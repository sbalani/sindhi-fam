-- Canonical baseline for a fresh Vansh Supabase project.
-- All statements are idempotent so this file can also be introduced to an
-- existing project without deleting data.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  first_name text,
  surname text,
  birth_date date,
  birth_location_text text,
  current_location_text text,
  discovery_enabled boolean not null default false,
  discovery_code uuid default gen_random_uuid()
);

create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  linked_user_id uuid references auth.users(id) on delete set null,
  filled_by uuid references auth.users(id) on delete set null,
  first_name text not null,
  surname text not null,
  nickname text,
  maiden_name text,
  gender text not null default 'unspecified',
  birth_year integer,
  birth_location jsonb,
  lived_locations jsonb not null default '[]'::jsonb,
  birth_place text,
  lived_in text,
  family_side text not null default 'Other',
  is_self boolean not null default false,
  is_placeholder boolean not null default false,
  placeholder_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  age_as_reported integer,
  age_recorded_at date,
  birth_date date,
  person_identity_id uuid default gen_random_uuid()
);

create table if not exists public.relationships (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  person_a_id uuid not null references public.family_members(id) on delete cascade,
  person_b_id uuid not null references public.family_members(id) on delete cascade,
  relationship_type text not null,
  start_year integer,
  created_at timestamptz not null default now(),
  relationship_variant text not null default 'unspecified',
  end_year integer,
  check (person_a_id <> person_b_id)
);

create index if not exists family_members_owner_idx on public.family_members(owner_id);
create index if not exists family_members_linked_user_idx on public.family_members(linked_user_id);
create index if not exists family_members_identity_idx on public.family_members(person_identity_id);
create index if not exists relationships_a_idx on public.relationships(person_a_id);
create index if not exists relationships_b_idx on public.relationships(person_b_id);

-- Compatibility helper required by the historical 20260809120645 migration.
-- The P0 migration later replaces this with the full invitation/identity-aware
-- access function.
create or replace function public.can_access_family_member(p_user_id uuid, p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.family_members fm
    where fm.id = p_person_id
      and (fm.owner_id = p_user_id or fm.created_by = p_user_id or fm.linked_user_id = p_user_id or fm.filled_by = p_user_id)
  );
$$;
