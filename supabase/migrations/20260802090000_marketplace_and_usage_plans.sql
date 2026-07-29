-- AgentForge Days 14-15: versioned marketplace and billing-ready usage controls.

create table public.plan_definitions (
  plan_key text primary key check (plan_key in ('free', 'pro', 'enterprise')),
  display_name text not null check (char_length(display_name) between 1 and 80),
  description text not null check (char_length(description) between 1 and 500),
  monthly_price_cents integer check (monthly_price_cents is null or monthly_price_cents >= 0),
  currency text not null default 'USD' check (char_length(currency) = 3),
  limits jsonb not null check (jsonb_typeof(limits) = 'object'),
  features jsonb not null default '[]'::jsonb check (jsonb_typeof(features) = 'array'),
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.plan_definitions (
  plan_key, display_name, description, monthly_price_cents, limits, features
) values
  (
    'free', 'Free', 'Build and test production automations without a subscription.', 0,
    '{"model_calls":50,"tokens":100000,"estimated_cost_usd":5,"agents":10,"workflows":20,"marketplace_installs":25}'::jsonb,
    '["Durable agent runs","Visual workflows","Knowledge and memory","Community marketplace"]'::jsonb
  ),
  (
    'pro', 'Pro', 'Higher limits for individual builders and production workloads.', null,
    '{"model_calls":500,"tokens":2000000,"estimated_cost_usd":75,"agents":100,"workflows":250,"marketplace_installs":500}'::jsonb,
    '["Everything in Free","Higher execution limits","Priority workers","Advanced evaluations"]'::jsonb
  ),
  (
    'enterprise', 'Enterprise', 'Custom controls and capacity for governed teams.', null,
    '{"model_calls":10000,"tokens":50000000,"estimated_cost_usd":2500,"agents":5000,"workflows":10000,"marketplace_installs":10000}'::jsonb,
    '["Everything in Pro","Admin overrides","Custom limits","Enterprise governance"]'::jsonb
  )
on conflict (plan_key) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  monthly_price_cents = excluded.monthly_price_cents,
  limits = excluded.limits,
  features = excluded.features,
  updated_at = now();

create table public.user_entitlements (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  plan_key text not null references public.plan_definitions(plan_key),
  status text not null default 'active'
    check (status in ('active', 'trialing', 'grace', 'suspended', 'expired')),
  source text not null default 'default'
    check (source in ('default', 'billing', 'admin')),
  effective_at timestamptz not null default now(),
  expires_at timestamptz,
  override_limits jsonb not null default '{}'::jsonb
    check (jsonb_typeof(override_limits) = 'object'),
  external_customer_id text,
  external_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or expires_at > effective_at)
);

insert into public.user_entitlements (user_id, plan_key, source)
select id, subscription_tier, 'default'
from public.profiles
on conflict (user_id) do nothing;

create table public.usage_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  model_calls integer not null default 0 check (model_calls >= 0),
  tokens bigint not null default 0 check (tokens >= 0),
  estimated_cost_usd numeric(14, 6) not null default 0
    check (estimated_cost_usd >= 0),
  agent_runs integer not null default 0 check (agent_runs >= 0),
  workflow_steps integer not null default 0 check (workflow_steps >= 0),
  evaluation_calls integer not null default 0 check (evaluation_calls >= 0),
  multi_agent_tasks integer not null default 0 check (multi_agent_tasks >= 0),
  chain_steps integer not null default 0 check (chain_steps >= 0),
  marketplace_installs integer not null default 0 check (marketplace_installs >= 0),
  updated_at timestamptz not null default now(),
  unique (user_id, period_start),
  check (period_end > period_start)
);

insert into public.usage_periods (
  user_id, period_start, period_end, model_calls
)
select
  id,
  date_trunc('month', now())::date,
  (date_trunc('month', now()) + interval '1 month')::date,
  api_calls_used
