-- Generic friendships are intentionally separate from family matching and
-- genealogy access. Browser clients can only use the audited RPC surface.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.friend_discovery_codes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  code uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

insert into private.friend_discovery_codes(user_id)
select p.id from public.profiles p
on conflict (user_id) do nothing;

create or replace function private.ensure_friend_discovery_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.friend_discovery_codes(user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists profiles_ensure_friend_discovery_code on public.profiles;
create trigger profiles_ensure_friend_discovery_code
after insert on public.profiles
for each row execute function private.ensure_friend_discovery_code();

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_a_id uuid not null references public.profiles(id) on delete cascade,
  user_b_id uuid not null references public.profiles(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  user_a_shares_tree boolean not null default false,
  user_b_shares_tree boolean not null default false,
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  accepted_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint friendships_canonical_pair check (user_a_id < user_b_id),
  constraint friendships_unique_pair unique (user_a_id, user_b_id),
  constraint friendships_requester_participant check (requester_id in (user_a_id, user_b_id)),
  constraint friendships_status check (status in ('pending','accepted','declined','canceled','removed')),
  constraint friendships_sharing_requires_acceptance check (
    status = 'accepted' or (not user_a_shares_tree and not user_b_shares_tree)
  ),
  constraint friendships_response_timing check (
    (status = 'pending' and responded_at is null)
    or (status <> 'pending' and responded_at is not null)
  ),
  constraint friendships_acceptance_timing check (status <> 'accepted' or accepted_at is not null)
);

create index if not exists friendships_user_a_status_idx on public.friendships(user_a_id, status);
create index if not exists friendships_user_b_status_idx on public.friendships(user_b_id, status);

alter table private.friend_discovery_codes enable row level security;
alter table private.friend_discovery_codes force row level security;
alter table public.friendships enable row level security;
alter table public.friendships force row level security;
revoke all on table private.friend_discovery_codes, public.friendships from public, anon, authenticated;

create or replace function public.get_my_friend_discovery_code()
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user uuid := auth.uid();
  v_code uuid;
begin
  if v_user is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  insert into private.friend_discovery_codes(user_id) values (v_user)
  on conflict (user_id) do nothing;
  select fdc.code into v_code from private.friend_discovery_codes fdc where fdc.user_id=v_user;
  return v_code;
end;
$$;

create or replace function public.rotate_my_friend_discovery_code()
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user uuid := auth.uid();
  v_code uuid := gen_random_uuid();
begin
  if v_user is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  insert into private.friend_discovery_codes(user_id,code,rotated_at)
  values (v_user,v_code,now())
  on conflict (user_id) do update set code=excluded.code,rotated_at=excluded.rotated_at;
  return v_code;
end;
$$;

create or replace function public.request_friend_by_code(p_code uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user uuid := auth.uid();
  v_target uuid;
  v_a uuid;
  v_b uuid;
  v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  select fdc.user_id into v_target from private.friend_discovery_codes fdc where fdc.code=p_code;
  if v_target is null or v_target=v_user then
    raise exception 'This friend code is unavailable.' using errcode='P0001';
  end if;
  v_a := least(v_user,v_target);
  v_b := greatest(v_user,v_target);
  insert into public.friendships(user_a_id,user_b_id,requester_id)
  values (v_a,v_b,v_user)
  on conflict (user_a_id,user_b_id) do update
  set requester_id=excluded.requester_id,status='pending',user_a_shares_tree=false,
      user_b_shares_tree=false,requested_at=now(),responded_at=null,accepted_at=null,updated_at=now()
  where friendships.status in ('declined','canceled','removed')
  returning id into v_id;
  if v_id is null then
    raise exception 'A friend request for this code is already active.' using errcode='P0001';
  end if;
  return v_id;
end;
$$;

create or replace function public.get_friendships()
returns table(
  friendship_id uuid,
  direction text,
  status text,
  counterpart_name text,
  requested_at timestamptz,
  responded_at timestamptz,
  accepted_at timestamptz,
  my_tree_shared boolean,
  their_tree_shared boolean,
  can_view_their_tree boolean
)
language sql
security definer
set search_path = ''
set row_security = off
as $$
  select f.id,
    case when f.status='pending' then case when f.requester_id=auth.uid() then 'outgoing' else 'incoming' end else 'friend' end,
    f.status,
    p.display_name,
    f.requested_at,
    f.responded_at,
    f.accepted_at,
    case when f.user_a_id=auth.uid() then f.user_a_shares_tree else f.user_b_shares_tree end,
    case when f.user_a_id=auth.uid() then f.user_b_shares_tree else f.user_a_shares_tree end,
    f.status='accepted' and case when f.user_a_id=auth.uid() then f.user_b_shares_tree else f.user_a_shares_tree end
  from public.friendships f
  join public.profiles p on p.id=case when f.user_a_id=auth.uid() then f.user_b_id else f.user_a_id end
  where auth.uid() is not null and auth.uid() in (f.user_a_id,f.user_b_id)
  order by case f.status when 'pending' then 0 when 'accepted' then 1 else 2 end, f.updated_at desc;
$$;

create or replace function public.respond_friend_request(p_friendship_id uuid,p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare v_user uuid:=auth.uid(); v_friendship public.friendships%rowtype;
begin
  if v_user is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  select * into v_friendship from public.friendships where id=p_friendship_id for update;
  if not found or v_friendship.status<>'pending' or v_friendship.requester_id=v_user
     or v_user not in (v_friendship.user_a_id,v_friendship.user_b_id) then
    raise exception 'Friend request not found.' using errcode='P0002';
  end if;
  update public.friendships set status=case when p_accept then 'accepted' else 'declined' end,
    responded_at=now(),accepted_at=case when p_accept then now() else null end,updated_at=now()
  where id=p_friendship_id;
end;
$$;

create or replace function public.cancel_friend_request(p_friendship_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  update public.friendships set status='canceled',responded_at=now(),updated_at=now()
  where id=p_friendship_id and status='pending' and requester_id=v_user;
  if not found then raise exception 'Friend request not found.' using errcode='P0002'; end if;
end;
$$;

create or replace function public.remove_friend(p_friendship_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  update public.friendships set status='removed',user_a_shares_tree=false,user_b_shares_tree=false,
    responded_at=now(),accepted_at=null,updated_at=now()
  where id=p_friendship_id and status='accepted' and v_user in (user_a_id,user_b_id);
  if not found then raise exception 'Friendship not found.' using errcode='P0002'; end if;
end;
$$;

create or replace function public.set_friend_tree_sharing(p_friendship_id uuid,p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  update public.friendships
  set user_a_shares_tree=case when user_a_id=v_user then p_enabled else user_a_shares_tree end,
      user_b_shares_tree=case when user_b_id=v_user then p_enabled else user_b_shares_tree end,
      updated_at=now()
  where id=p_friendship_id and status='accepted' and v_user in (user_a_id,user_b_id);
  if not found then raise exception 'Friendship not found.' using errcode='P0002'; end if;
end;
$$;

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

revoke all on function private.ensure_friend_discovery_code() from public, anon, authenticated;
revoke all on function public.get_my_friend_discovery_code() from public, anon;
revoke all on function public.rotate_my_friend_discovery_code() from public, anon;
revoke all on function public.request_friend_by_code(uuid) from public, anon;
revoke all on function public.get_friendships() from public, anon;
revoke all on function public.respond_friend_request(uuid,boolean) from public, anon;
revoke all on function public.cancel_friend_request(uuid) from public, anon;
revoke all on function public.remove_friend(uuid) from public, anon;
revoke all on function public.set_friend_tree_sharing(uuid,boolean) from public, anon;
revoke all on function public.get_shared_friend_tree(uuid) from public, anon;

grant execute on function public.get_my_friend_discovery_code() to authenticated;
grant execute on function public.rotate_my_friend_discovery_code() to authenticated;
grant execute on function public.request_friend_by_code(uuid) to authenticated;
grant execute on function public.get_friendships() to authenticated;
grant execute on function public.respond_friend_request(uuid,boolean) to authenticated;
grant execute on function public.cancel_friend_request(uuid) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.set_friend_tree_sharing(uuid,boolean) to authenticated;
grant execute on function public.get_shared_friend_tree(uuid) to authenticated;

comment on table public.friendships is
  'RPC-only generic friendships. Acceptance does not grant genealogy access; tree snapshots require a separate per-user share flag.';
