-- AgentForge Days 4-5: durable execution jobs and workflow graph v1.

alter table public.agent_runs
  drop constraint if exists agent_runs_status_check;
alter table public.agent_runs
  add constraint agent_runs_status_check
  check (status in ('queued', 'running', 'completed', 'failed', 'cancelled'));

create table public.execution_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_type text not null check (job_type in ('agent_run', 'workflow_run')),
  status text not null default 'queued'
    check (status in (
      'queued', 'running', 'retry_wait', 'succeeded', 'failed', 'cancelled'
    )),
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  resource_id uuid,
  idempotency_key text,
  priority smallint not null default 0 check (priority between -10 and 10),
  attempt integer not null default 0 check (attempt >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  timeout_seconds integer not null default 90
    check (timeout_seconds between 5 and 900),
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  cancel_requested_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (idempotency_key is null or char_length(idempotency_key) between 1 and 200)
);

create unique index execution_jobs_user_idempotency_unique
  on public.execution_jobs(user_id, idempotency_key)
  where idempotency_key is not null;
create index execution_jobs_claim_idx
  on public.execution_jobs(status, run_after, priority desc, created_at)
  where status in ('queued', 'retry_wait');
create index execution_jobs_user_created_idx
  on public.execution_jobs(user_id, created_at desc);

alter table public.agent_runs
  add column execution_job_id uuid
    references public.execution_jobs(id) on delete set null;
create unique index agent_runs_execution_job_unique
  on public.agent_runs(execution_job_id)
  where execution_job_id is not null;

create table public.workflows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  description text,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused')),
  nodes jsonb not null default '[]'::jsonb,
  edges jsonb not null default '[]'::jsonb,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(nodes) = 'array'),
  check (jsonb_typeof(edges) = 'array')
);

alter table public.workflows
  add constraint workflows_owner_unique unique (id, user_id);

create table public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null,
  user_id uuid not null,
  execution_job_id uuid unique
    references public.execution_jobs(id) on delete set null,
  workflow_version integer not null check (workflow_version >= 1),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  input_text text not null,
  output jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint workflow_runs_workflow_owner_fk
    foreign key (workflow_id, user_id)
    references public.workflows(id, user_id)
    on delete cascade
);

create table public.workflow_step_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_run_id uuid not null references public.workflow_runs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  node_id text not null,
  node_type text not null
    check (node_type in ('input', 'agent', 'transform', 'condition', 'output')),
  sequence_number integer not null check (sequence_number >= 1),
  status text not null
    check (status in ('running', 'completed', 'failed', 'skipped', 'cancelled')),
  input jsonb,
  output jsonb,
  agent_version_id uuid references public.agent_versions(id),
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  unique (workflow_run_id, node_id)
);

create index workflows_user_created_idx
  on public.workflows(user_id, created_at desc);
create index workflow_runs_user_created_idx
  on public.workflow_runs(user_id, created_at desc);
create index workflow_runs_workflow_created_idx
  on public.workflow_runs(workflow_id, created_at desc);
create index workflow_step_runs_run_sequence_idx
  on public.workflow_step_runs(workflow_run_id, sequence_number);

create trigger set_execution_jobs_updated_at
  before update on public.execution_jobs
  for each row execute function public.set_updated_at();
create trigger set_workflows_updated_at
  before update on public.workflows
  for each row execute function public.set_updated_at();

create or replace function public.claim_execution_job(p_worker_id text)
returns public.execution_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.execution_jobs;
begin
  update public.execution_jobs
  set
    status = 'running',
    attempt = attempt + 1,
    locked_at = now(),
    locked_by = left(p_worker_id, 200),
    started_at = coalesce(started_at, now()),
    error_message = null
  where id = (
    select id
    from public.execution_jobs
    where status in ('queued', 'retry_wait')
      and run_after <= now()
      and cancel_requested_at is null
    order by priority desc, run_after, created_at
    for update skip locked
    limit 1
  )
  returning * into v_job;

  return v_job;
end;
$$;

create or replace function public.recover_stale_execution_jobs()
returns setof public.execution_jobs
language sql
security definer
set search_path = ''
as $$
  update public.execution_jobs
  set
    status = case when attempt < max_attempts then 'retry_wait' else 'failed' end,
    run_after = now(),
    error_message = 'Worker stopped before the job completed',
    completed_at = case when attempt < max_attempts then null else now() end,
    locked_at = null,
    locked_by = null
  where status = 'running'
    and locked_at < now() - make_interval(secs => timeout_seconds + 30)
  returning *;
$$;

