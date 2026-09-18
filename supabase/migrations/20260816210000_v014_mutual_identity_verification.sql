-- VANSH v0.14 DATABASE UPDATE
-- Mutual identity verification + privacy-safe surname discovery.
-- Run once in Supabase Dashboard -> SQL Editor.

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------------
-- 1) Profile identity fields
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists surname text;
alter table public.profiles add column if not exists birth_date date;
alter table public.profiles add column if not exists birth_location_text text;
alter table public.profiles add column if not exists current_location_text text;
alter table public.profiles add column if not exists discovery_enabled boolean not null default false;
alter table public.profiles add column if not exists discovery_code uuid not null default gen_random_uuid();

create unique index if not exists profiles_discovery_code_uidx
  on public.profiles(discovery_code);
create index if not exists profiles_surname_lower_idx
  on public.profiles(lower(surname));

alter table public.family_members add column if not exists birth_date date;
alter table public.family_members add column if not exists person_identity_id uuid not null default gen_random_uuid();

create unique index if not exists family_members_person_identity_uidx
  on public.family_members(person_identity_id);
create index if not exists family_members_name_match_idx
  on public.family_members(lower(first_name), lower(surname));

-- Backfill profile fields from Auth metadata / existing display name.
update public.profiles p
set
  first_name = coalesce(
    nullif(p.first_name, ''),
    nullif(u.raw_user_meta_data ->> 'first_name', ''),
    nullif(split_part(p.display_name, ' ', 1), '')
  ),
  surname = coalesce(
    nullif(p.surname, ''),
    nullif(u.raw_user_meta_data ->> 'family_surname', ''),
    case when position(' ' in p.display_name) > 0
      then nullif(regexp_replace(p.display_name, '^.*\s', ''), '')
      else null
    end
  ),
  birth_date = coalesce(
    p.birth_date,
    case
      when (u.raw_user_meta_data ->> 'birth_date') ~ '^\d{4}-\d{2}-\d{2}$'
        then (u.raw_user_meta_data ->> 'birth_date')::date
      else null
    end
  ),
  birth_location_text = coalesce(nullif(p.birth_location_text, ''), nullif(u.raw_user_meta_data ->> 'birth_location', '')),
  current_location_text = coalesce(nullif(p.current_location_text, ''), nullif(u.raw_user_meta_data ->> 'location', ''), nullif(p.location, '')),
  discovery_enabled = case
    when lower(coalesce(u.raw_user_meta_data ->> 'discovery_enabled', '')) in ('true','1','yes') then true
    else p.discovery_enabled
  end,
  updated_at = now()
from auth.users u
where p.id = u.id;

-- Keep new sign-ups synchronized into public.profiles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first_name text;
  v_surname text;
  v_display_name text;
  v_birth_date date;
  v_discovery boolean;
