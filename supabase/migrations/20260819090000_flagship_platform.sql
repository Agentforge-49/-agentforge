-- AgentForge flagship platform: persistent Copilot, reusable workspace tools,
-- versioned visual graphs, and governed knowledge-source synchronization.

begin;

alter table public.workflows
  add column if not exists schema_version integer not null default 1
    check (schema_version in (1, 2)),
  add column if not exists viewport jsonb not null default '{"x":0,"y":0,"zoom":1}'::jsonb
    check (jsonb_typeof(viewport) = 'object');

create table public.copilot_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'New conversation'
    check (char_length(title) between 1 and 120),
  mode text not null default 'copilot'
    check (mode in ('copilot', 'agent_chat')),
  agent_id uuid references public.agents(id) on delete set null,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.copilot_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.copilot_threads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null check (char_length(content) between 1 and 20000),
  status text not null default 'complete'
    check (status in ('streaming', 'complete', 'failed', 'cancelled')),
  citations jsonb not null default '[]'::jsonb
    check (jsonb_typeof(citations) = 'array'),
  generation jsonb not null default '{}'::jsonb
    check (jsonb_typeof(generation) = 'object'),
  parent_message_id uuid references public.copilot_messages(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.copilot_action_proposals (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.copilot_threads(id) on delete cascade,
  message_id uuid references public.copilot_messages(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  action_type text not null
    check (action_type in ('workflow_draft', 'agent_draft', 'evaluation_draft', 'connection_plan')),
  title text not null check (char_length(title) between 1 and 160),
  summary text check (summary is null or char_length(summary) <= 1000),
  preview jsonb not null default '{}'::jsonb
    check (jsonb_typeof(preview) = 'object'),
  status text not null default 'pending'
    check (status in ('pending', 'applied', 'rejected', 'expired')),
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 160),
  applied_resource_type text,
  applied_resource_id uuid,
  applied_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table public.workspace_tools (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text check (description is null or char_length(description) <= 500),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);

create table public.workspace_tool_versions (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references public.workspace_tools(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  input_schema jsonb not null default '{"type":"object","properties":{}}'::jsonb
    check (jsonb_typeof(input_schema) = 'object'),
  output_schema jsonb not null default '{"type":"object","properties":{}}'::jsonb
    check (jsonb_typeof(output_schema) = 'object'),
  steps jsonb not null default '[]'::jsonb
    check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) between 1 and 50),
  test_fixture jsonb not null default '{}'::jsonb
    check (jsonb_typeof(test_fixture) = 'object'),
  change_summary text check (change_summary is null or char_length(change_summary) <= 500),
  created_at timestamptz not null default now(),
  unique (tool_id, version_number)
);

alter table public.workspace_tools
  add constraint workspace_tools_current_version_fk
  foreign key (current_version_id) references public.workspace_tool_versions(id) on delete set null;

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  knowledge_base_id uuid not null references public.knowledge_bases(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_type text not null
    check (source_type in ('text', 'pdf', 'docx', 'csv', 'website', 'google_drive', 'notion')),
  name text not null check (char_length(name) between 1 and 160),
  configuration jsonb not null default '{}'::jsonb
    check (jsonb_typeof(configuration) = 'object'),
  status text not null default 'pending'
    check (status in ('pending', 'syncing', 'ready', 'failed', 'paused')),
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  last_synced_at timestamptz,
  next_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index copilot_threads_user_updated_idx
  on public.copilot_threads(user_id, updated_at desc);
create index copilot_messages_thread_created_idx
  on public.copilot_messages(thread_id, created_at);
create index copilot_proposals_thread_status_idx
  on public.copilot_action_proposals(thread_id, status, created_at desc);
create index workspace_tools_user_status_idx
  on public.workspace_tools(user_id, status, updated_at desc);
create index workspace_tool_versions_tool_idx
  on public.workspace_tool_versions(tool_id, version_number desc);
create index knowledge_sources_base_status_idx
  on public.knowledge_sources(knowledge_base_id, status, updated_at desc);

create trigger set_copilot_threads_updated_at
  before update on public.copilot_threads
  for each row execute function public.set_updated_at();
create trigger set_workspace_tools_updated_at
  before update on public.workspace_tools
  for each row execute function public.set_updated_at();
create trigger set_knowledge_sources_updated_at
  before update on public.knowledge_sources
  for each row execute function public.set_updated_at();

create or replace function public.apply_copilot_workflow_proposal(
  p_user_id uuid,
  p_proposal_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal public.copilot_action_proposals%rowtype;
  v_workflow_id uuid;
begin
  select * into v_proposal
  from public.copilot_action_proposals
  where id = p_proposal_id and user_id = p_user_id
  for update;

  if not found then raise exception 'Proposal not found'; end if;
  if v_proposal.status = 'applied' then
    return jsonb_build_object(
      'status', 'applied',
      'resource_type', v_proposal.applied_resource_type,
      'resource_id', v_proposal.applied_resource_id
    );
  end if;
  if v_proposal.status <> 'pending' then raise exception 'Proposal is no longer pending'; end if;
  if v_proposal.expires_at <= now() then
    update public.copilot_action_proposals set status = 'expired' where id = v_proposal.id;
    return jsonb_build_object('status', 'expired');
  end if;
  if v_proposal.action_type <> 'workflow_draft' then
    raise exception 'Proposal type is not yet applyable';
  end if;

  insert into public.workflows (
    user_id, name, description, nodes, edges, status, schema_version, viewport
  ) values (
    p_user_id,
    left(coalesce(v_proposal.preview->>'name', v_proposal.title), 100),
    left(coalesce(v_proposal.preview->>'description', v_proposal.summary), 500),
    coalesce(v_proposal.preview->'nodes', '[]'::jsonb),
    coalesce(v_proposal.preview->'edges', '[]'::jsonb),
    'draft',
    2,
    coalesce(v_proposal.preview->'viewport', '{"x":0,"y":0,"zoom":1}'::jsonb)
  ) returning id into v_workflow_id;

  update public.copilot_action_proposals
  set status = 'applied', applied_resource_type = 'workflow',
      applied_resource_id = v_workflow_id, applied_at = now()
  where id = v_proposal.id;

  return jsonb_build_object(
    'status', 'applied', 'resource_type', 'workflow', 'resource_id', v_workflow_id
  );
end;
$$;

alter table public.copilot_threads enable row level security;
alter table public.copilot_messages enable row level security;
alter table public.copilot_action_proposals enable row level security;
alter table public.workspace_tools enable row level security;
alter table public.workspace_tool_versions enable row level security;
alter table public.knowledge_sources enable row level security;

revoke all on public.copilot_threads, public.copilot_messages,
  public.copilot_action_proposals, public.workspace_tools,
  public.workspace_tool_versions, public.knowledge_sources
  from anon, authenticated;
grant all on public.copilot_threads, public.copilot_messages,
  public.copilot_action_proposals, public.workspace_tools,
  public.workspace_tool_versions, public.knowledge_sources
  to service_role;

revoke execute on function public.apply_copilot_workflow_proposal(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.apply_copilot_workflow_proposal(uuid, uuid)
  to service_role;

-- Realtime is an optimization only; clients retain bounded exponential polling.
do $$
declare
  v_table_name text;
begin
  foreach v_table_name in array array[
    'execution_jobs', 'approval_requests', 'run_observability',
    'copilot_threads', 'copilot_messages', 'copilot_action_proposals'
  ] loop
    if not exists (
      select 1 from pg_publication_tables p
      where p.pubname = 'supabase_realtime' and p.schemaname = 'public'
        and p.tablename = v_table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table_name);
    end if;
  end loop;
end;
$$;

commit;
