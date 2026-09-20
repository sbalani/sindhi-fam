-- Reconcile the family-editing foundation with the launch schema. The earlier
-- migrations are immutable because they have already run in development.

create schema if not exists private;

-- Partnership state is canonical in relationship_status. Qualifiers describe
-- kinship only: parent kind or half-sibling.
update public.relationships
set relationship_status = relationship_variant,
    relationship_variant = null
where relationship_type in ('spouse', 'partner')
  and relationship_variant in ('current', 'former', 'unspecified');

alter table public.relationships
  drop constraint if exists relationships_relationship_variant_check,
  drop constraint if exists relationships_relationship_status_check;

alter table public.relationships
  add constraint relationships_relationship_variant_check check (
    relationship_variant is null
    or (relationship_type = 'sibling' and relationship_variant = 'half')
    or (
      relationship_type = 'parent'
      and relationship_variant in ('biological', 'adoptive', 'step', 'guardian')
    )
  ),
  add constraint relationships_relationship_status_check check (
    relationship_status in ('current', 'former', 'unspecified')
    and (relationship_type in ('spouse', 'partner') or relationship_status = 'unspecified')
    and not (relationship_status = 'current' and end_year is not null)
  );

-- Main's change-history tables and revision triggers are canonical. Preserve
-- foundation history tables as sealed legacy data, but stop writing twice.
drop trigger if exists bump_family_member_revision on public.family_members;
drop trigger if exists record_family_member_revision on public.family_members;
drop trigger if exists withdraw_member_corrections on public.family_members;
drop trigger if exists b_bump_relationship_revision on public.relationships;
drop trigger if exists record_relationship_revision on public.relationships;
drop trigger if exists relationships_prevent_duplicate on public.relationships;

drop trigger if exists family_member_revision on public.family_members;
create trigger family_member_revision
before update on public.family_members
for each row execute function private.bump_family_member_revision();

drop trigger if exists relationship_revision on public.relationships;
create trigger relationship_revision
before update on public.relationships
for each row execute function private.bump_relationship_revision();

drop trigger if exists family_member_change_audit on public.family_members;
create trigger family_member_change_audit
after insert or update or delete on public.family_members
for each row execute function private.audit_family_member_change();

drop trigger if exists relationship_change_audit on public.relationships;
create trigger relationship_change_audit
after insert or update or delete on public.relationships
for each row execute function private.audit_relationship_change();

comment on table public.member_revision_history is
  'Legacy immutable history written by the 20260919 foundation; member_change_history is canonical.';
comment on table public.relationship_revision_history is
  'Legacy immutable history written by the 20260919 foundation; relationship_change_history is canonical.';

create or replace function private.can_manage_member(
  p_user_id uuid,
  p_member public.family_members
)
returns boolean
language sql
stable security definer
set search_path = ''
set row_security = off
as $$
  select p_user_id is not null and (
    (p_member.linked_user_id is not null and p_member.linked_user_id = p_user_id)
    or (
      p_member.linked_user_id is null
      and p_user_id in (p_member.owner_id, p_member.created_by, p_member.filled_by)
    )
  );
$$;

create or replace function private.can_view_member(
  p_user_id uuid,
  p_member public.family_members
)
returns boolean
language sql
stable security definer
set search_path = ''
set row_security = off
as $$
  select p_user_id is not null and public.can_access_family_member(p_user_id, p_member.id);
$$;

create or replace function private.guard_family_member_write()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user uuid := auth.uid();
  v_system boolean := coalesce(current_setting('vansh.system_write', true), '') = 'on';
  v_identity_changed boolean;
begin
  if tg_op = 'INSERT' then
    if not v_system then
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
    elsif new.person_identity_id is null then
      new.person_identity_id := gen_random_uuid();
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
  if not v_system and (
    new.linked_user_id is distinct from old.linked_user_id
    or new.person_identity_id is distinct from old.person_identity_id
  ) then
    raise exception 'Identity linkage can only be changed through the Vansh verification workflow.';
  end if;

  v_identity_changed :=
    new.first_name is distinct from old.first_name
    or new.surname is distinct from old.surname
    or new.nickname is distinct from old.nickname
    or new.maiden_name is distinct from old.maiden_name
    or new.alternate_names is distinct from old.alternate_names
    or new.gender is distinct from old.gender
    or new.birth_year is distinct from old.birth_year
    or new.birth_date is distinct from old.birth_date
    or new.birth_approximate is distinct from old.birth_approximate
    or new.birth_location is distinct from old.birth_location
    or new.birth_place is distinct from old.birth_place
    or new.lived_locations is distinct from old.lived_locations
    or new.lived_in is distinct from old.lived_in
    or new.death_year is distinct from old.death_year
    or new.death_date is distinct from old.death_date
    or new.death_approximate is distinct from old.death_approximate
    or new.death_location is distinct from old.death_location
    or new.death_place is distinct from old.death_place
    or new.fact_confidence is distinct from old.fact_confidence
    or new.provenance_note is distinct from old.provenance_note
    or new.privacy_level is distinct from old.privacy_level;

  if not v_system and old.linked_user_id is not null
    and old.linked_user_id <> v_user and v_identity_changed then
    raise exception 'This profile has been claimed. Suggest a correction instead of editing identity details directly.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.sync_claimed_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare v_changed boolean;
begin
  if tg_op <> 'UPDATE' or pg_trigger_depth() > 1 then return new; end if;
  if new.linked_user_id is null or new.linked_user_id <> auth.uid() then return new; end if;
  v_changed :=
    new.first_name is distinct from old.first_name
    or new.surname is distinct from old.surname
    or new.nickname is distinct from old.nickname
    or new.maiden_name is distinct from old.maiden_name
    or new.alternate_names is distinct from old.alternate_names
    or new.gender is distinct from old.gender
    or new.birth_year is distinct from old.birth_year
    or new.birth_date is distinct from old.birth_date
    or new.birth_approximate is distinct from old.birth_approximate
    or new.birth_location is distinct from old.birth_location
    or new.birth_place is distinct from old.birth_place
    or new.lived_locations is distinct from old.lived_locations
    or new.lived_in is distinct from old.lived_in
    or new.death_year is distinct from old.death_year
    or new.death_date is distinct from old.death_date
    or new.death_approximate is distinct from old.death_approximate
    or new.death_location is distinct from old.death_location
    or new.death_place is distinct from old.death_place
    or new.fact_confidence is distinct from old.fact_confidence
    or new.provenance_note is distinct from old.provenance_note
    or new.privacy_level is distinct from old.privacy_level;
  if not v_changed or new.person_identity_id is null then return new; end if;

  perform set_config('vansh.system_write', 'on', true);
  update public.family_members fm set
    first_name = new.first_name,
    surname = new.surname,
    nickname = new.nickname,
    maiden_name = new.maiden_name,
    alternate_names = new.alternate_names,
    gender = new.gender,
    birth_year = new.birth_year,
    birth_date = new.birth_date,
    birth_approximate = new.birth_approximate,
    birth_location = new.birth_location,
    birth_place = new.birth_place,
    lived_locations = new.lived_locations,
    lived_in = new.lived_in,
    death_year = new.death_year,
    death_date = new.death_date,
    death_approximate = new.death_approximate,
    death_location = new.death_location,
    death_place = new.death_place,
    fact_confidence = new.fact_confidence,
    provenance_note = new.provenance_note,
    privacy_level = new.privacy_level
  where fm.person_identity_id = new.person_identity_id and fm.id <> new.id;
  return new;
