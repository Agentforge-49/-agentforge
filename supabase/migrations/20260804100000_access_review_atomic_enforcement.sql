-- Make access-review decisions and membership enforcement one transaction.

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

  select * into v_item
  from public.organization_access_review_items
  where id = p_item_id
    and review_id = p_review_id
    and decision = 'pending'
  for update;
  if v_item.id is null then raise exception 'Pending access review item not found'; end if;
  if p_decision not in ('retain', 'change', 'revoke') then
    raise exception 'Access review decision is invalid';
  end if;
  if v_item.member_user_id = p_actor_user_id and p_decision <> 'retain' then
    raise exception 'Reviewers cannot change or revoke their own access';
  end if;
  if v_item.snapshot_role = 'owner' and p_decision <> 'retain' then
    raise exception 'Owner access cannot be changed by an access review';
  end if;
  if p_decision = 'change' and p_recommended_role not in ('admin', 'builder', 'viewer') then
    raise exception 'Recommended role is invalid';
  end if;

  if p_decision = 'change' then
    update public.organization_members
    set role = p_recommended_role, updated_at = now()
    where organization_id = v_item.organization_id
      and user_id = v_item.member_user_id
      and status = 'active'
      and role <> 'owner';
    if not found then raise exception 'Active member could not be changed'; end if;
  elsif p_decision = 'revoke' then
    update public.organization_members
    set status = 'removed', updated_at = now()
    where organization_id = v_item.organization_id
      and user_id = v_item.member_user_id
      and status = 'active'
      and role <> 'owner';
    if not found then raise exception 'Active member could not be revoked'; end if;
  end if;

  update public.organization_access_review_items
  set decision = p_decision,
      recommended_role = case when p_decision = 'change' then p_recommended_role else null end,
      reviewed_by = p_actor_user_id,
      reviewed_at = now(),
      note = nullif(p_note, '')
  where id = v_item.id
  returning * into v_item;

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

revoke execute on function public.complete_access_review_item(
  uuid, uuid, uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.complete_access_review_item(
  uuid, uuid, uuid, text, text, text
) to service_role;
