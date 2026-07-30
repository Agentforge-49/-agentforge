-- AgentForge Days 2-3: expand governed model choices and add the OAuth
-- connection lifecycle. Provider tokens remain encrypted by the API.

begin;

alter table public.organization_policies
  drop constraint if exists organization_policies_allowed_models_check;

alter table public.organization_policies
  add constraint organization_policies_allowed_models_check check (
    cardinality(allowed_models) between 1 and 20
    and allowed_models <@ array[
      'claude-sonnet-4-6',
      'claude-opus-4-6',
      'gpt-5.6-sol',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
      'gemini-3.5-flash'
    ]::text[]
  );

create table public.oauth_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('google', 'slack', 'github')),
  provider_account_id text,
  provider_account_name text,
  scopes text[] not null default '{}',
  encrypted_access_token jsonb not null,
  encrypted_refresh_token jsonb,
  access_token_expires_at timestamptz,
  status text not null default 'active'
    check (status in ('active', 'expired', 'revoked', 'error')),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, provider_account_id)
);

create table public.oauth_authorization_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('google', 'slack', 'github')),
  nonce_hash text not null unique check (char_length(nonce_hash) = 64),
  redirect_path text not null default '/credentials'
    check (redirect_path ~ '^/[A-Za-z0-9/_-]*$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index oauth_connections_user_idx
  on public.oauth_connections(user_id, status, created_at desc);
create index oauth_authorization_requests_expiry_idx
  on public.oauth_authorization_requests(expires_at)
  where consumed_at is null;

create trigger set_oauth_connections_updated_at
  before update on public.oauth_connections
  for each row execute function public.set_updated_at();

alter table public.oauth_connections enable row level security;
alter table public.oauth_authorization_requests enable row level security;

revoke all on public.oauth_connections, public.oauth_authorization_requests
  from anon, authenticated;
grant all on public.oauth_connections, public.oauth_authorization_requests
  to service_role;

commit;
