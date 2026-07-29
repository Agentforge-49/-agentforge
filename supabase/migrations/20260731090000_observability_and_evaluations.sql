-- AgentForge Days 10-11: structured observability and evaluation quality gates.

alter table public.execution_jobs
  drop constraint if exists execution_jobs_job_type_check;
alter table public.execution_jobs
  add constraint execution_jobs_job_type_check
  check (job_type in ('agent_run', 'workflow_run', 'evaluation_run'));

create table public.run_observability (
  execution_job_id uuid primary key references public.execution_jobs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  run_type text not null
    check (run_type in ('agent_run', 'workflow_run', 'evaluation_run')),
  status text not null
    check (status in (
      'queued', 'running', 'retry_wait', 'waiting_approval',
      'succeeded', 'failed', 'cancelled'
    )),
  resource_name text not null check (char_length(resource_name) between 1 and 200),
  model text,
  tokens_used integer not null default 0 check (tokens_used >= 0),
  estimated_cost_usd numeric(12, 6) not null default 0
    check (estimated_cost_usd >= 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  structured_error jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.run_events (
  id uuid primary key default gen_random_uuid(),
  execution_job_id uuid not null references public.execution_jobs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (char_length(event_type) between 1 and 80),
  level text not null default 'info'
    check (level in ('debug', 'info', 'warning', 'error')),
  status text,
  message text not null check (char_length(message) between 1 and 1000),
  node_id text,
  attempt integer not null default 0 check (attempt >= 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  tokens_used integer not null default 0 check (tokens_used >= 0),
  estimated_cost_usd numeric(12, 6) not null default 0
    check (estimated_cost_usd >= 0),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index run_observability_user_created_idx
  on public.run_observability(user_id, created_at desc);
create index run_observability_user_status_idx
  on public.run_observability(user_id, status, created_at desc);
create index run_events_job_created_idx
  on public.run_events(execution_job_id, created_at, id);
create index run_events_user_level_idx
  on public.run_events(user_id, level, created_at desc);

create trigger set_run_observability_updated_at
  before update on public.run_observability
  for each row execute function public.set_updated_at();

create table public.evaluation_suites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  agent_id uuid not null,
  name text not null check (char_length(name) between 1 and 100),
  description text check (description is null or char_length(description) <= 500),
  gate_threshold numeric(5, 2) not null default 80
    check (gate_threshold between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint evaluation_suites_agent_owner_fk
    foreign key (agent_id, user_id)
    references public.agents(id, user_id)
    on delete cascade,
  unique (id, user_id)
);

create table public.evaluation_cases (
  id uuid primary key default gen_random_uuid(),
  suite_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  input_text text not null check (char_length(input_text) between 1 and 50000),
  expected_output text not null check (char_length(expected_output) between 1 and 50000),
  assertion_type text not null default 'contains'
    check (assertion_type in ('exact', 'contains', 'not_contains', 'json_equals')),
  weight numeric(6, 2) not null default 1 check (weight > 0 and weight <= 100),
  created_at timestamptz not null default now(),
  constraint evaluation_cases_suite_owner_fk
    foreign key (suite_id, user_id)
    references public.evaluation_suites(id, user_id)
    on delete cascade,
  unique (id, user_id)
);

create table public.evaluation_runs (
  id uuid primary key default gen_random_uuid(),
  suite_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  execution_job_id uuid unique
    references public.execution_jobs(id) on delete set null,
  baseline_version_id uuid not null references public.agent_versions(id),
  candidate_version_id uuid not null references public.agent_versions(id),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  gate_threshold numeric(5, 2) not null check (gate_threshold between 0 and 100),
  baseline_score numeric(5, 2) check (baseline_score between 0 and 100),
  candidate_score numeric(5, 2) check (candidate_score between 0 and 100),
  gate_passed boolean,
  promoted_version_id uuid references public.agent_versions(id),
  promoted_at timestamptz,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint evaluation_runs_suite_owner_fk
    foreign key (suite_id, user_id)
    references public.evaluation_suites(id, user_id)
    on delete cascade,
  unique (id, user_id)
);

create table public.evaluation_results (
  id uuid primary key default gen_random_uuid(),
  evaluation_run_id uuid not null,
  case_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  variant text not null check (variant in ('baseline', 'candidate')),
  agent_version_id uuid not null references public.agent_versions(id),
  actual_output text,
  score numeric(5, 2) not null check (score between 0 and 100),
  passed boolean not null,
  tokens_used integer not null default 0 check (tokens_used >= 0),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  estimated_cost_usd numeric(12, 6) not null default 0
    check (estimated_cost_usd >= 0),
  error_message text,
  created_at timestamptz not null default now(),
  constraint evaluation_results_run_owner_fk
    foreign key (evaluation_run_id, user_id)
    references public.evaluation_runs(id, user_id)
    on delete cascade,
  constraint evaluation_results_case_owner_fk
    foreign key (case_id, user_id)
    references public.evaluation_cases(id, user_id)
    on delete cascade,
  unique (evaluation_run_id, case_id, variant)
);

create index evaluation_suites_user_created_idx
  on public.evaluation_suites(user_id, created_at desc);
create index evaluation_cases_suite_idx
  on public.evaluation_cases(suite_id, created_at);
create index evaluation_runs_suite_created_idx
  on public.evaluation_runs(suite_id, created_at desc);
create index evaluation_runs_user_status_idx
  on public.evaluation_runs(user_id, status, created_at desc);
create index evaluation_results_run_case_idx
  on public.evaluation_results(evaluation_run_id, case_id, variant);

create trigger set_evaluation_suites_updated_at
  before update on public.evaluation_suites
  for each row execute function public.set_updated_at();

create or replace function public.enqueue_evaluation_run(
  p_user_id uuid,
  p_suite_id uuid,
  p_baseline_version_id uuid,
  p_candidate_version_id uuid,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_suite public.evaluation_suites;
  v_existing public.execution_jobs;
  v_job public.execution_jobs;
  v_run public.evaluation_runs;
  v_case_count integer;
begin
  if p_baseline_version_id = p_candidate_version_id then
    raise exception 'Baseline and candidate versions must be different';
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
    where user_id = p_user_id and idempotency_key = p_idempotency_key;
    if found then
      select * into v_run from public.evaluation_runs
      where execution_job_id = v_existing.id;
      return jsonb_build_object(
        'job', to_jsonb(v_existing),
        'run', to_jsonb(v_run),
        'deduplicated', true
      );
    end if;
  end if;

  select * into v_suite
  from public.evaluation_suites
  where id = p_suite_id and user_id = p_user_id;
  if not found then raise exception 'Evaluation suite not found'; end if;

  select count(*) into v_case_count
  from public.evaluation_cases
  where suite_id = v_suite.id and user_id = p_user_id;
  if v_case_count < 1 then raise exception 'Evaluation suite has no cases'; end if;
  if v_case_count > 25 then raise exception 'Evaluation suite exceeds 25 cases'; end if;

  if not exists (
    select 1 from public.agent_versions
    where id = p_baseline_version_id
      and agent_id = v_suite.agent_id
      and user_id = p_user_id
  ) then raise exception 'Baseline version not found'; end if;
  if not exists (
    select 1 from public.agent_versions
    where id = p_candidate_version_id
      and agent_id = v_suite.agent_id
      and user_id = p_user_id
  ) then raise exception 'Candidate version not found'; end if;

  insert into public.execution_jobs (
    user_id, job_type, payload, idempotency_key, max_attempts, timeout_seconds
  ) values (
    p_user_id,
    'evaluation_run',
    jsonb_build_object(
      'suite_id', v_suite.id,
      'agent_id', v_suite.agent_id,
      'baseline_version_id', p_baseline_version_id,
      'candidate_version_id', p_candidate_version_id
    ),
    nullif(trim(p_idempotency_key), ''),
    1,
    900
  ) returning * into v_job;

  insert into public.evaluation_runs (
    suite_id, user_id, execution_job_id, baseline_version_id,
    candidate_version_id, gate_threshold
  ) values (
    v_suite.id, p_user_id, v_job.id, p_baseline_version_id,
    p_candidate_version_id, v_suite.gate_threshold
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

-- Backfill summaries so the observability page starts with existing history.
insert into public.run_observability (
  execution_job_id, user_id, run_type, status, resource_name, model,
  tokens_used, duration_ms, structured_error, started_at, completed_at, created_at
)
select
  j.id,
  j.user_id,
  j.job_type,
  j.status,
  coalesce(a.name, w.name, 'Historical run'),
  av.model,
  coalesce(
    ar.tokens_used,
    case when coalesce(wr.output->>'total_tokens', '') ~ '^[0-9]+$'
      then (wr.output->>'total_tokens')::integer else null end,
    0
  ),
  coalesce(
    ar.duration_ms,
    case when j.started_at is not null and j.completed_at is not null
      then greatest(0, floor(extract(epoch from (j.completed_at - j.started_at)) * 1000)::integer)
      else null end
  ),
  case when j.error_message is not null
    then jsonb_build_object('message', left(j.error_message, 1000), 'category', 'historical')
    else null end,
  j.started_at,
  j.completed_at,
  j.created_at
from public.execution_jobs j
left join public.agent_runs ar
  on j.job_type = 'agent_run' and ar.id = j.resource_id
left join public.agents a on a.id = ar.agent_id
left join public.agent_versions av on av.id = ar.agent_version_id
left join public.workflow_runs wr
  on j.job_type = 'workflow_run' and wr.id = j.resource_id
left join public.workflows w on w.id = wr.workflow_id
where j.job_type in ('agent_run', 'workflow_run')
on conflict (execution_job_id) do nothing;

alter table public.run_observability enable row level security;
alter table public.run_events enable row level security;
alter table public.evaluation_suites enable row level security;
alter table public.evaluation_cases enable row level security;
alter table public.evaluation_runs enable row level security;
alter table public.evaluation_results enable row level security;

revoke all on public.run_observability, public.run_events,
  public.evaluation_suites, public.evaluation_cases, public.evaluation_runs,
  public.evaluation_results from anon, authenticated;
grant all on public.run_observability, public.run_events,
  public.evaluation_suites, public.evaluation_cases, public.evaluation_runs,
  public.evaluation_results to service_role;

revoke execute on function public.enqueue_evaluation_run(uuid, uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.enqueue_evaluation_run(uuid, uuid, uuid, uuid, text)
  to service_role;
