-- AgentForge Day 3: immutable agent versions, publishing, rollback, and
-- run-to-version traceability.

create table if not exists public.agent_versions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null,
  user_id uuid not null,
  version_number integer not null check (version_number >= 1),
  name text not null,
  description text,
  category text not null
    check (category in ('research', 'writing', 'automation', 'support', 'data', 'other')),
  system_prompt text not null default '',
  personality text not null
    check (personality in ('professional', 'friendly', 'concise', 'creative')),
  model text not null,
  temperature double precision not null
    check (temperature >= 0 and temperature <= 1),
  max_tokens integer not null
    check (max_tokens >= 1 and max_tokens <= 8192),
  tool_slugs text[] not null default '{}',
  change_summary text,
  source_version_id uuid references public.agent_versions(id),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  published_at timestamptz not null default now(),
  constraint agent_versions_agent_owner_fkey
    foreign key (agent_id, user_id)
    references public.agents(id, user_id)
    on delete cascade,
  unique (agent_id, version_number)
);

create unique index if not exists agent_versions_id_agent_user_key
  on public.agent_versions (id, agent_id, user_id);
create index if not exists idx_agent_versions_agent_version
  on public.agent_versions (agent_id, version_number desc);
create index if not exists idx_agent_versions_user_published
  on public.agent_versions (user_id, published_at desc);

alter table public.agents
  add column if not exists published_version_id uuid,
  add column if not exists latest_version_number integer not null default 0,
  add column if not exists has_unpublished_changes boolean not null default true,
  add column if not exists published_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.agents'::regclass
      and conname = 'agents_latest_version_number_check'
  ) then
    alter table public.agents
      add constraint agents_latest_version_number_check
      check (latest_version_number >= 0);
  end if;
end
$$;

-- Preserve every legacy agent as published version 1. The previous application
-- allowed draft agents to run, so promoting only these existing records keeps
-- production behavior intact while new records use the stricter lifecycle.
insert into public.agent_versions (
  agent_id,
  user_id,
  version_number,
  name,
  description,
  category,
  system_prompt,
  personality,
  model,
  temperature,
  max_tokens,
  tool_slugs,
  change_summary,
  created_by,
  created_at,
  published_at
)
select
  a.id,
  a.user_id,
  1,
  a.name,
  a.description,
  a.category,
  a.system_prompt,
  a.personality,
  a.model,
  a.temperature,
  a.max_tokens,
  coalesce(
    array_agg(t.slug order by t.slug) filter (where t.slug is not null),
    '{}'::text[]
  ),
  'Imported from the pre-versioning agent configuration',
  a.user_id,
  a.created_at,
  coalesce(a.updated_at, a.created_at)
from public.agents a
left join public.agent_tools at on at.agent_id = a.id
left join public.tools t on t.id = at.tool_id
where not exists (
  select 1
  from public.agent_versions av
  where av.agent_id = a.id
)
group by a.id;

update public.agents a
set
  published_version_id = av.id,
  latest_version_number = av.version_number,
  has_unpublished_changes = false,
  published_at = av.published_at,
  status = 'active'
from public.agent_versions av
where av.agent_id = a.id
  and av.version_number = 1
  and a.published_version_id is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.agents'::regclass
      and conname = 'agents_published_version_fkey'
  ) then
    alter table public.agents
      add constraint agents_published_version_fkey
      foreign key (published_version_id, id, user_id)
      references public.agent_versions(id, agent_id, user_id);
  end if;
end
$$;

alter table public.agent_runs
  add column if not exists agent_version_id uuid;

update public.agent_runs ar
set agent_version_id = a.published_version_id
from public.agents a
where a.id = ar.agent_id
  and a.user_id = ar.user_id
  and ar.agent_version_id is null;

alter table public.agent_runs
  alter column agent_version_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.agent_runs'::regclass
      and conname = 'agent_runs_version_owner_fkey'
  ) then
    alter table public.agent_runs
      add constraint agent_runs_version_owner_fkey
      foreign key (agent_version_id, agent_id, user_id)
      references public.agent_versions(id, agent_id, user_id);
  end if;
end
$$;

create index if not exists idx_agent_runs_version_started_at
  on public.agent_runs (agent_version_id, started_at desc);

create or replace function public.mark_agent_draft_changed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if
    new.name is distinct from old.name
    or new.description is distinct from old.description
    or new.category is distinct from old.category
    or new.system_prompt is distinct from old.system_prompt
    or new.personality is distinct from old.personality
    or new.model is distinct from old.model
    or new.temperature is distinct from old.temperature
    or new.max_tokens is distinct from old.max_tokens
  then
    new.has_unpublished_changes = true;
  end if;
  return new;
end;
$$;

drop trigger if exists mark_agent_draft_changed on public.agents;
create trigger mark_agent_draft_changed
  before update of
    name,
    description,
    category,
    system_prompt,
    personality,
    model,
    temperature,
    max_tokens
  on public.agents
  for each row execute function public.mark_agent_draft_changed();

create or replace function public.reject_agent_version_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Published agent versions are immutable';
end;
$$;

