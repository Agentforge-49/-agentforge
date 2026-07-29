-- Days 18-19: enterprise identity/access controls and provider-neutral billing.

create table public.organization_domains (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  domain text not null check (
    char_length(domain) between 3 and 253
    and domain = lower(domain)
  ),
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'failed')),
  verification_method text not null default 'dns_txt'
    check (verification_method = 'dns_txt'),
  verification_token_hash text not null check (char_length(verification_token_hash) = 64),
  last_checked_at timestamptz,
  verified_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, domain),
  unique (domain)
);

create table public.organization_identity_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  protocol text not null default 'oidc' check (protocol in ('oidc', 'saml')),
  provider_name text,
  issuer_url text,
  metadata_url text,
  client_id text,
  sso_enabled boolean not null default false,
  sso_enforced boolean not null default false,
  jit_provisioning boolean not null default false,
  default_role text not null default 'viewer'
    check (default_role in ('viewer', 'builder')),
  require_mfa boolean not null default false,
  session_max_minutes integer not null default 720
    check (session_max_minutes between 15 and 43200),
  idle_timeout_minutes integer not null default 60
    check (idle_timeout_minutes between 5 and 1440),
  scim_enabled boolean not null default false,
  scim_token_hash text check (
    scim_token_hash is null or char_length(scim_token_hash) = 64
  ),
  scim_token_last_four text check (
    scim_token_last_four is null or char_length(scim_token_last_four) = 4
  ),
  scim_token_rotated_at timestamptz,
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not sso_enforced or sso_enabled),
  check (idle_timeout_minutes <= session_max_minutes)
);

insert into public.organization_identity_settings (organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;

create or replace function public.ensure_organization_identity_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.organization_identity_settings (organization_id)
  values (new.id)
  on conflict (organization_id) do nothing;
  return new;
end;
$$;

create trigger organizations_ensure_identity_settings
after insert on public.organizations
for each row execute function public.ensure_organization_identity_settings();

create table public.organization_directory_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  external_id text not null check (char_length(external_id) between 1 and 255),
  email text not null check (char_length(email) between 3 and 320),
  display_name text check (display_name is null or char_length(display_name) <= 200),
  requested_role text not null default 'viewer'
    check (requested_role in ('viewer', 'builder')),
  active boolean not null default true,
  linked_user_id uuid references public.profiles(id) on delete set null,
  provisioning_source text not null default 'scim'
    check (provisioning_source in ('scim', 'manual')),
  external_version text,
  attributes jsonb not null default '{}'::jsonb
    check (jsonb_typeof(attributes) = 'object'),
  provisioned_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  deprovisioned_at timestamptz,
  unique (organization_id, external_id),
  unique (organization_id, email)
);

create table public.organization_access_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 160),
  status text not null default 'open'
    check (status in ('open', 'completed', 'cancelled')),
  initiated_by uuid not null references public.profiles(id),
  due_at timestamptz not null,
  notes text check (notes is null or char_length(notes) <= 2000),
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_at > created_at),
  check ((status <> 'completed') or completed_at is not null),
  check ((status <> 'cancelled') or cancelled_at is not null)
);

create table public.organization_access_review_items (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.organization_access_reviews(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  member_user_id uuid not null references public.profiles(id),
  snapshot_role text not null check (snapshot_role in ('owner', 'admin', 'builder', 'viewer')),
  decision text not null default 'pending'
    check (decision in ('pending', 'retain', 'change', 'revoke')),
  recommended_role text check (
    recommended_role is null or recommended_role in ('admin', 'builder', 'viewer')
  ),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  unique (review_id, member_user_id),
  check ((decision = 'pending') = (reviewed_at is null)),
  check ((decision = 'change') = (recommended_role is not null))
);

create index organization_domains_org_idx
  on public.organization_domains (organization_id, status);
create index organization_directory_users_org_idx
  on public.organization_directory_users (organization_id, active, email);
create index organization_access_reviews_org_idx
  on public.organization_access_reviews (organization_id, status, created_at desc);
create index organization_access_review_items_review_idx
  on public.organization_access_review_items (review_id, decision);

create table public.billing_customers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  provider text not null default 'test'
    check (provider in ('test', 'stripe', 'paddle', 'manual')),
  provider_customer_id text,
  billing_email text not null check (char_length(billing_email) between 3 and 320),
  company_name text check (company_name is null or char_length(company_name) <= 200),
  tax_country text check (tax_country is null or char_length(tax_country) = 2),
  test_mode boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_customer_id)
);

