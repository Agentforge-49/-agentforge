-- Lifecycle safeguard: immutable billing ledgers remain protected while a
-- service-only, sandbox-only purge enables test cleanup and account deletion.

create or replace function public.reject_billing_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('agentforge.allow_billing_purge', true) = 'on' then
    return old;
  end if;
  raise exception 'Billing ledger events are append-only';
end;
$$;

create or replace function public.purge_billing_sandbox_user(
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ledger integer := 0;
  v_invoices integer := 0;
  v_subscriptions integer := 0;
  v_checkouts integer := 0;
  v_customers integer := 0;
begin
  if exists (
    select 1 from public.billing_customers
    where user_id = p_user_id and test_mode = false
  ) or exists (
    select 1 from public.billing_checkout_sessions
    where user_id = p_user_id and mode = 'live'
  ) or exists (
    select 1 from public.billing_subscriptions
    where user_id = p_user_id and mode = 'live'
  ) or exists (
    select 1 from public.billing_invoices
    where user_id = p_user_id and mode = 'live'
  ) then
    raise exception 'Live billing data cannot be purged through the sandbox cleanup';
  end if;

  perform set_config('agentforge.allow_billing_purge', 'on', true);
  delete from public.billing_ledger_events where user_id = p_user_id;
  get diagnostics v_ledger = row_count;
  delete from public.billing_invoices where user_id = p_user_id and mode = 'test';
  get diagnostics v_invoices = row_count;
  delete from public.billing_subscriptions where user_id = p_user_id and mode = 'test';
  get diagnostics v_subscriptions = row_count;
  delete from public.billing_checkout_sessions where user_id = p_user_id and mode = 'test';
  get diagnostics v_checkouts = row_count;
  delete from public.billing_customers where user_id = p_user_id and test_mode = true;
  get diagnostics v_customers = row_count;
  perform set_config('agentforge.allow_billing_purge', 'off', true);

  return jsonb_build_object(
    'ledger_events_deleted', v_ledger,
    'invoices_deleted', v_invoices,
    'subscriptions_deleted', v_subscriptions,
    'checkout_sessions_deleted', v_checkouts,
    'customers_deleted', v_customers
  );
end;
$$;

revoke execute on function public.purge_billing_sandbox_user(uuid)
  from public, anon, authenticated;
grant execute on function public.purge_billing_sandbox_user(uuid)
  to service_role;
