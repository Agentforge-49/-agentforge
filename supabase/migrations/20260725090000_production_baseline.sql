-- AgentForge production schema baseline and security hardening.
-- This migration is idempotent so it can bootstrap a new project or harden
-- the existing production database without replacing user data.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  full_name text,
  avatar_url text,
  subscription_tier text not null default 'free'
    check (subscription_tier in ('free', 'pro', 'enterprise')),
  api_calls_used integer not null default 0 check (api_calls_used >= 0),
  api_calls_limit integer not null default 50 check (api_calls_limit >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  category text not null default 'other'
    check (category in ('research', 'writing', 'automation', 'support', 'data', 'other')),
  system_prompt text not null default '',
  personality text not null default 'professional'
    check (personality in ('professional', 'friendly', 'concise', 'creative')),
  model text not null default 'claude-sonnet-4-6',
  temperature double precision not null default 0.7
    check (temperature >= 0 and temperature <= 1),
  max_tokens integer not null default 1000
    check (max_tokens >= 1 and max_tokens <= 8192),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused')),
  run_count integer not null default 0 check (run_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tools (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  description text,
  icon text,
  is_available boolean not null default true,
  requires_pro boolean not null default false
);

create table if not exists public.agent_tools (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  tool_id uuid not null references public.tools(id),
  unique (agent_id, tool_id)
);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  input_text text not null,
  output_text text,
  run_trace jsonb not null default '[]'::jsonb,
  tokens_used integer not null default 0 check (tokens_used >= 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text,
  system_prompt text,
  personality text not null default 'professional',
  default_model text not null default 'claude-sonnet-4-6',
  default_tool_slugs text[] not null default '{}',
  is_featured boolean not null default false,
  usage_count integer not null default 0 check (usage_count >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.agent_chains (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  agent_ids uuid[] not null,
  branch_keyword text,
  branch_agent_if_id uuid references public.agents(id),
  branch_agent_else_id uuid references public.agents(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(agent_ids) >= 2)
);

create table if not exists public.chain_runs (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid not null references public.agent_chains(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  initial_message text not null,
  steps jsonb not null default '[]'::jsonb,
  total_tokens integer not null default 0 check (total_tokens >= 0),
  total_duration_ms integer not null default 0 check (total_duration_ms >= 0),
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Existing production tables predate some integrity checks. Add them safely.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_api_calls_used_check'
  ) then
    alter table public.profiles
      add constraint profiles_api_calls_used_check check (api_calls_used >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_api_calls_limit_check'
  ) then
    alter table public.profiles
      add constraint profiles_api_calls_limit_check check (api_calls_limit >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.agents'::regclass
      and conname = 'agents_max_tokens_check'
  ) then
    alter table public.agents
      add constraint agents_max_tokens_check check (max_tokens >= 1 and max_tokens <= 8192);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.agents'::regclass
      and conname = 'agents_run_count_check'
  ) then
    alter table public.agents
      add constraint agents_run_count_check check (run_count >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.agent_runs'::regclass
      and conname = 'agent_runs_tokens_used_check'
  ) then
    alter table public.agent_runs
      add constraint agent_runs_tokens_used_check check (tokens_used >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.agent_runs'::regclass
      and conname = 'agent_runs_duration_ms_check'
  ) then
    alter table public.agent_runs
      add constraint agent_runs_duration_ms_check check (duration_ms is null or duration_ms >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.agent_chains'::regclass
      and conname = 'agent_chains_min_agents_check'
  ) then
    alter table public.agent_chains
      add constraint agent_chains_min_agents_check check (cardinality(agent_ids) >= 2);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.chain_runs'::regclass
      and conname = 'chain_runs_total_tokens_check'
  ) then
    alter table public.chain_runs
      add constraint chain_runs_total_tokens_check check (total_tokens >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.chain_runs'::regclass
      and conname = 'chain_runs_total_duration_ms_check'
  ) then
    alter table public.chain_runs
      add constraint chain_runs_total_duration_ms_check check (total_duration_ms >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.templates'::regclass
      and conname = 'templates_usage_count_check'
  ) then
    alter table public.templates
      add constraint templates_usage_count_check check (usage_count >= 0);
  end if;
end
$$;

-- Composite ownership keys prevent a run or branch from referencing another
-- user's resource even when a privileged server client performs the write.
create unique index if not exists agents_id_user_id_key
  on public.agents (id, user_id);
create unique index if not exists agent_chains_id_user_id_key
  on public.agent_chains (id, user_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.agent_runs'::regclass
      and conname = 'agent_runs_agent_owner_fkey'
  ) then
    alter table public.agent_runs
      add constraint agent_runs_agent_owner_fkey
      foreign key (agent_id, user_id)
      references public.agents(id, user_id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.chain_runs'::regclass
      and conname = 'chain_runs_chain_owner_fkey'
  ) then
    alter table public.chain_runs
      add constraint chain_runs_chain_owner_fkey
      foreign key (chain_id, user_id)
      references public.agent_chains(id, user_id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.agent_chains'::regclass
      and conname = 'agent_chains_branch_if_owner_fkey'
  ) then
    alter table public.agent_chains
      add constraint agent_chains_branch_if_owner_fkey
      foreign key (branch_agent_if_id, user_id)
      references public.agents(id, user_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.agent_chains'::regclass
      and conname = 'agent_chains_branch_else_owner_fkey'
  ) then
    alter table public.agent_chains
      add constraint agent_chains_branch_else_owner_fkey
      foreign key (branch_agent_else_id, user_id)
      references public.agents(id, user_id);
  end if;
end
$$;

create index if not exists idx_agents_user_created_at
  on public.agents (user_id, created_at desc);
create index if not exists idx_agent_tools_tool_id
  on public.agent_tools (tool_id);
create index if not exists idx_agent_runs_user_started_at
  on public.agent_runs (user_id, started_at desc);
create index if not exists idx_agent_runs_agent_started_at
  on public.agent_runs (agent_id, started_at desc);
create index if not exists idx_agent_chains_user_created_at
  on public.agent_chains (user_id, created_at desc);
create index if not exists idx_chain_runs_user_started_at
  on public.chain_runs (user_id, started_at desc);
create index if not exists idx_chain_runs_chain_started_at
  on public.chain_runs (chain_id, started_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.validate_agent_chain_ownership()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.agent_ids is null or cardinality(new.agent_ids) < 2 then
    raise exception 'A chain must contain at least two agents';
  end if;

  if array_position(new.agent_ids, null) is not null then
    raise exception 'A chain cannot contain null agent identifiers';
  end if;

  if cardinality(new.agent_ids) <> (
    select count(distinct agent_id)
    from unnest(new.agent_ids) as agent_id
  ) then
    raise exception 'A chain cannot contain duplicate agents';
  end if;

  if exists (
    select 1
    from unnest(new.agent_ids) as requested(agent_id)
    left join public.agents a
      on a.id = requested.agent_id
     and a.user_id = new.user_id
    where a.id is null
  ) then
    raise exception 'Every chain agent must belong to the chain owner';
  end if;

  return new;
end;
$$;

create or replace function public.increment_api_usage(
  p_user_id uuid,
  p_amount integer default 1
)
returns table (api_calls_used integer, api_calls_limit integer)
language sql
security definer
set search_path = ''
as $$
  update public.profiles
  set api_calls_used = api_calls_used + greatest(p_amount, 0),
      updated_at = now()
  where id = p_user_id
  returning profiles.api_calls_used, profiles.api_calls_limit;
$$;

create or replace function public.increment_template_usage(p_template_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.templates
  set usage_count = usage_count + 1
  where id = p_template_id;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_agents_updated_at on public.agents;
create trigger set_agents_updated_at
  before update on public.agents
  for each row execute function public.set_updated_at();

drop trigger if exists set_agent_chains_updated_at on public.agent_chains;
create trigger set_agent_chains_updated_at
  before update on public.agent_chains
  for each row execute function public.set_updated_at();

drop trigger if exists validate_agent_chain_ownership
  on public.agent_chains;
create trigger validate_agent_chain_ownership
  before insert or update of user_id, agent_ids
  on public.agent_chains
  for each row execute function public.validate_agent_chain_ownership();

alter table public.profiles enable row level security;
alter table public.agents enable row level security;
alter table public.tools enable row level security;
alter table public.agent_tools enable row level security;
alter table public.agent_runs enable row level security;
alter table public.templates enable row level security;
alter table public.agent_chains enable row level security;
alter table public.chain_runs enable row level security;

drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can select their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);
create policy "Users can select their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "Users can manage their own agents" on public.agents;
create policy "Users can manage their own agents"
  on public.agents for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage tools for their own agents" on public.agent_tools;
create policy "Users can manage tools for their own agents"
  on public.agent_tools for all to authenticated
  using (
    exists (
      select 1 from public.agents
      where agents.id = agent_tools.agent_id
        and agents.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.agents
      where agents.id = agent_tools.agent_id
        and agents.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can manage their own runs" on public.agent_runs;
create policy "Users can manage their own runs"
  on public.agent_runs for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their own chains" on public.agent_chains;
create policy "Users manage their own chains"
  on public.agent_chains for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their own chain runs" on public.chain_runs;
create policy "Users manage their own chain runs"
  on public.chain_runs for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Anyone can view tools" on public.tools;
create policy "Anyone can view tools"
  on public.tools for select to anon, authenticated
  using (true);

drop policy if exists "Anyone can view templates" on public.templates;
create policy "Anyone can view templates"
  on public.templates for select to anon, authenticated
  using (true);

-- Start from no client table privileges, then grant the minimum used surface.
revoke all privileges on all tables in schema public from anon, authenticated;

grant select on public.tools, public.templates to anon, authenticated;
grant select, insert, update, delete
  on public.agents, public.agent_tools, public.agent_runs,
     public.agent_chains, public.chain_runs
  to authenticated;
grant select on public.profiles to authenticated;
grant insert (id, username, full_name, avatar_url)
  on public.profiles to authenticated;
grant update (username, full_name, avatar_url)
  on public.profiles to authenticated;

grant all privileges on all tables in schema public to service_role;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.validate_agent_chain_ownership() from public, anon, authenticated;
revoke execute on function public.increment_api_usage(uuid, integer) from public, anon, authenticated;
revoke execute on function public.increment_template_usage(uuid) from public, anon, authenticated;
grant execute on function public.increment_api_usage(uuid, integer) to service_role;
grant execute on function public.increment_template_usage(uuid) to service_role;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
