-- Pre-release fixes found during P1/P2 manual testing.
-- 1) Normalize auth.users FK delete actions so Dashboard/admin user deletion works.
-- 2) Make strong living-person identity claims discoverable without weakening private records.
-- 3) Validate relationship end years used for divorce/former partnerships.
--
-- IMPORTANT (launch hardening):
-- family_members.owner_id, relationships.owner_id and
-- family_invitations.graph_owner_id are stable FAMILY GRAPH identifiers.
-- They may legitimately refer to the UUID of an account that has since been
-- deleted, so they must NOT be foreign keys to auth.users.

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Normalize real user-reference foreign keys.
--
-- Older databases can contain IDs belonging to accounts that were already
-- deleted before the FK cleanup existed. Clean only account/workflow
-- attribution; NEVER delete family_members/relationships because an owner_id
-- no longer exists in auth.users.
-- ---------------------------------------------------------------------------

-- Account profiles cannot exist meaningfully without an Auth account.
delete from public.profiles p
where not exists (select 1 from auth.users u where u.id = p.id);

-- Genealogy remains. Only stale user attribution is cleared.
update public.family_members fm
set created_by = null
where created_by is not null
  and not exists (select 1 from auth.users u where u.id = fm.created_by);

update public.family_members fm
set linked_user_id = null
where linked_user_id is not null
  and not exists (select 1 from auth.users u where u.id = fm.linked_user_id);

update public.family_members fm
set filled_by = null
where filled_by is not null
  and not exists (select 1 from auth.users u where u.id = fm.filled_by);

update public.family_members fm
set updated_by = null
where updated_by is not null
  and not exists (select 1 from auth.users u where u.id = fm.updated_by);

update public.relationships r
set created_by = null
where created_by is not null
  and not exists (select 1 from auth.users u where u.id = r.created_by);

update public.relationships r
set updated_by = null
where updated_by is not null
  and not exists (select 1 from auth.users u where u.id = r.updated_by);

-- Requests/connections involving a deleted account are no longer actionable.
delete from public.identity_claim_requests r
where not exists (select 1 from auth.users u where u.id = r.candidate_owner_id)
   or not exists (select 1 from auth.users u where u.id = r.claimant_user_id);

delete from public.verified_identity_links r
where not exists (select 1 from auth.users u where u.id = r.record_owner_id)
   or not exists (select 1 from auth.users u where u.id = r.claimant_user_id);

delete from public.profile_change_requests r
where not exists (select 1 from auth.users u where u.id = r.proposer_user_id);

update public.profile_change_requests r
set reviewer_user_id = null
where reviewer_user_id is not null
  and not exists (select 1 from auth.users u where u.id = r.reviewer_user_id);

delete from public.family_connection_requests r
where not exists (select 1 from auth.users u where u.id = r.from_user_id)
   or not exists (select 1 from auth.users u where u.id = r.to_user_id);

delete from public.verified_family_connections r
where not exists (select 1 from auth.users u where u.id = r.user_a_id)
   or not exists (select 1 from auth.users u where u.id = r.user_b_id);

-- graph_owner_id is a graph key and is deliberately preserved.
alter table public.family_invitations alter column inviter_id drop not null;

update public.family_invitations i
set inviter_id = null
where inviter_id is not null
  and not exists (select 1 from auth.users u where u.id = i.inviter_id);

update public.family_invitations i
set accepted_user_id = null
where accepted_user_id is not null
  and not exists (select 1 from auth.users u where u.id = i.accepted_user_id);

delete from public.match_decisions r
where not exists (select 1 from auth.users u where u.id = r.owner_id)
   or not exists (select 1 from auth.users u where u.id = r.candidate_owner_id);

delete from public.member_merge_audit r
where not exists (select 1 from auth.users u where u.id = r.merged_by);

update public.member_change_history r
set changed_by = null
where changed_by is not null
  and not exists (select 1 from auth.users u where u.id = r.changed_by);

update public.relationship_change_history r
set changed_by = null
where changed_by is not null
  and not exists (select 1 from auth.users u where u.id = r.changed_by);

update public.application_errors r
set user_id = null
where user_id is not null
  and not exists (select 1 from auth.users u where u.id = r.user_id);