end;
$$;

drop trigger if exists family_members_guard_write on public.family_members;
create trigger family_members_guard_write
before insert or update on public.family_members
for each row execute function private.guard_family_member_write();

drop trigger if exists family_members_sync_claimed_identity on public.family_members;
create trigger family_members_sync_claimed_identity
after update on public.family_members
for each row execute function private.sync_claimed_identity();

create or replace function private.prepare_relationship_write()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_swap uuid;
begin
  if tg_op = 'DELETE' then return old; end if;
  if new.person_a_id = new.person_b_id then
    raise exception 'A relationship cannot connect a person to themselves.' using errcode = '22023';
  end if;
  if new.relationship_type in ('spouse', 'partner', 'sibling') and new.person_a_id > new.person_b_id then
    v_swap := new.person_a_id;
    new.person_a_id := new.person_b_id;
    new.person_b_id := v_swap;
  end if;
  if (select count(*) from public.family_members m
      where m.owner_id = new.owner_id and m.id in (new.person_a_id, new.person_b_id)) <> 2 then
    raise exception 'Relationship endpoints must exist in the same family graph.' using errcode = '22023';
  end if;
  if new.relationship_type in ('spouse', 'partner') then
    new.relationship_variant := null;
  else
    new.relationship_status := 'unspecified';
    new.start_year := null;
    new.end_year := null;
  end if;
  if exists (
    select 1 from public.relationships r
    where r.owner_id = new.owner_id and r.id is distinct from new.id
      and (
        (new.relationship_type = 'parent' and r.relationship_type = 'parent'
          and r.person_a_id = new.person_a_id and r.person_b_id = new.person_b_id)
        or (new.relationship_type in ('spouse', 'partner') and r.relationship_type in ('spouse', 'partner')
          and least(r.person_a_id,r.person_b_id)=least(new.person_a_id,new.person_b_id)
          and greatest(r.person_a_id,r.person_b_id)=greatest(new.person_a_id,new.person_b_id))
        or (new.relationship_type = 'sibling' and r.relationship_type = 'sibling'
          and least(r.person_a_id,r.person_b_id)=least(new.person_a_id,new.person_b_id)
          and greatest(r.person_a_id,r.person_b_id)=greatest(new.person_a_id,new.person_b_id))
      )
  ) then
    raise exception 'That direct relationship is already recorded.' using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists a_prepare_relationship_write on public.relationships;
create trigger a_prepare_relationship_write
before insert or update on public.relationships
for each row execute function private.prepare_relationship_write();

create or replace function private.managed_connection_snapshot(
  p_member_id uuid,
  p_owner_id uuid
)
returns jsonb
language sql
stable security definer
set search_path = ''
set row_security = off
as $$
  select jsonb_build_object(
    'parents', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'person_id',r.person_a_id,'variant',coalesce(r.relationship_variant,'unspecified'),
      'confidence',r.confidence,'provenance_note',r.provenance_note
    )) order by r.person_a_id,r.id) from public.relationships r
      where r.owner_id=p_owner_id and r.relationship_type='parent' and r.person_b_id=p_member_id),'[]'::jsonb),
    'partners', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'person_id',case when r.person_a_id=p_member_id then r.person_b_id else r.person_a_id end,
      'type',r.relationship_type,'start_year',r.start_year,'end_year',r.end_year,
      'status',r.relationship_status,'confidence',r.confidence,'provenance_note',r.provenance_note
    )) order by r.person_a_id,r.person_b_id,r.id) from public.relationships r
      where r.owner_id=p_owner_id and r.relationship_type in ('spouse','partner')
        and p_member_id in (r.person_a_id,r.person_b_id)),'[]'::jsonb),
    'siblings', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'person_id',case when r.person_a_id=p_member_id then r.person_b_id else r.person_a_id end,
      'variant',coalesce(r.relationship_variant,'reported'),
      'confidence',r.confidence,'provenance_note',r.provenance_note
    )) order by r.person_a_id,r.person_b_id,r.id) from public.relationships r
      where r.owner_id=p_owner_id and r.relationship_type='sibling'
        and p_member_id in (r.person_a_id,r.person_b_id)),'[]'::jsonb)
  );
$$;

create or replace function public.get_managed_relationship_snapshots(p_member_ids uuid[])
returns table(member_id uuid, connections jsonb, content_hash text)
language sql
stable security definer
set search_path = ''
set row_security = off
as $$
  select m.id,s.connections,md5(s.connections::text)
  from unnest(p_member_ids) requested(id)
  join public.family_members m on m.id=requested.id
  cross join lateral (select private.managed_connection_snapshot(m.id,m.owner_id) connections) s
  where private.can_view_member(auth.uid(),m);
$$;

-- One correction table powers the launch inbox and graph proposals.
alter table public.profile_change_requests
  add column if not exists expected_revision bigint,
  add column if not exists expected_relationship_hash text,
  add column if not exists base_snapshot jsonb,
  add column if not exists proposed_connections jsonb,
  add column if not exists reason text;

drop policy if exists "Read own profile corrections" on public.profile_change_requests;
create policy "Read own profile corrections"
on public.profile_change_requests
for select to authenticated
using (
  proposer_user_id = (select auth.uid())
  or reviewer_user_id = (select auth.uid())
  or public.can_manage_family_member((select auth.uid()), member_id)
);

-- Carry any requests made in the short-lived foundation inbox into the launch
-- inbox without deleting their source records.
insert into public.profile_change_requests(
  id,member_id,proposer_user_id,reviewer_user_id,proposed_changes,status,
  created_at,resolved_at,expected_revision,expected_relationship_hash,
  base_snapshot,proposed_connections,reason
)
select c.id,c.member_id,c.proposer_id,
  coalesce(c.reviewer_id,m.linked_user_id,m.created_by),c.details,
  case c.status when 'withdrawn' then 'rejected' else c.status end,
  c.created_at,c.reviewed_at,c.expected_revision,c.expected_relationship_hash,
  jsonb_build_object('details',c.base_details,'connections',c.base_connections),
  c.connections,c.reason
from public.family_correction_requests c
join public.family_members m on m.id=c.member_id
where not exists(select 1 from public.profile_change_requests p where p.id=c.id);

create or replace function private.member_edit_details(p_member public.family_members)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object(
    'first_name',p_member.first_name,'surname',p_member.surname,'nickname',p_member.nickname,
    'maiden_name',p_member.maiden_name,'alternate_names',p_member.alternate_names,'gender',p_member.gender,
    'birth_date',p_member.birth_date,'birth_year',p_member.birth_year,'birth_approximate',p_member.birth_approximate,
    'birth_location',p_member.birth_location,'birth_place',p_member.birth_place,
    'lived_locations',p_member.lived_locations,'lived_in',p_member.lived_in,
    'death_date',p_member.death_date,'death_year',p_member.death_year,'death_approximate',p_member.death_approximate,
    'death_location',p_member.death_location,'death_place',p_member.death_place,
    'fact_confidence',p_member.fact_confidence,'provenance_note',p_member.provenance_note,
    'privacy_level',p_member.privacy_level,'family_side',p_member.family_side
  );
$$;