from public.profiles
on conflict (user_id, period_start) do nothing;

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  execution_job_id uuid references public.execution_jobs(id) on delete set null,
  resource_type text not null
    check (resource_type in (
      'agent', 'workflow', 'evaluation', 'multi_agent', 'chain', 'marketplace', 'adjustment'
    )),
  resource_id uuid,
  model_calls integer not null default 0 check (model_calls >= 0),
  tokens integer not null default 0 check (tokens >= 0),
  estimated_cost_usd numeric(12, 6) not null default 0
    check (estimated_cost_usd >= 0),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 200),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table public.budget_policies (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  monthly_cost_limit_usd numeric(12, 2)
    check (monthly_cost_limit_usd is null or monthly_cost_limit_usd between 0.01 and 1000000),
  warning_percent integer not null default 80 check (warning_percent between 1 and 100),
  hard_limit_enabled boolean not null default false,
  warning_acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.entitlement_override_audit (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  previous_entitlement jsonb not null,
  new_entitlement jsonb not null,
  reason text not null check (char_length(reason) between 3 and 1000),
  created_at timestamptz not null default now()
);

create table public.plan_change_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  requested_plan_key text not null references public.plan_definitions(plan_key),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  note text check (note is null or char_length(note) <= 1000),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index usage_periods_user_period_idx
  on public.usage_periods(user_id, period_start desc);
create index usage_events_user_time_idx
  on public.usage_events(user_id, occurred_at desc);
create index usage_events_job_idx
  on public.usage_events(execution_job_id) where execution_job_id is not null;
create index plan_change_requests_user_created_idx
  on public.plan_change_requests(user_id, created_at desc);

create trigger set_plan_definitions_updated_at
  before update on public.plan_definitions
  for each row execute function public.set_updated_at();
create trigger set_user_entitlements_updated_at
  before update on public.user_entitlements
  for each row execute function public.set_updated_at();
create trigger set_budget_policies_updated_at
  before update on public.budget_policies
  for each row execute function public.set_updated_at();

create or replace function public.ensure_user_entitlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_entitlements (user_id, plan_key, source)
  values (new.id, new.subscription_tier, 'default')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger ensure_profile_entitlement
  after insert on public.profiles
  for each row execute function public.ensure_user_entitlement();

create or replace function public.check_usage_allowance(
  p_user_id uuid,
  p_requested_model_calls integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_entitlement public.user_entitlements;
  v_plan public.plan_definitions;
  v_period public.usage_periods;
  v_budget public.budget_policies;
  v_limits jsonb;
  v_call_limit integer;
  v_cost_limit numeric;
  v_allowed boolean := true;
  v_reason text;
begin
  select * into v_entitlement from public.user_entitlements
  where user_id = p_user_id;
  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'Entitlement not found');
  end if;
  if v_entitlement.status not in ('active', 'trialing', 'grace')
    or (v_entitlement.expires_at is not null and v_entitlement.expires_at <= now()) then
    return jsonb_build_object('allowed', false, 'reason', 'Plan entitlement is not active');
  end if;
  select * into v_plan from public.plan_definitions
  where plan_key = v_entitlement.plan_key;
  v_limits := v_plan.limits || v_entitlement.override_limits;
  v_call_limit := coalesce((v_limits ->> 'model_calls')::integer, 0);
  v_cost_limit := nullif(v_limits ->> 'estimated_cost_usd', '')::numeric;
  select * into v_period from public.usage_periods
  where user_id = p_user_id
    and period_start = date_trunc('month', now())::date;
  select * into v_budget from public.budget_policies where user_id = p_user_id;
  if coalesce(v_period.model_calls, 0) + greatest(p_requested_model_calls, 0) > v_call_limit then
    v_allowed := false;
    v_reason := 'Monthly model-call limit reached';
  elsif v_cost_limit is not null
    and coalesce(v_period.estimated_cost_usd, 0) >= v_cost_limit then
    v_allowed := false;
    v_reason := 'Plan cost guardrail reached';
  elsif v_budget.hard_limit_enabled
    and v_budget.monthly_cost_limit_usd is not null
    and coalesce(v_period.estimated_cost_usd, 0) >= v_budget.monthly_cost_limit_usd then
    v_allowed := false;
    v_reason := 'Personal monthly budget reached';
  end if;
  return jsonb_build_object(
    'allowed', v_allowed,
    'reason', v_reason,
    'plan_key', v_plan.plan_key,
    'limits', v_limits,
    'model_calls_used', coalesce(v_period.model_calls, 0),
    'model_calls_remaining', greatest(0, v_call_limit - coalesce(v_period.model_calls, 0)),
    'tokens_used', coalesce(v_period.tokens, 0),
    'estimated_cost_usd', coalesce(v_period.estimated_cost_usd, 0),
    'period_start', date_trunc('month', now())::date,
    'period_end', (date_trunc('month', now()) + interval '1 month')::date
  );
end;
$$;

create or replace function public.record_run_usage(
  p_user_id uuid,
  p_execution_job_id uuid,
  p_resource_type text,
  p_resource_id uuid,
  p_model_calls integer,
  p_tokens integer,
  p_estimated_cost_usd numeric,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.usage_events;
  v_period public.usage_periods;
begin
  if p_resource_type not in (
    'agent', 'workflow', 'evaluation', 'multi_agent', 'chain', 'marketplace', 'adjustment'
  ) then raise exception 'Unsupported usage resource type'; end if;
  if char_length(trim(coalesce(p_idempotency_key, ''))) not between 1 and 200 then
    raise exception 'Usage idempotency key must be between 1 and 200 characters';
  end if;
  if greatest(p_model_calls, 0) <> p_model_calls
    or greatest(p_tokens, 0) <> p_tokens
    or greatest(p_estimated_cost_usd, 0) <> p_estimated_cost_usd then
    raise exception 'Usage values cannot be negative';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':' || trim(p_idempotency_key), 0)
  );
  select * into v_event from public.usage_events
  where user_id = p_user_id and idempotency_key = trim(p_idempotency_key);
  if found then
    select * into v_period from public.usage_periods
    where user_id = p_user_id
      and period_start = date_trunc('month', v_event.occurred_at)::date;
    return jsonb_build_object(
      'deduplicated', true,
      'event', to_jsonb(v_event),
      'period', to_jsonb(v_period)
    );
  end if;
  insert into public.usage_events (
    user_id, execution_job_id, resource_type, resource_id,
    model_calls, tokens, estimated_cost_usd, idempotency_key, metadata
  ) values (
    p_user_id, p_execution_job_id, p_resource_type, p_resource_id,
    greatest(p_model_calls, 0), greatest(p_tokens, 0),
    greatest(p_estimated_cost_usd, 0), trim(p_idempotency_key),
    coalesce(p_metadata, '{}'::jsonb)
  ) returning * into v_event;

  insert into public.usage_periods (
    user_id, period_start, period_end, model_calls, tokens, estimated_cost_usd,
    agent_runs, workflow_steps, evaluation_calls, multi_agent_tasks, chain_steps,
    marketplace_installs
  ) values (
    p_user_id,
    date_trunc('month', v_event.occurred_at)::date,
    (date_trunc('month', v_event.occurred_at) + interval '1 month')::date,
    v_event.model_calls,
    v_event.tokens,
    v_event.estimated_cost_usd,
    case when p_resource_type = 'agent' then 1 else 0 end,
    case when p_resource_type = 'workflow' then 1 else 0 end,
    case when p_resource_type = 'evaluation' then v_event.model_calls else 0 end,
    case when p_resource_type = 'multi_agent' then 1 else 0 end,
    case when p_resource_type = 'chain' then 1 else 0 end,
    case when p_resource_type = 'marketplace' then 1 else 0 end
  )
  on conflict (user_id, period_start) do update set
    model_calls = public.usage_periods.model_calls + excluded.model_calls,
    tokens = public.usage_periods.tokens + excluded.tokens,
    estimated_cost_usd = public.usage_periods.estimated_cost_usd + excluded.estimated_cost_usd,
    agent_runs = public.usage_periods.agent_runs + excluded.agent_runs,
    workflow_steps = public.usage_periods.workflow_steps + excluded.workflow_steps,
    evaluation_calls = public.usage_periods.evaluation_calls + excluded.evaluation_calls,
    multi_agent_tasks = public.usage_periods.multi_agent_tasks + excluded.multi_agent_tasks,
    chain_steps = public.usage_periods.chain_steps + excluded.chain_steps,
    marketplace_installs = public.usage_periods.marketplace_installs + excluded.marketplace_installs,
    updated_at = now()
  returning * into v_period;
  update public.profiles
  set api_calls_used = v_period.model_calls,
      api_calls_limit = coalesce((
        select ((p.limits || e.override_limits) ->> 'model_calls')::integer
        from public.user_entitlements e
        join public.plan_definitions p on p.plan_key = e.plan_key
        where e.user_id = p_user_id
      ), api_calls_limit)
  where id = p_user_id;
  return jsonb_build_object(
    'deduplicated', false,
    'event', to_jsonb(v_event),
    'period', to_jsonb(v_period)
  );