-- Drop any legacy public -> auth.users FK on all columns we normalize.
-- Graph-key FKs are dropped here and intentionally NOT re-added.
do $$
declare
  target record;
  r record;
begin
  for target in
    select * from (values
      ('profiles','id'),
      ('family_members','owner_id'),('family_members','created_by'),('family_members','linked_user_id'),('family_members','filled_by'),('family_members','updated_by'),
      ('relationships','owner_id'),('relationships','created_by'),('relationships','updated_by'),
      ('identity_claim_requests','candidate_owner_id'),('identity_claim_requests','claimant_user_id'),
      ('verified_identity_links','record_owner_id'),('verified_identity_links','claimant_user_id'),
      ('profile_change_requests','proposer_user_id'),('profile_change_requests','reviewer_user_id'),
      ('family_connection_requests','from_user_id'),('family_connection_requests','to_user_id'),
      ('verified_family_connections','user_a_id'),('verified_family_connections','user_b_id'),
      ('family_invitations','graph_owner_id'),('family_invitations','inviter_id'),('family_invitations','accepted_user_id'),
      ('match_decisions','owner_id'),('match_decisions','candidate_owner_id'),
      ('member_merge_audit','merged_by'),
      ('member_change_history','changed_by'),
      ('relationship_change_history','changed_by'),
      ('application_errors','user_id')
    ) as v(table_name,column_name)
  loop
    for r in
      select distinct c.conname
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      join unnest(c.conkey) as ck(attnum) on true
      join pg_attribute a on a.attrelid = t.oid and a.attnum = ck.attnum
      where c.contype = 'f'
        and c.confrelid = 'auth.users'::regclass
        and n.nspname = 'public'
        and t.relname = target.table_name
        and a.attname = target.column_name
    loop
      execute format('alter table public.%I drop constraint if exists %I', target.table_name, r.conname);
    end loop;
  end loop;
end $$;

-- Real account-reference FKs.
alter table public.profiles
  add constraint profiles_id_auth_fkey
  foreign key (id) references auth.users(id) on delete cascade;

-- owner_id is intentionally NOT constrained to auth.users.
alter table public.family_members
  add constraint family_members_created_by_auth_fkey foreign key (created_by) references auth.users(id) on delete set null,
  add constraint family_members_linked_user_auth_fkey foreign key (linked_user_id) references auth.users(id) on delete set null,
  add constraint family_members_filled_by_auth_fkey foreign key (filled_by) references auth.users(id) on delete set null,
  add constraint family_members_updated_by_auth_fkey foreign key (updated_by) references auth.users(id) on delete set null;

-- owner_id is intentionally NOT constrained to auth.users.
alter table public.relationships
  add constraint relationships_created_by_auth_fkey foreign key (created_by) references auth.users(id) on delete set null,
  add constraint relationships_updated_by_auth_fkey foreign key (updated_by) references auth.users(id) on delete set null;

alter table public.identity_claim_requests
  add constraint identity_claim_candidate_owner_auth_fkey foreign key (candidate_owner_id) references auth.users(id) on delete cascade,
  add constraint identity_claim_claimant_auth_fkey foreign key (claimant_user_id) references auth.users(id) on delete cascade;

alter table public.verified_identity_links
  add constraint verified_identity_record_owner_auth_fkey foreign key (record_owner_id) references auth.users(id) on delete cascade,
  add constraint verified_identity_claimant_auth_fkey foreign key (claimant_user_id) references auth.users(id) on delete cascade;

alter table public.profile_change_requests
  add constraint profile_change_proposer_auth_fkey foreign key (proposer_user_id) references auth.users(id) on delete cascade,
  add constraint profile_change_reviewer_auth_fkey foreign key (reviewer_user_id) references auth.users(id) on delete set null;

alter table public.family_connection_requests
  add constraint family_connection_from_auth_fkey foreign key (from_user_id) references auth.users(id) on delete cascade,
  add constraint family_connection_to_auth_fkey foreign key (to_user_id) references auth.users(id) on delete cascade;

alter table public.verified_family_connections
  add constraint verified_family_user_a_auth_fkey foreign key (user_a_id) references auth.users(id) on delete cascade,
  add constraint verified_family_user_b_auth_fkey foreign key (user_b_id) references auth.users(id) on delete cascade;

