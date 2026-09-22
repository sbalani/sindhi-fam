-- Generic friendship never implies that a third-party claimed profile has
-- consented to share their identity with the tree owner's friends.
create or replace function public.get_shared_friend_tree(p_friendship_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user uuid:=auth.uid();
  v_friend uuid;
  v_name text;
  v_owner_member uuid;
  v_viewer_member uuid;
  v_result jsonb;
begin
  if v_user is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  select case when f.user_a_id=v_user then f.user_b_id else f.user_a_id end
  into v_friend
  from public.friendships f
  where f.id=p_friendship_id and f.status='accepted' and v_user in (f.user_a_id,f.user_b_id)
    and case when f.user_a_id=v_user then f.user_b_shares_tree else f.user_a_shares_tree end;
  if v_friend is null then raise exception 'Shared tree not found.' using errcode='P0002'; end if;
  select p.display_name into v_name from public.profiles p where p.id=v_friend;
  select fm.id into v_owner_member from public.family_members fm
  where fm.owner_id=v_friend and (fm.linked_user_id=v_friend or fm.is_self)
  order by (fm.linked_user_id=v_friend) desc,fm.created_at limit 1;
  select fm.id into v_viewer_member from public.family_members fm
  where fm.owner_id=v_friend and fm.linked_user_id=v_user order by fm.created_at limit 1;
  with visible_people as (
    select fm.* from public.family_members fm
    where fm.owner_id=v_friend
      and coalesce(fm.privacy_level,'family')='family'
      and (fm.linked_user_id is null or fm.linked_user_id in (v_user,v_friend))
  ), visible_relationships as (
    select r.* from public.relationships r
    join visible_people a on a.id=r.person_a_id
    join visible_people b on b.id=r.person_b_id
    where r.owner_id=v_friend
  )
  select jsonb_build_object(
    'friendship_id',p_friendship_id,
    'tree_owner_name',v_name,
    'tree_owner_member_id',v_owner_member,
    'viewer_member_id',v_viewer_member,
    'people',coalesce((select jsonb_agg(jsonb_build_object(
      'id',vp.id,'display_name',case when vp.is_placeholder then coalesce(vp.placeholder_label,'Unknown relative') else concat_ws(' ',vp.first_name,vp.surname) end,
      'first_name',case when vp.is_placeholder then coalesce(vp.placeholder_label,'Unknown relative') else vp.first_name end,
      'surname',case when vp.is_placeholder then '' else vp.surname end,
      'initials',case when vp.is_placeholder then '?' else upper(left(vp.first_name,1)||left(vp.surname,1)) end,
      'gender',vp.gender,'is_tree_owner',vp.id=v_owner_member,'is_viewer',vp.id=v_viewer_member,
      'is_placeholder',vp.is_placeholder
    ) order by vp.created_at) from visible_people vp),'[]'::jsonb),
    'relationships',coalesce((select jsonb_agg(jsonb_build_object(
      'id',vr.id,'from',vr.person_a_id,'to',vr.person_b_id,'type',vr.relationship_type,
      'variant',coalesce(vr.relationship_variant,'unspecified'),'status',coalesce(vr.relationship_status,'unspecified')
    ) order by vr.created_at) from visible_relationships vr),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.get_shared_friend_tree(uuid) from public,anon;
grant execute on function public.get_shared_friend_tree(uuid) to authenticated;