create table public.billing_checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'test'
    check (provider in ('test', 'stripe', 'paddle')),
  mode text not null default 'test' check (mode in ('test', 'live')),
  provider_session_id text,
  checkout_token_hash text not null check (char_length(checkout_token_hash) = 64),
  plan_key text not null references public.plan_definitions(plan_key),
  billing_interval text not null check (billing_interval in ('monthly', 'annual')),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'USD' check (char_length(currency) = 3),
  status text not null default 'open'
    check (status in ('open', 'completed', 'expired', 'cancelled')),
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_session_id),
  check (expires_at > created_at),
  check ((status <> 'completed') or completed_at is not null)
);

create table public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('test', 'stripe', 'paddle', 'manual')),
  mode text not null default 'test' check (mode in ('test', 'live')),
  provider_subscription_id text,
  plan_key text not null references public.plan_definitions(plan_key),
  billing_interval text not null check (billing_interval in ('monthly', 'annual')),
  status text not null
    check (status in (
      'test_active', 'trialing', 'active', 'past_due', 'paused', 'cancelled', 'expired'
    )),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'USD' check (char_length(currency) = 3),
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  checkout_session_id uuid references public.billing_checkout_sessions(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id),
  check (current_period_end > current_period_start),
  check (mode = 'live' or status not in ('trialing', 'active', 'past_due'))
);

create unique index billing_one_current_subscription
  on public.billing_subscriptions (user_id)
  where status in ('test_active', 'trialing', 'active', 'past_due', 'paused');

create table public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subscription_id uuid references public.billing_subscriptions(id) on delete set null,
  provider text not null check (provider in ('test', 'stripe', 'paddle', 'manual')),
  mode text not null default 'test' check (mode in ('test', 'live')),
  provider_invoice_id text,
  invoice_number text not null unique,
  status text not null
    check (status in ('draft', 'open', 'simulated_paid', 'paid', 'void', 'uncollectible')),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  tax_cents integer not null default 0 check (tax_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  amount_paid_cents integer not null default 0 check (amount_paid_cents >= 0),
  currency text not null default 'USD' check (char_length(currency) = 3),
  period_start timestamptz not null,
  period_end timestamptz not null,
  due_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_invoice_id),
  check (period_end > period_start),
  check (total_cents = subtotal_cents + tax_cents),
  check (mode = 'live' or status not in ('paid', 'uncollectible'))
);

create table public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('stripe', 'paddle', 'agentforge')),
  provider_event_id text not null,
  event_type text not null check (char_length(event_type) between 1 and 160),
  payload_sha256 text not null check (char_length(payload_sha256) = 64),
  signature_valid boolean not null,
  status text not null default 'received'
    check (status in ('received', 'processed', 'ignored', 'failed')),
  error_code text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, provider_event_id)
);

create table public.billing_ledger_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  sequence_number bigint not null,
  event_type text not null check (char_length(event_type) between 2 and 160),
  source_type text,
  source_id uuid,
  details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details) = 'object'),
  previous_hash text,
  event_hash text not null check (char_length(event_hash) = 64),
  occurred_at timestamptz not null default now(),
  unique (user_id, sequence_number),
  unique (user_id, event_hash)
);

create index billing_checkout_user_idx
  on public.billing_checkout_sessions (user_id, status, created_at desc);
create index billing_subscription_user_idx
  on public.billing_subscriptions (user_id, created_at desc);
create index billing_invoice_user_idx
  on public.billing_invoices (user_id, created_at desc);
create index billing_ledger_user_idx
  on public.billing_ledger_events (user_id, sequence_number desc);

create or replace function public.create_access_review(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_name text,
  p_due_at timestamptz,
  p_notes text
)
returns public.organization_access_reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review public.organization_access_reviews;
begin
  insert into public.organization_access_reviews (
    organization_id, name, initiated_by, due_at, notes
  ) values (
    p_organization_id, p_name, p_actor_user_id, p_due_at, nullif(p_notes, '')
  ) returning * into v_review;

  insert into public.organization_access_review_items (
    review_id, organization_id, member_user_id, snapshot_role
  )
  select v_review.id, p_organization_id, user_id, role
  from public.organization_members
  where organization_id = p_organization_id
    and status = 'active';

  return v_review;
end;
$$;

create or replace function public.complete_access_review_item(
  p_review_id uuid,
  p_item_id uuid,
  p_actor_user_id uuid,
  p_decision text,
  p_recommended_role text,
  p_note text
)
returns public.organization_access_review_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.organization_access_review_items;
  v_review public.organization_access_reviews;