-- graph_owner_id is intentionally NOT constrained to auth.users.
alter table public.family_invitations
  add constraint family_invitation_inviter_auth_fkey foreign key (inviter_id) references auth.users(id) on delete set null,
  add constraint family_invitation_accepted_user_auth_fkey foreign key (accepted_user_id) references auth.users(id) on delete set null;

alter table public.match_decisions
  add constraint match_decision_owner_auth_fkey foreign key (owner_id) references auth.users(id) on delete cascade,
  add constraint match_decision_candidate_owner_auth_fkey foreign key (candidate_owner_id) references auth.users(id) on delete cascade;

alter table public.member_merge_audit
  add constraint member_merge_merged_by_auth_fkey foreign key (merged_by) references auth.users(id) on delete cascade;

alter table public.member_change_history
  add constraint member_history_changed_by_auth_fkey foreign key (changed_by) references auth.users(id) on delete set null;

alter table public.relationship_change_history
  add constraint relationship_history_changed_by_auth_fkey foreign key (changed_by) references auth.users(id) on delete set null;

alter table public.application_errors
  add constraint application_errors_user_auth_fkey foreign key (user_id) references auth.users(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Marriage / partnership end-year validation.
-- ---------------------------------------------------------------------------
alter table public.relationships drop constraint if exists relationships_end_year_check;
alter table public.relationships
  add constraint relationships_end_year_check
  check (end_year is null or (end_year between 1800 and 2100));

alter table public.relationships drop constraint if exists relationships_year_order_check;
alter table public.relationships
  add constraint relationships_year_order_check
  check (start_year is null or end_year is null or end_year >= start_year);

-- ---------------------------------------------------------------------------
-- Identity suggestions.
-- A living unclaimed record marked private remains completely undiscoverable.
-- Records at family/match_clues visibility can be suggested only when full name
-- plus another independent clue reaches a score of at least 75. Same name alone
-- scores 65 and is still insufficient.
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
set row_security = off
as $$
  with me as (
    select p.* from public.profiles p where p.id = auth.uid()
  ), scored as (
    select
      fm.id,
      'VNSH-' || upper(substr(replace(fm.person_identity_id::text, '-', ''), 1, 10)) as person_code,
      trim(concat_ws(' ', fm.first_name, fm.surname)) as display_name,
      (
        40 + 25
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
      fm.lived_in,
      fm.privacy_level
    from me
    join public.family_members fm
      on fm.owner_id <> auth.uid()
     and not fm.is_placeholder
     and fm.linked_user_id is null
     and coalesce(fm.created_by, fm.owner_id) <> auth.uid()
     and coalesce(fm.privacy_level, 'family') <> 'private'
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
  where match_score >= 75
  order by match_score desc, display_name
  limit 20;
$$;

grant execute on function public.find_identity_claim_candidates() to authenticated;

-- Owner-side matching remains opt-in for the account being suggested. Allow
-- either relatives or match_clues visibility, but require the same 75-point
-- minimum so surname/name alone never triggers an identity proposal.
create or replace function public.find_member_user_candidates(p_member_id uuid)
returns table(candidate_code uuid, display_name text, score integer, shared_details text[], birth_year integer, current_location text, birth_location text)
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  with member as (
    select fm.* from public.family_members fm
    where fm.id = p_member_id
      and fm.linked_user_id is null
      and not fm.is_placeholder
      and coalesce(fm.privacy_level, 'family') <> 'private'
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
     and p.living_person_privacy in ('relatives','match_clues')
     and private.norm_text(p.first_name)=private.norm_text(m.first_name)
     and (private.norm_text(p.surname)=private.norm_text(m.surname) or private.norm_text(p.surname)=private.norm_text(coalesce(m.maiden_name,'')))
    where not exists(select 1 from public.identity_claim_requests r where r.candidate_member_id=m.id and r.claimant_user_id=p.id)
      and not exists(select 1 from public.verified_identity_links v where v.candidate_member_id=m.id)
  )
  select discovery_code,display_name,least(match_score,100),clues,byear,current_location_text,birth_location_text
  from scored where match_score >= 75 order by match_score desc,display_name limit 10;
$$;

grant execute on function public.find_member_user_candidates(uuid) to authenticated;
