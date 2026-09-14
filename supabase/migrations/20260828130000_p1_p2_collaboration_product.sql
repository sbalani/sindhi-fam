-- Vansh P1/P2 collaboration, provenance, privacy, invitation-management and
-- concurrency foundations. Designed to be safe on top of the P0 schema.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Structured profile fields and living-person privacy.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists birth_location jsonb,
  add column if not exists current_location jsonb,
  add column if not exists living_person_privacy text not null default 'relatives';

do $$ begin
  alter table public.profiles add constraint profiles_living_person_privacy_check
    check (living_person_privacy in ('private','relatives','match_clues'));
exception when duplicate_object then null; end $$;

-- family_side remains temporarily for backward compatibility only. New clients
-- derive branch/side relative to the viewer from actual graph relationships.
alter table public.family_members
  add column if not exists death_date date,
  add column if not exists death_year integer,
  add column if not exists death_location jsonb,
  add column if not exists death_place text,
  add column if not exists birth_approximate boolean not null default false,
  add column if not exists death_approximate boolean not null default false,
  add column if not exists fact_confidence text not null default 'reported',
  add column if not exists provenance_note text,
  add column if not exists privacy_level text not null default 'family',
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists revision integer not null default 1;

do $$ begin
  alter table public.family_members add constraint family_member_fact_confidence_check
    check (fact_confidence in ('reported','probable','uncertain','documented','disputed'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.family_members add constraint family_member_privacy_level_check
    check (privacy_level in ('private','family','match_clues'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.family_members add constraint family_member_death_year_check
    check (death_year is null or (death_year >= 1800 and death_year <= extract(year from now())::int));
exception when duplicate_object then null; end $$;

alter table public.relationships
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists revision integer not null default 1,
  add column if not exists confidence text not null default 'reported',
  add column if not exists provenance_note text;

-- ---------------------------------------------------------------------------
-- Change history/audit. This is application-level history in addition to
-- Supabase platform backups.
-- ---------------------------------------------------------------------------
create table if not exists public.member_change_history (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null,
  changed_by uuid references auth.users(id) on delete set null,
  operation text not null check (operation in ('insert','update','delete')),
  before_data jsonb,
  after_data jsonb,
  revision integer,
  created_at timestamptz not null default now()
);
create index if not exists member_change_history_member_idx on public.member_change_history(member_id, created_at desc);

create table if not exists public.relationship_change_history (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null,
  changed_by uuid references auth.users(id) on delete set null,
  operation text not null check (operation in ('insert','update','delete')),
  before_data jsonb,
  after_data jsonb,
  revision integer,
  created_at timestamptz not null default now()
);

create table if not exists public.application_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  message text not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function private.audit_family_member_change()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  insert into public.member_change_history(member_id, changed_by, operation, before_data, after_data, revision)
  values (
    coalesce(new.id, old.id),
    auth.uid(),
    lower(tg_op),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end,
    coalesce(new.revision, old.revision)
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists family_member_change_audit on public.family_members;
create trigger family_member_change_audit
after insert or update or delete on public.family_members
for each row execute function private.audit_family_member_change();

create or replace function private.audit_relationship_change()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  insert into public.relationship_change_history(relationship_id, changed_by, operation, before_data, after_data, revision)
  values (
    coalesce(new.id, old.id), auth.uid(), lower(tg_op),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end,
    coalesce(new.revision, old.revision)
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists relationship_change_audit on public.relationships;
create trigger relationship_change_audit
after insert or update or delete on public.relationships
for each row execute function private.audit_relationship_change();

-- Revision stamps. The client supplies an expected revision through the RPC
-- below; the trigger advances the row revision atomically.
create or replace function private.bump_family_member_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new is distinct from old then
    new.revision := old.revision + 1;
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;
  return new;
end;
$$;

drop trigger if exists family_member_revision on public.family_members;
create trigger family_member_revision
before update on public.family_members
for each row execute function private.bump_family_member_revision();

create or replace function private.bump_relationship_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new is distinct from old then
    new.revision := old.revision + 1;
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;
  return new;
end;
$$;

drop trigger if exists relationship_revision on public.relationships;
create trigger relationship_revision
before update on public.relationships
for each row execute function private.bump_relationship_revision();

-- Optimistic concurrency update. Only whitelisted person fields can be changed.
create or replace function public.update_family_member_with_revision(
  p_member_id uuid,
  p_expected_revision integer,
  p_changes jsonb
)
returns public.family_members
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_current public.family_members%rowtype;
  v_result public.family_members%rowtype;
  v_allowed text[] := array[
    'first_name','surname','nickname','maiden_name','gender','birth_date','birth_year',
    'birth_location','birth_place','birth_approximate','lived_locations','lived_in',
    'death_date','death_year','death_location','death_place','death_approximate',
    'fact_confidence','provenance_note','privacy_level','is_placeholder','placeholder_label','filled_by'
  ];
  v_key text;
begin
  select * into v_current from public.family_members where id = p_member_id for update;
  if v_current.id is null then raise exception 'Family member not found.'; end if;
  if not public.can_manage_family_member(auth.uid(), p_member_id) then
    raise exception 'You do not have permission to edit this family member.';
  end if;
  if v_current.revision <> p_expected_revision then
    raise exception 'This record changed while you were editing it. Reload the latest version and review your changes.' using errcode = '40001';
  end if;
  for v_key in select jsonb_object_keys(coalesce(p_changes,'{}'::jsonb)) loop
    if not (v_key = any(v_allowed)) then raise exception 'Unsupported family-member field: %', v_key; end if;
  end loop;

  update public.family_members fm set
    first_name = coalesce(p_changes->>'first_name', fm.first_name),
    surname = coalesce(p_changes->>'surname', fm.surname),
    nickname = case when p_changes ? 'nickname' then nullif(p_changes->>'nickname','') else fm.nickname end,
    maiden_name = case when p_changes ? 'maiden_name' then nullif(p_changes->>'maiden_name','') else fm.maiden_name end,
    gender = coalesce(p_changes->>'gender', fm.gender),
    birth_date = case when p_changes ? 'birth_date' then nullif(p_changes->>'birth_date','')::date else fm.birth_date end,
    birth_year = case when p_changes ? 'birth_year' then nullif(p_changes->>'birth_year','')::int else fm.birth_year end,
    birth_location = case when p_changes ? 'birth_location' then p_changes->'birth_location' else fm.birth_location end,
    birth_place = case when p_changes ? 'birth_place' then nullif(p_changes->>'birth_place','') else fm.birth_place end,
    birth_approximate = case when p_changes ? 'birth_approximate' then (p_changes->>'birth_approximate')::boolean else fm.birth_approximate end,
    lived_locations = case when p_changes ? 'lived_locations' then coalesce(p_changes->'lived_locations','[]'::jsonb) else fm.lived_locations end,
    lived_in = case when p_changes ? 'lived_in' then nullif(p_changes->>'lived_in','') else fm.lived_in end,
    death_date = case when p_changes ? 'death_date' then nullif(p_changes->>'death_date','')::date else fm.death_date end,
    death_year = case when p_changes ? 'death_year' then nullif(p_changes->>'death_year','')::int else fm.death_year end,
    death_location = case when p_changes ? 'death_location' then p_changes->'death_location' else fm.death_location end,
    death_place = case when p_changes ? 'death_place' then nullif(p_changes->>'death_place','') else fm.death_place end,
    death_approximate = case when p_changes ? 'death_approximate' then (p_changes->>'death_approximate')::boolean else fm.death_approximate end,
    fact_confidence = coalesce(p_changes->>'fact_confidence', fm.fact_confidence),
    provenance_note = case when p_changes ? 'provenance_note' then nullif(p_changes->>'provenance_note','') else fm.provenance_note end,
    privacy_level = coalesce(p_changes->>'privacy_level', fm.privacy_level),
    is_placeholder = case when p_changes ? 'is_placeholder' then (p_changes->>'is_placeholder')::boolean else fm.is_placeholder end,
    placeholder_label = case when p_changes ? 'placeholder_label' then nullif(p_changes->>'placeholder_label','') else fm.placeholder_label end,
    filled_by = case when p_changes ? 'filled_by' then nullif(p_changes->>'filled_by','')::uuid else fm.filled_by end
  where fm.id = p_member_id
  returning * into v_result;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Invitation management and exact scope preview.
-- ---------------------------------------------------------------------------
create or replace function public.preview_family_invitation_people(p_person_id uuid, p_scope text)
returns table(member_id uuid, display_name text, relationship_hint text)
language sql
stable security definer
set search_path = ''
set row_security = off
as $$
  with recursive walk(id, depth, crossed_partner) as (
    select p_person_id, 0, false
    where public.can_access_family_member(auth.uid(), p_person_id)
    union
    select
      case when r.person_a_id = w.id then r.person_b_id else r.person_a_id end,
      w.depth + 1,
      w.crossed_partner or r.relationship_type in ('spouse','partner')
    from walk w
    join public.relationships r on r.person_a_id = w.id or r.person_b_id = w.id
    where w.depth < case when p_scope='connection' then 4 when p_scope='immediate' then 2 else 5 end
      and (
        p_scope='extended'
        or r.relationship_type not in ('spouse','partner')
        or w.depth=0
      )
  ), allowed as (
    select distinct id from walk
    where p_scope='extended' or not crossed_partner or id=p_person_id
  )
  select fm.id,
         trim(concat_ws(' ', fm.first_name, fm.surname)),
         case when fm.id=p_person_id then 'Invited person' else 'Shared family scope' end
  from allowed a
  join public.family_members fm on fm.id=a.id
  where public.can_access_family_member(auth.uid(), fm.id)
  order by case when fm.id=p_person_id then 0 else 1 end, fm.first_name, fm.surname;
$$;

create or replace function public.get_my_invitation_activity()
returns table(
  invitation_id uuid,
  direction text,
  person_id uuid,
  person_name text,
  email text,
  scope text,
  status text,
  created_at timestamptz,
  expires_at timestamptz,
  responded_at timestamptz
)
language sql
stable security definer
set search_path = ''
set row_security = off
as $$
  select fi.id,
         case when fi.inviter_id=auth.uid() then 'outgoing' else 'incoming' end,
         fi.person_id,
         trim(concat_ws(' ', fm.first_name, fm.surname)),
         case when fi.inviter_id=auth.uid() then fi.email else null end,
         fi.scope, case when fi.status='pending' and fi.expires_at<=now() then 'expired' else fi.status end, fi.created_at, fi.expires_at, fi.responded_at
  from public.family_invitations fi
  join public.family_members fm on fm.id=fi.person_id
  where fi.inviter_id=auth.uid()
     or (fi.accepted_user_id=auth.uid())
     or lower(fi.email)=lower(coalesce((select email from auth.users where id=auth.uid()),''))
  order by fi.created_at desc
  limit 100;
$$;

create or replace function public.revoke_family_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  update public.family_invitations
  set status='revoked', responded_at=now()
  where id=p_invitation_id and inviter_id=auth.uid() and status='pending';
  if not found then raise exception 'Pending invitation not found or not owned by you.'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Change history lookup and lightweight client-error logging.
-- ---------------------------------------------------------------------------
create or replace function public.get_member_change_history(p_member_id uuid)
returns table(id uuid, changed_by uuid, operation text, before_data jsonb, after_data jsonb, revision integer, created_at timestamptz)
language sql
stable security definer
set search_path = ''
set row_security = off
as $$
  select h.id,h.changed_by,h.operation,h.before_data,h.after_data,h.revision,h.created_at
  from public.member_change_history h
  where h.member_id=p_member_id and public.can_access_family_member(auth.uid(),p_member_id)
  order by h.created_at desc limit 50;
$$;

alter table public.member_change_history enable row level security;
alter table public.relationship_change_history enable row level security;
alter table public.application_errors enable row level security;

drop policy if exists "Read accessible member history" on public.member_change_history;
create policy "Read accessible member history" on public.member_change_history
for select to authenticated using (public.can_access_family_member(auth.uid(), member_id));

drop policy if exists "Read own relationship history" on public.relationship_change_history;
create policy "Read own relationship history" on public.relationship_change_history
for select to authenticated using (
  exists(select 1 from public.relationships r where r.id=relationship_id and public.can_access_family_member(auth.uid(),r.person_a_id))
);

drop policy if exists "Write own client errors" on public.application_errors;
create policy "Write own client errors" on public.application_errors
for insert to authenticated with check (user_id=auth.uid());

drop policy if exists "Read own client errors" on public.application_errors;
create policy "Read own client errors" on public.application_errors
for select to authenticated using (user_id=auth.uid());

-- Update profile trigger for structured signup metadata while preserving text
-- compatibility used by existing accounts.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_first_name text;
  v_surname text;
  v_display_name text;
  v_birth_date date;
  v_discovery boolean;
  v_birth_location jsonb;
  v_current_location jsonb;
begin
  v_first_name:=nullif(trim(coalesce(new.raw_user_meta_data->>'first_name','')),'');
  v_surname:=nullif(trim(coalesce(new.raw_user_meta_data->>'family_surname',new.raw_user_meta_data->>'surname','')),'');
  v_display_name:=coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),trim(concat_ws(' ',v_first_name,v_surname)),split_part(new.email,'@',1));
  begin v_birth_date:=nullif(new.raw_user_meta_data->>'birth_date','')::date; exception when others then v_birth_date:=null; end;
  v_discovery:=lower(coalesce(new.raw_user_meta_data->>'discovery_enabled','true')) in ('true','1','yes');
  begin v_birth_location:=(new.raw_user_meta_data->'birth_location_data')::jsonb; exception when others then v_birth_location:=null; end;
  begin v_current_location:=(new.raw_user_meta_data->'current_location_data')::jsonb; exception when others then v_current_location:=null; end;
  insert into public.profiles(id,display_name,first_name,surname,location,birth_date,birth_location_text,current_location_text,birth_location,current_location,discovery_enabled)
  values(
    new.id,v_display_name,v_first_name,v_surname,
    coalesce(v_current_location->>'display',nullif(new.raw_user_meta_data->>'location','')),
    v_birth_date,
    coalesce(v_birth_location->>'display',nullif(new.raw_user_meta_data->>'birth_location','')),
    coalesce(v_current_location->>'display',nullif(new.raw_user_meta_data->>'location','')),
    v_birth_location,v_current_location,v_discovery
  )
  on conflict(id) do update set
    display_name=excluded.display_name,first_name=excluded.first_name,surname=excluded.surname,
    location=excluded.location,birth_date=excluded.birth_date,birth_location_text=excluded.birth_location_text,
    current_location_text=excluded.current_location_text,birth_location=excluded.birth_location,current_location=excluded.current_location,
    discovery_enabled=excluded.discovery_enabled,updated_at=now();
  return new;
end;
$$;

-- Realtime: idempotently add key collaborative tables to the publication.
do $$ begin
  alter publication supabase_realtime add table public.family_members;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.relationships;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.identity_claim_requests;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.profile_change_requests;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.family_invitations;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.family_connection_requests;
exception when duplicate_object then null; end $$;

grant execute on function public.update_family_member_with_revision(uuid,integer,jsonb) to authenticated;
grant execute on function public.preview_family_invitation_people(uuid,text) to authenticated;
grant execute on function public.get_my_invitation_activity() to authenticated;
grant execute on function public.revoke_family_invitation(uuid) to authenticated;
grant execute on function public.get_member_change_history(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- P1 collaborative corrections for any shared record, not only claimed ones.
-- Claimed profiles are reviewed by the linked person. Shared unclaimed records
-- are reviewed by the original creator/graph owner. Direct RLS updates remain
-- blocked for people who are not the authorized editor.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists birth_surname text;

alter table public.profile_change_requests
  add column if not exists reviewer_user_id uuid references auth.users(id) on delete set null;

create index if not exists profile_change_reviewer_idx
  on public.profile_change_requests(reviewer_user_id, status, created_at desc);

create or replace function public.suggest_member_correction(p_member_id uuid, p_changes jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_id uuid;
  v_member public.family_members%rowtype;
  v_reviewer uuid;
  v_key text;
  v_allowed text[] := array[
    'first_name','surname','nickname','maiden_name','gender','birth_year','birth_date',
    'birth_approximate','birth_location','birth_place','lived_locations','lived_in',
    'death_date','death_year','death_approximate','death_location','death_place',
    'fact_confidence','provenance_note','privacy_level'
  ];
begin
  select * into v_member
  from public.family_members fm
  where fm.id=p_member_id and public.can_access_family_member(auth.uid(),fm.id);
  if v_member.id is null then raise exception 'Family member not found or not shared with you.'; end if;
  if public.can_manage_family_member(auth.uid(),p_member_id) then
    raise exception 'You can edit this record directly; a correction request is not required.';
  end if;
  if p_changes is null or p_changes='{}'::jsonb then raise exception 'No correction was supplied.'; end if;
  for v_key in select jsonb_object_keys(p_changes) loop
    if not (v_key = any(v_allowed)) then
      raise exception 'The correction contains an unsupported profile field: %', v_key;
    end if;
  end loop;
  v_reviewer := coalesce(v_member.linked_user_id, v_member.created_by, v_member.owner_id);
  if v_reviewer is null or v_reviewer=auth.uid() then
    raise exception 'No separate reviewer is available for this shared record.';
  end if;
  insert into public.profile_change_requests(member_id,proposer_user_id,reviewer_user_id,proposed_changes)
  values(p_member_id,auth.uid(),v_reviewer,p_changes)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.respond_profile_correction(p_request_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_change public.profile_change_requests%rowtype;
  v_member public.family_members%rowtype;
  v_expected_reviewer uuid;
begin
  select * into v_change
  from public.profile_change_requests c
  where c.id=p_request_id and c.status='pending'
  for update;
  if v_change.id is null then raise exception 'Correction request not found or already resolved.'; end if;

  select * into v_member from public.family_members where id=v_change.member_id for update;
  if v_member.id is null then raise exception 'The family record no longer exists.'; end if;
  v_expected_reviewer := coalesce(v_change.reviewer_user_id, v_member.linked_user_id, v_member.created_by, v_member.owner_id);
  if v_expected_reviewer is distinct from auth.uid() then
    raise exception 'Only the profile owner or designated record reviewer can resolve this correction.';
  end if;

  if p_accept then
    perform set_config('vansh.system_write','on',true);
    update public.family_members fm set
      first_name = case when v_change.proposed_changes ? 'first_name' then nullif(trim(v_change.proposed_changes->>'first_name'),'') else fm.first_name end,
      surname = case when v_change.proposed_changes ? 'surname' then nullif(trim(v_change.proposed_changes->>'surname'),'') else fm.surname end,
      nickname = case when v_change.proposed_changes ? 'nickname' then nullif(v_change.proposed_changes->>'nickname','') else fm.nickname end,
      maiden_name = case when v_change.proposed_changes ? 'maiden_name' then nullif(v_change.proposed_changes->>'maiden_name','') else fm.maiden_name end,
      gender = case when v_change.proposed_changes ? 'gender' then v_change.proposed_changes->>'gender' else fm.gender end,
      birth_year = case when v_change.proposed_changes ? 'birth_year' then nullif(v_change.proposed_changes->>'birth_year','')::int else fm.birth_year end,
      birth_date = case when v_change.proposed_changes ? 'birth_date' then nullif(v_change.proposed_changes->>'birth_date','')::date else fm.birth_date end,
      birth_approximate = case when v_change.proposed_changes ? 'birth_approximate' then (v_change.proposed_changes->>'birth_approximate')::boolean else fm.birth_approximate end,
      birth_location = case when v_change.proposed_changes ? 'birth_location' then v_change.proposed_changes->'birth_location' else fm.birth_location end,
      birth_place = case when v_change.proposed_changes ? 'birth_place' then nullif(v_change.proposed_changes->>'birth_place','') else fm.birth_place end,
      lived_locations = case when v_change.proposed_changes ? 'lived_locations' then coalesce(v_change.proposed_changes->'lived_locations','[]'::jsonb) else fm.lived_locations end,
      lived_in = case when v_change.proposed_changes ? 'lived_in' then nullif(v_change.proposed_changes->>'lived_in','') else fm.lived_in end,
      death_date = case when v_change.proposed_changes ? 'death_date' then nullif(v_change.proposed_changes->>'death_date','')::date else fm.death_date end,
      death_year = case when v_change.proposed_changes ? 'death_year' then nullif(v_change.proposed_changes->>'death_year','')::int else fm.death_year end,
      death_approximate = case when v_change.proposed_changes ? 'death_approximate' then (v_change.proposed_changes->>'death_approximate')::boolean else fm.death_approximate end,
      death_location = case when v_change.proposed_changes ? 'death_location' then v_change.proposed_changes->'death_location' else fm.death_location end,
      death_place = case when v_change.proposed_changes ? 'death_place' then nullif(v_change.proposed_changes->>'death_place','') else fm.death_place end,
      fact_confidence = case when v_change.proposed_changes ? 'fact_confidence' then v_change.proposed_changes->>'fact_confidence' else fm.fact_confidence end,
      provenance_note = case when v_change.proposed_changes ? 'provenance_note' then nullif(v_change.proposed_changes->>'provenance_note','') else fm.provenance_note end,
      privacy_level = case when v_change.proposed_changes ? 'privacy_level' then v_change.proposed_changes->>'privacy_level' else fm.privacy_level end
    where fm.id=v_change.member_id;
  end if;

  update public.profile_change_requests
  set status=case when p_accept then 'accepted' else 'rejected' end,
      resolved_at=now(), reviewer_user_id=v_expected_reviewer
  where id=v_change.id;
end;
$$;

-- Replace the inbox so correction requests can target either a claimed-profile
-- owner or the designated reviewer of a shared unclaimed record.
create or replace function public.get_verification_inbox()
returns table(kind text,request_id uuid,direction text,status text,counterpart_name text,subject_name text,score integer,shared_details text[],created_at timestamptz)
language sql
stable
security definer
set search_path=''
set row_security=off
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
      case when coalesce(c.reviewer_user_id,fm.linked_user_id,fm.created_by,fm.owner_id)=auth.uid() then 'incoming' else 'outgoing' end::text,
      c.status,
      case when coalesce(c.reviewer_user_id,fm.linked_user_id,fm.created_by,fm.owner_id)=auth.uid()
        then coalesce(pp.display_name,'A relative') else coalesce(rp.display_name,'Record reviewer') end::text,
      trim(concat_ws(' ',fm.first_name,fm.surname))::text,
      null::int,
      array['Suggested profile correction']::text[] || coalesce(
        (select array_agg(replace(e.key, '_', ' ') || ': ' || left(e.value::text, 120)) from jsonb_each(c.proposed_changes) e),
        '{}'::text[]
      ),
      c.created_at
    from public.profile_change_requests c
    join public.family_members fm on fm.id=c.member_id
    left join public.profiles pp on pp.id=c.proposer_user_id
    left join public.profiles rp on rp.id=coalesce(c.reviewer_user_id,fm.linked_user_id,fm.created_by,fm.owner_id)
    where c.proposer_user_id=auth.uid()
       or coalesce(c.reviewer_user_id,fm.linked_user_id,fm.created_by,fm.owner_id)=auth.uid()

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
      and fi.status in ('pending','accepted','rejected','expired','revoked')
  ) as inbox(kind, request_id, direction, status, counterpart_name, subject_name, score, shared_details, created_at)
  order by case when inbox.status='pending' and inbox.direction='incoming' then 0 when inbox.status='pending' then 1 else 2 end, inbox.created_at desc
  limit 100;
$$;

-- Keep profile updates and sign-up metadata aligned, including birth surname.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_first_name text;
  v_surname text;
  v_birth_surname text;
  v_display_name text;
  v_birth_date date;
  v_discovery boolean;
  v_birth_location jsonb;
  v_current_location jsonb;
begin
  v_first_name:=nullif(trim(coalesce(new.raw_user_meta_data->>'first_name','')),'');
  v_surname:=nullif(trim(coalesce(new.raw_user_meta_data->>'family_surname',new.raw_user_meta_data->>'surname','')),'');
  v_birth_surname:=nullif(trim(coalesce(new.raw_user_meta_data->>'birth_surname','')),'');
  v_display_name:=coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),trim(concat_ws(' ',v_first_name,v_surname)),split_part(new.email,'@',1));
  begin v_birth_date:=nullif(new.raw_user_meta_data->>'birth_date','')::date; exception when others then v_birth_date:=null; end;
  v_discovery:=lower(coalesce(new.raw_user_meta_data->>'discovery_enabled','true')) in ('true','1','yes');
  begin v_birth_location:=(new.raw_user_meta_data->'birth_location_data')::jsonb; exception when others then v_birth_location:=null; end;
  begin v_current_location:=(new.raw_user_meta_data->'current_location_data')::jsonb; exception when others then v_current_location:=null; end;
  insert into public.profiles(id,display_name,first_name,surname,birth_surname,location,birth_date,birth_location_text,current_location_text,birth_location,current_location,discovery_enabled)
  values(new.id,v_display_name,v_first_name,v_surname,v_birth_surname,
    coalesce(v_current_location->>'display',nullif(new.raw_user_meta_data->>'location','')),
    v_birth_date,coalesce(v_birth_location->>'display',nullif(new.raw_user_meta_data->>'birth_location','')),
    coalesce(v_current_location->>'display',nullif(new.raw_user_meta_data->>'location','')),
    v_birth_location,v_current_location,v_discovery)
  on conflict(id) do update set
    display_name=excluded.display_name,first_name=excluded.first_name,surname=excluded.surname,birth_surname=excluded.birth_surname,
    location=excluded.location,birth_date=excluded.birth_date,birth_location_text=excluded.birth_location_text,
    current_location_text=excluded.current_location_text,birth_location=excluded.birth_location,current_location=excluded.current_location,
    discovery_enabled=excluded.discovery_enabled,updated_at=now();
  return new;
end;
$$;

-- New relationship writes reject accidental duplicates while preserving
-- multiple partners, multiple parents, relationship variants and graph loops.
create or replace function private.prevent_duplicate_relationship()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if exists (
    select 1 from public.relationships r
    where r.id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000'::uuid)
      and r.owner_id=new.owner_id
      and r.relationship_type=new.relationship_type
      and coalesce(r.relationship_variant,'unspecified')=coalesce(new.relationship_variant,'unspecified')
      and (
        (r.person_a_id=new.person_a_id and r.person_b_id=new.person_b_id)
        or (new.relationship_type in ('sibling','spouse','partner') and r.person_a_id=new.person_b_id and r.person_b_id=new.person_a_id)
      )
  ) then
    raise exception 'That relationship is already recorded.' using errcode='23505';
  end if;
  return new;
end;
$$;

drop trigger if exists relationships_prevent_duplicate on public.relationships;
create trigger relationships_prevent_duplicate
before insert or update of person_a_id,person_b_id,relationship_type,relationship_variant on public.relationships
for each row execute function private.prevent_duplicate_relationship();

-- Replace the time-dependent death-year check with a deterministic range;
-- application validation additionally limits years to the current year.
do $$ begin
  alter table public.family_members drop constraint if exists family_member_death_year_check;
  alter table public.family_members add constraint family_member_death_year_check
    check (death_year is null or (death_year >= 1800 and death_year <= 2200));
end $$;

grant execute on function public.suggest_member_correction(uuid,jsonb) to authenticated;
grant execute on function public.respond_profile_correction(uuid,boolean) to authenticated;
grant execute on function public.get_verification_inbox() to authenticated;


-- Living-person matching privacy: cross-graph candidate functions only expose
-- records explicitly marked for match clues, while deceased records may be
-- matched under the family-history policy. Same-surname alone remains below
-- the eligibility threshold.
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
     and (fm.death_date is not null or fm.death_year is not null or (fm.privacy_level='match_clues' and fm.birth_year is not null and fm.birth_year <= extract(year from current_date)::int - 18))
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
      and (fm.death_date is not null or fm.death_year is not null or (fm.privacy_level='match_clues' and fm.birth_year is not null and fm.birth_year <= extract(year from current_date)::int - 18))
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
     and p.living_person_privacy='match_clues' and p.birth_date is not null and p.birth_date <= (current_date - interval '18 years')::date
     and private.norm_text(p.first_name)=private.norm_text(m.first_name)
     and (private.norm_text(p.surname)=private.norm_text(m.surname) or private.norm_text(p.surname)=private.norm_text(coalesce(m.maiden_name,'')))
    where not exists(select 1 from public.identity_claim_requests r where r.candidate_member_id=m.id and r.claimant_user_id=p.id)
      and not exists(select 1 from public.verified_identity_links v where v.candidate_member_id=m.id)
  )
  select discovery_code,display_name,least(match_score,100),clues,byear,current_location_text,birth_location_text
  from scored where match_score >= 80 order by match_score desc,display_name limit 10;
$$;

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
     and (other.death_date is not null or other.death_year is not null or (other.privacy_level='match_clues' and other.birth_year is not null and other.birth_year <= extract(year from current_date)::int - 18))
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

grant execute on function public.find_identity_claim_candidates() to authenticated;
grant execute on function public.find_member_user_candidates(uuid) to authenticated;
grant execute on function public.find_family_matches() to authenticated;

-- Final invitation preview mirrors the existing invitation-access trigger
-- exactly: connection = invited record only, immediate = one graph hop,
-- extended = two graph hops. This ensures the preview cannot understate access.
create or replace function public.preview_family_invitation_people(p_person_id uuid, p_scope text)
returns table(member_id uuid, display_name text, relationship_hint text)
language sql
stable security definer
set search_path = ''
set row_security = off
as $$
  with recursive walk(id, depth) as (
    select p_person_id, 0
    where p_scope in ('connection','immediate','extended')
      and public.can_access_family_member(auth.uid(), p_person_id)
    union
    select case when r.person_a_id=w.id then r.person_b_id else r.person_a_id end,
           w.depth + 1
    from walk w
    join public.relationships r on r.person_a_id=w.id or r.person_b_id=w.id
    where w.depth < case p_scope when 'connection' then 0 when 'immediate' then 1 else 2 end
  )
  select fm.id,
         trim(concat_ws(' ',fm.first_name,fm.surname)),
         case when fm.id=p_person_id then 'Invited person'
              when min(w.depth)=1 then 'Directly connected family'
              else 'Extended connected family' end
  from walk w
  join public.family_members fm on fm.id=w.id
  where public.can_access_family_member(auth.uid(),fm.id)
  group by fm.id,fm.first_name,fm.surname
  order by min(w.depth),fm.first_name,fm.surname;
$$;

grant execute on function public.preview_family_invitation_people(uuid,text) to authenticated;

alter table public.family_invitations
  add column if not exists last_sent_at timestamptz not null default now(),
  add column if not exists send_count integer not null default 1;

do $$ begin
  alter table public.family_invitations add constraint family_invitation_send_count_check
    check (send_count between 1 and 10);
exception when duplicate_object then null; end $$;