end;
$$;

create or replace function public.refresh_legacy_usage_counters()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.profiles p
  set api_calls_used = coalesce(u.model_calls, 0),
      api_calls_limit = coalesce(
        ((d.limits || e.override_limits) ->> 'model_calls')::integer,
        p.api_calls_limit
      )
  from public.user_entitlements e
  join public.plan_definitions d on d.plan_key = e.plan_key
  left join public.usage_periods u
    on u.user_id = e.user_id
    and u.period_start = date_trunc('month', now())::date
  where p.id = e.user_id
    and (
      p.api_calls_used is distinct from coalesce(u.model_calls, 0)
      or p.api_calls_limit is distinct from
        coalesce(((d.limits || e.override_limits) ->> 'model_calls')::integer, p.api_calls_limit)
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Keep legacy callers working while moving them onto the monthly ledger.
create or replace function public.increment_api_usage(
  p_user_id uuid,
  p_amount integer default 1
)
returns table (api_calls_used integer, api_calls_limit integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  select public.record_run_usage(
    p_user_id, null, 'adjustment', null, greatest(p_amount, 0), 0, 0,
    'legacy:' || extensions.gen_random_uuid()::text,
    '{"source":"legacy_increment_api_usage"}'::jsonb
  ) into v_result;
  return query select
    (v_result -> 'period' ->> 'model_calls')::integer,
    p.api_calls_limit
  from public.profiles p where p.id = p_user_id;
end;
$$;

create table public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid references public.profiles(id) on delete set null,
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 3 and 120),
  name text not null check (char_length(name) between 1 and 100),
  summary text not null check (char_length(summary) between 20 and 500),
  asset_type text not null check (asset_type in ('agent', 'workflow')),
  category text not null
    check (category in ('research', 'writing', 'automation', 'support', 'data', 'sales', 'other')),
  tags text[] not null default '{}' check (cardinality(tags) <= 12),
  author_name text not null check (char_length(author_name) between 1 and 100),
  status text not null default 'published'
    check (status in ('draft', 'published', 'unlisted', 'rejected')),
  verification_status text not null default 'community'
    check (verification_status in ('community', 'automated', 'curated')),
  quality_score integer not null default 50 check (quality_score between 0 and 100),
  trust_signals jsonb not null default '{}'::jsonb check (jsonb_typeof(trust_signals) = 'object'),
  compatibility_min integer not null default 1 check (compatibility_min >= 1),
  compatibility_max integer not null default 1 check (compatibility_max >= compatibility_min),
  current_version integer not null default 1 check (current_version >= 1),
  current_version_id uuid,
  install_count integer not null default 0 check (install_count >= 0),
  rating_average numeric(3, 2) not null default 0 check (rating_average between 0 and 5),
  rating_count integer not null default 0 check (rating_count >= 0),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, creator_user_id)
);

