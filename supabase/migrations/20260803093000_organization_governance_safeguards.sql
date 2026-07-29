-- Additional safeguards for governed decisions and explicit tenant deletion.

create or replace function public.reject_conflicted_governance_decision()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_request public.governance_change_requests;
begin
  select * into v_request
  from public.governance_change_requests
  where id = new.request_id;
  if not found then raise exception 'Governance request not found'; end if;
  if v_request.requested_by = new.reviewer_user_id then
    raise exception 'Requesters cannot approve their own governance changes';
  end if;
  if v_request.change_type in ('member_role', 'member_remove')
    and v_request.payload ->> 'user_id' = new.reviewer_user_id::text then
    raise exception 'Reviewers cannot approve a membership change that affects themselves';
  end if;
  return new;
end;
$$;

create trigger reject_conflicted_governance_decision
  before insert or update on public.governance_change_decisions
  for each row execute function public.reject_conflicted_governance_decision();

create or replace function public.delete_organization(
  p_organization_id uuid,
  p_owner_user_id uuid,
  p_confirmation_slug text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization public.organizations;
begin
  select * into v_organization
  from public.organizations
  where id = p_organization_id
    and owner_user_id = p_owner_user_id
  for update;
  if not found then raise exception 'Owned organization not found'; end if;
  if v_organization.status <> 'archived' then
    raise exception 'Archive the organization before permanent deletion';
  end if;
  if v_organization.slug <> trim(p_confirmation_slug) then
    raise exception 'Organization confirmation slug does not match';
  end if;
  perform set_config('agentforge.audit_purge', 'on', true);
  delete from public.organizations where id = v_organization.id;
  return true;
end;
$$;

revoke execute on function public.delete_organization(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.delete_organization(uuid, uuid, text)
  to service_role;