begin
  select * into v_review
  from public.organization_access_reviews
  where id = p_review_id
  for update;
  if v_review.id is null or v_review.status <> 'open' then
    raise exception 'Access review is not open';
  end if;

  update public.organization_access_review_items
  set decision = p_decision,
      recommended_role = case when p_decision = 'change' then p_recommended_role else null end,
      reviewed_by = p_actor_user_id,
      reviewed_at = now(),
      note = nullif(p_note, '')
  where id = p_item_id
    and review_id = p_review_id
    and decision = 'pending'
  returning * into v_item;
  if v_item.id is null then
    raise exception 'Pending access review item not found';
  end if;

  if not exists (
    select 1 from public.organization_access_review_items
    where review_id = p_review_id and decision = 'pending'
  ) then
    update public.organization_access_reviews
    set status = 'completed', completed_at = now(), updated_at = now()
    where id = p_review_id;
  end if;
  return v_item;
end;
$$;

create or replace function public.reject_billing_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Billing ledger events are append-only';
end;
$$;

create trigger billing_ledger_immutable
before update or delete on public.billing_ledger_events
for each row execute function public.reject_billing_ledger_mutation();

create or replace function public.record_billing_ledger_event(
  p_user_id uuid,
  p_event_type text,
  p_source_type text,
  p_source_id uuid,
  p_details jsonb
)
returns public.billing_ledger_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sequence bigint;
  v_previous_hash text;
  v_event public.billing_ledger_events;
  v_payload text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 43));
  select sequence_number, event_hash
  into v_sequence, v_previous_hash
  from public.billing_ledger_events
  where user_id = p_user_id
  order by sequence_number desc
  limit 1;
  v_sequence := coalesce(v_sequence, 0) + 1;
  v_payload := concat_ws(
    '|', p_user_id::text, v_sequence::text, p_event_type,
    coalesce(p_source_type, ''), coalesce(p_source_id::text, ''),
    coalesce(p_details, '{}'::jsonb)::text, coalesce(v_previous_hash, '')
  );
  insert into public.billing_ledger_events (
    user_id, sequence_number, event_type, source_type, source_id,
    details, previous_hash, event_hash
  ) values (
    p_user_id, v_sequence, p_event_type, p_source_type, p_source_id,
    coalesce(p_details, '{}'::jsonb), v_previous_hash,
    encode(extensions.digest(convert_to(v_payload, 'UTF8'), 'sha256'), 'hex')
  ) returning * into v_event;
  return v_event;
end;
$$;

