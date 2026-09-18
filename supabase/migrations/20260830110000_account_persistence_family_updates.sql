-- Vansh v0.13.2: account deletion must not delete a shared family tree.
--
-- Important distinction:
--   * Auth account = login/profile/discoverability.
--   * Family person = genealogical record that may outlive an account.
--   * Family graph = shared genealogy namespace that must not disappear merely
--     because its original creator deletes their login.
--
-- owner_id / graph_owner_id are retained for backwards compatibility, but are
-- now treated as stable graph keys. They are deliberately no longer cascading
-- foreign keys to auth.users.

create extension if not exists pgcrypto;

create table if not exists public.family_graphs (
  id uuid primary key,
  created_by uuid references auth.users(id) on delete set null,
  status text not null default 'active' check (status in ('active','orphaned')),
  orphaned_at timestamptz,
  retention_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Backfill one graph row for every legacy owner/graph key. If the original
-- creator account no longer exists, the graph still gets a durable row.
insert into public.family_graphs(id, created_by)
select distinct fm.owner_id,
       case when au.id is not null then fm.owner_id else null end
from public.family_members fm
left join auth.users au on au.id = fm.owner_id
where fm.owner_id is not null
on conflict (id) do nothing;

-- Remove only the legacy auth-user FKs that made the graph itself depend on a
-- login account. Keep the UUID values as stable graph identifiers.
do $$
declare r record;
begin
  for r in
    select c.conname, n.nspname, t.relname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join unnest(c.conkey) with ordinality k(attnum, ord) on true
    join pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum
    where c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and n.nspname = 'public'
      and (
        (t.relname = 'family_members' and a.attname = 'owner_id')
        or (t.relname = 'relationships' and a.attname = 'owner_id')
        or (t.relname = 'family_invitations' and a.attname in ('graph_owner_id','inviter_id'))
      )
  loop
    execute format('alter table %I.%I drop constraint %I', r.nspname, r.relname, r.conname);
  end loop;
end $$;

-- The graph key itself intentionally has no FK to auth.users.
-- inviter_id is user attribution, so preserve accepted invitations/access by
-- setting the inviter to NULL when that account disappears.
alter table public.family_invitations alter column inviter_id drop not null;
do $$ begin
  alter table public.family_invitations
    add constraint family_invitation_inviter_auth_fkey
    foreign key (inviter_id) references auth.users(id) on delete set null;
exception when duplicate_object then null; end $$;

comment on column public.family_members.owner_id is
  'Legacy name: stable family graph key. It is not deleted when an auth account is deleted.';
comment on column public.relationships.owner_id is
  'Legacy name: stable family graph key. It is not deleted when an auth account is deleted.';
comment on column public.family_invitations.graph_owner_id is
  'Legacy name: stable family graph key used by this invitation.';

-- ---------------------------------------------------------------------------
-- Family-update notifications.
-- ---------------------------------------------------------------------------
create table if not exists public.family_update_notifications (
  id uuid primary key default gen_random_uuid(),
  graph_id uuid not null references public.family_graphs(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  member_id uuid references public.family_members(id) on delete set null,
  relationship_id uuid references public.relationships(id) on delete set null,
  event_type text not null check (event_type in ('person_added','person_updated','person_removed','relationship_added','relationship_updated','relationship_removed')),
  summary text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists family_update_recipient_idx
  on public.family_update_notifications(recipient_user_id, read_at, created_at desc);

alter table public.family_update_notifications enable row level security;
drop policy if exists "Read own family updates" on public.family_update_notifications;
create policy "Read own family updates" on public.family_update_notifications
for select to authenticated using (recipient_user_id = auth.uid());
drop policy if exists "Mark own family updates read" on public.family_update_notifications;
create policy "Mark own family updates read" on public.family_update_notifications
for update to authenticated using (recipient_user_id = auth.uid())
with check (recipient_user_id = auth.uid());

create or replace function private.notify_family_graph_users(
  p_graph_id uuid,
  p_actor uuid,
  p_event_type text,
  p_summary text,
  p_member_id uuid default null,
  p_relationship_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if p_graph_id is null or p_actor is null then return; end if;

  insert into public.family_graphs(id, created_by)
  values (
    p_graph_id,
    case when exists(select 1 from auth.users au where au.id = p_graph_id) then p_graph_id else p_actor end
  )
  on conflict (id) do nothing;

  insert into public.family_update_notifications(
    graph_id, recipient_user_id, actor_user_id, member_id, relationship_id, event_type, summary
  )
  select distinct p_graph_id, candidate.user_id, p_actor, p_member_id, p_relationship_id, p_event_type, p_summary
  from (
    select fm.linked_user_id as user_id
      from public.family_members fm where fm.owner_id = p_graph_id
    union
    select fm.created_by from public.family_members fm where fm.owner_id = p_graph_id
    union
    select fm.filled_by from public.family_members fm where fm.owner_id = p_graph_id
    union
    select fi.accepted_user_id from public.family_invitations fi
      where fi.graph_owner_id = p_graph_id and fi.status = 'accepted'
    union
    select p_graph_id where exists(select 1 from auth.users au where au.id = p_graph_id)
  ) candidate
  join auth.users au on au.id = candidate.user_id
  where candidate.user_id is not null
    and candidate.user_id <> p_actor
    and (
      (p_member_id is not null and public.can_access_family_member(candidate.user_id, p_member_id))
      or (p_relationship_id is not null and exists (
        select 1 from public.relationships rel
        where rel.id = p_relationship_id
          and public.can_access_family_member(candidate.user_id, rel.person_a_id)
          and public.can_access_family_member(candidate.user_id, rel.person_b_id)
      ))
    );
end;
$$;

create or replace function private.family_member_update_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_name text;
  v_graph uuid;
  v_event text;
  v_summary text;
  v_changed boolean := true;
begin
  if tg_op = 'DELETE' then
    v_graph := old.owner_id;
    v_name := trim(concat_ws(' ', old.first_name, old.surname));
  else
    v_graph := new.owner_id;
    v_name := trim(concat_ws(' ', new.first_name, new.surname));
  end if;
  select coalesce(p.display_name, 'A relative') into v_actor_name from public.profiles p where p.id = v_actor;
  v_actor_name := coalesce(v_actor_name, 'A relative');

  if tg_op = 'INSERT' then
    v_event := 'person_added';
    v_summary := format('Added %s to your family tree.', coalesce(nullif(v_name,''),'a family member'));
  elsif tg_op = 'DELETE' then
    v_event := 'person_removed';
    v_summary := format('Removed %s from your family tree.', coalesce(nullif(v_name,''),'a family member'));
  else
    -- Ignore revision/timestamp-only writes and identity-link bookkeeping.
    v_changed := (
      new.first_name is distinct from old.first_name
      or new.surname is distinct from old.surname
      or new.nickname is distinct from old.nickname
      or new.maiden_name is distinct from old.maiden_name
      or new.gender is distinct from old.gender
      or new.birth_year is distinct from old.birth_year
      or new.birth_date is distinct from old.birth_date
      or new.birth_location is distinct from old.birth_location
      or new.birth_place is distinct from old.birth_place
      or new.lived_locations is distinct from old.lived_locations
      or new.lived_in is distinct from old.lived_in
      or new.death_year is distinct from old.death_year
      or new.death_date is distinct from old.death_date
      or new.death_location is distinct from old.death_location
      or new.death_place is distinct from old.death_place
      or new.is_placeholder is distinct from old.is_placeholder
    );
    if not v_changed then return new; end if;
    v_event := 'person_updated';
    v_summary := format('Updated details for %s.', coalesce(nullif(v_name,''),'a family member'));
  end if;

  perform private.notify_family_graph_users(
    v_graph, v_actor, v_event, v_summary,
    case when tg_op = 'DELETE' then old.id else new.id end, null
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists family_member_update_notification on public.family_members;
create trigger family_member_update_notification
after insert or update or delete on public.family_members
for each row execute function private.family_member_update_notification();

create or replace function private.relationship_update_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_a_name text;
  v_b_name text;
  v_graph uuid;
  v_type text;
  v_person_a uuid;
  v_person_b uuid;
  v_event text;
  v_summary text;
begin
  if tg_op = 'DELETE' then
    v_graph := old.owner_id;
    v_type := coalesce(old.relationship_type, 'relationship');
    v_person_a := old.person_a_id;
    v_person_b := old.person_b_id;
  else
    v_graph := new.owner_id;
    v_type := coalesce(new.relationship_type, 'relationship');
    v_person_a := new.person_a_id;
    v_person_b := new.person_b_id;
  end if;
  select coalesce(p.display_name, 'A relative') into v_actor_name from public.profiles p where p.id = v_actor;
  v_actor_name := coalesce(v_actor_name, 'A relative');
  select trim(concat_ws(' ', fm.first_name, fm.surname)) into v_a_name
    from public.family_members fm where fm.id = v_person_a;
  select trim(concat_ws(' ', fm.first_name, fm.surname)) into v_b_name
    from public.family_members fm where fm.id = v_person_b;

  if tg_op = 'INSERT' then
    v_event := 'relationship_added';
    v_summary := format('Linked %s and %s as %s.', coalesce(v_a_name,'a relative'), coalesce(v_b_name,'a relative'), replace(v_type,'_',' '));
  elsif tg_op = 'DELETE' then
    v_event := 'relationship_removed';
    v_summary := format('Removed a %s link between %s and %s.', replace(v_type,'_',' '), coalesce(v_a_name,'a relative'), coalesce(v_b_name,'a relative'));
  else
    if new.relationship_type is not distinct from old.relationship_type
       and new.relationship_variant is not distinct from old.relationship_variant
       and new.start_year is not distinct from old.start_year
       and new.end_year is not distinct from old.end_year then
      return new;
    end if;
    v_event := 'relationship_updated';
    v_summary := format('Updated the %s relationship between %s and %s.', replace(v_type,'_',' '), coalesce(v_a_name,'a relative'), coalesce(v_b_name,'a relative'));
  end if;

  perform private.notify_family_graph_users(
    v_graph, v_actor, v_event, v_summary,
    null, case when tg_op = 'DELETE' then old.id else new.id end
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists relationship_update_notification on public.relationships;
create trigger relationship_update_notification
after insert or update or delete on public.relationships
for each row execute function private.relationship_update_notification();

create or replace function public.get_family_update_notifications()
returns table(
  notification_id uuid,
  event_type text,
  actor_name text,
  summary text,
  created_at timestamptz,
  read_at timestamptz
)
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select n.id,
         n.event_type,
         coalesce(p.display_name, 'Deleted account') as actor_name,
         n.summary,
         n.created_at,
         n.read_at
  from public.family_update_notifications n
  left join public.profiles p on p.id = n.actor_user_id
  where n.recipient_user_id = auth.uid()
  order by n.created_at desc
  limit 80;
$$;

grant execute on function public.get_family_update_notifications() to authenticated;

create or replace function public.mark_family_update_notifications_read()
returns void
language sql
security definer
set search_path = ''
set row_security = off
as $$
  update public.family_update_notifications
  set read_at = coalesce(read_at, now())
  where recipient_user_id = auth.uid() and read_at is null;
$$;
grant execute on function public.mark_family_update_notifications_read() to authenticated;

-- ---------------------------------------------------------------------------
-- Account deletion lifecycle.
-- ---------------------------------------------------------------------------
create or replace function private.graph_has_other_active_user(p_graph_id uuid, p_excluding uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from (
      select fm.linked_user_id as user_id from public.family_members fm where fm.owner_id = p_graph_id
      union select fm.created_by from public.family_members fm where fm.owner_id = p_graph_id
      union select fm.filled_by from public.family_members fm where fm.owner_id = p_graph_id
      union select fi.accepted_user_id from public.family_invitations fi where fi.graph_owner_id = p_graph_id and fi.status = 'accepted'
      union select p_graph_id
    ) users
    join auth.users au on au.id = users.user_id
    where users.user_id is not null and users.user_id <> p_excluding
  );
$$;

create or replace function private.before_vansh_auth_user_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare g uuid;
begin
  -- Ensure all graphs touched by this account have a lifecycle row.
  for g in
    select distinct graph_id from (
      select fm.owner_id as graph_id from public.family_members fm
        where fm.owner_id = old.id or fm.linked_user_id = old.id or fm.created_by = old.id or fm.filled_by = old.id
      union
      select fi.graph_owner_id from public.family_invitations fi
        where fi.graph_owner_id = old.id or fi.inviter_id = old.id or fi.accepted_user_id = old.id
    ) q where graph_id is not null
  loop
    insert into public.family_graphs(id, created_by)
    values (g, case when g = old.id then old.id else null end)
    on conflict (id) do nothing;

    if private.graph_has_other_active_user(g, old.id) then
      update public.family_graphs
      set status = 'active', orphaned_at = null, retention_until = null, updated_at = now()
      where id = g;
    else
      update public.family_graphs
      set status = 'orphaned', orphaned_at = coalesce(orphaned_at, now()),
          retention_until = coalesce(retention_until, now() + interval '30 days'), updated_at = now()
      where id = g;
    end if;
  end loop;
  return old;
end;
$$;

drop trigger if exists vansh_before_auth_user_delete on auth.users;
create trigger vansh_before_auth_user_delete
before delete on auth.users
for each row execute function private.before_vansh_auth_user_delete();

create or replace function public.preview_account_deletion()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user uuid := auth.uid();
  v_shared integer := 0;
  v_solo integer := 0;
  v_people integer := 0;
  v_contributions integer := 0;
  v_claimed integer := 0;
  g uuid;
begin
  if v_user is null then raise exception 'Sign in to preview account deletion.'; end if;

  select count(*) into v_contributions from public.family_members where created_by = v_user or filled_by = v_user;
  select count(*) into v_claimed from public.family_members where linked_user_id = v_user;

  for g in
    select distinct graph_id from (
      select fm.owner_id as graph_id from public.family_members fm
        where fm.owner_id = v_user or fm.linked_user_id = v_user or fm.created_by = v_user or fm.filled_by = v_user
      union
      select fi.graph_owner_id from public.family_invitations fi
        where fi.inviter_id = v_user or fi.accepted_user_id = v_user
    ) q where graph_id is not null
  loop
    select v_people + count(*)::int into v_people from public.family_members where owner_id = g;
    if private.graph_has_other_active_user(g, v_user) then v_shared := v_shared + 1;
    else v_solo := v_solo + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'sharedGraphs', v_shared,
    'soloGraphs', v_solo,
    'familyPeoplePreserved', v_people,
    'contributionsPreserved', v_contributions,
    'claimedRecordsUnlinked', v_claimed,
    'soloRetentionDays', 30
  );
end;
$$;
grant execute on function public.preview_account_deletion() to authenticated;

-- Keep the account-specific FKs non-destructive where history should survive.
-- The linked family person becomes unclaimed automatically when the Auth user
-- disappears; created_by / filled_by / audit users become NULL.
-- (The prior migration already normalizes these columns to SET NULL.)