begin
  v_first_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'first_name', ''),
    nullif(split_part(coalesce(new.raw_user_meta_data ->> 'display_name', ''), ' ', 1), ''),
    split_part(new.email, '@', 1),
    'User'
  );
  v_surname := nullif(new.raw_user_meta_data ->> 'family_surname', '');
  v_display_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    trim(concat_ws(' ', v_first_name, v_surname)),
    split_part(new.email, '@', 1),
    'User'
  );
  v_birth_date := case
    when (new.raw_user_meta_data ->> 'birth_date') ~ '^\d{4}-\d{2}-\d{2}$'
      then (new.raw_user_meta_data ->> 'birth_date')::date
    else null
  end;
  v_discovery := lower(coalesce(new.raw_user_meta_data ->> 'discovery_enabled', 'false')) in ('true','1','yes');

  insert into public.profiles (
    id, display_name, first_name, surname, location,
    birth_date, birth_location_text, current_location_text,
    discovery_enabled
  ) values (
    new.id,
    v_display_name,
    v_first_name,
    v_surname,
    nullif(new.raw_user_meta_data ->> 'location', ''),
    v_birth_date,
    nullif(new.raw_user_meta_data ->> 'birth_location', ''),
    nullif(new.raw_user_meta_data ->> 'location', ''),
    v_discovery
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    first_name = excluded.first_name,
    surname = excluded.surname,
    location = excluded.location,
    birth_date = excluded.birth_date,
    birth_location_text = excluded.birth_location_text,
    current_location_text = excluded.current_location_text,
    discovery_enabled = excluded.discovery_enabled,
    updated_at = now();

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Privacy-safe verification request tables
-- ---------------------------------------------------------------------------

create table if not exists public.identity_claim_requests (
  id uuid primary key default gen_random_uuid(),
  candidate_member_id uuid not null references public.family_members(id) on delete cascade,
  candidate_owner_id uuid not null references auth.users(id) on delete cascade,
  claimant_user_id uuid not null references auth.users(id) on delete cascade,
  claimant_member_id uuid references public.family_members(id) on delete cascade,
  initiated_by text not null default 'claimant' check (initiated_by in ('claimant','record_owner')),
  status text not null default 'pending' check (status in ('pending','accepted','rejected','dismissed')),
  score integer not null default 0 check (score between 0 and 100),
  shared_details text[] not null default '{}',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.identity_claim_requests
  add column if not exists initiated_by text not null default 'claimant';
alter table public.identity_claim_requests
  drop constraint if exists identity_claim_requests_initiated_by_check;
alter table public.identity_claim_requests
  add constraint identity_claim_requests_initiated_by_check check (initiated_by in ('claimant','record_owner'));
alter table public.identity_claim_requests
  alter column claimant_member_id drop not null;

create unique index if not exists identity_claim_pending_uidx
  on public.identity_claim_requests(candidate_member_id, claimant_user_id)
  where status = 'pending';
create index if not exists identity_claim_owner_idx on public.identity_claim_requests(candidate_owner_id, status);
create index if not exists identity_claim_claimant_idx on public.identity_claim_requests(claimant_user_id, status);

create table if not exists public.verified_identity_links (
  id uuid primary key default gen_random_uuid(),
  candidate_member_id uuid not null references public.family_members(id) on delete cascade,
  claimant_member_id uuid not null references public.family_members(id) on delete cascade,
  record_owner_id uuid not null references auth.users(id) on delete cascade,
  claimant_user_id uuid not null references auth.users(id) on delete cascade,
  verified_at timestamptz not null default now(),
  unique(candidate_member_id, claimant_member_id)
);

create unique index if not exists verified_identity_candidate_uidx
  on public.verified_identity_links(candidate_member_id);
create index if not exists verified_identity_claimant_user_idx
  on public.verified_identity_links(claimant_user_id);

create table if not exists public.family_connection_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references auth.users(id) on delete cascade,
  to_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (from_user_id <> to_user_id)
);

create index if not exists family_connection_from_idx on public.family_connection_requests(from_user_id, status);
create index if not exists family_connection_to_idx on public.family_connection_requests(to_user_id, status);

create table if not exists public.verified_family_connections (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.family_connection_requests(id) on delete cascade,
  user_a_id uuid not null references auth.users(id) on delete cascade,
  user_b_id uuid not null references auth.users(id) on delete cascade,
  verified_at timestamptz not null default now(),
  check (user_a_id <> user_b_id)
);

alter table public.identity_claim_requests enable row level security;
alter table public.verified_identity_links enable row level security;
alter table public.family_connection_requests enable row level security;
alter table public.verified_family_connections enable row level security;

-- Direct table access is read-only and only for participants. Mutations happen
-- through the security-definer RPCs below, where every action is re-validated.
drop policy if exists "Read own identity claims" on public.identity_claim_requests;
create policy "Read own identity claims"
on public.identity_claim_requests for select to authenticated
using (
  claimant_user_id = (select auth.uid())
  or candidate_owner_id = (select auth.uid())
);

drop policy if exists "Read own verified identity links" on public.verified_identity_links;
create policy "Read own verified identity links"
on public.verified_identity_links for select to authenticated
using (
  claimant_user_id = (select auth.uid())
  or record_owner_id = (select auth.uid())
);

drop policy if exists "Read own family connection requests" on public.family_connection_requests;
create policy "Read own family connection requests"
on public.family_connection_requests for select to authenticated
using (
  from_user_id = (select auth.uid())
  or to_user_id = (select auth.uid())
);

drop policy if exists "Read own verified family connections" on public.verified_family_connections;
create policy "Read own verified family connections"
on public.verified_family_connections for select to authenticated
using (
  user_a_id = (select auth.uid())
  or user_b_id = (select auth.uid())
);

grant select on public.identity_claim_requests to authenticated;
grant select on public.verified_identity_links to authenticated;
grant select on public.family_connection_requests to authenticated;
grant select on public.verified_family_connections to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Internal matching helpers
-- ---------------------------------------------------------------------------

create or replace function private.norm_text(v text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(coalesce(v, ''), '[^[:alnum:]]+', '', 'g'));
$$;

revoke all on function private.norm_text(text) from public;

-- ---------------------------------------------------------------------------
-- 4) "Could this be you?" matching
-- ---------------------------------------------------------------------------

