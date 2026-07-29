-- AgentForge Days 16-17: organizations, tenant governance, and compliance.

update public.plan_definitions
set limits = limits || case plan_key
  when 'free' then '{"organizations":1,"organization_members":5}'::jsonb
  when 'pro' then '{"organizations":5,"organization_members":50}'::jsonb
  else '{"organizations":100,"organization_members":1000}'::jsonb
end,
updated_at = now()
where plan_key in ('free', 'pro', 'enterprise');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 3 and 80),
  name text not null check (char_length(name) between 2 and 100),
  description text check (description is null or char_length(description) <= 500),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'builder', 'viewer')),
  status text not null default 'active'
    check (status in ('active', 'suspended')),
  invited_by uuid references public.profiles(id) on delete set null,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id),
  unique (id, organization_id)
);

create unique index organization_single_owner_idx
  on public.organization_members(organization_id)
  where role = 'owner' and status = 'active';
create index organization_members_user_idx
  on public.organization_members(user_id, status, joined_at desc);

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null
    check (
      email = lower(trim(email))
      and char_length(email) between 3 and 320
      and position('@' in email) > 1
    ),
  role text not null check (role in ('admin', 'builder', 'viewer')),
  token_hash text not null unique check (char_length(token_hash) = 64),
  invited_by uuid not null references public.profiles(id) on delete restrict,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_user_id uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (not (accepted_at is not null and revoked_at is not null))
);

create unique index organization_pending_invite_idx
  on public.organization_invitations(organization_id, email)
  where accepted_at is null and revoked_at is null;
create index organization_invitations_expiry_idx
  on public.organization_invitations(expires_at)
  where accepted_at is null and revoked_at is null;

create table public.organization_resources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  resource_type text not null
    check (resource_type in (
      'agent', 'workflow', 'chain', 'knowledge_base', 'multi_agent', 'evaluation_suite'
    )),
  resource_id uuid not null,
  access_level text not null default 'view'
    check (access_level in ('view', 'run', 'edit')),
  shared_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, resource_type, resource_id)
);

create index organization_resources_lookup_idx
  on public.organization_resources(resource_type, resource_id);
create index organization_resources_org_idx
  on public.organization_resources(organization_id, created_at desc);

create table public.organization_policies (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  execution_enabled boolean not null default true,
  allowed_models text[] not null default array['claude-sonnet-4-6', 'claude-opus-4-6']
    check (
      cardinality(allowed_models) between 1 and 20
      and allowed_models <@ array['claude-sonnet-4-6', 'claude-opus-4-6']::text[]
    ),
  max_model_calls_per_run integer not null default 25
    check (max_model_calls_per_run between 1 and 10000),
  max_estimated_cost_usd numeric(12, 4)
    check (max_estimated_cost_usd is null or max_estimated_cost_usd between 0.0001 and 1000000),
  approval_mode text not null default 'sensitive'
    check (approval_mode in ('none', 'sensitive', 'all_changes')),
  minimum_approvers integer not null default 1 check (minimum_approvers between 1 and 5),
  audit_retention_days integer not null default 365
    check (audit_retention_days between 30 and 3650),
  immutable_audit boolean not null default true,
  compliance_export_enabled boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.governance_change_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  change_type text not null
    check (change_type in ('member_role', 'member_remove', 'policy_update', 'resource_remove')),
  target_type text not null
    check (target_type in ('member', 'policy', 'resource')),
  target_id uuid,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  reason text not null check (char_length(reason) between 3 and 1000),
  required_approvals integer not null check (required_approvals between 1 and 5),
  status text not null default 'pending'
    check (status in ('pending', 'rejected', 'cancelled', 'applied', 'expired')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create table public.governance_change_decisions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.governance_change_requests(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reviewer_user_id uuid not null references public.profiles(id) on delete restrict,
  decision text not null check (decision in ('approve', 'reject')),
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  unique (request_id, reviewer_user_id)
);

create index governance_requests_org_idx
  on public.governance_change_requests(organization_id, status, created_at desc);

create table public.organization_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sequence_number bigint not null check (sequence_number > 0),
  actor_user_id uuid references public.profiles(id) on delete set null,
  event_type text not null
    check (event_type ~ '^[a-z][a-z0-9_.-]{2,99}$'),
  target_type text check (target_type is null or char_length(target_type) between 1 and 80),
  target_id uuid,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  previous_hash text check (previous_hash is null or char_length(previous_hash) = 64),
  event_hash text not null check (char_length(event_hash) = 64),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (organization_id, sequence_number)
);

create index organization_audit_org_time_idx
  on public.organization_audit_events(organization_id, occurred_at desc);
create index organization_audit_actor_idx
  on public.organization_audit_events(actor_user_id, occurred_at desc)
  where actor_user_id is not null;
create index organization_audit_event_type_idx
  on public.organization_audit_events(organization_id, event_type, occurred_at desc);

create table public.audit_retention_checkpoints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  deleted_through_sequence bigint not null check (deleted_through_sequence > 0),
  terminal_hash text not null check (char_length(terminal_hash) = 64),
  events_deleted integer not null check (events_deleted > 0),
  cutoff_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.compliance_exports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  export_format text not null check (export_format in ('json', 'csv')),
  date_from timestamptz,
  date_to timestamptz,
  status text not null default 'ready' check (status in ('ready', 'failed', 'expired')),
  record_count integer not null default 0 check (record_count >= 0),
  content_sha256 text check (content_sha256 is null or char_length(content_sha256) = 64),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  check (date_to is null or date_from is null or date_to >= date_from)
);

