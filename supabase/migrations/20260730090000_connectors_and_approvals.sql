-- AgentForge Days 8-9: connector execution and resumable approvals.

alter table public.vault_credentials
  drop constraint if exists vault_credentials_provider_check;
alter table public.vault_credentials
  add constraint vault_credentials_provider_check
  check (provider in (
    'generic', 'openai', 'anthropic', 'slack', 'github',
    'google', 'resend', 'supabase'
  ));

alter table public.execution_jobs
  drop constraint if exists execution_jobs_status_check;
alter table public.execution_jobs
  add constraint execution_jobs_status_check
  check (status in (
    'queued', 'running', 'retry_wait', 'waiting_approval',
    'succeeded', 'failed', 'cancelled'
  ));

alter table public.workflow_runs
  drop constraint if exists workflow_runs_status_check;
alter table public.workflow_runs
  add constraint workflow_runs_status_check
  check (status in (
    'queued', 'running', 'waiting_approval',
    'completed', 'failed', 'cancelled'
  ));

alter table public.workflow_step_runs
  drop constraint if exists workflow_step_runs_node_type_check;
alter table public.workflow_step_runs
  add constraint workflow_step_runs_node_type_check
  check (node_type in (
    'input', 'agent', 'connector', 'transform', 'condition', 'approval', 'output'
  ));
alter table public.workflow_step_runs
  drop constraint if exists workflow_step_runs_status_check;
alter table public.workflow_step_runs
  add constraint workflow_step_runs_status_check
  check (status in (
    'running', 'waiting', 'completed', 'failed', 'skipped',
    'rejected', 'cancelled'
  ));

create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  workflow_id uuid not null,
  workflow_run_id uuid not null references public.workflow_runs(id) on delete cascade,
  execution_job_id uuid not null references public.execution_jobs(id) on delete cascade,
  node_id text not null,
  instructions text,
  status text not null default 'pending'
    check (status in (
      'pending', 'approved', 'edited', 'rejected', 'expired', 'cancelled'
    )),
  input jsonb not null,
  edited_input text,
  decision_note text,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  resolved_at timestamptz,
  constraint approval_requests_workflow_owner_fk
    foreign key (workflow_id, user_id)
    references public.workflows(id, user_id)
    on delete cascade,
  unique (workflow_run_id, node_id)
);

create index approval_requests_user_status_idx
  on public.approval_requests(user_id, status, requested_at desc);
create index approval_requests_expiry_idx
  on public.approval_requests(expires_at)
  where status = 'pending';