create or replace function public.complete_test_checkout(
  p_user_id uuid,
  p_checkout_id uuid,
  p_checkout_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_checkout public.billing_checkout_sessions;
  v_subscription public.billing_subscriptions;
  v_invoice public.billing_invoices;
  v_period_end timestamptz;
begin
  select * into v_checkout
  from public.billing_checkout_sessions
  where id = p_checkout_id and user_id = p_user_id
  for update;
  if v_checkout.id is null then raise exception 'Checkout session not found'; end if;
  if v_checkout.mode <> 'test' or v_checkout.provider <> 'test' then
    raise exception 'Only sandbox checkout can be completed here';
  end if;
  if v_checkout.status <> 'open' then raise exception 'Checkout session is not open'; end if;
  if v_checkout.expires_at <= now() then
    update public.billing_checkout_sessions set status = 'expired'
    where id = v_checkout.id;
    raise exception 'Checkout session expired';
  end if;
  if v_checkout.checkout_token_hash <> p_checkout_token_hash then
    raise exception 'Checkout token is invalid';
  end if;

  update public.billing_subscriptions
  set status = 'cancelled', cancelled_at = now(), updated_at = now()
  where user_id = p_user_id
    and mode = 'test'
    and status = 'test_active';

  v_period_end := case
    when v_checkout.billing_interval = 'annual' then now() + interval '1 year'
    else now() + interval '1 month'
  end;
  insert into public.billing_subscriptions (
    user_id, provider, mode, plan_key, billing_interval, status,
    amount_cents, currency, current_period_start, current_period_end,
    checkout_session_id
  ) values (
    p_user_id, 'test', 'test', v_checkout.plan_key, v_checkout.billing_interval,
    'test_active', v_checkout.amount_cents, v_checkout.currency,
    now(), v_period_end, v_checkout.id
  ) returning * into v_subscription;

  insert into public.billing_invoices (
    user_id, subscription_id, provider, mode, invoice_number, status,
    subtotal_cents, total_cents, amount_paid_cents, currency,
    period_start, period_end, paid_at
  ) values (
    p_user_id, v_subscription.id, 'test', 'test',
    'TEST-' || upper(substr(replace(v_checkout.id::text, '-', ''), 1, 12)),
    'simulated_paid', v_checkout.amount_cents, v_checkout.amount_cents,
    v_checkout.amount_cents, v_checkout.currency, now(), v_period_end, now()
  ) returning * into v_invoice;

  update public.billing_checkout_sessions
  set status = 'completed', completed_at = now()
  where id = v_checkout.id;

  perform public.record_billing_ledger_event(
    p_user_id, 'sandbox.checkout_completed', 'checkout', v_checkout.id,
    jsonb_build_object(
      'subscription_id', v_subscription.id,
      'invoice_id', v_invoice.id,
      'plan_key', v_checkout.plan_key,
      'entitlement_changed', false
    )
  );
  return jsonb_build_object(
    'subscription', to_jsonb(v_subscription),
    'invoice', to_jsonb(v_invoice),
    'entitlement_changed', false
  );
end;
$$;

create or replace function public.expire_billing_sandbox()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_checkouts integer := 0;
  v_subscriptions integer := 0;
  v_subscription record;
begin
  update public.billing_checkout_sessions
  set status = 'expired'
  where status = 'open' and expires_at <= now();
  get diagnostics v_checkouts = row_count;

  for v_subscription in
    select id, user_id, cancel_at_period_end
    from public.billing_subscriptions
    where mode = 'test'
      and status = 'test_active'
      and current_period_end <= now()
    for update
  loop
    update public.billing_subscriptions
    set status = case when v_subscription.cancel_at_period_end then 'cancelled' else 'expired' end,
        cancelled_at = case when v_subscription.cancel_at_period_end then now() else cancelled_at end,
        updated_at = now()
    where id = v_subscription.id;
    perform public.record_billing_ledger_event(
      v_subscription.user_id,
      case when v_subscription.cancel_at_period_end
        then 'subscription.cancelled_at_period_end'
        else 'sandbox.subscription_expired'
      end,
      'subscription',
      v_subscription.id,
      jsonb_build_object('mode', 'test', 'entitlement_changed', false)
    );
    v_subscriptions := v_subscriptions + 1;
  end loop;
  return jsonb_build_object(
    'checkout_sessions_expired', v_checkouts,
    'sandbox_subscriptions_closed', v_subscriptions
  );
end;
$$;

alter table public.organization_domains enable row level security;
alter table public.organization_identity_settings enable row level security;
alter table public.organization_directory_users enable row level security;
alter table public.organization_access_reviews enable row level security;
alter table public.organization_access_review_items enable row level security;
alter table public.billing_customers enable row level security;
alter table public.billing_checkout_sessions enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_invoices enable row level security;
alter table public.billing_webhook_events enable row level security;
alter table public.billing_ledger_events enable row level security;

revoke all on public.organization_domains,
  public.organization_identity_settings, public.organization_directory_users,
  public.organization_access_reviews, public.organization_access_review_items,
  public.billing_customers, public.billing_checkout_sessions,
  public.billing_subscriptions, public.billing_invoices,
  public.billing_webhook_events, public.billing_ledger_events
  from anon, authenticated;
grant all on public.organization_domains,
  public.organization_identity_settings, public.organization_directory_users,
  public.organization_access_reviews, public.organization_access_review_items,
  public.billing_customers, public.billing_checkout_sessions,
  public.billing_subscriptions, public.billing_invoices,
  public.billing_webhook_events, public.billing_ledger_events
  to service_role;

revoke execute on function public.create_access_review(
  uuid, uuid, text, timestamptz, text
) from public, anon, authenticated;
revoke execute on function public.complete_access_review_item(
  uuid, uuid, uuid, text, text, text
) from public, anon, authenticated;
revoke execute on function public.record_billing_ledger_event(
  uuid, text, text, uuid, jsonb
) from public, anon, authenticated;
revoke execute on function public.complete_test_checkout(
  uuid, uuid, text
) from public, anon, authenticated;
revoke execute on function public.expire_billing_sandbox()
  from public, anon, authenticated;
revoke execute on function public.ensure_organization_identity_settings()
  from public, anon, authenticated;

grant execute on function public.create_access_review(
  uuid, uuid, text, timestamptz, text
) to service_role;
grant execute on function public.complete_access_review_item(
  uuid, uuid, uuid, text, text, text
) to service_role;
grant execute on function public.record_billing_ledger_event(
  uuid, text, text, uuid, jsonb
) to service_role;
grant execute on function public.complete_test_checkout(
  uuid, uuid, text
) to service_role;
grant execute on function public.expire_billing_sandbox()
  to service_role;