create table public.marketplace_listing_versions (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  version_number integer not null check (version_number >= 1),
  schema_version integer not null default 1 check (schema_version >= 1),
  source_resource_id uuid,
  configuration jsonb not null check (jsonb_typeof(configuration) = 'object'),
  config_hash text not null check (char_length(config_hash) = 64),
  release_notes text check (release_notes is null or char_length(release_notes) <= 1000),
  compatibility_notes text check (compatibility_notes is null or char_length(compatibility_notes) <= 1000),
  created_at timestamptz not null default now(),
  unique (listing_id, version_number)
);

alter table public.marketplace_listings
  add constraint marketplace_current_version_fk
  foreign key (current_version_id)
  references public.marketplace_listing_versions(id)
  on delete set null;

create table public.marketplace_installs (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete restrict,
  listing_version_id uuid not null references public.marketplace_listing_versions(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete cascade,
  installed_resource_type text not null check (installed_resource_type in ('agent', 'workflow')),
  installed_resource_id uuid not null,
  created_at timestamptz not null default now()
);

create table public.marketplace_reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  review_text text check (review_text is null or char_length(review_text) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, user_id)
);

create index marketplace_discovery_idx
  on public.marketplace_listings(status, verification_status, quality_score desc, install_count desc);
create index marketplace_category_idx
  on public.marketplace_listings(category, asset_type, published_at desc);
