-- Vansh P0 foundation: explicit identity verification, claimed-person authority,
-- duplicate prevention/merge, invitation acceptance, and relationship variants.
-- This migration is additive and preserves existing rows.

create extension if not exists pgcrypto;
create schema if not exists private;

create or replace function private.norm_text(v text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(lower(trim(coalesce(v, ''))), '[^a-z0-9]+', '', 'g');
$$;

-- ---------------------------------------------------------------------------
-- Bring the live schema to a documented, backwards-compatible baseline.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists surname text,
  add column if not exists birth_date date,
  add column if not exists birth_location_text text,
  add column if not exists current_location_text text,
  add column if not exists discovery_enabled boolean not null default false,
  add column if not exists discovery_code uuid default gen_random_uuid();

update public.profiles set discovery_code = gen_random_uuid() where discovery_code is null;
create unique index if not exists profiles_discovery_code_uidx on public.profiles(discovery_code);

alter table public.family_members
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists linked_user_id uuid references auth.users(id) on delete set null,
  add column if not exists filled_by uuid references auth.users(id) on delete set null,
  add column if not exists nickname text,
  add column if not exists maiden_name text,
  add column if not exists birth_year integer,
  add column if not exists birth_date date,
  add column if not exists birth_location jsonb,
  add column if not exists lived_locations jsonb not null default '[]'::jsonb,
  add column if not exists birth_place text,
  add column if not exists lived_in text,
  add column if not exists family_side text not null default 'Other',
  add column if not exists is_self boolean not null default false,
  add column if not exists is_placeholder boolean not null default false,
  add column if not exists placeholder_label text,
  add column if not exists age_as_reported integer,
  add column if not exists age_recorded_at date,
  add column if not exists person_identity_id uuid default gen_random_uuid(),
  add column if not exists updated_at timestamptz not null default now();

update public.family_members
set person_identity_id = gen_random_uuid()
where person_identity_id is null;

-- Keep legacy birth-year validation compatible with exact-date onboarding.
alter table public.family_members
  drop constraint if exists family_members_birth_year_check;

alter table public.family_members
  add constraint family_members_birth_year_check
  check (
    birth_year is null
    or (birth_year >= 1800 and birth_year <= extract(year from current_date)::integer)
  );

-- Legacy versions used a UNIQUE index here. That conflicts with verified identity
-- linking because multiple graph records can represent the same real person.
drop index if exists public.family_members_person_identity_uidx;
create index if not exists family_members_identity_idx on public.family_members(person_identity_id);
create index if not exists family_members_linked_user_idx on public.family_members(linked_user_id);
create index if not exists family_members_owner_idx on public.family_members(owner_id);

alter table public.relationships
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists start_year integer,
  add column if not exists end_year integer,
  add column if not exists relationship_variant text not null default 'unspecified';

-- Reconcile legacy relationship-variant validation with the P0 graph model.
-- Existing databases may have a narrower CHECK constraint that predates
-- reported siblings, parent variants, and current/former partnerships.
alter table public.relationships
  drop constraint if exists relationships_relationship_variant_check;

alter table public.relationships
  add constraint relationships_relationship_variant_check
  check (
    relationship_variant is null
    or relationship_variant in (
      'unspecified',
      'reported',
      'biological',
      'adoptive',
      'step',
      'guardian',
      'current',
      'former'
    )
  );

create index if not exists relationships_a_idx on public.relationships(person_a_id);
create index if not exists relationships_b_idx on public.relationships(person_b_id);

-- Identity verification tables. Existing live tables are reused if present.
create table if not exists public.identity_claim_requests (
  id uuid primary key default gen_random_uuid(),
  candidate_member_id uuid not null references public.family_members(id) on delete cascade,
  candidate_owner_id uuid not null references auth.users(id) on delete cascade,
  claimant_user_id uuid not null references auth.users(id) on delete cascade,
  claimant_member_id uuid references public.family_members(id) on delete set null,
  initiated_by text not null check (initiated_by in ('claimant','record_owner')),
  status text not null default 'pending' check (status in ('pending','accepted','rejected','dismissed')),
  score integer not null default 0,
  shared_details text[] not null default '{}',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create unique index if not exists identity_claim_pending_pair_uidx
on public.identity_claim_requests(candidate_member_id, claimant_user_id)
where status = 'pending';

create table if not exists public.verified_identity_links (
  id uuid primary key default gen_random_uuid(),
  candidate_member_id uuid not null references public.family_members(id) on delete cascade,
  claimant_member_id uuid not null references public.family_members(id) on delete cascade,
  record_owner_id uuid not null references auth.users(id) on delete cascade,
  claimant_user_id uuid not null references auth.users(id) on delete cascade,
  verified_at timestamptz not null default now()
);

create unique index if not exists verified_identity_candidate_uidx
on public.verified_identity_links(candidate_member_id);

-- Explicit correction requests for claimed profiles.
create table if not exists public.profile_change_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.family_members(id) on delete cascade,
  proposer_user_id uuid not null references auth.users(id) on delete cascade,
  proposed_changes jsonb not null,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists profile_change_member_idx on public.profile_change_requests(member_id, status);

-- Family-to-family connection requests remain distinct from identity claims.
create table if not exists public.family_connection_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references auth.users(id) on delete cascade,
  to_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.family_connection_requests
  add column if not exists connection_kind text not null default 'surname',
  add column if not exists candidate_member_id uuid references public.family_members(id) on delete set null;

create table if not exists public.verified_family_connections (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.family_connection_requests(id) on delete cascade,
  user_a_id uuid not null references auth.users(id) on delete cascade,
  user_b_id uuid not null references auth.users(id) on delete cascade,
  verified_at timestamptz not null default now()
);
create unique index if not exists verified_family_request_uidx on public.verified_family_connections(request_id);

-- Invitation means: a known relative invited this exact record. Acceptance is explicit.
create table if not exists public.family_invitations (
  id uuid primary key default gen_random_uuid(),
  graph_owner_id uuid not null references auth.users(id) on delete cascade,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  inviter_person_id uuid references public.family_members(id) on delete set null,
  person_id uuid not null references public.family_members(id) on delete cascade,
  email text not null,
  scope text not null default 'connection' check (scope in ('connection','immediate','extended')),
  status text not null default 'pending' check (status in ('pending','accepted','rejected','revoked','expired')),
  accepted_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days')
);

alter table public.family_invitations
  add column if not exists status text not null default 'pending',
  add column if not exists accepted_user_id uuid references auth.users(id) on delete set null,
  add column if not exists responded_at timestamptz,
  add column if not exists expires_at timestamptz not null default (now() + interval '30 days');

create unique index if not exists family_invitation_pending_uidx
on public.family_invitations(person_id, lower(email))
where status = 'pending';

-- Some legacy projects created this join table with person_id. Renaming the
-- column preserves its existing data, primary key, and foreign key definitions.
do $$
declare v_access_table regclass:=to_regclass('public.family_invitation_access');
begin
  if v_access_table is not null
    and exists (
      select 1 from pg_attribute
      where attrelid = v_access_table
        and attname = 'person_id' and not attisdropped
    )
    and not exists (
      select 1 from pg_attribute
      where attrelid = v_access_table
        and attname = 'member_id' and not attisdropped
    ) then
    alter table public.family_invitation_access rename column person_id to member_id;
  end if;
end;
$$;

create table if not exists public.family_invitation_access (
  invitation_id uuid not null references public.family_invitations(id) on delete cascade,
  member_id uuid not null references public.family_members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(invitation_id, member_id)
);

alter table public.family_invitation_access
  add column if not exists created_at timestamptz not null default now();

-- Compatibility table for old clients. New UI uses family_connection_requests.
create table if not exists public.match_decisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  candidate_owner_id uuid not null references auth.users(id) on delete cascade,
  candidate_member_id uuid references public.family_members(id) on delete cascade,
  status text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.member_merge_audit (
  id uuid primary key default gen_random_uuid(),
  kept_member_id uuid not null,
  merged_member_id uuid not null,
  merged_by uuid not null references auth.users(id) on delete cascade,
  kept_snapshot jsonb not null,
  merged_snapshot jsonb not null,
  field_choices jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Permission helpers. Security must be enforced in Postgres, not only React.
-- ---------------------------------------------------------------------------

create or replace function public.can_access_family_member(p_user_id uuid, p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.family_members fm
    where fm.id = p_person_id
      and (
        fm.owner_id = p_user_id
        or fm.created_by = p_user_id
        or fm.linked_user_id = p_user_id
        or fm.filled_by = p_user_id
        or (
          fm.person_identity_id is not null
          and exists (
            select 1 from public.family_members mine
            where mine.person_identity_id = fm.person_identity_id
              and mine.linked_user_id = p_user_id
          )
        )
        or exists (
          select 1
          from public.family_invitation_access fia
          join public.family_invitations fi on fi.id = fia.invitation_id
          where fia.member_id = fm.id
            and fi.status = 'accepted'
            and fi.accepted_user_id = p_user_id
        )
      )
  );
$$;

create or replace function public.can_manage_family_member(p_user_id uuid, p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.family_members fm
    where fm.id = p_member_id
      and (
        (fm.linked_user_id is not null and fm.linked_user_id = p_user_id)
        or (
          fm.linked_user_id is null
          and (fm.owner_id = p_user_id or fm.created_by = p_user_id or fm.filled_by = p_user_id)
        )
      )
  );
$$;


create or replace function public.can_create_family_member_for_owner(p_user_id uuid, p_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select
    p_user_id = p_owner_id
    or exists (
      select 1
      from public.family_members anchor
      where anchor.owner_id = p_owner_id
        and public.can_access_family_member(p_user_id, anchor.id)
    );
$$;

create or replace function private.guard_family_member_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_system boolean := coalesce(current_setting('vansh.system_write', true), '') = 'on';
  v_identity_changed boolean;
begin
  if tg_op = 'INSERT' then
    if not v_system then
      -- Browser-created records always receive a fresh opaque identity id.
      -- The only direct linked insert allowed is a user's own self record.
      new.person_identity_id := gen_random_uuid();
      new.created_by := v_user;
      if new.linked_user_id is not null and not (
        new.linked_user_id = v_user and new.owner_id = v_user and new.is_self
      ) then
        raise exception 'Identity linkage can only be created through the Vansh verification workflow.';
      end if;
      if new.is_self and not (new.owner_id = v_user and new.linked_user_id = v_user) then
        raise exception 'A self record must belong to and be linked to the signed-in user.';
      end if;
      if new.filled_by is not null and new.filled_by <> v_user then
        raise exception 'filled_by can only identify the signed-in user.';
      end if;
    else
      if new.person_identity_id is null then new.person_identity_id := gen_random_uuid(); end if;
    end if;
    if new.created_by is null and v_user is not null then new.created_by := v_user; end if;
    new.updated_at := now();
    return new;
  end if;

  if not v_system and (
    new.owner_id is distinct from old.owner_id
    or new.created_by is distinct from old.created_by
    or new.is_self is distinct from old.is_self
  ) then
    raise exception 'Family graph ownership and creator metadata cannot be changed directly.';
  end if;

  if not v_system and new.filled_by is distinct from old.filled_by
     and new.filled_by is not null and new.filled_by <> v_user then
    raise exception 'filled_by can only identify the signed-in user.';
  end if;

  v_identity_changed :=
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
    or new.lived_in is distinct from old.lived_in;

  if not v_system and (
    new.linked_user_id is distinct from old.linked_user_id
    or new.person_identity_id is distinct from old.person_identity_id
  ) then
    raise exception 'Identity linkage can only be changed through the Vansh verification workflow.';
  end if;

  if not v_system and old.linked_user_id is not null and old.linked_user_id <> v_user and v_identity_changed then
    raise exception 'This profile has been claimed. Suggest a correction instead of editing identity details directly.';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists family_members_guard_write on public.family_members;
create trigger family_members_guard_write
before insert or update on public.family_members
for each row execute function private.guard_family_member_write();

-- Once an identity is claimed, edits made by that person become the canonical
-- identity facts for every representation carrying the same opaque identity id.
-- Graph-specific fields (owner, family side, relationships) are not propagated.
create or replace function private.sync_claimed_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed boolean;
begin
  if tg_op <> 'UPDATE' or pg_trigger_depth() > 1 then return new; end if;
  if new.linked_user_id is null or new.linked_user_id <> auth.uid() then return new; end if;
  v_changed :=
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
    or new.lived_in is distinct from old.lived_in;
  if not v_changed or new.person_identity_id is null then return new; end if;

  perform set_config('vansh.system_write','on',true);
  update public.family_members fm set
    first_name = new.first_name,
    surname = new.surname,
    nickname = new.nickname,
    maiden_name = new.maiden_name,
    gender = new.gender,
    birth_year = new.birth_year,
    birth_date = new.birth_date,
    birth_location = new.birth_location,
    birth_place = new.birth_place,
    lived_locations = new.lived_locations,
    lived_in = new.lived_in
  where fm.person_identity_id = new.person_identity_id
    and fm.id <> new.id;
  return new;
end;
$$;

drop trigger if exists family_members_sync_claimed_identity on public.family_members;
create trigger family_members_sync_claimed_identity
after update on public.family_members
for each row execute function private.sync_claimed_identity();

-- RLS policies: explicit matrix for people and relationships.
alter table public.profiles enable row level security;
alter table public.family_members enable row level security;
alter table public.relationships enable row level security;
alter table public.identity_claim_requests enable row level security;
alter table public.verified_identity_links enable row level security;
alter table public.profile_change_requests enable row level security;
alter table public.family_connection_requests enable row level security;
alter table public.verified_family_connections enable row level security;
alter table public.family_invitations enable row level security;
alter table public.family_invitation_access enable row level security;
alter table public.match_decisions enable row level security;
alter table public.member_merge_audit enable row level security;

-- Remove known legacy policies to avoid permissive-policy leakage.
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies
           where schemaname='public' and tablename in (
             'profiles','family_members','relationships','identity_claim_requests',
             'verified_identity_links','profile_change_requests',
             'family_connection_requests','verified_family_connections',
             'family_invitations','family_invitation_access','match_decisions',
             'member_merge_audit'
           )
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

drop policy if exists "Read own profile" on public.profiles;
drop policy if exists "Update own profile" on public.profiles;
create policy "Read own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "Update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "Read accessible family members" on public.family_members
for select to authenticated using (
  owner_id = (select auth.uid())
  or created_by = (select auth.uid())
  or linked_user_id = (select auth.uid())
  or filled_by = (select auth.uid())
  or public.can_access_family_member((select auth.uid()), id)
);

create policy "Create accessible family members" on public.family_members
for insert to authenticated with check (
  public.can_create_family_member_for_owner((select auth.uid()), owner_id)
);

create policy "Update manageable family members" on public.family_members
for update to authenticated
using (public.can_manage_family_member(auth.uid(), id))
with check (public.can_manage_family_member(auth.uid(), id));

create policy "Delete unclaimed created family members" on public.family_members
for delete to authenticated using (
  linked_user_id is null
  and not is_self
  and (created_by = auth.uid() or owner_id = auth.uid())
);

create policy "Read accessible relationships" on public.relationships
for select to authenticated using (
  public.can_access_family_member(auth.uid(), person_a_id)
  and public.can_access_family_member(auth.uid(), person_b_id)
);

create policy "Create relationships between accessible people" on public.relationships
for insert to authenticated with check (
  created_by = auth.uid()
  and person_a_id <> person_b_id
  and public.can_access_family_member(auth.uid(), person_a_id)
  and public.can_access_family_member(auth.uid(), person_b_id)
  and exists (
    select 1
    from public.family_members a
    join public.family_members b on b.id = relationships.person_b_id
    where a.id = relationships.person_a_id
      and a.owner_id = b.owner_id
      and relationships.owner_id = a.owner_id
  )
);

create policy "Update own relationships" on public.relationships
for update to authenticated
using (created_by = auth.uid() or owner_id = auth.uid())
with check (
  (created_by = auth.uid() or owner_id = auth.uid())
  and public.can_access_family_member(auth.uid(), person_a_id)
  and public.can_access_family_member(auth.uid(), person_b_id)
  and exists (
    select 1
    from public.family_members a
    join public.family_members b on b.id = relationships.person_b_id
    where a.id = relationships.person_a_id
      and a.owner_id = b.owner_id
      and relationships.owner_id = a.owner_id
  )
);

create policy "Delete own relationships" on public.relationships
for delete to authenticated using (created_by = auth.uid() or owner_id = auth.uid());

-- Audit can only be read by the user who performed the merge.
drop policy if exists "Read own merge audit" on public.member_merge_audit;
create policy "Read own merge audit" on public.member_merge_audit
for select to authenticated using (merged_by = auth.uid());

-- ---------------------------------------------------------------------------
-- Identity candidate and mutual confirmation workflow.
-- ---------------------------------------------------------------------------

create or replace function public.find_identity_claim_candidates()
returns table(
  candidate_member_id uuid,
  person_code text,
  display_name text,
  score integer,
  shared_details text[],
  birth_year integer,
  birth_place text,
  lived_in text
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select p.* from public.profiles p where p.id = auth.uid()
  ), scored as (
    select
      fm.id,
      'VNSH-' || upper(substr(replace(fm.person_identity_id::text, '-', ''), 1, 10)) as person_code,
      trim(concat_ws(' ', fm.first_name, fm.surname)) as display_name,
      (
        40
        + 25
        + case
            when me.birth_date is not null and fm.birth_date = me.birth_date then 25
            when me.birth_date is not null and fm.birth_year = extract(year from me.birth_date)::integer then 12
            else 0
          end
        + case
            when private.norm_text(me.birth_location_text) <> ''
             and private.norm_text(coalesce(fm.birth_place, fm.birth_location ->> 'display')) = private.norm_text(me.birth_location_text)
              then 10 else 0
          end
        + case
            when private.norm_text(me.current_location_text) <> ''
             and private.norm_text(coalesce(fm.lived_in, '')) = private.norm_text(me.current_location_text)
              then 5 else 0
          end
      )::integer as match_score,
      array_remove(array[
        'Same first name'::text,
        'Same surname'::text,
        case when me.birth_date is not null and fm.birth_date = me.birth_date then 'Exact birth date' end,
        case when me.birth_date is not null and fm.birth_date is distinct from me.birth_date and fm.birth_year = extract(year from me.birth_date)::integer then 'Same birth year' end,
        case when private.norm_text(me.birth_location_text) <> '' and private.norm_text(coalesce(fm.birth_place, fm.birth_location ->> 'display')) = private.norm_text(me.birth_location_text) then 'Same birth place' end,
        case when private.norm_text(me.current_location_text) <> '' and private.norm_text(coalesce(fm.lived_in, '')) = private.norm_text(me.current_location_text) then 'Same current / last known place' end
      ], null)::text[] as clues,
      fm.birth_year,
      coalesce(fm.birth_place, fm.birth_location ->> 'display') as birth_place,
      fm.lived_in
    from me
    join public.family_members fm
      on fm.owner_id <> auth.uid()
     and not fm.is_placeholder
     and fm.linked_user_id is null
     and coalesce(fm.created_by, fm.owner_id) <> auth.uid()
     and private.norm_text(fm.first_name) = private.norm_text(me.first_name)
     and (
       private.norm_text(fm.surname) = private.norm_text(me.surname)
       or private.norm_text(coalesce(fm.maiden_name, '')) = private.norm_text(me.surname)
     )
    where coalesce(me.first_name, '') <> ''
      and coalesce(me.surname, '') <> ''
      and not exists (
        select 1 from public.identity_claim_requests r
        where r.candidate_member_id = fm.id and r.claimant_user_id = auth.uid()
      )
      and not exists (
        select 1 from public.verified_identity_links v where v.candidate_member_id = fm.id
      )
  )
  select id, person_code, display_name, least(match_score, 100), clues, birth_year, birth_place, lived_in
  from scored
  where match_score >= 80
  order by match_score desc, display_name
  limit 20;
$$;

create or replace function public.request_identity_claim(p_candidate_member_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate_owner uuid;
  v_self_id uuid;
  v_score integer;
  v_shared text[];
  v_request_id uuid;
begin
  select c.score, c.shared_details into v_score, v_shared
  from public.find_identity_claim_candidates() c
  where c.candidate_member_id = p_candidate_member_id;
  if v_score is null then raise exception 'This record is not an eligible identity suggestion.'; end if;

  select fm.id into v_self_id
  from public.family_members fm
  where fm.linked_user_id = auth.uid() and fm.is_self
  order by fm.created_at limit 1;
  if v_self_id is null then
    select fm.id into v_self_id from public.family_members fm
    where fm.owner_id = auth.uid() and fm.is_self order by fm.created_at limit 1;
  end if;
  if v_self_id is null then raise exception 'Your self record is missing.'; end if;

  select coalesce(fm.created_by, fm.owner_id) into v_candidate_owner
  from public.family_members fm where fm.id = p_candidate_member_id and fm.linked_user_id is null;
  if v_candidate_owner is null then raise exception 'This family record is no longer claimable.'; end if;

  insert into public.identity_claim_requests(
    candidate_member_id,candidate_owner_id,claimant_user_id,claimant_member_id,
    initiated_by,status,score,shared_details
  ) values (
    p_candidate_member_id,v_candidate_owner,auth.uid(),v_self_id,
    'claimant','pending',v_score,coalesce(v_shared,'{}')
  ) returning id into v_request_id;
  return v_request_id;
end;
$$;

create or replace function public.find_member_user_candidates(p_member_id uuid)
returns table(candidate_code uuid, display_name text, score integer, shared_details text[], birth_year integer, current_location text, birth_location text)
language sql
stable
security definer
set search_path = ''
as $$
  with member as (
    select fm.* from public.family_members fm
    where fm.id = p_member_id
      and fm.linked_user_id is null
      and not fm.is_placeholder
      and (fm.created_by = auth.uid() or fm.owner_id = auth.uid())
  ), scored as (
    select
      p.discovery_code,
      p.display_name,
      (40 + 25
        + case when m.birth_date is not null and p.birth_date = m.birth_date then 25
               when m.birth_year is not null and p.birth_date is not null and extract(year from p.birth_date)::int = m.birth_year then 12 else 0 end
        + case when private.norm_text(coalesce(m.birth_place,m.birth_location->>'display')) <> ''
                and private.norm_text(p.birth_location_text) = private.norm_text(coalesce(m.birth_place,m.birth_location->>'display')) then 10 else 0 end
        + case when private.norm_text(coalesce(m.lived_in,'')) <> ''
                and private.norm_text(p.current_location_text) = private.norm_text(m.lived_in) then 5 else 0 end
      )::int as match_score,
      array_remove(array[
        'Same first name'::text,'Same surname'::text,
        case when m.birth_date is not null and p.birth_date = m.birth_date then 'Exact birth date' end,
        case when m.birth_year is not null and p.birth_date is not null and extract(year from p.birth_date)::int = m.birth_year then 'Same birth year' end,
        case when private.norm_text(coalesce(m.birth_place,m.birth_location->>'display')) <> '' and private.norm_text(p.birth_location_text)=private.norm_text(coalesce(m.birth_place,m.birth_location->>'display')) then 'Same birth place' end,
        case when private.norm_text(coalesce(m.lived_in,'')) <> '' and private.norm_text(p.current_location_text)=private.norm_text(m.lived_in) then 'Same current / last known place' end
      ],null)::text[] as clues,
      case when p.birth_date is not null then extract(year from p.birth_date)::int end as byear,
      p.current_location_text,
      p.birth_location_text
    from member m
    join public.profiles p
      on p.id <> auth.uid()
     and p.discovery_enabled
     and private.norm_text(p.first_name)=private.norm_text(m.first_name)
     and (private.norm_text(p.surname)=private.norm_text(m.surname) or private.norm_text(p.surname)=private.norm_text(coalesce(m.maiden_name,'')))
    where not exists(select 1 from public.identity_claim_requests r where r.candidate_member_id=m.id and r.claimant_user_id=p.id)
      and not exists(select 1 from public.verified_identity_links v where v.candidate_member_id=m.id)
  )
  select discovery_code,display_name,least(match_score,100),clues,byear,current_location_text,birth_location_text
  from scored where match_score >= 80 order by match_score desc,display_name limit 10;
$$;

create or replace function public.request_member_identity_verification(p_member_id uuid, p_candidate_code uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_user uuid;
  v_target_self uuid;
  v_score integer;
  v_shared text[];
  v_id uuid;
begin
  select p.id into v_target_user from public.profiles p where p.discovery_code=p_candidate_code and p.discovery_enabled;
  select c.score,c.shared_details into v_score,v_shared from public.find_member_user_candidates(p_member_id) c where c.candidate_code=p_candidate_code;
  if v_target_user is null or v_score is null then raise exception 'This user is not an eligible identity suggestion for that family record.'; end if;
  select fm.id into v_target_self from public.family_members fm where fm.owner_id=v_target_user and fm.is_self order by fm.created_at limit 1;
  insert into public.identity_claim_requests(candidate_member_id,candidate_owner_id,claimant_user_id,claimant_member_id,initiated_by,status,score,shared_details)
  values(p_member_id,auth.uid(),v_target_user,v_target_self,'record_owner','pending',v_score,coalesce(v_shared,'{}')) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.dismiss_identity_candidate(p_candidate_member_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_owner uuid; v_self_id uuid;
begin
  select coalesce(fm.created_by,fm.owner_id) into v_owner from public.family_members fm where fm.id=p_candidate_member_id;
  select fm.id into v_self_id from public.family_members fm where fm.owner_id=auth.uid() and fm.is_self order by fm.created_at limit 1;
  if v_owner is null or v_self_id is null then return; end if;
  if not exists(select 1 from public.identity_claim_requests r where r.candidate_member_id=p_candidate_member_id and r.claimant_user_id=auth.uid()) then
    insert into public.identity_claim_requests(candidate_member_id,candidate_owner_id,claimant_user_id,claimant_member_id,initiated_by,status,score,shared_details,resolved_at)
    values(p_candidate_member_id,v_owner,auth.uid(),v_self_id,'claimant','dismissed',0,'{}',now());
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Claimed-person corrections.
-- ---------------------------------------------------------------------------

create or replace function public.suggest_member_correction(p_member_id uuid, p_changes jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_linked uuid;
begin
  select fm.linked_user_id into v_linked from public.family_members fm where fm.id=p_member_id and public.can_access_family_member(auth.uid(),fm.id);
  if v_linked is null then raise exception 'This record is not claimed; edit it directly instead.'; end if;
  if v_linked=auth.uid() then raise exception 'You own this profile; edit it directly.'; end if;
  if p_changes is null or p_changes='{}'::jsonb then raise exception 'No correction was supplied.'; end if;
  if exists (
    select 1 from jsonb_object_keys(p_changes) k
    where k not in (
      'first_name','surname','nickname','maiden_name','gender','birth_year',
      'birth_date','birth_location','birth_place','lived_locations','lived_in'
    )
  ) then
    raise exception 'The correction contains an unsupported profile field.';
  end if;
  insert into public.profile_change_requests(member_id,proposer_user_id,proposed_changes)
  values(p_member_id,auth.uid(),p_changes) returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Family invitations: explicit recipient acceptance and scoped access.
-- ---------------------------------------------------------------------------

create or replace function public.preview_family_invitation_scope(p_person_id uuid, p_scope text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with recursive walk(id,depth) as (
    select fm.id,0 from public.family_members fm
    where fm.id=p_person_id and public.can_access_family_member(auth.uid(),fm.id)
    union
    select case when r.person_a_id=w.id then r.person_b_id else r.person_a_id end,
           w.depth+1
    from walk w
    join public.relationships r on r.person_a_id=w.id or r.person_b_id=w.id
    where w.depth < case p_scope when 'connection' then 0 when 'immediate' then 1 else 2 end
  )
  select count(distinct id)::int from walk;
$$;

create or replace function private.populate_invitation_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_depth int;
begin
  v_depth := case new.scope when 'connection' then 0 when 'immediate' then 1 else 2 end;
  insert into public.family_invitation_access(invitation_id,member_id)
  with recursive walk(id,depth) as (
    select new.person_id,0
    union
    select case when r.person_a_id=w.id then r.person_b_id else r.person_a_id end,w.depth+1
    from walk w join public.relationships r on r.person_a_id=w.id or r.person_b_id=w.id
    where w.depth < v_depth
  ) select new.id,id from walk on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists family_invitation_scope_access on public.family_invitations;
create trigger family_invitation_scope_access after insert on public.family_invitations
for each row execute function private.populate_invitation_access();

-- Compatibility: invitations must never be accepted just because the app loaded.
create or replace function public.accept_family_invitations()
returns integer language sql as $$ select 0; $$;

create or replace function public.respond_family_invitation(p_invitation_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_inv public.family_invitations%rowtype;
  v_self uuid;
  v_identity uuid;
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
begin
  select * into v_inv from public.family_invitations fi
  where fi.id=p_invitation_id and fi.status='pending' and lower(fi.email)=v_email for update;
  if v_inv.id is null then raise exception 'Invitation not found, expired, or already resolved.'; end if;
  if v_inv.expires_at < now() then
    update public.family_invitations set status='expired',responded_at=now() where id=v_inv.id;
    raise exception 'This invitation has expired.';
  end if;
  if p_accept then
    if exists(select 1 from public.family_members fm where fm.id=v_inv.person_id and fm.linked_user_id is not null and fm.linked_user_id<>auth.uid()) then
      raise exception 'That family record has already been claimed by another account.';
    end if;
    perform set_config('vansh.system_write','on',true);
    select fm.id,fm.person_identity_id into v_self,v_identity from public.family_members fm
      where fm.owner_id=auth.uid() and fm.is_self order by fm.created_at limit 1;
    update public.family_members set linked_user_id=auth.uid() where id=v_inv.person_id;
    select fm.person_identity_id into v_identity from public.family_members fm where fm.id=v_inv.person_id;
    if v_self is not null then update public.family_members set person_identity_id=v_identity where id=v_self; end if;
    update public.family_invitations set status='accepted',accepted_user_id=auth.uid(),responded_at=now() where id=v_inv.id;
  else
    update public.family_invitations set status='rejected',accepted_user_id=auth.uid(),responded_at=now() where id=v_inv.id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Separate family matching workflow.
-- ---------------------------------------------------------------------------

-- The v0.14 function returned a different OUT-row shape, which PostgreSQL
-- cannot replace in place even when there are no table dependencies.
drop function if exists public.find_family_matches();
create or replace function public.find_family_matches()
returns table(candidate_member_id uuid,candidate_owner_id uuid,display_name text,score integer,shared_details text[],birth_year integer,birth_place text,lived_in text)
language sql
stable
security definer
set search_path=''
as $$
  with mine as (
    select fm.* from public.family_members fm where fm.owner_id=auth.uid() and not fm.is_placeholder
  ), candidates as (
    select distinct on (other.id)
      other.id,
      other.owner_id,
      trim(concat_ws(' ',other.first_name,other.surname)) as display_name,
      (35
       + case when private.norm_text(coalesce(m.birth_place,m.birth_location->>'display'))<>'' and private.norm_text(coalesce(other.birth_place,other.birth_location->>'display'))=private.norm_text(coalesce(m.birth_place,m.birth_location->>'display')) then 30 else 0 end
       + case when private.norm_text(coalesce(m.lived_in,''))<>'' and private.norm_text(coalesce(other.lived_in,''))=private.norm_text(coalesce(m.lived_in,'')) then 20 else 0 end
       + case when m.birth_year is not null and other.birth_year is not null and abs(m.birth_year-other.birth_year)<=35 then 10 else 0 end
      )::int as match_score,
      array_remove(array[
        'Same family surname'::text,
        case when private.norm_text(coalesce(m.birth_place,m.birth_location->>'display'))<>'' and private.norm_text(coalesce(other.birth_place,other.birth_location->>'display'))=private.norm_text(coalesce(m.birth_place,m.birth_location->>'display')) then 'Shared birth place' end,
        case when private.norm_text(coalesce(m.lived_in,''))<>'' and private.norm_text(coalesce(other.lived_in,''))=private.norm_text(coalesce(m.lived_in,'')) then 'Shared residence' end
      ],null)::text[] as clues,
      other.birth_year,
      coalesce(other.birth_place,other.birth_location->>'display') as birth_place,
      other.lived_in
    from mine m
    join public.family_members other
      on other.owner_id<>auth.uid()
     and not other.is_placeholder
     and private.norm_text(other.surname)=private.norm_text(m.surname)
     -- Exact same-name records belong in identity/duplicate workflows instead.
     and private.norm_text(other.first_name)<>private.norm_text(m.first_name)
    where not exists(
      select 1 from public.family_connection_requests r
      where ((r.from_user_id=auth.uid() and r.to_user_id=other.owner_id) or (r.to_user_id=auth.uid() and r.from_user_id=other.owner_id))
        and r.status in ('pending','accepted','dismissed')
    )
    order by other.id,match_score desc
  )
  select id,owner_id,display_name,least(match_score,100),clues,birth_year,birth_place,lived_in
  from candidates where match_score>=65 order by match_score desc,display_name limit 30;
$$;

create or replace function public.request_family_match(p_candidate_member_id uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_owner uuid; v_id uuid;
begin
  select c.candidate_owner_id into v_owner from public.find_family_matches() c where c.candidate_member_id=p_candidate_member_id;
  if v_owner is null then raise exception 'This family suggestion is no longer available.'; end if;
  insert into public.family_connection_requests(from_user_id,to_user_id,status,connection_kind,candidate_member_id)
  values(auth.uid(),v_owner,'pending','family_match',p_candidate_member_id) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.dismiss_family_match(p_candidate_member_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_owner uuid;
begin
  select fm.owner_id into v_owner from public.family_members fm
  where fm.id=p_candidate_member_id and fm.owner_id<>auth.uid();
  if v_owner is null then return; end if;
  if not exists(
    select 1 from public.family_connection_requests r
    where r.from_user_id=auth.uid() and r.to_user_id=v_owner
      and r.candidate_member_id=p_candidate_member_id
  ) then
    insert into public.family_connection_requests(from_user_id,to_user_id,status,connection_kind,candidate_member_id,resolved_at)
    values(auth.uid(),v_owner,'dismissed','family_match',p_candidate_member_id,now());
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Duplicate detection and deliberate merge.
-- ---------------------------------------------------------------------------

create or replace function public.find_duplicate_members(
  p_owner_id uuid,
  p_first_name text,
  p_surname text,
  p_birth_date date default null,
  p_birth_year integer default null,
  p_birth_place text default null,
  p_exclude_id uuid default null
)
returns table(member_id uuid,display_name text,score integer,birth_year integer,birth_place text,lived_in text,claimed boolean)
language sql
stable
security definer
set search_path=''
as $$
  select
    fm.id,
    trim(concat_ws(' ',fm.first_name,fm.surname)),
    least(100,
      55
      + case
          when p_birth_date is not null and fm.birth_date=p_birth_date then 30
          when p_birth_year is not null and fm.birth_year=p_birth_year then 20
          else 0
        end
      + case when private.norm_text(p_birth_place)<>'' and private.norm_text(coalesce(fm.birth_place,fm.birth_location->>'display'))=private.norm_text(p_birth_place) then 15 else 0 end
    )::int,
    fm.birth_year,
    coalesce(fm.birth_place,fm.birth_location->>'display'),
    fm.lived_in,
    fm.linked_user_id is not null
  from public.family_members fm
  where fm.owner_id=p_owner_id
    and fm.id is distinct from p_exclude_id
    and not fm.is_placeholder
    and public.can_access_family_member(auth.uid(),fm.id)
    and private.norm_text(fm.first_name)=private.norm_text(p_first_name)
    and (private.norm_text(fm.surname)=private.norm_text(p_surname) or private.norm_text(coalesce(fm.maiden_name,''))=private.norm_text(p_surname))
  order by 3 desc,2
  limit 10;
$$;

create or replace function public.merge_family_members(p_keep_id uuid,p_merge_id uuid,p_field_choices jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  k public.family_members%rowtype;
  m public.family_members%rowtype;
  rel record;
  new_a uuid;
  new_b uuid;
begin
  if p_keep_id=p_merge_id then raise exception 'Choose two different records.'; end if;
  select * into k from public.family_members where id=p_keep_id for update;
  select * into m from public.family_members where id=p_merge_id for update;
  if k.id is null or m.id is null or k.owner_id<>m.owner_id then raise exception 'Duplicates must belong to the same family graph.'; end if;
  if not public.can_manage_family_member(auth.uid(),k.id) or not public.can_manage_family_member(auth.uid(),m.id) then raise exception 'You do not have permission to merge both records.'; end if;
  if k.is_self or m.is_self then raise exception 'Self records cannot be merged through duplicate cleanup.'; end if;
  if k.linked_user_id is not null or m.linked_user_id is not null then raise exception 'Claimed profiles cannot be merged automatically. Resolve the identity link first.'; end if;
  if exists (
    select 1 from public.identity_claim_requests r
    where r.status='pending'
      and (r.candidate_member_id in (k.id,m.id) or r.claimant_member_id in (k.id,m.id))
  ) then
    raise exception 'Resolve pending identity claims before merging these records.';
  end if;

  insert into public.member_merge_audit(kept_member_id,merged_member_id,merged_by,kept_snapshot,merged_snapshot,field_choices)
  values(k.id,m.id,auth.uid(),to_jsonb(k),to_jsonb(m),coalesce(p_field_choices,'{}'::jsonb));

  perform set_config('vansh.system_write','on',true);
  update public.family_members set
    first_name = case when p_field_choices->>'first_name'='merge' then m.first_name else k.first_name end,
    surname = case when p_field_choices->>'surname'='merge' then m.surname else k.surname end,
    nickname = case when p_field_choices->>'nickname'='merge' then m.nickname else coalesce(k.nickname,m.nickname) end,
    maiden_name = case when p_field_choices->>'maiden_name'='merge' then m.maiden_name else coalesce(k.maiden_name,m.maiden_name) end,
    gender = case when p_field_choices->>'gender'='merge' then m.gender else k.gender end,
    birth_year = case when p_field_choices->>'birth_year'='merge' then m.birth_year else coalesce(k.birth_year,m.birth_year) end,
    birth_date = case when p_field_choices->>'birth_date'='merge' then m.birth_date else coalesce(k.birth_date,m.birth_date) end,
    birth_location = case when p_field_choices->>'birth_location'='merge' then m.birth_location else coalesce(k.birth_location,m.birth_location) end,
    birth_place = case when p_field_choices->>'birth_place'='merge' then m.birth_place else coalesce(k.birth_place,m.birth_place) end,
    lived_locations = case when p_field_choices->>'lived_locations'='merge' then m.lived_locations else case when jsonb_array_length(coalesce(k.lived_locations,'[]'::jsonb))=0 then m.lived_locations else k.lived_locations end end,
    lived_in = case when p_field_choices->>'lived_in'='merge' then m.lived_in else coalesce(k.lived_in,m.lived_in) end
  where id=k.id;

  -- Transfer the duplicate's graph edges one at a time. A direct relationship
  -- between the two duplicate records would become k -> k and violate the
  -- relationships_different_people constraint, so it is removed. If replacing
  -- m with k would create an edge that already exists, keep the existing edge
  -- and remove the duplicate one before updating anything.
  for rel in
    select *
    from public.relationships
    where person_a_id=m.id or person_b_id=m.id
    order by created_at nulls last, id
  loop
    new_a := case when rel.person_a_id=m.id then k.id else rel.person_a_id end;
    new_b := case when rel.person_b_id=m.id then k.id else rel.person_b_id end;

    if new_a = new_b then
      delete from public.relationships where id=rel.id;
    elsif exists (
      select 1
      from public.relationships d
      where d.id <> rel.id
        and d.owner_id = rel.owner_id
        and d.person_a_id = new_a
        and d.person_b_id = new_b
        and d.relationship_type = rel.relationship_type
        and coalesce(d.relationship_variant,'') = coalesce(rel.relationship_variant,'')
    ) then
      delete from public.relationships where id=rel.id;
    else
      update public.relationships
      set person_a_id=new_a,
          person_b_id=new_b
      where id=rel.id;
    end if;
  end loop;

  -- Defensive cleanup for legacy duplicate edges.
  delete from public.relationships where person_a_id=person_b_id;
  delete from public.relationships r
  using public.relationships d
  where r.id>d.id and r.owner_id=d.owner_id and r.person_a_id=d.person_a_id and r.person_b_id=d.person_b_id
    and r.relationship_type=d.relationship_type and coalesce(r.relationship_variant,'')=coalesce(d.relationship_variant,'');

  -- A duplicate may already participate in pending workflows. Preserve those
  -- references rather than deleting them through cascading foreign keys.
  update public.identity_claim_requests set candidate_member_id=k.id where candidate_member_id=m.id;
  update public.identity_claim_requests set claimant_member_id=k.id where claimant_member_id=m.id;
  update public.family_connection_requests set candidate_member_id=k.id where candidate_member_id=m.id;
  update public.match_decisions set candidate_member_id=k.id where candidate_member_id=m.id;

  -- If both duplicate records have an equivalent pending invitation, keep the
  -- oldest one and remove the collision before repointing the remainder.
  delete from public.family_invitations mi
  using public.family_invitations ki
  where mi.person_id=m.id and ki.person_id=k.id
    and lower(mi.email)=lower(ki.email)
    and mi.status='pending' and ki.status='pending';
  update public.family_invitations set person_id=k.id where person_id=m.id;
  update public.family_invitations set inviter_person_id=k.id where inviter_person_id=m.id;
  insert into public.family_invitation_access(invitation_id,member_id)
    select invitation_id,k.id from public.family_invitation_access where member_id=m.id on conflict do nothing;
  delete from public.family_invitation_access where member_id=m.id;
  update public.profile_change_requests set member_id=k.id where member_id=m.id;
  delete from public.family_members where id=m.id;
  return k.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Unified verification inbox and responses. The kinds stay explicit.
-- ---------------------------------------------------------------------------

create or replace function public.get_verification_inbox()
returns table(kind text,request_id uuid,direction text,status text,counterpart_name text,subject_name text,score integer,shared_details text[],created_at timestamptz)
language sql
stable
security definer
set search_path=''
as $$
  select * from (
    select
      'identity'::text,
      r.id,
      case when (r.initiated_by='claimant' and r.candidate_owner_id=auth.uid()) or (r.initiated_by='record_owner' and r.claimant_user_id=auth.uid()) then 'incoming' else 'outgoing' end::text,
      r.status,
      case
        when r.initiated_by='claimant' and r.candidate_owner_id=auth.uid() then coalesce(cp.display_name,'Another Vansh user')
        when r.initiated_by='record_owner' and r.claimant_user_id=auth.uid() then coalesce(op.display_name,'Family record owner')
        when r.initiated_by='record_owner' then coalesce(cp.display_name,'Another Vansh user')
        else coalesce(op.display_name,'Family record owner') end::text,
      trim(concat_ws(' ',fm.first_name,fm.surname))::text,
      r.score,r.shared_details,r.created_at
    from public.identity_claim_requests r
    join public.family_members fm on fm.id=r.candidate_member_id
    left join public.profiles cp on cp.id=r.claimant_user_id
    left join public.profiles op on op.id=r.candidate_owner_id
    where r.status<>'dismissed' and (r.candidate_owner_id=auth.uid() or r.claimant_user_id=auth.uid())

    union all

    select
      'family_match'::text,r.id,
      case when r.to_user_id=auth.uid() then 'incoming' else 'outgoing' end::text,
      r.status,
      case when r.to_user_id=auth.uid() then coalesce(fp.display_name,'Another Vansh user') else coalesce(tp.display_name,'Another Vansh user') end::text,
      case when fm.id is not null then trim(concat_ws(' ',fm.first_name,fm.surname)) end::text,
      null::int,
      array[case when r.connection_kind='family_match' then 'Possible overlapping family branch' else 'Same family surname' end]::text[],
      r.created_at
    from public.family_connection_requests r
    left join public.profiles fp on fp.id=r.from_user_id
    left join public.profiles tp on tp.id=r.to_user_id
    left join public.family_members fm on fm.id=r.candidate_member_id
    where r.status<>'dismissed' and (r.from_user_id=auth.uid() or r.to_user_id=auth.uid())

    union all

    select
      'correction'::text,c.id,
      case when fm.linked_user_id=auth.uid() then 'incoming' else 'outgoing' end::text,
      c.status,
      coalesce(pp.display_name,'A relative')::text,
      trim(concat_ws(' ',fm.first_name,fm.surname))::text,
      null::int,
      array['Suggested profile correction']::text[] || coalesce(
        (select array_agg(replace(e.key, '_', ' ') || ': ' || left(e.value::text, 120))
         from jsonb_each(c.proposed_changes) e),
        '{}'::text[]
      ),
      c.created_at
    from public.profile_change_requests c
    join public.family_members fm on fm.id=c.member_id
    left join public.profiles pp on pp.id=c.proposer_user_id
    where fm.linked_user_id=auth.uid() or c.proposer_user_id=auth.uid()

    union all

    select
      'invitation'::text,fi.id,'incoming'::text,fi.status,
      coalesce(ip.display_name,'A relative')::text,
      trim(concat_ws(' ',fm.first_name,fm.surname))::text,
      null::int,
      array['Direct family invitation', 'Sharing: ' || fi.scope]::text[],
      fi.created_at
    from public.family_invitations fi
    join public.family_members fm on fm.id=fi.person_id
    left join public.profiles ip on ip.id=fi.inviter_id
    where lower(fi.email)=lower(coalesce(auth.jwt()->>'email',''))
      and fi.status in ('pending','accepted','rejected','expired')
  ) as inbox(kind, request_id, direction, status, counterpart_name, subject_name, score, shared_details, created_at)
  order by case when inbox.status='pending' and inbox.direction='incoming' then 0 when inbox.status='pending' then 1 else 2 end, inbox.created_at desc
  limit 80;
$$;

create or replace function public.respond_verification_request(p_kind text,p_request_id uuid,p_accept boolean)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_identity public.identity_claim_requests%rowtype;
  v_connection public.family_connection_requests%rowtype;
  v_change public.profile_change_requests%rowtype;
  v_candidate public.family_members%rowtype;
  v_claimant public.family_members%rowtype;
begin
  if p_kind='identity' then
    select * into v_identity from public.identity_claim_requests
    where id=p_request_id and status='pending'
      and ((initiated_by='claimant' and candidate_owner_id=auth.uid()) or (initiated_by='record_owner' and claimant_user_id=auth.uid()))
    for update;
    if v_identity.id is null then raise exception 'Identity request not found or already resolved.'; end if;

    if p_accept then
      select * into v_candidate from public.family_members where id=v_identity.candidate_member_id for update;
      if v_candidate.linked_user_id is not null and v_candidate.linked_user_id<>v_identity.claimant_user_id then
        raise exception 'This profile has already been claimed by another account.';
      end if;
      if v_identity.claimant_member_id is null then
        select * into v_claimant from public.family_members where owner_id=v_identity.claimant_user_id and is_self order by created_at limit 1;
        if v_claimant.id is null then raise exception 'The claimant needs to open Vansh once before verification can complete.'; end if;
        update public.identity_claim_requests set claimant_member_id=v_claimant.id where id=v_identity.id;
      else
        select * into v_claimant from public.family_members where id=v_identity.claimant_member_id;
      end if;
      perform set_config('vansh.system_write','on',true);
      update public.family_members set linked_user_id=v_identity.claimant_user_id where id=v_candidate.id;
      update public.family_members set person_identity_id=v_candidate.person_identity_id where id=v_claimant.id;
      insert into public.verified_identity_links(candidate_member_id,claimant_member_id,record_owner_id,claimant_user_id)
      values(v_candidate.id,v_claimant.id,v_identity.candidate_owner_id,v_identity.claimant_user_id)
      on conflict(candidate_member_id) do update set claimant_member_id=excluded.claimant_member_id,claimant_user_id=excluded.claimant_user_id,verified_at=now();
      update public.identity_claim_requests set status='rejected',resolved_at=now()
      where candidate_member_id=v_candidate.id and id<>v_identity.id and status='pending';
    end if;
    update public.identity_claim_requests set status=case when p_accept then 'accepted' else 'rejected' end,resolved_at=now() where id=v_identity.id;

  elsif p_kind in ('family_match','surname') then
    select * into v_connection from public.family_connection_requests
    where id=p_request_id and to_user_id=auth.uid() and status='pending' for update;
    if v_connection.id is null then raise exception 'Family connection request not found or already resolved.'; end if;
    update public.family_connection_requests set status=case when p_accept then 'accepted' else 'rejected' end,resolved_at=now() where id=v_connection.id;
    if p_accept then
      insert into public.verified_family_connections(request_id,user_a_id,user_b_id)
      values(v_connection.id,v_connection.from_user_id,v_connection.to_user_id) on conflict(request_id) do nothing;
    end if;

  elsif p_kind='correction' then
    select c.* into v_change
    from public.profile_change_requests c
    join public.family_members fm on fm.id=c.member_id
    where c.id=p_request_id and c.status='pending' and fm.linked_user_id=auth.uid()
    for update;
    if v_change.id is null then raise exception 'Correction request not found or already resolved.'; end if;
    if p_accept then
      update public.family_members fm set
        first_name = case when v_change.proposed_changes ? 'first_name' then nullif(v_change.proposed_changes->>'first_name','') else fm.first_name end,
        surname = case when v_change.proposed_changes ? 'surname' then nullif(v_change.proposed_changes->>'surname','') else fm.surname end,
        nickname = case when v_change.proposed_changes ? 'nickname' then nullif(v_change.proposed_changes->>'nickname','') else fm.nickname end,
        maiden_name = case when v_change.proposed_changes ? 'maiden_name' then nullif(v_change.proposed_changes->>'maiden_name','') else fm.maiden_name end,
        gender = case when v_change.proposed_changes ? 'gender' then v_change.proposed_changes->>'gender' else fm.gender end,
        birth_year = case when v_change.proposed_changes ? 'birth_year' then nullif(v_change.proposed_changes->>'birth_year','')::int else fm.birth_year end,
        birth_date = case when v_change.proposed_changes ? 'birth_date' then nullif(v_change.proposed_changes->>'birth_date','')::date else fm.birth_date end,
        birth_place = case when v_change.proposed_changes ? 'birth_place' then nullif(v_change.proposed_changes->>'birth_place','') else fm.birth_place end,
        lived_in = case when v_change.proposed_changes ? 'lived_in' then nullif(v_change.proposed_changes->>'lived_in','') else fm.lived_in end,
        birth_location = case when v_change.proposed_changes ? 'birth_location' then v_change.proposed_changes->'birth_location' else fm.birth_location end,
        lived_locations = case when v_change.proposed_changes ? 'lived_locations' then v_change.proposed_changes->'lived_locations' else fm.lived_locations end
      where fm.id=v_change.member_id;
    end if;
    update public.profile_change_requests set status=case when p_accept then 'accepted' else 'rejected' end,resolved_at=now() where id=v_change.id;
  else
    raise exception 'Unknown request kind.';
  end if;
end;
$$;

-- Optional owner-side dismissal functions retained for existing clients.
create or replace function public.dismiss_member_identity_candidate(p_member_id uuid,p_candidate_code uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_target_user uuid; v_target_self uuid;
begin
  if not exists(select 1 from public.family_members fm where fm.id=p_member_id and fm.linked_user_id is null and (fm.created_by=auth.uid() or fm.owner_id=auth.uid())) then return; end if;
  select p.id into v_target_user from public.profiles p where p.discovery_code=p_candidate_code;
  if v_target_user is null then return; end if;
  select fm.id into v_target_self from public.family_members fm where fm.owner_id=v_target_user and fm.is_self order by fm.created_at limit 1;
  if not exists(select 1 from public.identity_claim_requests r where r.candidate_member_id=p_member_id and r.claimant_user_id=v_target_user) then
    insert into public.identity_claim_requests(candidate_member_id,candidate_owner_id,claimant_user_id,claimant_member_id,initiated_by,status,score,shared_details,resolved_at)
    values(p_member_id,auth.uid(),v_target_user,v_target_self,'record_owner','dismissed',0,'{}',now());
  end if;
end;
$$;

-- Timestamp helper for profiles.
create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles for each row execute function private.touch_updated_at();

-- Keep the auth trigger deterministic for fresh signups.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_first_name text; v_surname text; v_display_name text; v_birth_date date; v_discovery boolean;
begin
  v_first_name:=coalesce(nullif(new.raw_user_meta_data->>'first_name',''),nullif(split_part(coalesce(new.raw_user_meta_data->>'display_name',''),' ',1),''),split_part(new.email,'@',1),'User');
  v_surname:=nullif(new.raw_user_meta_data->>'family_surname','');
  v_display_name:=coalesce(nullif(new.raw_user_meta_data->>'display_name',''),trim(concat_ws(' ',v_first_name,v_surname)),split_part(new.email,'@',1),'User');
  v_birth_date:=case when (new.raw_user_meta_data->>'birth_date')~'^\d{4}-\d{2}-\d{2}$' then (new.raw_user_meta_data->>'birth_date')::date end;
  v_discovery:=lower(coalesce(new.raw_user_meta_data->>'discovery_enabled','true')) in ('true','1','yes');
  insert into public.profiles(id,display_name,first_name,surname,location,birth_date,birth_location_text,current_location_text,discovery_enabled)
  values(new.id,v_display_name,v_first_name,v_surname,nullif(new.raw_user_meta_data->>'location',''),v_birth_date,nullif(new.raw_user_meta_data->>'birth_location',''),nullif(new.raw_user_meta_data->>'location',''),v_discovery)
  on conflict(id) do update set display_name=excluded.display_name,first_name=excluded.first_name,surname=excluded.surname,location=excluded.location,birth_date=excluded.birth_date,birth_location_text=excluded.birth_location_text,current_location_text=excluded.current_location_text,discovery_enabled=excluded.discovery_enabled,updated_at=now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert or update of raw_user_meta_data on auth.users
for each row execute function public.handle_new_user();

-- Grants for RPCs called by the browser client.
grant execute on function public.can_access_family_member(uuid,uuid) to authenticated;
grant execute on function public.can_create_family_member_for_owner(uuid,uuid) to authenticated;
grant execute on function public.can_manage_family_member(uuid,uuid) to authenticated;
grant execute on function public.find_identity_claim_candidates() to authenticated;
grant execute on function public.request_identity_claim(uuid) to authenticated;
grant execute on function public.find_member_user_candidates(uuid) to authenticated;
grant execute on function public.request_member_identity_verification(uuid,uuid) to authenticated;
grant execute on function public.suggest_member_correction(uuid,jsonb) to authenticated;
grant execute on function public.preview_family_invitation_scope(uuid,text) to authenticated;
grant execute on function public.respond_family_invitation(uuid,boolean) to authenticated;
grant execute on function public.find_family_matches() to authenticated;
grant execute on function public.request_family_match(uuid) to authenticated;
grant execute on function public.dismiss_family_match(uuid) to authenticated;
grant execute on function public.find_duplicate_members(uuid,text,text,date,integer,text,uuid) to authenticated;
grant execute on function public.merge_family_members(uuid,uuid,jsonb) to authenticated;
grant execute on function public.get_verification_inbox() to authenticated;
grant execute on function public.respond_verification_request(text,uuid,boolean) to authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.family_members to authenticated;
grant select, insert, update, delete on public.relationships to authenticated;
-- Request/audit tables are intentionally not granted for direct browser CRUD.
-- Browser clients use the SECURITY DEFINER RPCs above so workflow invariants
-- cannot be bypassed with raw table calls.