create index compliance_exports_org_idx
  on public.compliance_exports(organization_id, created_at desc);

create trigger set_organizations_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();
create trigger set_organization_members_updated_at
  before update on public.organization_members
  for each row execute function public.set_updated_at();
create trigger set_organization_resources_updated_at
  before update on public.organization_resources
  for each row execute function public.set_updated_at();
create trigger set_organization_policies_updated_at
  before update on public.organization_policies
  for each row execute function public.set_updated_at();
create trigger set_governance_requests_updated_at
  before update on public.governance_change_requests
  for each row execute function public.set_updated_at();

create or replace function public.reject_organization_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    and current_setting('agentforge.audit_purge', true) = 'on' then
    return old;
  end if;
  raise exception 'Organization audit events are append-only';
end;
$$;

create trigger reject_organization_audit_mutation
  before update or delete on public.organization_audit_events
  for each row execute function public.reject_organization_audit_mutation();

create or replace function public.record_organization_audit(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_event_type text,
  p_target_type text default null,
  p_target_id uuid default null,
  p_details jsonb default '{}'::jsonb
)
returns public.organization_audit_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.organization_audit_events;
  v_event_id uuid := extensions.gen_random_uuid();
  v_sequence bigint;
  v_previous_hash text;
  v_occurred_at timestamptz := clock_timestamp();
  v_payload text;
  v_hash text;
begin
  perform 1 from public.organizations where id = p_organization_id for update;
  if not found then raise exception 'Organization not found'; end if;
  if p_actor_user_id is not null and not exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id
      and user_id = p_actor_user_id
      and status = 'active'
  ) then
    raise exception 'Actor is not an active organization member';
  end if;
  select sequence_number, event_hash
  into v_sequence, v_previous_hash
  from public.organization_audit_events
  where organization_id = p_organization_id
  order by sequence_number desc
  limit 1;
  v_sequence := coalesce(v_sequence, 0) + 1;
  v_payload := concat_ws(
    '|',
    v_event_id::text,
    p_organization_id::text,
    v_sequence::text,
    coalesce(p_actor_user_id::text, ''),
    p_event_type,
    coalesce(p_target_type, ''),
    coalesce(p_target_id::text, ''),
    coalesce(p_details, '{}'::jsonb)::text,
    coalesce(v_previous_hash, ''),
    v_occurred_at::text
  );
  v_hash := encode(
    extensions.digest(convert_to(v_payload, 'UTF8'), 'sha256'),
    'hex'
  );
  insert into public.organization_audit_events (
    id, organization_id, sequence_number, actor_user_id, event_type,
    target_type, target_id, details, previous_hash, event_hash, occurred_at
  ) values (
    v_event_id, p_organization_id, v_sequence, p_actor_user_id, p_event_type,
    p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb),
    v_previous_hash, v_hash, v_occurred_at
  ) returning * into v_event;
  return v_event;