drop trigger if exists reject_agent_version_update on public.agent_versions;
create trigger reject_agent_version_update
  before update on public.agent_versions
  for each row execute function public.reject_agent_version_update();

create or replace function public.publish_agent_version(
  p_agent_id uuid,
  p_user_id uuid,
  p_change_summary text default null
)
returns public.agent_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent public.agents%rowtype;
  v_version public.agent_versions%rowtype;
  v_tool_slugs text[];
  v_next_version integer;
begin
  select *
  into v_agent
  from public.agents
  where id = p_agent_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Agent not found';
  end if;

  select coalesce(
    array_agg(t.slug order by t.slug) filter (where t.slug is not null),
    '{}'::text[]
  )
  into v_tool_slugs
  from public.agent_tools at
  join public.tools t on t.id = at.tool_id
  where at.agent_id = p_agent_id;

  v_next_version := v_agent.latest_version_number + 1;

  insert into public.agent_versions (
    agent_id,
    user_id,
    version_number,
    name,
    description,
    category,
    system_prompt,
    personality,
    model,
    temperature,
    max_tokens,
    tool_slugs,
    change_summary,
    created_by,
    published_at
  )
  values (
    v_agent.id,
    v_agent.user_id,
    v_next_version,
    v_agent.name,
    v_agent.description,
    v_agent.category,
    v_agent.system_prompt,
    v_agent.personality,
    v_agent.model,
    v_agent.temperature,
    v_agent.max_tokens,
    v_tool_slugs,
    nullif(btrim(p_change_summary), ''),
    p_user_id,
    now()
  )
  returning * into v_version;

  update public.agents
  set
    published_version_id = v_version.id,
    latest_version_number = v_version.version_number,
    has_unpublished_changes = false,
    published_at = v_version.published_at,
    status = 'active'
  where id = p_agent_id
    and user_id = p_user_id;

  return v_version;
end;
$$;

create or replace function public.rollback_agent_version(
  p_agent_id uuid,
  p_user_id uuid,
  p_source_version_id uuid,
  p_change_summary text default null
)
returns public.agent_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent public.agents%rowtype;
  v_source public.agent_versions%rowtype;
  v_version public.agent_versions%rowtype;
  v_next_version integer;
begin
  select *
  into v_agent
  from public.agents
  where id = p_agent_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Agent not found';
  end if;

  select *
  into v_source
  from public.agent_versions
  where id = p_source_version_id
    and agent_id = p_agent_id
    and user_id = p_user_id;

  if not found then
    raise exception 'Agent version not found';
  end if;

  v_next_version := v_agent.latest_version_number + 1;

  insert into public.agent_versions (
    agent_id,
    user_id,
    version_number,
    name,
    description,
    category,
    system_prompt,
    personality,
    model,
    temperature,
    max_tokens,
    tool_slugs,
    change_summary,
    source_version_id,
    created_by,
    published_at
  )
  values (
    v_agent.id,
    v_agent.user_id,
    v_next_version,
    v_source.name,
    v_source.description,
    v_source.category,
    v_source.system_prompt,
    v_source.personality,
    v_source.model,
    v_source.temperature,
    v_source.max_tokens,
    v_source.tool_slugs,
    coalesce(
      nullif(btrim(p_change_summary), ''),
      format('Rollback to version %s', v_source.version_number)
    ),
    v_source.id,
    p_user_id,
    now()
  )
  returning * into v_version;

  update public.agents
  set
    name = v_source.name,
    description = v_source.description,
    category = v_source.category,
    system_prompt = v_source.system_prompt,
    personality = v_source.personality,
    model = v_source.model,
    temperature = v_source.temperature,
    max_tokens = v_source.max_tokens
  where id = p_agent_id
    and user_id = p_user_id;

  delete from public.agent_tools
  where agent_id = p_agent_id;

  insert into public.agent_tools (agent_id, tool_id)
  select p_agent_id, t.id
  from public.tools t
  where t.slug = any(v_source.tool_slugs)
  on conflict (agent_id, tool_id) do nothing;

  update public.agents
  set
    published_version_id = v_version.id,
    latest_version_number = v_version.version_number,
    has_unpublished_changes = false,
    published_at = v_version.published_at,
    status = 'active'
  where id = p_agent_id
    and user_id = p_user_id;

  return v_version;
end;
$$;

alter table public.agent_versions enable row level security;

drop policy if exists "Users can view their own agent versions"
  on public.agent_versions;
create policy "Users can view their own agent versions"
  on public.agent_versions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all privileges on public.agent_versions from anon, authenticated;
grant select on public.agent_versions to authenticated;
grant all privileges on public.agent_versions to service_role;

revoke execute on function public.mark_agent_draft_changed()
  from public, anon, authenticated;
revoke execute on function public.reject_agent_version_update()
  from public, anon, authenticated;
revoke execute on function public.publish_agent_version(uuid, uuid, text)
  from public, anon, authenticated;
revoke execute on function public.rollback_agent_version(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.publish_agent_version(uuid, uuid, text)
  to service_role;
grant execute on function public.rollback_agent_version(uuid, uuid, uuid, text)
  to service_role;