create or replace function private.apply_family_member_edit(
  p_user_id uuid,
  p_member_id uuid,
  p_expected_revision bigint,
  p_expected_relationship_hash text,
  p_details jsonb,
  p_connections jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_member public.family_members;
  v_owner uuid;
  v_hash text;
  v_item jsonb;
  v_person uuid;
  v_variant text;
  v_type text;
  v_status text;
  v_start integer;
  v_end integer;
begin
  select * into v_member from public.family_members where id=p_member_id;
  if not found then raise exception 'Family member not found.' using errcode='P0002'; end if;
  v_owner := v_member.owner_id;
  perform private.lock_family_graph(v_owner);
  select * into v_member from public.family_members where id=p_member_id and owner_id=v_owner for update;
  if not found or not private.can_manage_member(p_user_id,v_member) then
    raise exception 'You are not authorized to edit this family member.' using errcode='42501';
  end if;
  if v_member.revision <> p_expected_revision then
    raise exception 'This family member changed since you opened it. Refresh and try again.' using errcode='40001';
  end if;
  v_hash := md5(private.managed_connection_snapshot(p_member_id,v_owner)::text);
  if p_expected_relationship_hash is null or v_hash is distinct from p_expected_relationship_hash then
    raise exception 'This family member''s connections changed since you opened them. Refresh and try again.' using errcode='40001';
  end if;
  if jsonb_typeof(p_details) <> 'object' or jsonb_typeof(p_connections) <> 'object' then
    raise exception 'Details and connections must be objects.' using errcode='22023';
  end if;
  if nullif(btrim(p_details->>'first_name'),'') is null or nullif(btrim(p_details->>'surname'),'') is null then
    raise exception 'First name and surname are required.' using errcode='22023';
  end if;
  if p_details ?| array['id','owner_id','created_by','linked_user_id','is_self','revision','person_identity_id'] then
    raise exception 'Protected member fields cannot be edited.' using errcode='22023';
  end if;
  if jsonb_typeof(coalesce(p_connections->'parents','[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_connections->'partners','[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_connections->'siblings','[]'::jsonb)) <> 'array' then
    raise exception 'Connection sets must be arrays.' using errcode='22023';
  end if;

  create temporary table edit_connections(
    category text, person_id uuid, relationship_type text, variant text,
    start_year integer, end_year integer, relationship_status text,
    confidence text, provenance_note text
  ) on commit drop;

  for v_item in select value from jsonb_array_elements(coalesce(p_connections->'parents','[]'::jsonb)) loop
    if (v_item ? 'confidence' and v_item->>'confidence' not in ('reported','probable','uncertain','documented','disputed'))
      or char_length(v_item->>'provenance_note') > 1000 then
      raise exception 'Invalid relationship confidence or provenance.' using errcode='22023';
    end if;
    if v_item ? 'placeholder' then
      insert into public.family_members(owner_id,created_by,first_name,surname,gender,is_placeholder,placeholder_label,family_side)
      values(v_owner,p_user_id,'Unknown',v_member.surname,coalesce(v_item#>>'{placeholder,gender}','unspecified'),true,
        coalesce(nullif(btrim(v_item#>>'{placeholder,label}'),''),'Unknown parent of '||v_member.first_name),v_member.family_side)
      returning id into v_person;
    else v_person := (v_item->>'person_id')::uuid; end if;
    v_variant := coalesce(v_item->>'variant','unspecified');
    if v_variant not in ('unspecified','biological','adoptive','step','guardian') then
      raise exception 'Invalid parent variant.' using errcode='22023';
    end if;
    insert into edit_connections values('parent',v_person,'parent',nullif(v_variant,'unspecified'),null,null,'unspecified',
      nullif(v_item->>'confidence',''),nullif(btrim(v_item->>'provenance_note'),''));
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_connections->'partners','[]'::jsonb)) loop
    if (v_item ? 'confidence' and v_item->>'confidence' not in ('reported','probable','uncertain','documented','disputed'))
      or char_length(v_item->>'provenance_note') > 1000 then
      raise exception 'Invalid relationship confidence or provenance.' using errcode='22023';
    end if;
    if v_item ? 'placeholder' then
      insert into public.family_members(owner_id,created_by,first_name,surname,gender,is_placeholder,placeholder_label,family_side)
      values(v_owner,p_user_id,'Unknown',v_member.surname,coalesce(v_item#>>'{placeholder,gender}','unspecified'),true,
        coalesce(nullif(btrim(v_item#>>'{placeholder,label}'),''),'Unknown partner of '||v_member.first_name),v_member.family_side)
      returning id into v_person;
    else v_person := (v_item->>'person_id')::uuid; end if;
    v_type := v_item->>'type'; v_status := coalesce(v_item->>'status','unspecified');
    v_start := nullif(v_item->>'start_year','')::integer; v_end := nullif(v_item->>'end_year','')::integer;
    if v_type not in ('spouse','partner') or v_status not in ('current','former','unspecified')
      or (v_status='current' and v_end is not null) or (v_start is not null and v_start not between 1800 and 2100)
      or (v_end is not null and v_end not between 1800 and 2100) or (v_start is not null and v_end is not null and v_start>v_end) then
      raise exception 'Invalid partnership details.' using errcode='22023';
    end if;
    insert into edit_connections values('partner',v_person,v_type,null,v_start,v_end,v_status,
      nullif(v_item->>'confidence',''),nullif(btrim(v_item->>'provenance_note'),''));
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_connections->'siblings','[]'::jsonb)) loop
    if (v_item ? 'confidence' and v_item->>'confidence' not in ('reported','probable','uncertain','documented','disputed'))
      or char_length(v_item->>'provenance_note') > 1000 then
      raise exception 'Invalid relationship confidence or provenance.' using errcode='22023';
    end if;
    v_person := (v_item->>'person_id')::uuid; v_variant := coalesce(v_item->>'variant','reported');
    if v_variant not in ('reported','half') then raise exception 'Invalid sibling variant.' using errcode='22023'; end if;
    insert into edit_connections values('sibling',v_person,'sibling',nullif(v_variant,'reported'),null,null,'unspecified',
      nullif(v_item->>'confidence',''),nullif(btrim(v_item->>'provenance_note'),''));
  end loop;

  if exists(select 1 from edit_connections where person_id=p_member_id)
    or exists(select 1 from edit_connections group by category,person_id having count(*)>1) then
    raise exception 'Self-links and duplicate connections are not allowed.' using errcode='22023';
  end if;
  if exists(select 1 from edit_connections c left join public.family_members m on m.id=c.person_id
    where m.id is null or m.owner_id<>v_owner or not private.can_view_member(p_user_id,m)) then
    raise exception 'Every connected person must be accessible and in the same family graph.' using errcode='42501';
  end if;

  perform m.id from public.family_members m
  where m.owner_id=v_owner and m.id in (
    select p_member_id union select person_id from edit_connections union
    select case when r.person_a_id=p_member_id then r.person_b_id else r.person_a_id end
    from public.relationships r where r.owner_id=v_owner and (
      (r.relationship_type='parent' and r.person_b_id=p_member_id)
      or (r.relationship_type in ('spouse','partner','sibling') and p_member_id in (r.person_a_id,r.person_b_id)))
  ) order by m.id for update;
  perform r.id from public.relationships r where r.owner_id=v_owner and (
    (r.relationship_type='parent' and r.person_b_id=p_member_id)
    or (r.relationship_type in ('spouse','partner','sibling') and p_member_id in (r.person_a_id,r.person_b_id)))
  order by r.id for update;

  if exists(with recursive descendants(id) as (
      select p_member_id union select r.person_b_id from public.relationships r join descendants d on d.id=r.person_a_id
      where r.owner_id=v_owner and r.relationship_type='parent')
    select 1 from edit_connections where category='parent' and person_id in(select id from descendants)) then
    raise exception 'That parent connection would create an ancestry cycle.' using errcode='22023';
  end if;

  update public.family_members fm set
    first_name=btrim(p_details->>'first_name'),surname=btrim(p_details->>'surname'),
    nickname=nullif(btrim(p_details->>'nickname'),''),maiden_name=nullif(btrim(p_details->>'maiden_name'),''),
    alternate_names=coalesce(p_details->'alternate_names','[]'::jsonb),gender=coalesce(p_details->>'gender','unspecified'),
    birth_date=nullif(p_details->>'birth_date','')::date,birth_year=nullif(p_details->>'birth_year','')::integer,
    birth_approximate=coalesce((p_details->>'birth_approximate')::boolean,false),birth_location=p_details->'birth_location',
    birth_place=nullif(btrim(p_details->>'birth_place'),''),lived_locations=coalesce(p_details->'lived_locations','[]'::jsonb),
    lived_in=nullif(btrim(p_details->>'lived_in'),''),death_date=nullif(p_details->>'death_date','')::date,
    death_year=nullif(p_details->>'death_year','')::integer,death_approximate=coalesce((p_details->>'death_approximate')::boolean,false),
    death_location=p_details->'death_location',death_place=nullif(btrim(p_details->>'death_place'),''),
    fact_confidence=coalesce(p_details->>'fact_confidence','reported'),provenance_note=nullif(btrim(p_details->>'provenance_note'),''),
    privacy_level=coalesce(p_details->>'privacy_level','family'),family_side=coalesce(nullif(btrim(p_details->>'family_side'),''),fm.family_side),
    is_placeholder=case when coalesce((p_details->>'fill_placeholder')::boolean,false) then false else fm.is_placeholder end,
    placeholder_label=case when coalesce((p_details->>'fill_placeholder')::boolean,false) then null else fm.placeholder_label end,
    filled_by=case when coalesce((p_details->>'fill_placeholder')::boolean,false) then p_user_id else fm.filled_by end
  where fm.id=p_member_id;

  update public.relationships r set relationship_variant=c.variant,
    confidence=coalesce(c.confidence,r.confidence),provenance_note=coalesce(c.provenance_note,r.provenance_note)
  from edit_connections c where c.category='parent' and r.owner_id=v_owner and r.relationship_type='parent'
    and r.person_a_id=c.person_id and r.person_b_id=p_member_id;
  update public.relationships r set relationship_type=c.relationship_type,relationship_variant=null,
    start_year=c.start_year,end_year=c.end_year,relationship_status=c.relationship_status,
    confidence=coalesce(c.confidence,r.confidence),provenance_note=coalesce(c.provenance_note,r.provenance_note)
  from edit_connections c where c.category='partner' and r.owner_id=v_owner and r.relationship_type in ('spouse','partner')
    and c.person_id=case when r.person_a_id=p_member_id then r.person_b_id else r.person_a_id end;
  update public.relationships r set relationship_variant=c.variant,
    confidence=coalesce(c.confidence,r.confidence),provenance_note=coalesce(c.provenance_note,r.provenance_note)
  from edit_connections c where c.category='sibling' and r.owner_id=v_owner and r.relationship_type='sibling'
    and c.person_id=case when r.person_a_id=p_member_id then r.person_b_id else r.person_a_id end;

  delete from public.relationships r where r.owner_id=v_owner and r.relationship_type='parent' and r.person_b_id=p_member_id
    and not exists(select 1 from edit_connections c where c.category='parent' and c.person_id=r.person_a_id);
  delete from public.relationships r where r.owner_id=v_owner and r.relationship_type in ('spouse','partner') and p_member_id in(r.person_a_id,r.person_b_id)
    and not exists(select 1 from edit_connections c where c.category='partner' and c.person_id=case when r.person_a_id=p_member_id then r.person_b_id else r.person_a_id end);
  delete from public.relationships r where r.owner_id=v_owner and r.relationship_type='sibling' and p_member_id in(r.person_a_id,r.person_b_id)
    and not exists(select 1 from edit_connections c where c.category='sibling' and c.person_id=case when r.person_a_id=p_member_id then r.person_b_id else r.person_a_id end);

  insert into public.relationships(owner_id,created_by,person_a_id,person_b_id,relationship_type,relationship_variant,start_year,end_year,relationship_status,confidence,provenance_note)
  select v_owner,p_user_id,case when c.category='parent' then c.person_id else p_member_id end,
    case when c.category='parent' then p_member_id else c.person_id end,c.relationship_type,c.variant,c.start_year,c.end_year,c.relationship_status,coalesce(c.confidence,'reported'),c.provenance_note
  from edit_connections c where not exists(select 1 from public.relationships r where r.owner_id=v_owner and (
    (c.category='parent' and r.relationship_type='parent' and r.person_a_id=c.person_id and r.person_b_id=p_member_id)
    or (c.category='partner' and r.relationship_type in ('spouse','partner') and p_member_id in(r.person_a_id,r.person_b_id) and c.person_id in(r.person_a_id,r.person_b_id))
    or (c.category='sibling' and r.relationship_type='sibling' and p_member_id in(r.person_a_id,r.person_b_id) and c.person_id in(r.person_a_id,r.person_b_id))));

  return (select revision from public.family_members where id=p_member_id);
exception when invalid_text_representation then
  raise exception 'A person ID, date, year, or boolean is malformed.' using errcode='22023';
end;
$$;

create or replace function public.edit_family_member(
  p_member_id uuid,p_expected_revision bigint,p_expected_relationship_hash text,p_details jsonb,p_connections jsonb
)
returns bigint language plpgsql security definer set search_path='' set row_security=off as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  return private.apply_family_member_edit(auth.uid(),p_member_id,p_expected_revision,p_expected_relationship_hash,p_details,p_connections);
end;
$$;

create or replace function public.propose_family_correction(
  p_member_id uuid,p_expected_revision bigint,p_expected_relationship_hash text,
  p_details jsonb,p_connections jsonb,p_reason text default null
)
returns uuid language plpgsql security definer set search_path='' set row_security=off as $$
declare
  v_member public.family_members; v_owner uuid; v_hash text; v_id uuid; v_reviewer uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  select * into v_member from public.family_members where id=p_member_id;
  if not found then raise exception 'Family member not found.' using errcode='P0002'; end if;
  v_owner:=v_member.owner_id;
  perform private.lock_family_graph(v_owner);
  select * into v_member from public.family_members where id=p_member_id and owner_id=v_owner for update;
  if not private.can_view_member(auth.uid(),v_member) then raise exception 'Family member not found.' using errcode='P0002'; end if;
  if private.can_manage_member(auth.uid(),v_member) then raise exception 'Editors should save this record directly.' using errcode='22023'; end if;
  perform r.id from public.relationships r where r.owner_id=v_owner and p_member_id in(r.person_a_id,r.person_b_id) order by r.id for share;
  v_hash:=md5(private.managed_connection_snapshot(p_member_id,v_owner)::text);
  if v_member.revision<>p_expected_revision or p_expected_relationship_hash is null or v_hash is distinct from p_expected_relationship_hash then
    raise exception 'This family member changed since you opened it. Refresh and try again.' using errcode='40001';
  end if;
  if jsonb_typeof(p_details)<>'object' or jsonb_typeof(p_connections)<>'object' then raise exception 'Details and connections are required.' using errcode='22023'; end if;
  v_reviewer:=coalesce(v_member.linked_user_id,v_member.created_by,private.graph_contact_user(v_owner,auth.uid()));
  if v_reviewer is null or v_reviewer=auth.uid() then raise exception 'No separate reviewer is available for this record.'; end if;
  insert into public.profile_change_requests(member_id,proposer_user_id,reviewer_user_id,proposed_changes,
    expected_revision,expected_relationship_hash,base_snapshot,proposed_connections,reason)
  values(p_member_id,auth.uid(),v_reviewer,p_details,p_expected_revision,p_expected_relationship_hash,
    jsonb_build_object('details',private.member_edit_details(v_member),
      'connections',private.managed_connection_snapshot(p_member_id,v_owner)),p_connections,nullif(btrim(p_reason),'')) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.suggest_member_correction(p_member_id uuid,p_changes jsonb)
returns uuid language plpgsql security definer set search_path='' set row_security=off as $$
declare v_member public.family_members; v_details jsonb; v_connections jsonb; v_hash text;
begin
  select * into v_member from public.family_members where id=p_member_id;
  if not found then raise exception 'Family member not found.'; end if;
  v_connections:=private.managed_connection_snapshot(v_member.id,v_member.owner_id);
  v_hash:=md5(v_connections::text);
  v_details:=private.member_edit_details(v_member)||coalesce(p_changes,'{}'::jsonb);
  return public.propose_family_correction(p_member_id,v_member.revision,v_hash,v_details,v_connections,null);
end;
$$;

create or replace function public.respond_profile_correction(p_request_id uuid,p_accept boolean)
returns void language plpgsql security definer set search_path='' set row_security=off as $$
declare
  v_change public.profile_change_requests; v_member public.family_members; v_owner uuid; v_hash text; v_reviewer uuid;
  v_details jsonb; v_connections jsonb;
begin
  select m.owner_id into v_owner from public.profile_change_requests c join public.family_members m on m.id=c.member_id where c.id=p_request_id;
  if v_owner is null then raise exception 'Correction request not found.' using errcode='P0002'; end if;
  perform private.lock_family_graph(v_owner);
  select * into v_change from public.profile_change_requests where id=p_request_id for update;
  if not found or v_change.status<>'pending' then raise exception 'Correction request not found or already resolved.'; end if;
  select * into v_member from public.family_members where id=v_change.member_id and owner_id=v_owner for update;
  v_reviewer:=coalesce(v_change.reviewer_user_id,v_member.linked_user_id,v_member.created_by,private.graph_contact_user(v_owner,auth.uid()));
  if v_reviewer is distinct from auth.uid() or not private.can_manage_member(auth.uid(),v_member) then
    raise exception 'Only the designated record reviewer can resolve this correction.' using errcode='42501';
  end if;
  v_hash:=md5(private.managed_connection_snapshot(v_member.id,v_owner)::text);
  if v_change.expected_revision is null then
    v_change.expected_revision:=v_member.revision;
    v_change.expected_relationship_hash:=v_hash;
  end if;
  if p_accept and (v_change.expected_revision is null or v_change.expected_relationship_hash is null
    or v_member.revision<>v_change.expected_revision or v_hash is distinct from v_change.expected_relationship_hash) then
    raise exception 'This record changed after the correction was proposed. Review a fresh proposal.' using errcode='40001';
  end if;
  if p_accept then
    v_details:=private.member_edit_details(v_member)||v_change.proposed_changes;
    v_connections:=coalesce(v_change.proposed_connections,v_change.base_snapshot->'connections',private.managed_connection_snapshot(v_member.id,v_owner));
    perform private.apply_family_member_edit(auth.uid(),v_member.id,v_change.expected_revision,
      v_change.expected_relationship_hash,v_details,v_connections);
  end if;
  update public.profile_change_requests set status=case when p_accept then 'accepted' else 'rejected' end,
    resolved_at=now(),reviewer_user_id=v_reviewer where id=p_request_id;
end;
$$;

-- Keep the pre-launch identity and family-match responder available privately,
-- while forcing correction decisions through the atomic correction workflow.
do $$
begin
  if to_regprocedure('private.respond_verification_request_legacy(text,uuid,boolean)') is null
    and to_regprocedure('public.respond_verification_request(text,uuid,boolean)') is not null then
    alter function public.respond_verification_request(text,uuid,boolean)
      rename to respond_verification_request_legacy;
    alter function public.respond_verification_request_legacy(text,uuid,boolean)
      set schema private;
  end if;
end;
$$;

create or replace function public.respond_verification_request(p_kind text,p_request_id uuid,p_accept boolean)
returns void language plpgsql security definer set search_path='' set row_security=off as $$
begin
  if p_kind='correction' then
    perform public.respond_profile_correction(p_request_id,p_accept);
    return;
  end if;
  if to_regprocedure('private.respond_verification_request_legacy(text,uuid,boolean)') is null then
    raise exception 'The legacy verification responder is unavailable.';
  end if;
  execute 'select private.respond_verification_request_legacy($1,$2,$3)'
    using p_kind,p_request_id,p_accept;
end;
$$;

create or replace function public.respond_family_correction(p_request_id uuid,p_response text)
returns text language plpgsql security definer set search_path='' as $$
begin
  if p_response not in ('accepted','rejected') then raise exception 'Response must be accepted or rejected.'; end if;
  perform public.respond_profile_correction(p_request_id,p_response='accepted');
  return p_response;
end;
$$;

create or replace function public.ensure_self_family_member()
returns public.family_members language plpgsql security definer set search_path='' set row_security=off as $$
declare
  v_user uuid:=auth.uid();
  v_profile public.profiles;
  v_member public.family_members;
  v_first_name text;
  v_surname text;
begin
  if v_user is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  select * into v_profile from public.profiles where id=v_user;
  if not found then raise exception 'Complete your profile before creating your family record.' using errcode='P0002'; end if;
  v_first_name:=coalesce(nullif(btrim(v_profile.first_name),''),nullif(split_part(btrim(v_profile.display_name),' ',1),''),'Me');
  v_surname:=nullif(btrim(v_profile.surname),'');
  if v_surname is null then raise exception 'Complete your family surname before creating your family record.' using errcode='22023'; end if;

  perform private.lock_family_graph(v_user);
  select * into v_member from public.family_members
  where owner_id=v_user and is_self order by created_at,id limit 1 for update;
  if found then
    if v_member.linked_user_id is not null and v_member.linked_user_id<>v_user then
      raise exception 'Your self record is linked to another account.' using errcode='23505';
    end if;
    if v_member.linked_user_id is null then
      perform set_config('vansh.system_write','on',true);
      update public.family_members set linked_user_id=v_user
      where id=v_member.id returning * into v_member;
    end if;
    return v_member;
  end if;

  insert into public.family_members(
    owner_id,created_by,linked_user_id,first_name,surname,maiden_name,
    birth_date,birth_year,birth_location,birth_place,lived_locations,lived_in,
    privacy_level,family_side,is_self
  ) values (
    v_user,v_user,v_user,v_first_name,v_surname,nullif(btrim(v_profile.birth_surname),''),
    v_profile.birth_date,extract(year from v_profile.birth_date)::integer,
    v_profile.birth_location,nullif(btrim(v_profile.birth_location_text),''),
    case when v_profile.current_location is null then '[]'::jsonb else jsonb_build_array(v_profile.current_location) end,
    coalesce(nullif(btrim(v_profile.current_location_text),''),nullif(btrim(v_profile.location),'')),
    case v_profile.living_person_privacy when 'private' then 'private' when 'match_clues' then 'match_clues' else 'family' end,
    'You',true
  ) returning * into v_member;
  return v_member;
end;
$$;

create or replace function public.link_family_members(
  p_person_a_id uuid,p_person_b_id uuid,p_relationship_type text,p_variant text default null,
  p_start_year integer default null,p_end_year integer default null,p_status text default 'unspecified'
)
returns uuid language plpgsql security definer set search_path='' set row_security=off as $$
declare
  v_a public.family_members; v_b public.family_members; v_owner uuid; v_existing public.relationships; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if p_person_a_id=p_person_b_id then raise exception 'Choose two different people.' using errcode='22023'; end if;
  select * into v_a from public.family_members where id=p_person_a_id;
  if not found then raise exception 'Family member not found.' using errcode='P0002'; end if;
  v_owner:=v_a.owner_id;
  perform private.lock_family_graph(v_owner);
  perform m.id from public.family_members m where m.id in(p_person_a_id,p_person_b_id) order by m.id for update;
  select * into v_a from public.family_members where id=p_person_a_id and owner_id=v_owner;
  select * into v_b from public.family_members where id=p_person_b_id and owner_id=v_owner;
  if v_a.id is null or v_b.id is null then raise exception 'Both people must be in the same family graph.'; end if;
  if not(private.can_manage_member(auth.uid(),v_a) or private.can_manage_member(auth.uid(),v_b)) then raise exception 'You are not authorized to link these people.' using errcode='42501'; end if;
  if p_relationship_type not in ('parent','sibling','spouse','partner')
    or (p_relationship_type='parent' and p_variant is not null and p_variant not in ('biological','adoptive','step','guardian'))
    or (p_relationship_type='sibling' and p_variant is not null and p_variant not in ('reported','half'))
    or (p_relationship_type in ('spouse','partner') and p_variant is not null)
    or p_status not in ('current','former','unspecified')
    or (p_relationship_type not in ('spouse','partner') and (p_start_year is not null or p_end_year is not null or p_status<>'unspecified'))
    or (p_status='current' and p_end_year is not null)
    or (p_start_year is not null and p_start_year not between 1800 and 2100)
    or (p_end_year is not null and p_end_year not between 1800 and 2100)
    or (p_start_year is not null and p_end_year is not null and p_start_year>p_end_year) then
    raise exception 'Invalid relationship details.' using errcode='22023';
  end if;
  if p_relationship_type='parent' and exists(with recursive descendants(id) as (
      select p_person_b_id union select r.person_b_id from public.relationships r join descendants d on d.id=r.person_a_id
      where r.owner_id=v_owner and r.relationship_type='parent') select 1 from descendants where id=p_person_a_id) then
    raise exception 'That parent relationship would create an ancestry cycle.' using errcode='22023';
  end if;
  select * into v_existing from public.relationships r where r.owner_id=v_owner and (
    (p_relationship_type='parent' and r.relationship_type='parent' and r.person_a_id=p_person_a_id and r.person_b_id=p_person_b_id)
    or (p_relationship_type in ('spouse','partner') and r.relationship_type in ('spouse','partner') and p_person_a_id in(r.person_a_id,r.person_b_id) and p_person_b_id in(r.person_a_id,r.person_b_id))
    or (p_relationship_type='sibling' and r.relationship_type='sibling' and p_person_a_id in(r.person_a_id,r.person_b_id) and p_person_b_id in(r.person_a_id,r.person_b_id)))
    order by r.id limit 1 for update;
  if found then
    if v_existing.relationship_type=p_relationship_type and v_existing.relationship_variant is not distinct from nullif(p_variant,'reported')
      and v_existing.start_year is not distinct from p_start_year and v_existing.end_year is not distinct from p_end_year
      and v_existing.relationship_status=p_status then return v_existing.id; end if;
    raise exception 'A relationship in this category is already recorded.' using errcode='23505';
  end if;
  insert into public.relationships(owner_id,created_by,person_a_id,person_b_id,relationship_type,relationship_variant,start_year,end_year,relationship_status)
  values(v_owner,auth.uid(),p_person_a_id,p_person_b_id,p_relationship_type,nullif(p_variant,'reported'),p_start_year,p_end_year,p_status) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.link_family_members_bundle(p_anchor_id uuid,p_member_id uuid,p_bundle jsonb)
returns void language plpgsql security definer set search_path='' set row_security=off as $$
declare
  v_anchor public.family_members; v_member public.family_members; v_owner uuid; v_primary jsonb; v_item jsonb; v_person uuid;
begin
  select * into v_anchor from public.family_members where id=p_anchor_id;
  if not found then raise exception 'Anchor not found.'; end if;
  v_owner:=v_anchor.owner_id;
  perform private.lock_family_graph(v_owner);
  perform m.id from public.family_members m where m.id in(p_anchor_id,p_member_id) order by m.id for update;
  select * into v_anchor from public.family_members where id=p_anchor_id and owner_id=v_owner;
  select * into v_member from public.family_members where id=p_member_id and owner_id=v_owner;
  if v_member.id is null or not(private.can_manage_member(auth.uid(),v_anchor) or private.can_manage_member(auth.uid(),v_member)) then
    raise exception 'You are not authorized to connect these records.' using errcode='42501';
  end if;
  v_primary:=p_bundle->'primary';
  if v_primary->>'type'='parent' then
    if v_primary->>'direction'='from-anchor' then
      perform public.link_family_members(p_anchor_id,p_member_id,'parent',nullif(v_primary->>'variant','unspecified'),null,null,'unspecified');
    else
      perform public.link_family_members(p_member_id,p_anchor_id,'parent',nullif(v_primary->>'variant','unspecified'),null,null,'unspecified');
    end if;
  elsif v_primary->>'type' in ('spouse','partner') then
    perform public.link_family_members(p_member_id,p_anchor_id,v_primary->>'type',null,
      nullif(v_primary->>'start_year','')::integer,nullif(v_primary->>'end_year','')::integer,coalesce(v_primary->>'status','unspecified'));
  end if;
  for v_item in select value from jsonb_array_elements(coalesce(p_bundle->'parents','[]'::jsonb)) loop
    if v_item ? 'placeholder' then
      insert into public.family_members(owner_id,created_by,first_name,surname,gender,is_placeholder,placeholder_label,family_side)
      values(v_owner,auth.uid(),'Unknown',v_member.surname,coalesce(v_item#>>'{placeholder,gender}','unspecified'),true,
        coalesce(nullif(btrim(v_item#>>'{placeholder,label}'),''),'Unknown parent of '||v_member.first_name),v_member.family_side) returning id into v_person;
    else v_person:=(v_item->>'person_id')::uuid; end if;
    perform public.link_family_members(v_person,p_member_id,'parent',nullif(v_item->>'variant','unspecified'),null,null,'unspecified');
    if v_primary->>'type'='sibling' then
      perform public.link_family_members(v_person,p_anchor_id,'parent',nullif(v_item->>'variant','unspecified'),null,null,'unspecified');
    end if;
  end loop;
  for v_item in select value from jsonb_array_elements(coalesce(p_bundle->'partners','[]'::jsonb)) loop
    if v_item ? 'placeholder' then
      insert into public.family_members(owner_id,created_by,first_name,surname,gender,is_placeholder,placeholder_label,family_side)
      values(v_owner,auth.uid(),'Unknown',v_member.surname,coalesce(v_item#>>'{placeholder,gender}','unspecified'),true,
        coalesce(nullif(btrim(v_item#>>'{placeholder,label}'),''),'Unknown partner of '||v_member.first_name),v_member.family_side) returning id into v_person;
    else v_person:=(v_item->>'person_id')::uuid; end if;
    perform public.link_family_members(p_member_id,v_person,coalesce(v_item->>'type','spouse'),null,
      nullif(v_item->>'start_year','')::integer,nullif(v_item->>'end_year','')::integer,coalesce(v_item->>'status','unspecified'));
    if coalesce((v_item->>'also_parent_of_anchor')::boolean,false) and v_person<>p_anchor_id then
      perform public.link_family_members(v_person,p_anchor_id,'parent','biological',null,null,'unspecified');
    end if;
  end loop;
  if v_primary->>'type'='sibling' and jsonb_array_length(coalesce(p_bundle->'parents','[]'::jsonb))=0 then
    perform public.link_family_members(p_member_id,p_anchor_id,'sibling',null,null,null,'unspecified');
  end if;
end;
$$;

create or replace function public.create_family_relative(p_anchor_id uuid,p_details jsonb,p_bundle jsonb,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' set row_security=off as $$
declare
  v_anchor public.family_members; v_owner uuid; v_member uuid; v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  select * into v_anchor from public.family_members where id=p_anchor_id;
  if not found then raise exception 'Anchor not found.'; end if;
  v_owner:=v_anchor.owner_id;
  perform private.lock_family_graph(v_owner);
  select * into v_anchor from public.family_members where id=p_anchor_id and owner_id=v_owner for update;
  if not private.can_manage_member(auth.uid(),v_anchor) then raise exception 'You are not authorized to add family near this member.' using errcode='42501'; end if;
  select result into v_result from public.family_mutation_requests where id=p_idempotency_key and actor_id=auth.uid() and owner_id=v_owner;
  if found then return v_result; end if;
  if nullif(btrim(p_details->>'first_name'),'') is null or nullif(btrim(p_details->>'surname'),'') is null then raise exception 'First name and surname are required.'; end if;
  insert into public.family_members(owner_id,created_by,first_name,surname,nickname,maiden_name,alternate_names,gender,
    birth_date,birth_year,birth_approximate,birth_location,birth_place,lived_locations,lived_in,
    death_date,death_year,death_approximate,death_location,death_place,fact_confidence,provenance_note,privacy_level,family_side)
  values(v_owner,auth.uid(),btrim(p_details->>'first_name'),btrim(p_details->>'surname'),nullif(btrim(p_details->>'nickname'),''),
    nullif(btrim(p_details->>'maiden_name'),''),coalesce(p_details->'alternate_names','[]'::jsonb),coalesce(p_details->>'gender','unspecified'),
    nullif(p_details->>'birth_date','')::date,nullif(p_details->>'birth_year','')::integer,coalesce((p_details->>'birth_approximate')::boolean,false),
    p_details->'birth_location',nullif(btrim(p_details->>'birth_place'),''),coalesce(p_details->'lived_locations','[]'::jsonb),nullif(btrim(p_details->>'lived_in'),''),
    nullif(p_details->>'death_date','')::date,nullif(p_details->>'death_year','')::integer,coalesce((p_details->>'death_approximate')::boolean,false),
    p_details->'death_location',nullif(btrim(p_details->>'death_place'),''),coalesce(p_details->>'fact_confidence','reported'),
    nullif(btrim(p_details->>'provenance_note'),''),coalesce(p_details->>'privacy_level','family'),coalesce(p_details->>'family_side',v_anchor.family_side)) returning id into v_member;
  perform public.link_family_members_bundle(p_anchor_id,v_member,p_bundle);
  v_result:=jsonb_build_object('member_id',v_member);
  insert into public.family_mutation_requests(id,actor_id,owner_id,operation,result)
  values(p_idempotency_key,auth.uid(),v_owner,'create_family_relative',v_result);
  return v_result;
end;
$$;

create or replace function public.add_placeholder_siblings(p_anchor_id uuid,p_desired_total integer)
returns integer language plpgsql security definer set search_path='' set row_security=off as $$
declare
  v_anchor public.family_members; v_owner uuid; v_existing integer; v_missing integer; v_index integer; v_member uuid;
begin
  select * into v_anchor from public.family_members where id=p_anchor_id;
  if not found then raise exception 'Anchor not found.'; end if;
  v_owner:=v_anchor.owner_id;
  perform private.lock_family_graph(v_owner);
  select * into v_anchor from public.family_members where id=p_anchor_id and owner_id=v_owner for update;
  if not private.can_manage_member(auth.uid(),v_anchor) then raise exception 'You are not authorized to edit siblings for this member.' using errcode='42501'; end if;
  if p_desired_total not between 0 and 100 then raise exception 'Sibling total must be between 0 and 100.'; end if;
  select count(*)::integer into v_existing from public.relationships r where r.owner_id=v_owner and r.relationship_type='sibling' and p_anchor_id in(r.person_a_id,r.person_b_id);
  v_missing:=greatest(0,p_desired_total-v_existing);
  for v_index in 1..v_missing loop
    insert into public.family_members(owner_id,created_by,first_name,surname,gender,is_placeholder,placeholder_label,family_side)
    values(v_owner,auth.uid(),'Unknown',v_anchor.surname,'unspecified',true,'Unknown sibling '||(v_existing+v_index),v_anchor.family_side) returning id into v_member;
    perform public.link_family_members(v_member,p_anchor_id,'sibling',null,null,null,'unspecified');
  end loop;
  return v_missing;
end;
$$;

create or replace function public.delete_family_member(p_member_id uuid)
returns boolean language plpgsql security definer set search_path='' set row_security=off as $$
declare v_member public.family_members; v_owner uuid;
begin
  select * into v_member from public.family_members where id=p_member_id;
  if not found then return false; end if;
  v_owner:=v_member.owner_id;
  perform private.lock_family_graph(v_owner);
  select * into v_member from public.family_members where id=p_member_id and owner_id=v_owner for update;
  if not found then return false; end if;
  if v_member.is_self or v_member.linked_user_id is not null or v_member.created_by is distinct from auth.uid() then
    raise exception 'You are not authorized to delete this family member.' using errcode='42501';
  end if;
  perform r.id from public.relationships r where r.owner_id=v_owner and p_member_id in(r.person_a_id,r.person_b_id) order by r.id for update;
  update public.profile_change_requests set status='rejected',resolved_at=now(),reviewer_user_id=auth.uid()
    where member_id=p_member_id and status='pending';
  delete from public.relationships r where r.owner_id=v_owner and p_member_id in(r.person_a_id,r.person_b_id);
  delete from public.family_members where id=p_member_id;
  return true;
end;
$$;

-- Keep the launch duplicate-merge implementation, but put the graph advisory
-- lock in front of its existing row locks and hide the unlocked inner function.
do $$
begin
  if to_regprocedure('public.merge_family_members_reconciled_inner(uuid,uuid,jsonb)') is null
    and to_regprocedure('public.merge_family_members(uuid,uuid,jsonb)') is not null then
    execute 'alter function public.merge_family_members(uuid,uuid,jsonb) rename to merge_family_members_reconciled_inner';
  end if;
end;
$$;

create or replace function public.merge_family_members(
  p_keep_id uuid,p_merge_id uuid,p_field_choices jsonb default '{}'::jsonb
)
returns uuid language plpgsql security definer set search_path='' set row_security=off as $$
declare v_owner uuid; v_merge_owner uuid; v_result uuid;
begin
  select owner_id into v_owner from public.family_members where id=p_keep_id;
  select owner_id into v_merge_owner from public.family_members where id=p_merge_id;
  if v_owner is null or v_owner is distinct from v_merge_owner then
    raise exception 'Duplicates must belong to the same family graph.';
  end if;
  perform private.lock_family_graph(v_owner);
  if to_regprocedure('public.merge_family_members_reconciled_inner(uuid,uuid,jsonb)') is null then
    raise exception 'The launch duplicate-merge implementation is unavailable.';
  end if;
  execute 'select public.merge_family_members_reconciled_inner($1,$2,$3)'
    into v_result using p_keep_id,p_merge_id,p_field_choices;
  return v_result;
end;
$$;

-- Compatibility for the profile panel and existing integrations. This updates
-- details only, but follows the same claimed-profile rule and graph-first lock.
create or replace function public.update_family_member_with_revision(p_member_id uuid,p_expected_revision integer,p_changes jsonb)
returns public.family_members language plpgsql security definer set search_path='' set row_security=off as $$
declare v_member public.family_members; v_owner uuid; v_result public.family_members;
begin
  select * into v_member from public.family_members where id=p_member_id;
  if not found then raise exception 'Family member not found.'; end if;
  v_owner:=v_member.owner_id;
  perform private.lock_family_graph(v_owner);
  select * into v_member from public.family_members where id=p_member_id and owner_id=v_owner for update;
  if not private.can_manage_member(auth.uid(),v_member) then raise exception 'You do not have permission to edit this family member.' using errcode='42501'; end if;
  if v_member.revision<>p_expected_revision then raise exception 'This record changed while you were editing it.' using errcode='40001'; end if;
  update public.family_members fm set
    first_name=case when p_changes?'first_name' then btrim(p_changes->>'first_name') else fm.first_name end,
    surname=case when p_changes?'surname' then btrim(p_changes->>'surname') else fm.surname end,
    nickname=case when p_changes?'nickname' then nullif(btrim(p_changes->>'nickname'),'') else fm.nickname end,
    maiden_name=case when p_changes?'maiden_name' then nullif(btrim(p_changes->>'maiden_name'),'') else fm.maiden_name end,
    alternate_names=case when p_changes?'alternate_names' then coalesce(p_changes->'alternate_names','[]'::jsonb) else fm.alternate_names end,
    gender=case when p_changes?'gender' then p_changes->>'gender' else fm.gender end,
    birth_date=case when p_changes?'birth_date' then nullif(p_changes->>'birth_date','')::date else fm.birth_date end,
    birth_year=case when p_changes?'birth_year' then nullif(p_changes->>'birth_year','')::integer else fm.birth_year end,
    birth_location=case when p_changes?'birth_location' then p_changes->'birth_location' else fm.birth_location end,
    birth_place=case when p_changes?'birth_place' then nullif(btrim(p_changes->>'birth_place'),'') else fm.birth_place end
  where fm.id=p_member_id returning * into v_result;
  return v_result;
end;
$$;

revoke all privileges on table public.family_members from public, anon, authenticated;
revoke all privileges on table public.relationships from public, anon, authenticated;
revoke all privileges on table public.profile_change_requests from public, anon, authenticated;
revoke all privileges on table public.member_change_history from public, anon, authenticated;
revoke all privileges on table public.relationship_change_history from public, anon, authenticated;
revoke all privileges on table public.member_revision_history from public, anon, authenticated;
revoke all privileges on table public.relationship_revision_history from public, anon, authenticated;
revoke all privileges on table public.family_correction_requests from public, anon, authenticated;
revoke all privileges on table public.family_mutation_requests from public, anon, authenticated;
revoke all privileges on table public.member_merge_audit from public, anon, authenticated;
revoke all privileges on table public.application_errors from public, anon, authenticated;
revoke all privileges on table public.family_update_notifications from public, anon, authenticated;

grant select on table public.family_members to authenticated;
grant select on table public.relationships to authenticated;
grant select on table public.profile_change_requests to authenticated;
grant select, insert on table public.application_errors to authenticated;
grant select on table public.family_update_notifications to authenticated;

revoke all on function public.edit_family_member(uuid,bigint,text,jsonb,jsonb) from public,anon;
revoke all on function public.propose_family_correction(uuid,bigint,text,jsonb,jsonb,text) from public,anon;
revoke all on function public.suggest_member_correction(uuid,jsonb) from public,anon;
revoke all on function public.respond_profile_correction(uuid,boolean) from public,anon;
revoke all on function public.respond_verification_request(text,uuid,boolean) from public,anon;
revoke all on function public.respond_family_correction(uuid,text) from public,anon;
revoke all on function public.ensure_self_family_member() from public,anon;
revoke all on function public.get_managed_relationship_snapshots(uuid[]) from public,anon;
revoke all on function public.create_family_relative(uuid,jsonb,jsonb,uuid) from public,anon;
revoke all on function public.link_family_members_bundle(uuid,uuid,jsonb) from public,anon;
revoke all on function public.link_family_members(uuid,uuid,text,text,integer,integer,text) from public,anon;
revoke all on function public.add_placeholder_siblings(uuid,integer) from public,anon;
revoke all on function public.delete_family_member(uuid) from public,anon;
do $$
begin
  if to_regprocedure('public.merge_family_members_reconciled_inner(uuid,uuid,jsonb)') is not null then
    execute 'revoke all on function public.merge_family_members_reconciled_inner(uuid,uuid,jsonb) from public,anon,authenticated';
  end if;
end;
$$;
do $$
begin
  if to_regprocedure('private.respond_verification_request_legacy(text,uuid,boolean)') is not null then
    execute 'revoke all on function private.respond_verification_request_legacy(text,uuid,boolean) from public,anon,authenticated';
  end if;
end;
$$;
revoke all on function public.merge_family_members(uuid,uuid,jsonb) from public,anon;

grant execute on function public.edit_family_member(uuid,bigint,text,jsonb,jsonb) to authenticated;
grant execute on function public.propose_family_correction(uuid,bigint,text,jsonb,jsonb,text) to authenticated;
grant execute on function public.suggest_member_correction(uuid,jsonb) to authenticated;
grant execute on function public.respond_profile_correction(uuid,boolean) to authenticated;
grant execute on function public.respond_verification_request(text,uuid,boolean) to authenticated;
grant execute on function public.respond_family_correction(uuid,text) to authenticated;
grant execute on function public.ensure_self_family_member() to authenticated;
grant execute on function public.get_managed_relationship_snapshots(uuid[]) to authenticated;
grant execute on function public.create_family_relative(uuid,jsonb,jsonb,uuid) to authenticated;
grant execute on function public.link_family_members_bundle(uuid,uuid,jsonb) to authenticated;
grant execute on function public.link_family_members(uuid,uuid,text,text,integer,integer,text) to authenticated;
grant execute on function public.add_placeholder_siblings(uuid,integer) to authenticated;
grant execute on function public.delete_family_member(uuid) to authenticated;
grant execute on function public.merge_family_members(uuid,uuid,jsonb) to authenticated;

revoke all on function private.apply_family_member_edit(uuid,uuid,bigint,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function private.can_manage_member(uuid,public.family_members) from public,anon,authenticated;
revoke all on function private.can_view_member(uuid,public.family_members) from public,anon,authenticated;
revoke all on function private.managed_connection_snapshot(uuid,uuid) from public,anon,authenticated;
revoke all on function private.member_edit_details(public.family_members) from public,anon,authenticated;
revoke all on function private.prepare_relationship_write() from public,anon,authenticated;
