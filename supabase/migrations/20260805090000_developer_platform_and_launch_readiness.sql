-- Days 20-21: scoped developer API, durable webhooks, recovery, and launch readiness.

create table public.developer_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  key_prefix text not null unique check (char_length(key_prefix) between 8 and 24),
  key_hash text not null unique check (char_length(key_hash) = 64),
  scopes text[] not null check (
    cardinality(scopes) between 1 and 8
    and scopes <@ array[
      'agents:read', 'agents:run', 'workflows:read', 'workflows:run',
      'runs:read', 'usage:read', 'webhooks:write', 'status:read'
    ]::text[]
  ),
  rate_limit_per_minute integer not null default 60
    check (rate_limit_per_minute between 10 and 600),
  status text not null default 'active' check (status in ('active', 'revoked')),
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at is null or expires_at > created_at),
  check ((status = 'revoked') = (revoked_at is not null))
);

create table public.developer_api_rate_windows (
  api_key_id uuid not null references public.developer_api_keys(id) on delete cascade,
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (api_key_id, window_start)
);

create table public.developer_api_request_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  api_key_id uuid references public.developer_api_keys(id) on delete set null,
  request_id text not null check (char_length(request_id) between 8 and 100),
  method text not null check (method in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')),
  path text not null check (char_length(path) between 1 and 500),
  status_code integer not null check (status_code between 100 and 599),
  duration_ms integer not null check (duration_ms >= 0),
  ip_hash text check (ip_hash is null or char_length(ip_hash) = 64),
  user_agent text check (user_agent is null or char_length(user_agent) <= 240),
  occurred_at timestamptz not null default now(),
  unique (api_key_id, request_id)
);

create table public.developer_webhook_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  endpoint_url text not null check (char_length(endpoint_url) between 12 and 2000),
  event_types text[] not null check (
    cardinality(event_types) between 1 and 8
    and event_types <@ array[
      '*', 'test.ping', 'agent.run.completed', 'agent.run.failed',
      'workflow.run.completed', 'workflow.run.failed'
    ]::text[]
  ),
  signing_secret_hash text not null check (char_length(signing_secret_hash) = 64),
  secret_last_four text not null check (char_length(secret_last_four) = 4),
  status text not null default 'active'
    check (status in ('active', 'paused', 'revoked')),
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  last_delivery_at timestamptz,
  last_success_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.developer_webhook_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in (
    'test.ping', 'agent.run.completed', 'agent.run.failed',
    'workflow.run.completed', 'workflow.run.failed'
  )),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  payload_sha256 text not null check (char_length(payload_sha256) = 64),
  occurred_at timestamptz not null default now()
);

create table public.developer_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subscription_id uuid not null
    references public.developer_webhook_subscriptions(id) on delete cascade,
  event_id uuid not null references public.developer_webhook_events(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'delivering', 'delivered', 'retry_wait', 'dead_letter')),
  attempt integer not null default 0 check (attempt >= 0),
  max_attempts integer not null check (max_attempts between 1 and 10),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  response_status integer check (response_status is null or response_status between 100 and 599),
  response_sha256 text check (response_sha256 is null or char_length(response_sha256) = 64),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  error_code text check (error_code is null or char_length(error_code) <= 100),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscription_id, event_id)
);

create index developer_api_keys_user_idx
  on public.developer_api_keys (user_id, status, created_at desc);
create index developer_api_request_logs_user_idx
  on public.developer_api_request_logs (user_id, occurred_at desc);
create index developer_webhook_subscriptions_user_idx
  on public.developer_webhook_subscriptions (user_id, status, created_at desc);
create index developer_webhook_deliveries_claim_idx
  on public.developer_webhook_deliveries (status, next_attempt_at, created_at)
  where status in ('pending', 'retry_wait');
create index developer_webhook_deliveries_user_idx
  on public.developer_webhook_deliveries (user_id, created_at desc);

create table public.user_onboarding_progress (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  current_step text not null default 'profile' check (current_step in (
    'profile', 'agent', 'workflow', 'guardrails', 'developer', 'recovery', 'complete'
  )),
  completed_steps text[] not null default '{}' check (
    completed_steps <@ array[
      'profile', 'agent', 'workflow', 'guardrails', 'developer', 'recovery'
    ]::text[]
  ),
  dismissed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((current_step = 'complete') = (completed_at is not null))
);