create index marketplace_tags_idx on public.marketplace_listings using gin(tags);
create index marketplace_creator_idx
  on public.marketplace_listings(creator_user_id, created_at desc);
create index marketplace_installs_user_idx
  on public.marketplace_installs(user_id, created_at desc);
create index marketplace_reviews_listing_idx
  on public.marketplace_reviews(listing_id, created_at desc);

create trigger set_marketplace_listings_updated_at
  before update on public.marketplace_listings
  for each row execute function public.set_updated_at();
create trigger set_marketplace_reviews_updated_at
  before update on public.marketplace_reviews
  for each row execute function public.set_updated_at();

create or replace function public.publish_marketplace_listing(
  p_user_id uuid,
  p_listing_id uuid,
  p_slug text,
  p_name text,
  p_summary text,
  p_asset_type text,
  p_category text,
  p_tags text[],
  p_author_name text,
  p_source_resource_id uuid,
  p_configuration jsonb,
  p_release_notes text,
  p_compatibility_min integer default 1,
  p_compatibility_max integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.marketplace_listings;
  v_version public.marketplace_listing_versions;
  v_number integer;
  v_hash text;
  v_quality integer;
begin
  if p_asset_type not in ('agent', 'workflow') then raise exception 'Unsupported asset type'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 100 then raise exception 'Invalid listing name'; end if;
  if char_length(trim(coalesce(p_summary, ''))) not between 20 and 500 then raise exception 'Invalid listing summary'; end if;
  if p_configuration is null or jsonb_typeof(p_configuration) <> 'object' then
    raise exception 'Invalid listing configuration';
  end if;
  if p_compatibility_min < 1 or p_compatibility_max < p_compatibility_min then
    raise exception 'Invalid compatibility range';
  end if;
  v_hash := encode(extensions.digest(convert_to(p_configuration::text, 'UTF8'), 'sha256'), 'hex');
  v_quality := least(90, 50
    + case when cardinality(coalesce(p_tags, '{}')) >= 2 then 10 else 0 end
    + case when char_length(trim(p_summary)) >= 80 then 10 else 0 end
    + case when p_release_notes is not null then 10 else 0 end
    + 10
  );
  if p_listing_id is null then
    insert into public.marketplace_listings (
      creator_user_id, slug, name, summary, asset_type, category, tags,
      author_name, status, verification_status, quality_score, trust_signals,
      compatibility_min, compatibility_max, current_version, published_at
    ) values (
      p_user_id, trim(p_slug), trim(p_name), trim(p_summary), p_asset_type,
      p_category, coalesce(p_tags, '{}'), trim(p_author_name), 'published',
      'automated', v_quality,
      '{"immutable_snapshot":true,"ownership_checked":true,"schema_validated":true}'::jsonb,
      p_compatibility_min, p_compatibility_max, 1, now()
    ) returning * into v_listing;
    v_number := 1;
  else
    select * into v_listing from public.marketplace_listings
    where id = p_listing_id and creator_user_id = p_user_id
    for update;
    if not found then raise exception 'Marketplace listing not found'; end if;
    if v_listing.asset_type <> p_asset_type then raise exception 'Asset type cannot change'; end if;
    v_number := v_listing.current_version + 1;
    update public.marketplace_listings set
      name = trim(p_name),
      summary = trim(p_summary),
      category = p_category,
      tags = coalesce(p_tags, '{}'),
      author_name = trim(p_author_name),
      status = 'published',
      verification_status = case
        when verification_status = 'curated' then 'curated' else 'automated'
      end,
      quality_score = greatest(quality_score, v_quality),
      compatibility_min = p_compatibility_min,
      compatibility_max = p_compatibility_max,
      current_version = v_number,
      published_at = now()
    where id = v_listing.id returning * into v_listing;
  end if;
  insert into public.marketplace_listing_versions (
    listing_id, version_number, source_resource_id, configuration,
    config_hash, release_notes
  ) values (
    v_listing.id, v_number, p_source_resource_id, p_configuration,
    v_hash, nullif(trim(p_release_notes), '')
  ) returning * into v_version;
  update public.marketplace_listings
  set current_version_id = v_version.id
  where id = v_listing.id returning * into v_listing;
  return jsonb_build_object(
    'listing', to_jsonb(v_listing),
    'version', to_jsonb(v_version)
  );
end;
$$;

create or replace function public.install_marketplace_listing(
  p_user_id uuid,
  p_listing_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.marketplace_listings;
  v_version public.marketplace_listing_versions;
  v_agent public.agents;
  v_workflow public.workflows;
  v_install public.marketplace_installs;
  v_tool_slugs text[];
begin
  select * into v_listing from public.marketplace_listings
  where id = p_listing_id and status = 'published'
  for update;
  if not found then raise exception 'Marketplace listing not found'; end if;
  if not (v_listing.compatibility_min <= 1 and v_listing.compatibility_max >= 1) then
    raise exception 'Listing is not compatible with this AgentForge version';
  end if;
  select * into v_version from public.marketplace_listing_versions
  where id = v_listing.current_version_id;
  if not found then raise exception 'Marketplace version not found'; end if;
  if v_listing.asset_type = 'agent' then
    insert into public.agents (
      user_id, name, description, category, system_prompt, personality,
      model, temperature, max_tokens, status
    ) values (
      p_user_id,
      left(v_version.configuration ->> 'name', 100),
      left(v_version.configuration ->> 'description', 500),
      coalesce(v_version.configuration ->> 'category', 'other'),
      coalesce(v_version.configuration ->> 'system_prompt', ''),
      coalesce(v_version.configuration ->> 'personality', 'professional'),
      coalesce(v_version.configuration ->> 'model', 'claude-sonnet-4-6'),
      coalesce((v_version.configuration ->> 'temperature')::double precision, 0.7),
      coalesce((v_version.configuration ->> 'max_tokens')::integer, 1000),
      'draft'
    ) returning * into v_agent;
    select coalesce(array_agg(value), '{}') into v_tool_slugs
    from jsonb_array_elements_text(
      coalesce(v_version.configuration -> 'tool_slugs', '[]'::jsonb)
    );
    insert into public.agent_tools (agent_id, tool_id)
    select v_agent.id, t.id from public.tools t
    where t.slug = any(v_tool_slugs) and t.is_available
    on conflict do nothing;
    insert into public.marketplace_installs (
      listing_id, listing_version_id, user_id,
      installed_resource_type, installed_resource_id
    ) values (
      v_listing.id, v_version.id, p_user_id, 'agent', v_agent.id
    ) returning * into v_install;
  else
    insert into public.workflows (
      user_id, name, description, status, nodes, edges, version
    ) values (
      p_user_id,
      left(v_version.configuration ->> 'name', 100),
      left(v_version.configuration ->> 'description', 500),
      'draft',
      coalesce(v_version.configuration -> 'nodes', '[]'::jsonb),
      coalesce(v_version.configuration -> 'edges', '[]'::jsonb),
      1
    ) returning * into v_workflow;
    insert into public.marketplace_installs (
      listing_id, listing_version_id, user_id,
      installed_resource_type, installed_resource_id
    ) values (
      v_listing.id, v_version.id, p_user_id, 'workflow', v_workflow.id
    ) returning * into v_install;
  end if;
  update public.marketplace_listings
  set install_count = install_count + 1,
      quality_score = least(100, quality_score + case when install_count in (0, 4, 24, 99) then 2 else 0 end)
  where id = v_listing.id;
  perform public.record_run_usage(
    p_user_id, null, 'marketplace', v_listing.id, 0, 0, 0,
    'marketplace-install:' || v_install.id::text,
    jsonb_build_object('listing_version', v_version.version_number)
  );
  return jsonb_build_object(
    'install', to_jsonb(v_install),
    'resource', coalesce(to_jsonb(v_agent), to_jsonb(v_workflow)),
    'asset_type', v_listing.asset_type
  );
end;
$$;

create or replace function public.review_marketplace_listing(
  p_user_id uuid,
  p_listing_id uuid,
  p_rating integer,
  p_review_text text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review public.marketplace_reviews;
  v_listing public.marketplace_listings;
begin
  if p_rating not between 1 and 5 then raise exception 'Rating must be between 1 and 5'; end if;
  if not exists (
    select 1 from public.marketplace_installs
    where listing_id = p_listing_id and user_id = p_user_id
  ) then raise exception 'Install this listing before reviewing it'; end if;
  insert into public.marketplace_reviews (listing_id, user_id, rating, review_text)
  values (p_listing_id, p_user_id, p_rating, nullif(trim(p_review_text), ''))
  on conflict (listing_id, user_id) do update set
    rating = excluded.rating,
    review_text = excluded.review_text,
    updated_at = now()
  returning * into v_review;
  update public.marketplace_listings l set
    rating_average = r.average,
    rating_count = r.count,
    quality_score = least(100, greatest(0,
      l.quality_score + case when r.average >= 4 then 2 when r.average < 2 then -2 else 0 end
    ))
  from (
    select round(avg(rating)::numeric, 2) as average, count(*)::integer as count
    from public.marketplace_reviews where listing_id = p_listing_id
  ) r
  where l.id = p_listing_id
  returning l.* into v_listing;
  return jsonb_build_object('review', to_jsonb(v_review), 'listing', to_jsonb(v_listing));
end;
$$;

alter table public.plan_definitions enable row level security;
alter table public.user_entitlements enable row level security;
alter table public.usage_periods enable row level security;
alter table public.usage_events enable row level security;
alter table public.budget_policies enable row level security;
alter table public.entitlement_override_audit enable row level security;
alter table public.plan_change_requests enable row level security;
alter table public.marketplace_listings enable row level security;
alter table public.marketplace_listing_versions enable row level security;
alter table public.marketplace_installs enable row level security;
alter table public.marketplace_reviews enable row level security;

revoke all on public.plan_definitions, public.user_entitlements,
  public.usage_periods, public.usage_events, public.budget_policies,
  public.entitlement_override_audit, public.plan_change_requests,
  public.marketplace_listings, public.marketplace_listing_versions,
  public.marketplace_installs, public.marketplace_reviews
  from anon, authenticated;
grant all on public.plan_definitions, public.user_entitlements,
  public.usage_periods, public.usage_events, public.budget_policies,
  public.entitlement_override_audit, public.plan_change_requests,
  public.marketplace_listings, public.marketplace_listing_versions,
  public.marketplace_installs, public.marketplace_reviews
  to service_role;

revoke execute on function public.ensure_user_entitlement()
  from public, anon, authenticated;
revoke execute on function public.check_usage_allowance(uuid, integer)
  from public, anon, authenticated;
revoke execute on function public.record_run_usage(
  uuid, uuid, text, uuid, integer, integer, numeric, text, jsonb
) from public, anon, authenticated;
revoke execute on function public.refresh_legacy_usage_counters()
  from public, anon, authenticated;
revoke execute on function public.publish_marketplace_listing(
  uuid, uuid, text, text, text, text, text, text[], text, uuid, jsonb, text, integer, integer
) from public, anon, authenticated;
revoke execute on function public.install_marketplace_listing(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.review_marketplace_listing(uuid, uuid, integer, text)
  from public, anon, authenticated;

grant execute on function public.check_usage_allowance(uuid, integer) to service_role;
grant execute on function public.record_run_usage(
  uuid, uuid, text, uuid, integer, integer, numeric, text, jsonb
) to service_role;
grant execute on function public.refresh_legacy_usage_counters() to service_role;
grant execute on function public.publish_marketplace_listing(
  uuid, uuid, text, text, text, text, text, text[], text, uuid, jsonb, text, integer, integer
) to service_role;
grant execute on function public.install_marketplace_listing(uuid, uuid) to service_role;
grant execute on function public.review_marketplace_listing(uuid, uuid, integer, text) to service_role;