create or replace function public.enqueue_agent_run(
  p_user_id uuid,
  p_agent_id uuid,
  p_message text,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent public.agents;
  v_profile public.profiles;
  v_existing public.execution_jobs;
  v_job public.execution_jobs;
  v_run public.agent_runs;
begin
  if char_length(trim(coalesce(p_message, ''))) = 0
    or char_length(p_message) > 50000 then
    raise exception 'Message must be between 1 and 50,000 characters';
  end if;
  if p_idempotency_key is not null
    and char_length(trim(p_idempotency_key)) not between 1 and 200 then
    raise exception 'Idempotency key must be between 1 and 200 characters';
  end if;

  if p_idempotency_key is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(p_user_id::text || ':' || p_idempotency_key, 0)
    );
    select * into v_existing
    from public.execution_jobs
    where user_id = p_user_id
      and idempotency_key = p_idempotency_key;
    if found then
      select * into v_run
      from public.agent_runs
      where execution_job_id = v_existing.id;
      return jsonb_build_object(
        'job', to_jsonb(v_existing),
        'run', to_jsonb(v_run),
        'deduplicated', true
      );
    end if;
  end if;

  select * into v_agent
  from public.agents
  where id = p_agent_id and user_id = p_user_id;
  if not found then raise exception 'Agent not found'; end if;
  if v_agent.status <> 'active' or v_agent.published_version_id is null then
    raise exception 'Agent must be published and active';
  end if;

  select * into v_profile from public.profiles where id = p_user_id;
  if not found then raise exception 'Profile not found'; end if;
  if v_profile.api_calls_used >= v_profile.api_calls_limit then
    raise exception 'Monthly limit reached';
  end if;

  insert into public.execution_jobs (
    user_id, job_type, payload, idempotency_key, timeout_seconds
  ) values (
    p_user_id,
    'agent_run',
    jsonb_build_object(
      'agent_id', v_agent.id,
      'agent_version_id', v_agent.published_version_id,
      'message', trim(p_message)
    ),
    nullif(trim(p_idempotency_key), ''),
    90
  ) returning * into v_job;

  insert into public.agent_runs (
    agent_id, agent_version_id, user_id, status, input_text, execution_job_id
  ) values (
    v_agent.id,
    v_agent.published_version_id,
    p_user_id,
    'queued',
    trim(p_message),
    v_job.id
  ) returning * into v_run;

  update public.execution_jobs
  set resource_id = v_run.id
  where id = v_job.id
  returning * into v_job;

  return jsonb_build_object(
    'job', to_jsonb(v_job),
    'run', to_jsonb(v_run),
    'deduplicated', false
  );
end;
$$;

create or replace function public.enqueue_workflow_run(
  p_user_id uuid,
  p_workflow_id uuid,
  p_input text,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workflow public.workflows;
  v_existing public.execution_jobs;
  v_job public.execution_jobs;
  v_run public.workflow_runs;
begin
  if char_length(trim(coalesce(p_input, ''))) = 0
    or char_length(p_input) > 50000 then
    raise exception 'Input must be between 1 and 50,000 characters';
  end if;
  if p_idempotency_key is not null
    and char_length(trim(p_idempotency_key)) not between 1 and 200 then
    raise exception 'Idempotency key must be between 1 and 200 characters';
  end if;

  if p_idempotency_key is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(p_user_id::text || ':' || p_idempotency_key, 0)
    );
    select * into v_existing
    from public.execution_jobs
    where user_id = p_user_id
      and idempotency_key = p_idempotency_key;
    if found then
      select * into v_run
      from public.workflow_runs
      where execution_job_id = v_existing.id;
      return jsonb_build_object(
        'job', to_jsonb(v_existing),
        'run', to_jsonb(v_run),
        'deduplicated', true
      );
    end if;
  end if;

  select * into v_workflow
  from public.workflows
  where id = p_workflow_id and user_id = p_user_id;
  if not found then raise exception 'Workflow not found'; end if;
  if v_workflow.status <> 'active' then
    raise exception 'Workflow must be active';
  end if;

  insert into public.execution_jobs (
    user_id, job_type, payload, idempotency_key, timeout_seconds
  ) values (
    p_user_id,
    'workflow_run',
    jsonb_build_object(
      'workflow_id', v_workflow.id,
      'workflow_version', v_workflow.version,
      'nodes', v_workflow.nodes,
      'edges', v_workflow.edges,
      'input', trim(p_input)
    ),
    nullif(trim(p_idempotency_key), ''),
    300
  ) returning * into v_job;

  insert into public.workflow_runs (
    workflow_id, user_id, execution_job_id, workflow_version, status, input_text
  ) values (
    v_workflow.id, p_user_id, v_job.id, v_workflow.version, 'queued', trim(p_input)
  ) returning * into v_run;

  update public.execution_jobs
  set resource_id = v_run.id
  where id = v_job.id
  returning * into v_job;

  return jsonb_build_object(
    'job', to_jsonb(v_job),
    'run', to_jsonb(v_run),
    'deduplicated', false
  );
end;
$$;

create or replace function public.increment_agent_run_count(
  p_agent_id uuid,
  p_user_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.agents
  set run_count = run_count + 1
  where id = p_agent_id and user_id = p_user_id;
$$;

alter table public.execution_jobs enable row level security;
alter table public.workflows enable row level security;
alter table public.workflow_runs enable row level security;
alter table public.workflow_step_runs enable row level security;

create policy "Users view their own execution jobs"
  on public.execution_jobs for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users view their own workflows"
  on public.workflows for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users view their own workflow runs"
  on public.workflow_runs for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users view their own workflow steps"
  on public.workflow_step_runs for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.execution_jobs from anon, authenticated;
revoke all on public.workflows from anon, authenticated;
revoke all on public.workflow_runs from anon, authenticated;
revoke all on public.workflow_step_runs from anon, authenticated;
grant select on public.execution_jobs to authenticated;
grant select on public.workflows to authenticated;
grant select on public.workflow_runs to authenticated;
grant select on public.workflow_step_runs to authenticated;
grant all on public.execution_jobs, public.workflows, public.workflow_runs,
  public.workflow_step_runs to service_role;

revoke execute on function public.claim_execution_job(text)
  from public, anon, authenticated;
revoke execute on function public.enqueue_agent_run(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke execute on function public.recover_stale_execution_jobs()
  from public, anon, authenticated;
revoke execute on function public.enqueue_workflow_run(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke execute on function public.increment_agent_run_count(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_execution_job(text) to service_role;
grant execute on function public.recover_stale_execution_jobs() to service_role;
grant execute on function public.enqueue_agent_run(uuid, uuid, text, text)
  to service_role;
grant execute on function public.enqueue_workflow_run(uuid, uuid, text, text)
  to service_role;
grant execute on function public.increment_agent_run_count(uuid, uuid)
  to service_role;
