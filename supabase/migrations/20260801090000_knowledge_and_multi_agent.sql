-- AgentForge Days 12-13: knowledge, memory, citations, and bounded multi-agent runs.

alter table public.execution_jobs
  drop constraint if exists execution_jobs_job_type_check;
alter table public.execution_jobs
  add constraint execution_jobs_job_type_check
  check (job_type in (
    'agent_run', 'workflow_run', 'evaluation_run', 'multi_agent_run'
  ));

alter table public.run_observability
  drop constraint if exists run_observability_run_type_check;
alter table public.run_observability
  add constraint run_observability_run_type_check
  check (run_type in (
    'agent_run', 'workflow_run', 'evaluation_run', 'multi_agent_run'
  ));

alter table public.agent_runs
  add column citations jsonb not null default '[]'::jsonb,
  add column memory_context jsonb not null default '[]'::jsonb;

create table public.knowledge_bases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  description text check (description is null or char_length(description) <= 500),
  retention_days integer check (retention_days is null or retention_days between 1 and 3650),
  memory_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name)
);

create table public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  knowledge_base_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  source_type text not null default 'upload'
    check (source_type in ('upload', 'manual', 'url')),
  source_uri text check (source_uri is null or char_length(source_uri) <= 2000),
  mime_type text not null default 'text/plain'
    check (char_length(mime_type) between 1 and 100),
  content_hash text not null check (char_length(content_hash) = 64),
  character_count integer not null check (character_count between 1 and 1000000),
  chunk_count integer not null default 0 check (chunk_count between 0 and 5000),
  status text not null default 'processing'
    check (status in ('processing', 'ready', 'failed')),
  error_message text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_documents_base_owner_fk
    foreign key (knowledge_base_id, user_id)
    references public.knowledge_bases(id, user_id)
    on delete cascade,
  unique (id, user_id),
  unique (knowledge_base_id, content_hash)
);

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  knowledge_base_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null check (char_length(content) between 1 and 5000),
  token_estimate integer not null check (token_estimate between 1 and 2000),
  search_vector tsvector generated always as (
    to_tsvector('english', content)
  ) stored,
  created_at timestamptz not null default now(),
  constraint knowledge_chunks_document_owner_fk
    foreign key (document_id, user_id)
    references public.knowledge_documents(id, user_id)
    on delete cascade,
  constraint knowledge_chunks_base_owner_fk
    foreign key (knowledge_base_id, user_id)
    references public.knowledge_bases(id, user_id)
    on delete cascade,
  unique (document_id, chunk_index)
);

create table public.agent_knowledge_bases (
  agent_id uuid not null,
  knowledge_base_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (agent_id, knowledge_base_id),
  constraint agent_knowledge_agent_owner_fk
    foreign key (agent_id, user_id)
    references public.agents(id, user_id)
    on delete cascade,
  constraint agent_knowledge_base_owner_fk
    foreign key (knowledge_base_id, user_id)
    references public.knowledge_bases(id, user_id)
    on delete cascade
);

create table public.memory_entries (
  id uuid primary key default gen_random_uuid(),
  knowledge_base_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  scope_type text not null
    check (scope_type in ('general', 'agent', 'workflow', 'run')),
  scope_id uuid,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null check (char_length(content) between 1 and 20000),
  importance smallint not null default 3 check (importance between 1 and 5),
  source_run_id uuid references public.agent_runs(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (scope_type = 'general' and scope_id is null)
    or (scope_type <> 'general' and scope_id is not null)
  ),
  constraint memory_entries_base_owner_fk
    foreign key (knowledge_base_id, user_id)
    references public.knowledge_bases(id, user_id)
    on delete cascade
);

create table public.knowledge_retrieval_events (
  id uuid primary key default gen_random_uuid(),
  knowledge_base_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  execution_job_id uuid references public.execution_jobs(id) on delete set null,
  query text not null check (char_length(query) between 1 and 5000),
  result_count integer not null check (result_count between 0 and 20),
  citation_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint knowledge_retrieval_base_owner_fk
    foreign key (knowledge_base_id, user_id)
    references public.knowledge_bases(id, user_id)
    on delete cascade
);

create index knowledge_documents_base_created_idx
  on public.knowledge_documents(knowledge_base_id, created_at desc);
create index knowledge_documents_expiry_idx
  on public.knowledge_documents(expires_at) where expires_at is not null;
create index knowledge_chunks_search_idx
  on public.knowledge_chunks using gin(search_vector);
create index knowledge_chunks_base_idx
  on public.knowledge_chunks(knowledge_base_id, document_id, chunk_index);
create index memory_entries_scope_idx
  on public.memory_entries(user_id, scope_type, scope_id, created_at desc);
create index memory_entries_expiry_idx
  on public.memory_entries(expires_at) where expires_at is not null;