insert into public.user_onboarding_progress (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

create or replace function public.ensure_user_onboarding_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_onboarding_progress (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger profiles_ensure_onboarding_progress
after insert on public.profiles
for each row execute function public.ensure_user_onboarding_progress();

create table public.recovery_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  schema_version integer not null default 1 check (schema_version >= 1),
  status text not null default 'ready' check (status in ('ready', 'expired')),
  manifest jsonb not null check (jsonb_typeof(manifest) = 'object'),
  manifest_sha256 text not null check (char_length(manifest_sha256) = 64),
  resource_counts jsonb not null check (jsonb_typeof(resource_counts) = 'object'),
  secrets_excluded boolean not null default true check (secrets_excluded = true),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, manifest_sha256),
  check (expires_at > created_at)
);

create table public.recovery_verifications (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.recovery_snapshots(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('passed', 'failed')),
  dry_run boolean not null default true check (dry_run = true),
  checks jsonb not null check (jsonb_typeof(checks) = 'array'),
  verified_sha256 text not null check (char_length(verified_sha256) = 64),
  verified_at timestamptz not null default now()
);

create table public.launch_readiness_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  release_version text not null check (char_length(release_version) between 1 and 100),
  status text not null check (status in ('passed', 'warning', 'failed')),
  score integer not null check (score between 0 and 100),
  checks jsonb not null check (jsonb_typeof(checks) = 'array'),
  environment_summary jsonb not null check (jsonb_typeof(environment_summary) = 'object'),
  created_at timestamptz not null default now()
);

create index recovery_snapshots_user_idx
  on public.recovery_snapshots (user_id, created_at desc);
create index recovery_verifications_user_idx
  on public.recovery_verifications (user_id, verified_at desc);
create index launch_readiness_runs_user_idx
  on public.launch_readiness_runs (user_id, created_at desc);