create or replace function public.find_identity_claim_candidates()
returns table (
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
security definer
set search_path = ''
stable
as $$
  with me as (
    select p.*
    from public.profiles p
    where p.id = auth.uid()
  ), scored as (
    select
      fm.id,
      'VNSH-' || upper(substr(replace(fm.person_identity_id::text, '-', ''), 1, 10)) as person_code,
      trim(concat_ws(' ', fm.first_name, fm.surname)) as display_name,
      (
        30
        + 25
        + case
            when me.birth_date is not null and fm.birth_date = me.birth_date then 30
            when me.birth_date is not null and fm.birth_year = extract(year from me.birth_date)::integer then 15
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
              then 10 else 0
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
      case when coalesce(coalesce(fm.birth_place, fm.birth_location ->> 'display'), '') ~ '[0-9]' then null else coalesce(fm.birth_place, fm.birth_location ->> 'display') end as birth_place,
      case when coalesce(fm.lived_in, '') ~ '[0-9]' then null else fm.lived_in end as lived_in,
      fm.owner_id
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
        where r.candidate_member_id = fm.id
          and r.claimant_user_id = auth.uid()
      )
      and not exists (
        select 1 from public.verified_identity_links v
        where v.candidate_member_id = fm.id
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
  select c.score, c.shared_details
    into v_score, v_shared
  from public.find_identity_claim_candidates() c
  where c.candidate_member_id = p_candidate_member_id;

  if v_score is null then
    raise exception 'This record is not an eligible identity suggestion.';
  end if;

  select fm.id into v_self_id
  from public.family_members fm
  where fm.owner_id = auth.uid() and fm.is_self
  order by fm.created_at
  limit 1;

  if v_self_id is null then
    raise exception 'Your self record is missing.';
  end if;

  select coalesce(fm.created_by, fm.owner_id) into v_candidate_owner
  from public.family_members fm
  where fm.id = p_candidate_member_id;

  insert into public.identity_claim_requests (
    candidate_member_id, candidate_owner_id, claimant_user_id,
    claimant_member_id, initiated_by, status, score, shared_details
  ) values (
    p_candidate_member_id, v_candidate_owner, auth.uid(),
    v_self_id, 'claimant', 'pending', v_score, coalesce(v_shared, '{}')
  )
  returning id into v_request_id;

  return v_request_id;
end;
$$;

create or replace function public.dismiss_identity_candidate(p_candidate_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_self_id uuid;
begin
  select coalesce(fm.created_by, fm.owner_id) into v_owner
  from public.family_members fm
  where fm.id = p_candidate_member_id;

  select fm.id into v_self_id
  from public.family_members fm
  where fm.owner_id = auth.uid() and fm.is_self
  order by fm.created_at
  limit 1;

  if v_owner is null or v_self_id is null then return; end if;

  insert into public.identity_claim_requests (
    candidate_member_id, candidate_owner_id, claimant_user_id,
    claimant_member_id, initiated_by, status, score, shared_details, resolved_at
  ) values (
    p_candidate_member_id, v_owner, auth.uid(), v_self_id,
    'claimant', 'dismissed', 0, '{}', now()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4b) When a tree creator enters someone who may already be a Vansh user
-- ---------------------------------------------------------------------------

create or replace function public.find_member_user_candidates(p_member_id uuid)
returns table (
  candidate_code uuid,
  display_name text,
  score integer,
  shared_details text[],
  birth_year integer,
  current_location text,
  birth_location text
)
language sql
security definer
set search_path = ''
stable
as $$
  with member as (
    select fm.*
    from public.family_members fm
    where fm.id = p_member_id
      and coalesce(fm.created_by, fm.owner_id) = auth.uid()
      and not fm.is_placeholder
      and fm.linked_user_id is null
  ), scored as (
    select
      p.id as user_id,
      p.discovery_code,
      p.display_name,
      (
        30 + 25
        + case
            when m.birth_date is not null and p.birth_date = m.birth_date then 30
            when m.birth_year is not null and p.birth_date is not null and extract(year from p.birth_date)::integer = m.birth_year then 15
            else 0
          end
        + case
            when private.norm_text(coalesce(m.birth_place, m.birth_location ->> 'display')) <> ''
             and private.norm_text(p.birth_location_text) = private.norm_text(coalesce(m.birth_place, m.birth_location ->> 'display'))
              then 10 else 0
          end
        + case
            when private.norm_text(coalesce(m.lived_in, '')) <> ''
             and private.norm_text(p.current_location_text) = private.norm_text(m.lived_in)
              then 10 else 0
          end
      )::integer as match_score,
      array_remove(array[
        'Same first name'::text,
        'Same surname'::text,
        case when m.birth_date is not null and p.birth_date = m.birth_date then 'Exact birth date' end,
        case when m.birth_date is null and m.birth_year is not null and p.birth_date is not null and extract(year from p.birth_date)::integer = m.birth_year then 'Same birth year' end,
        case when private.norm_text(coalesce(m.birth_place, m.birth_location ->> 'display')) <> '' and private.norm_text(p.birth_location_text) = private.norm_text(coalesce(m.birth_place, m.birth_location ->> 'display')) then 'Same birth place' end,
        case when private.norm_text(coalesce(m.lived_in, '')) <> '' and private.norm_text(p.current_location_text) = private.norm_text(m.lived_in) then 'Same current / last known place' end
      ], null)::text[] as clues,
      case when p.birth_date is not null then extract(year from p.birth_date)::integer else null end as birth_year,
      case when coalesce(p.current_location_text, '') ~ '[0-9]' then null else p.current_location_text end as current_location,
      case when coalesce(p.birth_location_text, '') ~ '[0-9]' then null else p.birth_location_text end as birth_location
    from member m
    join public.profiles p
      on p.id <> auth.uid()
     and private.norm_text(p.first_name) = private.norm_text(m.first_name)
     and (
       private.norm_text(p.surname) = private.norm_text(m.surname)
       or private.norm_text(p.surname) = private.norm_text(coalesce(m.maiden_name, ''))
     )
    where not exists (
      select 1 from public.identity_claim_requests r
      where r.candidate_member_id = m.id and r.claimant_user_id = p.id
    )
    and not exists (
      select 1 from public.verified_identity_links v
      where v.candidate_member_id = m.id
    )
  )
  select discovery_code, display_name, least(match_score, 100), clues, birth_year, current_location, birth_location
  from scored
  where match_score >= 80
  order by match_score desc, display_name
  limit 10;
$$;

create or replace function public.request_member_identity_verification(
  p_member_id uuid,
  p_candidate_code uuid
)
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
  select p.id into v_target_user
  from public.profiles p
  where p.discovery_code = p_candidate_code;

  select c.score, c.shared_details into v_score, v_shared
  from public.find_member_user_candidates(p_member_id) c
  where c.candidate_code = p_candidate_code;

  if v_target_user is null or v_score is null then
    raise exception 'This user is not an eligible identity suggestion for that family record.';
  end if;

  select fm.id into v_target_self
  from public.family_members fm
  where fm.owner_id = v_target_user and fm.is_self
  order by fm.created_at
  limit 1;

  insert into public.identity_claim_requests(
    candidate_member_id, candidate_owner_id, claimant_user_id, claimant_member_id,
    initiated_by, status, score, shared_details
  ) values (
    p_member_id, auth.uid(), v_target_user, v_target_self,
    'record_owner', 'pending', v_score, coalesce(v_shared, '{}')
  ) returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.dismiss_member_identity_candidate(
  p_member_id uuid,
  p_candidate_code uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_user uuid;
  v_target_self uuid;
begin
  if not exists (
    select 1 from public.family_members fm
    where fm.id = p_member_id and coalesce(fm.created_by, fm.owner_id) = auth.uid()
  ) then return; end if;

  select p.id into v_target_user from public.profiles p where p.discovery_code = p_candidate_code;
  if v_target_user is null then return; end if;
  select fm.id into v_target_self from public.family_members fm where fm.owner_id = v_target_user and fm.is_self order by fm.created_at limit 1;

  if not exists (select 1 from public.identity_claim_requests r where r.candidate_member_id = p_member_id and r.claimant_user_id = v_target_user) then
    insert into public.identity_claim_requests(
      candidate_member_id, candidate_owner_id, claimant_user_id, claimant_member_id,
      initiated_by, status, score, shared_details, resolved_at
    ) values (
      p_member_id, auth.uid(), v_target_user, v_target_self,
      'record_owner', 'dismissed', 0, '{}', now()
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Opt-in same-surname discovery
-- ---------------------------------------------------------------------------

create or replace function public.find_surname_connections()
returns table (
  candidate_code uuid,
  display_name text,
  surname text,
  birth_year integer,
  current_location text,
  birth_location text
)
language sql
security definer
set search_path = ''
stable
as $$
  with me as (
    select * from public.profiles where id = auth.uid()
  )
  select
    p.discovery_code,
    p.display_name,
    p.surname,
    case when p.birth_date is not null then extract(year from p.birth_date)::integer else null end,
    case when coalesce(p.current_location_text, '') ~ '[0-9]' then null else p.current_location_text end,
    case when coalesce(p.birth_location_text, '') ~ '[0-9]' then null else p.birth_location_text end
  from me
  join public.profiles p
    on p.id <> auth.uid()
   and p.discovery_enabled
   and private.norm_text(p.surname) = private.norm_text(me.surname)
  where coalesce(me.surname, '') <> ''
    and not exists (
      select 1 from public.family_connection_requests r
      where (r.from_user_id = auth.uid() and r.to_user_id = p.id)
         or (r.from_user_id = p.id and r.to_user_id = auth.uid())
    )
    and not exists (
      select 1 from public.verified_family_connections v
      where (v.user_a_id = auth.uid() and v.user_b_id = p.id)
         or (v.user_a_id = p.id and v.user_b_id = auth.uid())
    )
  order by p.display_name
  limit 50;
$$;

create or replace function public.request_family_connection(p_candidate_code uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target uuid;
  v_my_surname text;
  v_target_surname text;
  v_id uuid;
begin
  select p.surname into v_my_surname from public.profiles p where p.id = auth.uid();
  select p.id, p.surname into v_target, v_target_surname
  from public.profiles p
  where p.discovery_code = p_candidate_code and p.discovery_enabled;

  if v_target is null or v_target = auth.uid() then
    raise exception 'This person is not available for discovery.';
  end if;
  if private.norm_text(v_my_surname) = '' or private.norm_text(v_my_surname) <> private.norm_text(v_target_surname) then
    raise exception 'Surname discovery only allows same-surname requests.';
  end if;
  if exists (
    select 1 from public.family_connection_requests r
    where (r.from_user_id = auth.uid() and r.to_user_id = v_target)
       or (r.from_user_id = v_target and r.to_user_id = auth.uid())
  ) then
    raise exception 'A decision already exists for this person.';
  end if;

  insert into public.family_connection_requests(from_user_id, to_user_id, status)
  values (auth.uid(), v_target, 'pending')
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.dismiss_surname_candidate(p_candidate_code uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target uuid;
begin
  select p.id into v_target
  from public.profiles p
  where p.discovery_code = p_candidate_code;
  if v_target is null or v_target = auth.uid() then return; end if;
  if not exists (
    select 1 from public.family_connection_requests r
    where (r.from_user_id = auth.uid() and r.to_user_id = v_target)
       or (r.from_user_id = v_target and r.to_user_id = auth.uid())
  ) then
    insert into public.family_connection_requests(from_user_id, to_user_id, status, resolved_at)
    values (auth.uid(), v_target, 'dismissed', now());
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) One mutual-response RPC + one privacy-limited inbox RPC
-- ---------------------------------------------------------------------------

create or replace function public.respond_verification_request(
  p_kind text,
  p_request_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_identity public.identity_claim_requests%rowtype;
  v_connection public.family_connection_requests%rowtype;
  v_claimant_member_id uuid;
begin
  if p_kind = 'identity' then
    select * into v_identity
    from public.identity_claim_requests
    where id = p_request_id
      and status = 'pending'
      and (
        (initiated_by = 'claimant' and candidate_owner_id = auth.uid())
        or (initiated_by = 'record_owner' and claimant_user_id = auth.uid())
      )
    for update;

    if v_identity.id is null then
      raise exception 'Identity request not found or already resolved.';
    end if;

    if p_accept and v_identity.claimant_member_id is null then
      select fm.id into v_claimant_member_id
      from public.family_members fm
      where fm.owner_id = v_identity.claimant_user_id and fm.is_self
      order by fm.created_at
      limit 1;
      if v_claimant_member_id is null then
        raise exception 'The other user needs to open Vansh once before this identity can be verified.';
      end if;
      update public.identity_claim_requests
      set claimant_member_id = v_claimant_member_id
      where id = v_identity.id;
      v_identity.claimant_member_id := v_claimant_member_id;
    end if;

    update public.identity_claim_requests
    set status = case when p_accept then 'accepted' else 'rejected' end,
        resolved_at = now()
    where id = v_identity.id;

    if p_accept then
      insert into public.verified_identity_links(
        candidate_member_id, claimant_member_id,
        record_owner_id, claimant_user_id
      ) values (
        v_identity.candidate_member_id,
        v_identity.claimant_member_id,
        v_identity.candidate_owner_id,
        v_identity.claimant_user_id
      )
      on conflict (candidate_member_id, claimant_member_id) do nothing;
    end if;

  elsif p_kind = 'surname' then
    select * into v_connection
    from public.family_connection_requests
    where id = p_request_id
      and to_user_id = auth.uid()
      and status = 'pending'
    for update;

    if v_connection.id is null then
      raise exception 'Family connection request not found or already resolved.';
    end if;

    update public.family_connection_requests
    set status = case when p_accept then 'accepted' else 'rejected' end,
        resolved_at = now()
    where id = v_connection.id;

    if p_accept then
      insert into public.verified_family_connections(request_id, user_a_id, user_b_id)
      values (v_connection.id, v_connection.from_user_id, v_connection.to_user_id)
      on conflict (request_id) do nothing;
    end if;

  else
    raise exception 'Unknown request kind.';
  end if;
end;
$$;

create or replace function public.get_verification_inbox()
returns table (
  kind text,
  request_id uuid,
  direction text,
  status text,
  counterpart_name text,
  subject_name text,
  score integer,
  shared_details text[],
  created_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select * from (
    select
      'identity'::text as kind,
      r.id as request_id,
      case
        when r.initiated_by = 'claimant' and r.candidate_owner_id = auth.uid() then 'incoming'
        when r.initiated_by = 'record_owner' and r.claimant_user_id = auth.uid() then 'incoming'
        else 'outgoing'
      end::text as direction,
      r.status,
      case
        when r.initiated_by = 'claimant' and r.candidate_owner_id = auth.uid() then coalesce(cp.display_name, 'Another Vansh user')
        when r.initiated_by = 'record_owner' and r.claimant_user_id = auth.uid() then coalesce(op.display_name, 'Family record owner')
        when r.initiated_by = 'record_owner' then coalesce(cp.display_name, 'Another Vansh user')
        else coalesce(op.display_name, 'Family record owner')
      end::text as counterpart_name,
      trim(concat_ws(' ', fm.first_name, fm.surname))::text as subject_name,
      r.score,
      r.shared_details,
      r.created_at
    from public.identity_claim_requests r
    join public.family_members fm on fm.id = r.candidate_member_id
    left join public.profiles cp on cp.id = r.claimant_user_id
    left join public.profiles op on op.id = r.candidate_owner_id
    where r.status <> 'dismissed'
      and (r.candidate_owner_id = auth.uid() or r.claimant_user_id = auth.uid())

    union all

    select
      'surname'::text,
      r.id,
      case when r.to_user_id = auth.uid() then 'incoming' else 'outgoing' end::text,
      r.status,
      case
        when r.to_user_id = auth.uid() then coalesce(fp.display_name, 'Another Vansh user')
        else coalesce(tp.display_name, 'Another Vansh user')
      end::text,
      null::text,
      null::integer,
      array['Same family surname']::text[],
      r.created_at
    from public.family_connection_requests r
    left join public.profiles fp on fp.id = r.from_user_id
    left join public.profiles tp on tp.id = r.to_user_id
    where r.status <> 'dismissed'
      and (r.from_user_id = auth.uid() or r.to_user_id = auth.uid())
  ) inbox
  order by
    case when inbox.status = 'pending' and inbox.direction = 'incoming' then 0
         when inbox.status = 'pending' then 1
         else 2 end,
    inbox.created_at desc
  limit 60;
$$;

-- ---------------------------------------------------------------------------
-- 7) Deduplicate mutually verified people in the anonymous world map
-- ---------------------------------------------------------------------------

create or replace function public.get_sindhi_location_counts()
returns table (
  city text,
  country text,
  lat double precision,
  lon double precision,
  people_count bigint,
  country_people_count bigint
)
language sql
security definer
set search_path = ''
stable
as $$
  with identity_keys as (
    select
      fm.id as person_id,
      coalesce(
        'user:' || verified.claimant_user_id::text,
        'member:' || fm.id::text
      ) as canonical_person
    from public.family_members fm
    left join lateral (
      select v.claimant_user_id
      from public.verified_identity_links v
      where v.candidate_member_id = fm.id or v.claimant_member_id = fm.id
      order by v.verified_at
      limit 1
    ) verified on true
  ), raw_locations as (
    select k.canonical_person, fm.birth_location as location
    from public.family_members fm
    join identity_keys k on k.person_id = fm.id
    where fm.birth_location is not null

    union all

    select k.canonical_person, residence.location
    from public.family_members fm
    join identity_keys k on k.person_id = fm.id
    cross join lateral jsonb_array_elements(coalesce(fm.lived_locations, '[]'::jsonb)) as residence(location)
  ), normalized as (
    select
      canonical_person,
      nullif(trim(location ->> 'city'), '') as city,
      nullif(trim(location ->> 'country'), '') as country,
      case when (location ->> 'lat') ~ '^-?[0-9]+(\.[0-9]+)?$' then (location ->> 'lat')::double precision end as lat,
      case when (location ->> 'lon') ~ '^-?[0-9]+(\.[0-9]+)?$' then (location ->> 'lon')::double precision end as lon
    from raw_locations
  ), country_counts as (
    select country, count(distinct canonical_person)::bigint as country_people_count
    from normalized
    where country is not null
    group by country
  ), city_counts as (
    select
      coalesce(city, '') as city,
      country,
      round(lat::numeric, 4)::double precision as lat,
      round(lon::numeric, 4)::double precision as lon,
      count(distinct canonical_person)::bigint as people_count
    from normalized
    where country is not null and lat is not null and lon is not null
    group by coalesce(city, ''), country, round(lat::numeric, 4), round(lon::numeric, 4)
  )
  select c.city, c.country, c.lat, c.lon, c.people_count, cc.country_people_count
  from city_counts c
  join country_counts cc using (country)
  order by c.people_count desc, c.country, c.city;
$$;

revoke all on function public.get_sindhi_location_counts() from public;
grant execute on function public.get_sindhi_location_counts() to authenticated;

-- ---------------------------------------------------------------------------
-- 8) Grants
-- ---------------------------------------------------------------------------

revoke all on function public.find_identity_claim_candidates() from public;
revoke all on function public.request_identity_claim(uuid) from public;
revoke all on function public.dismiss_identity_candidate(uuid) from public;
revoke all on function public.find_member_user_candidates(uuid) from public;
revoke all on function public.request_member_identity_verification(uuid, uuid) from public;
revoke all on function public.dismiss_member_identity_candidate(uuid, uuid) from public;
revoke all on function public.find_surname_connections() from public;
revoke all on function public.request_family_connection(uuid) from public;
revoke all on function public.dismiss_surname_candidate(uuid) from public;
revoke all on function public.respond_verification_request(text, uuid, boolean) from public;
revoke all on function public.get_verification_inbox() from public;

grant execute on function public.find_identity_claim_candidates() to authenticated;
grant execute on function public.request_identity_claim(uuid) to authenticated;
grant execute on function public.dismiss_identity_candidate(uuid) to authenticated;
grant execute on function public.find_member_user_candidates(uuid) to authenticated;
grant execute on function public.request_member_identity_verification(uuid, uuid) to authenticated;
grant execute on function public.dismiss_member_identity_candidate(uuid, uuid) to authenticated;
grant execute on function public.find_surname_connections() to authenticated;
grant execute on function public.request_family_connection(uuid) to authenticated;
grant execute on function public.dismiss_surname_candidate(uuid) to authenticated;
grant execute on function public.respond_verification_request(text, uuid, boolean) to authenticated;
grant execute on function public.get_verification_inbox() to authenticated;