create or replace function public.resolve_workflow_approval(
  p_approval_id uuid,
  p_user_id uuid,
  p_decision text,
  p_edited_input text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_approval public.approval_requests;
  v_job public.execution_jobs;
  v_status text;
  v_output jsonb;
begin
  if p_decision not in ('approve', 'edit', 'reject') then
    raise exception 'Decision must be approve, edit, or reject';
  end if;
  if p_decision = 'edit'
    and char_length(trim(coalesce(p_edited_input, ''))) not between 1 and 50000 then
    raise exception 'Edited input must be between 1 and 50,000 characters';
  end if;
  if p_note is not null and char_length(p_note) > 1000 then
    raise exception 'Decision note must be 1,000 characters or fewer';
  end if;

  select * into v_approval
  from public.approval_requests
  where id = p_approval_id and user_id = p_user_id
  for update;
  if not found then raise exception 'Approval request not found'; end if;
  if v_approval.status <> 'pending' then
    raise exception 'Approval request is already resolved';
  end if;

  if v_approval.expires_at <= now() then
    update public.approval_requests
    set status = 'expired', resolved_at = now(), decision_note = 'Approval timed out'
    where id = v_approval.id
    returning * into v_approval;
    update public.execution_jobs
    set status = 'cancelled', completed_at = now(),
      error_message = 'Approval timed out', locked_at = null, locked_by = null
    where id = v_approval.execution_job_id;
    update public.workflow_runs
    set status = 'cancelled', completed_at = now(), error_message = 'Approval timed out'
    where id = v_approval.workflow_run_id;
    update public.workflow_step_runs
    set status = 'cancelled', completed_at = now(), error_message = 'Approval timed out'
    where workflow_run_id = v_approval.workflow_run_id and node_id = v_approval.node_id;
    return jsonb_build_object('approval', to_jsonb(v_approval), 'expired', true);
  end if;

  if p_decision = 'reject' then
    update public.approval_requests
    set status = 'rejected', resolved_at = now(), decision_note = nullif(trim(p_note), '')
    where id = v_approval.id
    returning * into v_approval;
    update public.execution_jobs
    set status = 'cancelled', completed_at = now(),
      error_message = 'Rejected by approver', locked_at = null, locked_by = null
    where id = v_approval.execution_job_id;
    update public.workflow_runs
    set status = 'cancelled', completed_at = now(), error_message = 'Rejected by approver'
    where id = v_approval.workflow_run_id;
    update public.workflow_step_runs
    set status = 'rejected', completed_at = now(), error_message = 'Rejected by approver'
    where workflow_run_id = v_approval.workflow_run_id and node_id = v_approval.node_id;
    return jsonb_build_object('approval', to_jsonb(v_approval), 'rejected', true);
  end if;

  v_status := case when p_decision = 'edit' then 'edited' else 'approved' end;
  v_output := case
    when p_decision = 'edit' then to_jsonb(trim(p_edited_input))
    else coalesce(v_approval.input->'value', 'null'::jsonb)
  end;
  update public.approval_requests
  set
    status = v_status,
    edited_input = case when p_decision = 'edit' then trim(p_edited_input) else null end,
    decision_note = nullif(trim(p_note), ''),
    resolved_at = now()
  where id = v_approval.id
  returning * into v_approval;

  update public.execution_jobs
  set
    status = 'queued',
    attempt = greatest(0, attempt - 1),
    run_after = now(),
    completed_at = null,
    error_message = null,
    locked_at = null,
    locked_by = null,
    payload = jsonb_set(
      payload,
      '{approval_resolution}',
      jsonb_build_object(
        'approval_id', v_approval.id,
        'node_id', v_approval.node_id,
        'decision', p_decision,
        'output', v_output
      ),
      true
    )
  where id = v_approval.execution_job_id
    and user_id = p_user_id
    and status = 'waiting_approval'
  returning * into v_job;
  if not found then
    raise exception 'Approval job is not waiting';
  end if;
  update public.workflow_runs
  set status = 'queued', error_message = null, completed_at = null
  where id = v_approval.workflow_run_id;

  return jsonb_build_object(
    'approval', to_jsonb(v_approval),
    'job', to_jsonb(v_job),
    'resumed', true
  );
end;
$$;

create or replace function public.expire_pending_approvals()
returns setof public.approval_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_approval public.approval_requests;
begin
  for v_approval in
    update public.approval_requests
    set status = 'expired', resolved_at = now(), decision_note = 'Approval timed out'
    where status = 'pending' and expires_at <= now()
    returning *
  loop
    update public.execution_jobs
    set status = 'cancelled', completed_at = now(),
      error_message = 'Approval timed out', locked_at = null, locked_by = null
    where id = v_approval.execution_job_id and status = 'waiting_approval';
    update public.workflow_runs
    set status = 'cancelled', completed_at = now(), error_message = 'Approval timed out'
    where id = v_approval.workflow_run_id and status = 'waiting_approval';
    update public.workflow_step_runs
    set status = 'cancelled', completed_at = now(), error_message = 'Approval timed out'
    where workflow_run_id = v_approval.workflow_run_id
      and node_id = v_approval.node_id and status = 'waiting';
    return next v_approval;
  end loop;
end;
$$;

alter table public.approval_requests enable row level security;
revoke all on public.approval_requests from anon, authenticated;
grant all on public.approval_requests to service_role;

revoke execute on function public.resolve_workflow_approval(uuid, uuid, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.expire_pending_approvals()
  from public, anon, authenticated;
grant execute on function public.resolve_workflow_approval(uuid, uuid, text, text, text)
  to service_role;
grant execute on function public.expire_pending_approvals() to service_role;