end;
$$;

create or replace function public.create_organization(
  p_owner_user_id uuid,
  p_slug text,
  p_name text,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization public.organizations;
  v_member public.organization_members;
begin
  insert into public.organizations (owner_user_id, slug, name, description)
  values (
    p_owner_user_id,
    lower(trim(p_slug)),
    trim(p_name),
    nullif(trim(p_description), '')
  ) returning * into v_organization;
  insert into public.organization_members (
    organization_id, user_id, role, status, invited_by
  ) values (
    v_organization.id, p_owner_user_id, 'owner', 'active', p_owner_user_id
  ) returning * into v_member;
  insert into public.organization_policies (organization_id, updated_by)
  values (v_organization.id, p_owner_user_id);
  perform public.record_organization_audit(
    v_organization.id,
    p_owner_user_id,
    'organization.created',
    'organization',
    v_organization.id,
    jsonb_build_object('name', v_organization.name, 'slug', v_organization.slug)
  );
  return jsonb_build_object(
    'organization', to_jsonb(v_organization),
    'membership', to_jsonb(v_member)
  );
end;
$$;

create or replace function public.accept_organization_invitation(
  p_user_id uuid,
  p_user_email text,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.organization_invitations;
  v_member public.organization_members;
  v_organization public.organizations;
begin
  select * into v_invitation
  from public.organization_invitations
  where token_hash = p_token_hash
    and accepted_at is null
    and revoked_at is null
    and expires_at > now()
  for update;
  if not found then raise exception 'Invitation is invalid or expired'; end if;
  if lower(trim(p_user_email)) <> v_invitation.email then
    raise exception 'Invitation email does not match the signed-in account';
  end if;
  select * into v_organization from public.organizations
  where id = v_invitation.organization_id and status = 'active';
  if not found then raise exception 'Organization is unavailable'; end if;
  insert into public.organization_members (
    organization_id, user_id, role, status, invited_by
  ) values (
    v_invitation.organization_id, p_user_id, v_invitation.role,
    'active', v_invitation.invited_by
  )
  on conflict (organization_id, user_id) do update set
    role = excluded.role,
    status = 'active',
    invited_by = excluded.invited_by,
    joined_at = now()
  returning * into v_member;
  update public.organization_invitations set
    accepted_at = now(),
    accepted_user_id = p_user_id
  where id = v_invitation.id;
  perform public.record_organization_audit(
    v_invitation.organization_id,
    p_user_id,
    'member.joined',
    'member',
    v_member.id,
    jsonb_build_object('role', v_member.role, 'invitation_id', v_invitation.id)
  );
  return jsonb_build_object(
    'organization', to_jsonb(v_organization),
    'membership', to_jsonb(v_member)
  );
end;
$$;

create or replace function public.decide_governance_change(
  p_request_id uuid,
  p_actor_user_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.governance_change_requests;
  v_actor public.organization_members;
  v_approvals integer;
  v_new_role text;
  v_target_user_id uuid;
begin
  select * into v_request
  from public.governance_change_requests
  where id = p_request_id
  for update;
  if not found then raise exception 'Governance request not found'; end if;
  if v_request.status <> 'pending' then raise exception 'Governance request is not pending'; end if;
  if v_request.expires_at <= now() then
    update public.governance_change_requests set status = 'expired'
    where id = v_request.id;
    raise exception 'Governance request expired';
  end if;
  if v_request.requested_by = p_actor_user_id then
    raise exception 'Requesters cannot approve their own governance changes';
  end if;
  select * into v_actor
  from public.organization_members
  where organization_id = v_request.organization_id
    and user_id = p_actor_user_id
    and status = 'active'
    and role in ('owner', 'admin');
  if not found then raise exception 'Governance reviewer access required'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'Invalid governance decision'; end if;
  insert into public.governance_change_decisions (
    request_id, organization_id, reviewer_user_id, decision, note
  ) values (
    v_request.id, v_request.organization_id, p_actor_user_id,
    p_decision, nullif(trim(p_note), '')
  )
  on conflict (request_id, reviewer_user_id) do update set
    decision = excluded.decision,
    note = excluded.note,
    created_at = now();
  if p_decision = 'reject' then
    update public.governance_change_requests
    set status = 'rejected'
    where id = v_request.id;
    perform public.record_organization_audit(
      v_request.organization_id,
      p_actor_user_id,
      'governance.change_rejected',
      'governance_request',
      v_request.id,
      jsonb_build_object('change_type', v_request.change_type)
    );
    return jsonb_build_object('status', 'rejected', 'applied', false);
  end if;
  select count(*)::integer into v_approvals
  from public.governance_change_decisions
  where request_id = v_request.id and decision = 'approve';
  if v_approvals < v_request.required_approvals then
    perform public.record_organization_audit(
      v_request.organization_id,
      p_actor_user_id,
      'governance.change_approved',
      'governance_request',
      v_request.id,
      jsonb_build_object(
        'approvals', v_approvals,
        'required_approvals', v_request.required_approvals
      )
    );
    return jsonb_build_object(
      'status', 'pending',
      'applied', false,
      'approvals', v_approvals,
      'required_approvals', v_request.required_approvals
    );
  end if;
  if v_request.change_type = 'member_role' then
    v_target_user_id := (v_request.payload ->> 'user_id')::uuid;
    v_new_role := v_request.payload ->> 'role';
    if v_new_role not in ('admin', 'builder', 'viewer') then
      raise exception 'Invalid governed member role';
    end if;
    update public.organization_members
    set role = v_new_role
    where organization_id = v_request.organization_id
      and user_id = v_target_user_id
      and role <> 'owner'
      and status = 'active';
    if not found then raise exception 'Governed member not found'; end if;
  elsif v_request.change_type = 'member_remove' then
    v_target_user_id := (v_request.payload ->> 'user_id')::uuid;
    delete from public.organization_members
    where organization_id = v_request.organization_id
      and user_id = v_target_user_id
      and role <> 'owner';
    if not found then raise exception 'Governed member not found'; end if;
  elsif v_request.change_type = 'resource_remove' then
    delete from public.organization_resources
    where id = (v_request.payload ->> 'resource_id')::uuid
      and organization_id = v_request.organization_id;
    if not found then raise exception 'Governed resource not found'; end if;
  elsif v_request.change_type = 'policy_update' then
    update public.organization_policies set
      execution_enabled = case
        when v_request.payload ? 'execution_enabled'
          then (v_request.payload ->> 'execution_enabled')::boolean
        else execution_enabled
      end,
      allowed_models = case
        when v_request.payload ? 'allowed_models'
          then array(
            select jsonb_array_elements_text(v_request.payload -> 'allowed_models')
          )
        else allowed_models
      end,
      max_model_calls_per_run = case
        when v_request.payload ? 'max_model_calls_per_run'
          then (v_request.payload ->> 'max_model_calls_per_run')::integer
        else max_model_calls_per_run
      end,
      max_estimated_cost_usd = case
        when v_request.payload ? 'max_estimated_cost_usd'
          then nullif(v_request.payload ->> 'max_estimated_cost_usd', '')::numeric
        else max_estimated_cost_usd
      end,
      approval_mode = case
        when v_request.payload ? 'approval_mode'
          then v_request.payload ->> 'approval_mode'
        else approval_mode
      end,
      minimum_approvers = case
        when v_request.payload ? 'minimum_approvers'
          then (v_request.payload ->> 'minimum_approvers')::integer
        else minimum_approvers
      end,
      audit_retention_days = case
        when v_request.payload ? 'audit_retention_days'
          then (v_request.payload ->> 'audit_retention_days')::integer
        else audit_retention_days
      end,
      immutable_audit = case
        when v_request.payload ? 'immutable_audit'
          then (v_request.payload ->> 'immutable_audit')::boolean
        else immutable_audit
      end,
      compliance_export_enabled = case
        when v_request.payload ? 'compliance_export_enabled'
          then (v_request.payload ->> 'compliance_export_enabled')::boolean
        else compliance_export_enabled
      end,
      updated_by = p_actor_user_id
    where organization_id = v_request.organization_id;
    if not found then raise exception 'Organization policy not found'; end if;
  end if;
  update public.governance_change_requests
  set status = 'applied', applied_at = now()
  where id = v_request.id;
  perform public.record_organization_audit(
    v_request.organization_id,
    p_actor_user_id,
    'governance.change_applied',
    'governance_request',
    v_request.id,
    jsonb_build_object(
      'change_type', v_request.change_type,
      'approvals', v_approvals,
      'requested_by', v_request.requested_by
    )
  );
  return jsonb_build_object(
    'status', 'applied',
    'applied', true,
    'approvals', v_approvals
  );
end;
$$;

create or replace function public.purge_organization_governance_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_policy record;
  v_deleted integer := 0;
  v_invites integer := 0;
  v_exports integer := 0;
  v_checkpoint record;
begin
  perform set_config('agentforge.audit_purge', 'on', true);
  for v_policy in
    select organization_id, audit_retention_days
    from public.organization_policies
    where immutable_audit = false
  loop
    select
      max(sequence_number) as terminal_sequence,
      (array_agg(event_hash order by sequence_number desc))[1] as terminal_hash,
      count(*)::integer as event_count
    into v_checkpoint
    from public.organization_audit_events
    where organization_id = v_policy.organization_id
      and occurred_at < now() - make_interval(days => v_policy.audit_retention_days);
    if coalesce(v_checkpoint.event_count, 0) > 0 then
      insert into public.audit_retention_checkpoints (
        organization_id, deleted_through_sequence, terminal_hash,
        events_deleted, cutoff_at
      ) values (
        v_policy.organization_id,
        v_checkpoint.terminal_sequence,
        v_checkpoint.terminal_hash,
        v_checkpoint.event_count,
        now() - make_interval(days => v_policy.audit_retention_days)
      );
      delete from public.organization_audit_events
      where organization_id = v_policy.organization_id
        and sequence_number <= v_checkpoint.terminal_sequence;
      v_deleted := v_deleted + v_checkpoint.event_count;
    end if;
  end loop;
  delete from public.organization_invitations
  where (
    revoked_at is not null and revoked_at < now() - interval '30 days'
  ) or (
    accepted_at is null and expires_at < now() - interval '30 days'
  );
  get diagnostics v_invites = row_count;
  update public.compliance_exports
  set status = 'expired'
  where status = 'ready' and expires_at <= now();
  get diagnostics v_exports = row_count;
  return jsonb_build_object(
    'audit_events_deleted', v_deleted,
    'invitations_deleted', v_invites,
    'exports_expired', v_exports
  );
end;
$$;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.organization_resources enable row level security;
alter table public.organization_policies enable row level security;
alter table public.governance_change_requests enable row level security;
alter table public.governance_change_decisions enable row level security;
alter table public.organization_audit_events enable row level security;
alter table public.audit_retention_checkpoints enable row level security;
alter table public.compliance_exports enable row level security;

revoke all on public.organizations, public.organization_members,
  public.organization_invitations, public.organization_resources,
  public.organization_policies, public.governance_change_requests,
  public.governance_change_decisions, public.organization_audit_events,
  public.audit_retention_checkpoints, public.compliance_exports
  from anon, authenticated;
grant all on public.organizations, public.organization_members,
  public.organization_invitations, public.organization_resources,
  public.organization_policies, public.governance_change_requests,
  public.governance_change_decisions, public.organization_audit_events,
  public.audit_retention_checkpoints, public.compliance_exports
  to service_role;

revoke execute on function public.record_organization_audit(
  uuid, uuid, text, text, uuid, jsonb
) from public, anon, authenticated;
revoke execute on function public.create_organization(
  uuid, text, text, text
) from public, anon, authenticated;
revoke execute on function public.accept_organization_invitation(
  uuid, text, text
) from public, anon, authenticated;
revoke execute on function public.decide_governance_change(
  uuid, uuid, text, text
) from public, anon, authenticated;
revoke execute on function public.purge_organization_governance_data()
  from public, anon, authenticated;

grant execute on function public.record_organization_audit(
  uuid, uuid, text, text, uuid, jsonb
) to service_role;
grant execute on function public.create_organization(
  uuid, text, text, text
) to service_role;
grant execute on function public.accept_organization_invitation(
  uuid, text, text
) to service_role;
grant execute on function public.decide_governance_change(
  uuid, uuid, text, text
) to service_role;
grant execute on function public.purge_organization_governance_data()
  to service_role;