create index knowledge_retrieval_user_created_idx
  on public.knowledge_retrieval_events(user_id, created_at desc);

create trigger set_knowledge_bases_updated_at
  before update on public.knowledge_bases
  for each row execute function public.set_updated_at();
create trigger set_knowledge_documents_updated_at
  before update on public.knowledge_documents
  for each row execute function public.set_updated_at();

create or replace function public.search_knowledge_chunks(
  p_user_id uuid,
  p_knowledge_base_ids uuid[],
  p_query text,
  p_limit integer default 5
)
returns table (
  chunk_id uuid,
  document_id uuid,
  knowledge_base_id uuid,
  document_title text,
  source_uri text,
  chunk_index integer,
  content text,
  rank real
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    c.id,
    c.document_id,
    c.knowledge_base_id,
    d.title,
    d.source_uri,
    c.chunk_index,
    c.content,
    ts_rank_cd(c.search_vector, websearch_to_tsquery('english', p_query)) as rank
  from public.knowledge_chunks c
  join public.knowledge_documents d
    on d.id = c.document_id and d.user_id = c.user_id
  where c.user_id = p_user_id
    and c.knowledge_base_id = any(p_knowledge_base_ids)
    and d.status = 'ready'
    and (d.expires_at is null or d.expires_at > now())
    and c.search_vector @@ websearch_to_tsquery('english', p_query)
  order by rank desc, d.created_at desc, c.chunk_index
  limit least(20, greatest(1, p_limit));
$$;

create or replace function public.purge_expired_knowledge()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_documents integer;
  v_memories integer;
begin
  delete from public.knowledge_documents
  where expires_at is not null and expires_at <= now();
  get diagnostics v_documents = row_count;
  delete from public.memory_entries
  where expires_at is not null and expires_at <= now();
  get diagnostics v_memories = row_count;
  return jsonb_build_object(
    'documents_deleted', v_documents,
    'memories_deleted', v_memories
  );
end;
$$;

create table public.multi_agent_systems (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  description text check (description is null or char_length(description) <= 500),
  supervisor_agent_id uuid,
  strategy text not null default 'router'
    check (strategy in ('router', 'parallel', 'supervisor')),
  aggregation_strategy text not null default 'concatenate'
    check (aggregation_strategy in ('concatenate', 'vote', 'supervisor')),
  supervisor_prompt text check (
    supervisor_prompt is null or char_length(supervisor_prompt) <= 4000
  ),
  max_delegations integer not null default 6 check (max_delegations between 1 and 20),
  max_parallel integer not null default 3 check (max_parallel between 1 and 8),
  max_depth integer not null default 2 check (max_depth between 1 and 5),
  timeout_seconds integer not null default 180 check (timeout_seconds between 15 and 900),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint multi_agent_supervisor_owner_fk
    foreign key (supervisor_agent_id, user_id)
    references public.agents(id, user_id)
    on delete restrict
);

create table public.multi_agent_members (
  id uuid primary key default gen_random_uuid(),
  system_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  agent_id uuid not null,
  role text not null default 'worker'
    check (role in ('worker', 'specialist')),
  route_keywords text[] not null default '{}',
  position integer not null default 0 check (position between 0 and 100),
  created_at timestamptz not null default now(),
  constraint multi_agent_members_system_owner_fk
    foreign key (system_id, user_id)
    references public.multi_agent_systems(id, user_id)
    on delete cascade,
  constraint multi_agent_members_agent_owner_fk
    foreign key (agent_id, user_id)
    references public.agents(id, user_id)
    on delete restrict,
  unique (system_id, agent_id)
);

create table public.multi_agent_runs (
  id uuid primary key default gen_random_uuid(),
  system_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  execution_job_id uuid unique references public.execution_jobs(id) on delete set null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  input_text text not null check (char_length(input_text) between 1 and 50000),
  output_text text,
  delegation_count integer not null default 0 check (delegation_count between 0 and 20),
  maximum_depth integer not null default 0 check (maximum_depth between 0 and 5),
  total_tokens integer not null default 0 check (total_tokens >= 0),
  estimated_cost_usd numeric(12, 6) not null default 0
    check (estimated_cost_usd >= 0),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint multi_agent_runs_system_owner_fk
    foreign key (system_id, user_id)
    references public.multi_agent_systems(id, user_id)
    on delete cascade,
  unique (id, user_id)
);

create table public.multi_agent_tasks (
  id uuid primary key default gen_random_uuid(),
  multi_agent_run_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  parent_task_id uuid references public.multi_agent_tasks(id) on delete cascade,
  agent_id uuid not null,
  task_order integer not null check (task_order >= 1),
  depth integer not null check (depth between 0 and 5),
  task_signature text not null check (char_length(task_signature) = 64),
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed', 'cancelled')),
  input_text text not null check (char_length(input_text) between 1 and 50000),
  output_text text,
  routing_reason text check (routing_reason is null or char_length(routing_reason) <= 500),
  tokens_used integer not null default 0 check (tokens_used >= 0),
  estimated_cost_usd numeric(12, 6) not null default 0
    check (estimated_cost_usd >= 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint multi_agent_tasks_run_owner_fk
    foreign key (multi_agent_run_id, user_id)
    references public.multi_agent_runs(id, user_id)
    on delete cascade,
  constraint multi_agent_tasks_agent_owner_fk
    foreign key (agent_id, user_id)
    references public.agents(id, user_id)
    on delete restrict,
  unique (multi_agent_run_id, task_signature)
);

create index multi_agent_systems_user_created_idx
  on public.multi_agent_systems(user_id, created_at desc);
create index multi_agent_members_system_position_idx
  on public.multi_agent_members(system_id, position, created_at);
create index multi_agent_runs_system_created_idx
  on public.multi_agent_runs(system_id, created_at desc);
create index multi_agent_tasks_run_order_idx
  on public.multi_agent_tasks(multi_agent_run_id, task_order);

create trigger set_multi_agent_systems_updated_at
  before update on public.multi_agent_systems
  for each row execute function public.set_updated_at();

create or replace function public.enqueue_multi_agent_run(
  p_user_id uuid,
  p_system_id uuid,
  p_input text,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_system public.multi_agent_systems;
  v_existing public.execution_jobs;
  v_job public.execution_jobs;
  v_run public.multi_agent_runs;
  v_member_count integer;
begin
  if char_length(trim(coalesce(p_input, ''))) not between 1 and 50000 then
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
    select * into v_existing from public.execution_jobs
    where user_id = p_user_id and idempotency_key = p_idempotency_key;
    if found then
      select * into v_run from public.multi_agent_runs
      where execution_job_id = v_existing.id;
      return jsonb_build_object(
        'job', to_jsonb(v_existing),
        'run', to_jsonb(v_run),
        'deduplicated', true
      );
    end if;
  end if;

  select * into v_system from public.multi_agent_systems
  where id = p_system_id and user_id = p_user_id;
  if not found then raise exception 'Multi-agent system not found'; end if;
  if v_system.status <> 'active' then raise exception 'Multi-agent system must be active'; end if;
  select count(*) into v_member_count from public.multi_agent_members
  where system_id = v_system.id and user_id = p_user_id;
  if v_member_count < 1 then raise exception 'Multi-agent system has no workers'; end if;

  insert into public.execution_jobs (
    user_id, job_type, payload, idempotency_key, timeout_seconds, max_attempts
  ) values (
    p_user_id,
    'multi_agent_run',
    jsonb_build_object('system_id', v_system.id, 'input', trim(p_input)),
    nullif(trim(p_idempotency_key), ''),
    v_system.timeout_seconds,
    1
  ) returning * into v_job;

  insert into public.multi_agent_runs (
    system_id, user_id, execution_job_id, input_text
  ) values (
    v_system.id, p_user_id, v_job.id, trim(p_input)
  ) returning * into v_run;

  update public.execution_jobs set resource_id = v_run.id
  where id = v_job.id returning * into v_job;

  return jsonb_build_object(
    'job', to_jsonb(v_job),
    'run', to_jsonb(v_run),
    'deduplicated', false
  );
end;
$$;

alter table public.knowledge_bases enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.agent_knowledge_bases enable row level security;
alter table public.memory_entries enable row level security;
alter table public.knowledge_retrieval_events enable row level security;
alter table public.multi_agent_systems enable row level security;
alter table public.multi_agent_members enable row level security;
alter table public.multi_agent_runs enable row level security;
alter table public.multi_agent_tasks enable row level security;

revoke all on public.knowledge_bases, public.knowledge_documents,
  public.knowledge_chunks, public.agent_knowledge_bases, public.memory_entries,
  public.knowledge_retrieval_events, public.multi_agent_systems,
  public.multi_agent_members, public.multi_agent_runs,
  public.multi_agent_tasks from anon, authenticated;
grant all on public.knowledge_bases, public.knowledge_documents,
  public.knowledge_chunks, public.agent_knowledge_bases, public.memory_entries,
  public.knowledge_retrieval_events, public.multi_agent_systems,
  public.multi_agent_members, public.multi_agent_runs,
  public.multi_agent_tasks to service_role;

revoke execute on function public.search_knowledge_chunks(uuid, uuid[], text, integer)
  from public, anon, authenticated;
revoke execute on function public.purge_expired_knowledge()
  from public, anon, authenticated;
revoke execute on function public.enqueue_multi_agent_run(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.search_knowledge_chunks(uuid, uuid[], text, integer)
  to service_role;
grant execute on function public.purge_expired_knowledge() to service_role;
grant execute on function public.enqueue_multi_agent_run(uuid, uuid, text, text)
  to service_role;
