-- AgentForge Days 6-7: workflow triggers and encrypted credential vault.

create table public.workflow_triggers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  workflow_id uuid not null,
  name text not null check (char_length(name) between 1 and 100),
  trigger_type text not null check (trigger_type in ('manual', 'webhook', 'schedule')),
  status text not null default 'active' check (status in ('active', 'paused')),
  webhook_path text unique,
  interval_minutes integer,
  next_run_at timestamptz,
  last_fired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflow_triggers_workflow_owner_fk
    foreign key (workflow_id, user_id)
    references public.workflows(id, user_id)
    on delete cascade,
  check (
    (trigger_type = 'manual' and webhook_path is null and interval_minutes is null and next_run_at is null)
    or (trigger_type = 'webhook' and webhook_path is not null and interval_minutes is null and next_run_at is null)
    or (
      trigger_type = 'schedule'
      and webhook_path is null
      and interval_minutes between 5 and 43200
      and next_run_at is not null
    )
  )
);

create table public.workflow_trigger_secrets (
  trigger_id uuid primary key references public.workflow_triggers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  ciphertext text not null,
  initialization_vector text not null,
  authentication_tag text not null,
  key_version text not null,
  rotated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.trigger_events (
  id uuid primary key default gen_random_uuid(),
  trigger_id uuid not null references public.workflow_triggers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_source text not null check (event_source in ('manual', 'webhook', 'schedule')),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 160),
  status text not null default 'accepted'
    check (status in ('accepted', 'queued', 'duplicate', 'failed')),
  execution_job_id uuid references public.execution_jobs(id) on delete set null,
  workflow_run_id uuid references public.workflow_runs(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  unique (trigger_id, idempotency_key)
);

create index workflow_triggers_user_created_idx
  on public.workflow_triggers(user_id, created_at desc);
create index workflow_triggers_due_idx
  on public.workflow_triggers(next_run_at)
  where trigger_type = 'schedule' and status = 'active';
create index trigger_events_trigger_created_idx
  on public.trigger_events(trigger_id, created_at desc);

create table public.vault_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  provider text not null
    check (provider in ('generic', 'openai', 'anthropic', 'slack', 'github')),
  current_version integer not null default 1 check (current_version >= 1),
  last_four text not null check (char_length(last_four) between 1 and 4),
  fingerprint text not null,
  metadata jsonb not null default '{}'::jsonb,
  last_test_status text check (last_test_status in ('passed', 'failed')),
  last_tested_at timestamptz,
  rotated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.vault_credential_versions (
  id uuid primary key default gen_random_uuid(),
  credential_id uuid not null references public.vault_credentials(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  version integer not null check (version >= 1),
  ciphertext text not null,
  initialization_vector text not null,
  authentication_tag text not null,
  key_version text not null,
  fingerprint text not null,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  unique (credential_id, version)
);

create table public.credential_access_logs (
  id uuid primary key default gen_random_uuid(),
  credential_id uuid references public.vault_credentials(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  credential_name text not null,
  operation text not null
    check (operation in ('create', 'rotate', 'test', 'update', 'delete')),
  outcome text not null check (outcome in ('success', 'failure')),
  details text,
  created_at timestamptz not null default now()
);

create index vault_credentials_user_created_idx
  on public.vault_credentials(user_id, created_at desc);
create index vault_versions_credential_version_idx
  on public.vault_credential_versions(credential_id, version desc);
create index credential_access_user_created_idx
  on public.credential_access_logs(user_id, created_at desc);

create trigger set_workflow_triggers_updated_at
  before update on public.workflow_triggers
  for each row execute function public.set_updated_at();
create trigger set_vault_credentials_updated_at
  before update on public.vault_credentials
  for each row execute function public.set_updated_at();

create or replace function public.fire_workflow_trigger(
  p_trigger_id uuid,
  p_input text,
  p_event_source text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trigger public.workflow_triggers;
  v_event public.trigger_events;
  v_result jsonb;
begin
  if char_length(trim(coalesce(p_input, ''))) = 0
    or char_length(p_input) > 50000 then
    raise exception 'Trigger input must be between 1 and 50,000 characters';
  end if;
  if char_length(trim(coalesce(p_idempotency_key, ''))) not between 1 and 160 then
    raise exception 'Trigger idempotency key must be between 1 and 160 characters';
  end if;

  select * into v_trigger
  from public.workflow_triggers
  where id = p_trigger_id
  for update;
  if not found then raise exception 'Trigger not found'; end if;
  if v_trigger.status <> 'active' then raise exception 'Trigger is paused'; end if;
  if v_trigger.trigger_type <> p_event_source then
    raise exception 'Trigger source does not match trigger type';
  end if;

  begin
    insert into public.trigger_events (
      trigger_id, user_id, event_source, idempotency_key
    ) values (
      v_trigger.id, v_trigger.user_id, p_event_source, trim(p_idempotency_key)
    ) returning * into v_event;
  exception when unique_violation then
    select * into v_event
    from public.trigger_events
    where trigger_id = v_trigger.id
      and idempotency_key = trim(p_idempotency_key);
    return jsonb_build_object(
      'event', to_jsonb(v_event),
      'deduplicated', true
    );
  end;

  begin
    select public.enqueue_workflow_run(
      v_trigger.user_id,
      v_trigger.workflow_id,
      trim(p_input),
      'trigger:' || v_trigger.id::text || ':' || trim(p_idempotency_key)
    ) into v_result;

    update public.trigger_events
    set
      status = 'queued',
      execution_job_id = (v_result->'job'->>'id')::uuid,
      workflow_run_id = (v_result->'run'->>'id')::uuid
    where id = v_event.id
    returning * into v_event;

    update public.workflow_triggers
    set last_fired_at = now()
    where id = v_trigger.id;
  exception when others then
    update public.trigger_events
    set status = 'failed', error_message = left(sqlerrm, 2000)
    where id = v_event.id
    returning * into v_event;
    return jsonb_build_object(
      'event', to_jsonb(v_event),
      'deduplicated', false,
      'error', sqlerrm
    );
  end;

  return v_result || jsonb_build_object(
    'event', to_jsonb(v_event),
    'deduplicated', coalesce((v_result->>'deduplicated')::boolean, false)
  );
end;
$$;

create or replace function public.claim_due_workflow_trigger()
returns public.workflow_triggers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trigger public.workflow_triggers;
begin
  update public.workflow_triggers
  set
    last_fired_at = next_run_at,
    next_run_at = greatest(next_run_at, now())
      + make_interval(mins => interval_minutes)
  where id = (
    select id
    from public.workflow_triggers
    where trigger_type = 'schedule'
      and status = 'active'
      and next_run_at <= now()
    order by next_run_at
    for update skip locked
    limit 1
  )
  returning * into v_trigger;
  return v_trigger;
end;
$$;

create or replace function public.create_vault_credential(
  p_id uuid,
  p_user_id uuid,
  p_name text,
  p_provider text,
  p_last_four text,
  p_fingerprint text,
  p_metadata jsonb,
  p_ciphertext text,
  p_initialization_vector text,
  p_authentication_tag text,
  p_key_version text
)
returns public.vault_credentials
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credential public.vault_credentials;
begin
  insert into public.vault_credentials (
    id, user_id, name, provider, last_four, fingerprint, metadata
  ) values (
    p_id, p_user_id, trim(p_name), p_provider, p_last_four,
    p_fingerprint, coalesce(p_metadata, '{}'::jsonb)
  ) returning * into v_credential;

  insert into public.vault_credential_versions (
    credential_id, user_id, version, ciphertext, initialization_vector,
    authentication_tag, key_version, fingerprint
  ) values (
    p_id, p_user_id, 1, p_ciphertext, p_initialization_vector,
    p_authentication_tag, p_key_version, p_fingerprint
  );

  insert into public.credential_access_logs (
    credential_id, user_id, credential_name, operation, outcome
  ) values (p_id, p_user_id, trim(p_name), 'create', 'success');
  return v_credential;
end;
$$;

create or replace function public.rotate_vault_credential(
  p_credential_id uuid,
  p_user_id uuid,
  p_last_four text,
  p_fingerprint text,
  p_ciphertext text,
  p_initialization_vector text,
  p_authentication_tag text,
  p_key_version text
)
returns public.vault_credentials
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credential public.vault_credentials;
  v_next_version integer;
begin
  select * into v_credential
  from public.vault_credentials
  where id = p_credential_id and user_id = p_user_id
  for update;
  if not found then raise exception 'Credential not found'; end if;

  v_next_version := v_credential.current_version + 1;
  update public.vault_credential_versions
  set retired_at = now()
  where credential_id = v_credential.id and retired_at is null;

  insert into public.vault_credential_versions (
    credential_id, user_id, version, ciphertext, initialization_vector,
    authentication_tag, key_version, fingerprint
  ) values (
    v_credential.id, p_user_id, v_next_version, p_ciphertext,
    p_initialization_vector, p_authentication_tag, p_key_version, p_fingerprint
  );

  update public.vault_credentials
  set
    current_version = v_next_version,
    last_four = p_last_four,
    fingerprint = p_fingerprint,
    rotated_at = now(),
    last_test_status = null,
    last_tested_at = null
  where id = v_credential.id
  returning * into v_credential;

  insert into public.credential_access_logs (
    credential_id, user_id, credential_name, operation, outcome
  ) values (
    v_credential.id, p_user_id, v_credential.name, 'rotate', 'success'
  );
  return v_credential;
end;
$$;

alter table public.workflow_triggers enable row level security;
alter table public.workflow_trigger_secrets enable row level security;
alter table public.trigger_events enable row level security;
alter table public.vault_credentials enable row level security;
alter table public.vault_credential_versions enable row level security;
alter table public.credential_access_logs enable row level security;

revoke all on public.workflow_triggers, public.workflow_trigger_secrets,
  public.trigger_events, public.vault_credentials, public.vault_credential_versions,
  public.credential_access_logs from anon, authenticated;
grant all on public.workflow_triggers, public.workflow_trigger_secrets,
  public.trigger_events, public.vault_credentials, public.vault_credential_versions,
  public.credential_access_logs to service_role;

revoke execute on function public.fire_workflow_trigger(uuid, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.claim_due_workflow_trigger()
  from public, anon, authenticated;
revoke execute on function public.create_vault_credential(
  uuid, uuid, text, text, text, text, jsonb, text, text, text, text
) from public, anon, authenticated;
revoke execute on function public.rotate_vault_credential(
  uuid, uuid, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.fire_workflow_trigger(uuid, text, text, text)
  to service_role;
grant execute on function public.claim_due_workflow_trigger() to service_role;
grant execute on function public.create_vault_credential(
  uuid, uuid, text, text, text, text, jsonb, text, text, text, text
) to service_role;
grant execute on function public.rotate_vault_credential(
  uuid, uuid, text, text, text, text, text, text
) to service_role;