create or replace function public.authenticate_developer_api_key(
  p_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key public.developer_api_keys;
  v_window timestamptz := date_trunc('minute', now());
  v_count integer;
begin
  select * into v_key
  from public.developer_api_keys
  where key_hash = p_key_hash
  for update;
  if v_key.id is null then
    return jsonb_build_object('authenticated', false, 'reason', 'invalid');
  end if;
  if v_key.status <> 'active' then
    return jsonb_build_object('authenticated', false, 'reason', 'revoked');
  end if;
  if v_key.expires_at is not null and v_key.expires_at <= now() then
    return jsonb_build_object('authenticated', false, 'reason', 'expired');
  end if;

  insert into public.developer_api_rate_windows (api_key_id, window_start, request_count)
  values (v_key.id, v_window, 1)
  on conflict (api_key_id, window_start) do update
  set request_count = public.developer_api_rate_windows.request_count + 1
  returning request_count into v_count;

  update public.developer_api_keys
  set last_used_at = now()
  where id = v_key.id;

  return jsonb_build_object(
    'authenticated', true,
    'allowed', v_count <= v_key.rate_limit_per_minute,
    'user_id', v_key.user_id,
    'api_key_id', v_key.id,
    'key_prefix', v_key.key_prefix,
    'scopes', to_jsonb(v_key.scopes),
    'rate_limit', v_key.rate_limit_per_minute,
    'remaining', greatest(0, v_key.rate_limit_per_minute - v_count),
    'reset_at', v_window + interval '1 minute'
  );
end;
$$;

create or replace function public.publish_developer_webhook_event(
  p_user_id uuid,
  p_event_type text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.developer_webhook_events;
  v_delivery_count integer := 0;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  insert into public.developer_webhook_events (
    user_id, event_type, payload, payload_sha256
  ) values (
    p_user_id,
    p_event_type,
    v_payload,
    encode(extensions.digest(convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex')
  ) returning * into v_event;

  insert into public.developer_webhook_deliveries (
    user_id, subscription_id, event_id, max_attempts
  )
  select p_user_id, id, v_event.id, max_attempts
  from public.developer_webhook_subscriptions
  where user_id = p_user_id
    and status = 'active'
    and ('*' = any(event_types) or p_event_type = any(event_types));
  get diagnostics v_delivery_count = row_count;

  return jsonb_build_object(
    'event_id', v_event.id,
    'event_type', v_event.event_type,
    'deliveries_created', v_delivery_count,
    'payload_sha256', v_event.payload_sha256
  );
end;
$$;

create or replace function public.enqueue_agent_run_webhook()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('completed', 'failed')
    and new.status is distinct from old.status then
    perform public.publish_developer_webhook_event(
      new.user_id,
      case when new.status = 'completed'
        then 'agent.run.completed' else 'agent.run.failed' end,
      jsonb_build_object(
        'run_id', new.id,
        'agent_id', new.agent_id,
        'status', new.status,
        'tokens_used', new.tokens_used,
        'duration_ms', new.duration_ms,
        'completed_at', new.completed_at
      )
    );
  end if;
  return new;
end;
$$;

create trigger agent_runs_publish_developer_webhook
after update of status on public.agent_runs
for each row execute function public.enqueue_agent_run_webhook();

create or replace function public.enqueue_workflow_run_webhook()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('completed', 'failed')
    and new.status is distinct from old.status then
    perform public.publish_developer_webhook_event(
      new.user_id,
      case when new.status = 'completed'
        then 'workflow.run.completed' else 'workflow.run.failed' end,
      jsonb_build_object(
        'run_id', new.id,
        'workflow_id', new.workflow_id,
        'status', new.status,
        'completed_at', new.completed_at
      )
    );
  end if;
  return new;
end;
$$;

create trigger workflow_runs_publish_developer_webhook
after update of status on public.workflow_runs
for each row execute function public.enqueue_workflow_run_webhook();

create or replace function public.claim_developer_webhook_delivery()
returns public.developer_webhook_deliveries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.developer_webhook_deliveries;
begin
  update public.developer_webhook_deliveries
  set status = 'delivering',
      attempt = attempt + 1,
      locked_at = now(),
      updated_at = now()
  where id = (
    select id
    from public.developer_webhook_deliveries
    where status in ('pending', 'retry_wait')
      and next_attempt_at <= now()
    order by next_attempt_at, created_at
    for update skip locked
    limit 1
  )
  returning * into v_delivery;
  return v_delivery;
end;
$$;

create or replace function public.purge_developer_launch_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_windows integer := 0;
  v_logs integer := 0;
  v_events integer := 0;
  v_snapshots integer := 0;
begin
  delete from public.developer_api_rate_windows
  where window_start < now() - interval '2 days';
  get diagnostics v_windows = row_count;
  delete from public.developer_api_request_logs
  where occurred_at < now() - interval '90 days';
  get diagnostics v_logs = row_count;
  delete from public.developer_webhook_events
  where occurred_at < now() - interval '30 days';
  get diagnostics v_events = row_count;
  update public.recovery_snapshots
  set status = 'expired'
  where status = 'ready' and expires_at <= now();
  get diagnostics v_snapshots = row_count;
  return jsonb_build_object(
    'rate_windows_deleted', v_windows,
    'request_logs_deleted', v_logs,
    'webhook_events_deleted', v_events,
    'recovery_snapshots_expired', v_snapshots
  );
end;
$$;

alter table public.developer_api_keys enable row level security;
alter table public.developer_api_rate_windows enable row level security;
alter table public.developer_api_request_logs enable row level security;
alter table public.developer_webhook_subscriptions enable row level security;
alter table public.developer_webhook_events enable row level security;
alter table public.developer_webhook_deliveries enable row level security;
alter table public.user_onboarding_progress enable row level security;
alter table public.recovery_snapshots enable row level security;
alter table public.recovery_verifications enable row level security;
alter table public.launch_readiness_runs enable row level security;

revoke all on public.developer_api_keys, public.developer_api_rate_windows,
  public.developer_api_request_logs, public.developer_webhook_subscriptions,
  public.developer_webhook_events, public.developer_webhook_deliveries,
  public.user_onboarding_progress, public.recovery_snapshots,
  public.recovery_verifications, public.launch_readiness_runs
  from anon, authenticated;
grant all on public.developer_api_keys, public.developer_api_rate_windows,
  public.developer_api_request_logs, public.developer_webhook_subscriptions,
  public.developer_webhook_events, public.developer_webhook_deliveries,
  public.user_onboarding_progress, public.recovery_snapshots,
  public.recovery_verifications, public.launch_readiness_runs
  to service_role;

revoke execute on function public.ensure_user_onboarding_progress()
  from public, anon, authenticated;
revoke execute on function public.authenticate_developer_api_key(text)
  from public, anon, authenticated;
revoke execute on function public.publish_developer_webhook_event(uuid, text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.claim_developer_webhook_delivery()
  from public, anon, authenticated;
revoke execute on function public.purge_developer_launch_data()
  from public, anon, authenticated;

grant execute on function public.authenticate_developer_api_key(text)
  to service_role;
grant execute on function public.publish_developer_webhook_event(uuid, text, jsonb)
  to service_role;
grant execute on function public.claim_developer_webhook_delivery()
  to service_role;
grant execute on function public.purge_developer_launch_data()
  to service_role;
