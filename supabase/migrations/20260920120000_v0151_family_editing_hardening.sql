-- v0.15.1 family-editing hardening. This migration is forward-only for
-- deployed databases; historical replay fixes live in their original files.

create or replace function private.lock_member_mutation(
  p_member_ids uuid[],
  p_owner_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_identity uuid;
  v_owner uuid;
  v_identities uuid[];
begin
  select array_agg(distinct fm.person_identity_id order by fm.person_identity_id)
  into v_identities
  from public.family_members fm
  where fm.id = any(coalesce(p_member_ids, '{}'::uuid[]))
    and fm.person_identity_id is not null;

  foreach v_identity in array coalesce(v_identities, '{}'::uuid[]) loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_identity::text, 9151013417)
    );
  end loop;

  perform set_config(
    'vansh.identity_locks',
    coalesce((select jsonb_agg(identity_id::text)::text from unnest(coalesce(v_identities, '{}'::uuid[])) identity_id), '[]'),
    true
  );

  for v_owner in
    select owners.owner_id from (
      select unnest(coalesce(p_owner_ids,'{}'::uuid[])) owner_id
      union
      select fm.owner_id from public.family_members fm
      where fm.id=any(coalesce(p_member_ids,'{}'::uuid[]))
         or fm.person_identity_id=any(coalesce(v_identities,'{}'::uuid[]))
    ) owners where owners.owner_id is not null order by owners.owner_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_owner::text, 8617349127)
    );
  end loop;

  -- Every identity replica is locked in one deterministic order. Callers can
  -- safely acquire narrower row locks again after this helper returns.
  perform fm.id
  from public.family_members fm
  where fm.id = any(coalesce(p_member_ids, '{}'::uuid[]))
     or fm.person_identity_id = any(coalesce(v_identities, '{}'::uuid[]))
  order by fm.owner_id, fm.id
  for update;
end;
$$;

create or replace function private.lock_family_graph(p_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare v_members uuid[];
begin
  if p_owner_id is null then
    raise exception 'A family graph owner is required.' using errcode = '22023';
  end if;
  select array_agg(fm.id order by fm.id) into v_members
  from public.family_members fm where fm.owner_id = p_owner_id;
  if coalesce(cardinality(v_members), 0) = 0 then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_owner_id::text, 8617349127)
    );
    return;
  end if;
  perform private.lock_member_mutation(v_members);
end;
$$;

create or replace function private.sync_claimed_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_changed boolean;
  v_locks jsonb := coalesce(nullif(current_setting('vansh.identity_locks', true), ''), '[]')::jsonb;
begin
  if tg_op <> 'UPDATE' or pg_trigger_depth() > 1 then return new; end if;
  if coalesce(current_setting('vansh.system_write',true),'')='on' then return new; end if;
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
  if not (v_locks ? new.person_identity_id::text) then
    raise exception 'Claimed identity mutations require the identity advisory lock.' using errcode = '55000';
  end if;

  perform set_config('vansh.system_write', 'on', true);
  update public.family_members fm set
    first_name = case when new.first_name is distinct from old.first_name then new.first_name else fm.first_name end,
    surname = case when new.surname is distinct from old.surname then new.surname else fm.surname end,
    nickname = case when new.nickname is distinct from old.nickname then new.nickname else fm.nickname end,
    maiden_name = case when new.maiden_name is distinct from old.maiden_name then new.maiden_name else fm.maiden_name end,
    alternate_names = case when new.alternate_names is distinct from old.alternate_names then new.alternate_names else fm.alternate_names end,
    gender = case when new.gender is distinct from old.gender then new.gender else fm.gender end,
    birth_year = case when new.birth_year is distinct from old.birth_year then new.birth_year else fm.birth_year end,
    birth_date = case when new.birth_date is distinct from old.birth_date then new.birth_date else fm.birth_date end,
    birth_approximate = case when new.birth_approximate is distinct from old.birth_approximate then new.birth_approximate else fm.birth_approximate end,
    birth_location = case when new.birth_location is distinct from old.birth_location then new.birth_location else fm.birth_location end,
    birth_place = case when new.birth_place is distinct from old.birth_place then new.birth_place else fm.birth_place end,
    lived_locations = case when new.lived_locations is distinct from old.lived_locations then new.lived_locations else fm.lived_locations end,
    lived_in = case when new.lived_in is distinct from old.lived_in then new.lived_in else fm.lived_in end,
    death_year = case when new.death_year is distinct from old.death_year then new.death_year else fm.death_year end,
    death_date = case when new.death_date is distinct from old.death_date then new.death_date else fm.death_date end,
    death_approximate = case when new.death_approximate is distinct from old.death_approximate then new.death_approximate else fm.death_approximate end,
    death_location = case when new.death_location is distinct from old.death_location then new.death_location else fm.death_location end,
    death_place = case when new.death_place is distinct from old.death_place then new.death_place else fm.death_place end,
    fact_confidence = case when new.fact_confidence is distinct from old.fact_confidence then new.fact_confidence else fm.fact_confidence end,
    provenance_note = case when new.provenance_note is distinct from old.provenance_note then new.provenance_note else fm.provenance_note end,
    privacy_level = case when new.privacy_level is distinct from old.privacy_level then new.privacy_level else fm.privacy_level end
  where fm.person_identity_id = new.person_identity_id and fm.id <> new.id;
  return new;
end;
$$;

create or replace function private.valid_relationship_evidence(p_confidence text, p_note text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_confidence, 'reported') in ('reported','probable','uncertain','documented','disputed')
    and char_length(coalesce(p_note, '')) <= 1000;
$$;

create or replace function private.normalize_family_member_json_nulls()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if new.birth_location='null'::jsonb then new.birth_location:=null; end if;
  if new.death_location='null'::jsonb then new.death_location:=null; end if;
  return new;
end;
$$;

drop trigger if exists a_normalize_family_member_json_nulls on public.family_members;
create trigger a_normalize_family_member_json_nulls
before insert or update on public.family_members
for each row execute function private.normalize_family_member_json_nulls();

create or replace function private.normalize_managed_connections(p_connections jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'parents', coalesce((select jsonb_agg(jsonb_strip_nulls(item) order by item->>'person_id', item::text)
      from jsonb_array_elements(coalesce(p_connections->'parents','[]'::jsonb)) as items(item)),'[]'::jsonb),
    'partners', coalesce((select jsonb_agg(jsonb_strip_nulls(item) order by item->>'person_id', item::text)
      from jsonb_array_elements(coalesce(p_connections->'partners','[]'::jsonb)) as items(item)),'[]'::jsonb),
    'siblings', coalesce((select jsonb_agg(jsonb_strip_nulls(item) order by item->>'person_id', item::text)
      from jsonb_array_elements(coalesce(p_connections->'siblings','[]'::jsonb)) as items(item)),'[]'::jsonb)
  );
$$;

create or replace function public.link_family_members_batch(p_links jsonb, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_owner uuid;
  v_previous jsonb;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if p_idempotency_key is null or jsonb_typeof(p_links) <> 'array' or jsonb_array_length(p_links) = 0 then
    raise exception 'A non-empty link bundle and idempotency key are required.' using errcode='22023';
  end if;

  select fm.owner_id into v_owner
  from public.family_members fm
  where fm.id=nullif(p_links->0->>'person_a_id','')::uuid
    and private.can_view_member(auth.uid(),fm);
  if v_owner is null then
    raise exception 'Family relationship endpoint not found.' using errcode='P0002';
  end if;
  perform private.lock_family_graph(v_owner);

  select mr.result into v_previous
  from public.family_mutation_requests mr
  where mr.id=p_idempotency_key and mr.actor_id=auth.uid() and mr.owner_id=v_owner
    and mr.operation='link_family_members_batch';
  if found then
    if v_previous->>'request_hash' is distinct from md5(p_links::text) then
      raise exception 'That idempotency key was already used for another request.' using errcode='23505';
    end if;
    return v_previous->'result';
  end if;

  create temporary table if not exists intended_family_links(
    ordinal bigint, person_a_id uuid, person_b_id uuid, relationship_type text,
    variant text, start_year integer, end_year integer, status text,
    confidence text, provenance_note text, evidence_supplied boolean
  ) on commit drop;
  truncate intended_family_links;

  insert into intended_family_links
  select e.ordinality, nullif(e.value->>'person_a_id','')::uuid,
    nullif(e.value->>'person_b_id','')::uuid, e.value->>'relationship_type',
    case when e.value->>'relationship_type'='parent' and coalesce(e.value->>'variant','')='unspecified'
      then null else nullif(e.value->>'variant','') end,
    nullif(e.value->>'start_year','')::integer,
    nullif(e.value->>'end_year','')::integer, coalesce(nullif(e.value->>'status',''),'unspecified'),
    coalesce(nullif(e.value->>'confidence',''),'reported'), nullif(btrim(e.value->>'provenance_note'),''),
    (e.value ? 'confidence') or (e.value ? 'provenance_note')
  from jsonb_array_elements(p_links) with ordinality e(value, ordinality);

  -- Keep the first semantic edge. This handles older child-creation clients
  -- that sent the anchor both as the primary parent and as a suggested parent.
  delete from intended_family_links duplicate
  using intended_family_links keeper
  where duplicate.ordinal>keeper.ordinal
    and case when duplicate.relationship_type in ('spouse','partner') then 'partner' else duplicate.relationship_type end
      =case when keeper.relationship_type in ('spouse','partner') then 'partner' else keeper.relationship_type end
    and case when duplicate.relationship_type='parent' then duplicate.person_a_id else least(duplicate.person_a_id,duplicate.person_b_id) end
      is not distinct from case when keeper.relationship_type='parent' then keeper.person_a_id else least(keeper.person_a_id,keeper.person_b_id) end
    and case when duplicate.relationship_type='parent' then duplicate.person_b_id else greatest(duplicate.person_a_id,duplicate.person_b_id) end
      is not distinct from case when keeper.relationship_type='parent' then keeper.person_b_id else greatest(keeper.person_a_id,keeper.person_b_id) end;

  if exists(select 1 from intended_family_links where person_a_id is null or person_b_id is null or person_a_id=person_b_id)
    or exists(select 1 from intended_family_links where relationship_type not in ('parent','sibling','spouse','partner'))
    or exists(select 1 from intended_family_links where not private.valid_relationship_evidence(confidence,provenance_note))
    or exists(select 1 from intended_family_links where
      (relationship_type='parent' and variant is not null and variant not in ('biological','adoptive','step','guardian'))
      or (relationship_type='sibling' and variant is not null and variant not in ('reported','half'))
      or (relationship_type in ('spouse','partner') and variant is not null)
      or status not in ('current','former','unspecified')
      or (relationship_type not in ('spouse','partner') and (start_year is not null or end_year is not null or status<>'unspecified'))
      or (status='current' and end_year is not null)
      or (start_year is not null and start_year not between 1800 and 2100)
      or (end_year is not null and end_year not between 1800 and 2100)
      or (start_year is not null and end_year is not null and start_year>end_year)) then
    raise exception 'Invalid relationship details.' using errcode='22023';
  end if;

  if exists(
    select 1 from intended_family_links l
    left join public.family_members a on a.id=l.person_a_id
    left join public.family_members b on b.id=l.person_b_id
    where a.owner_id is distinct from v_owner or b.owner_id is distinct from v_owner
      or not private.can_view_member(auth.uid(),a) or not private.can_view_member(auth.uid(),b)
      or not (private.can_manage_member(auth.uid(),a) or private.can_manage_member(auth.uid(),b))
  ) then
    raise exception 'Family relationship endpoint not found.' using errcode='P0002';
  end if;

  if exists(
    select 1 from intended_family_links
    group by case when relationship_type in ('spouse','partner') then 'partner' else relationship_type end,
      case when relationship_type='parent' then person_a_id else least(person_a_id,person_b_id) end,
      case when relationship_type='parent' then person_b_id else greatest(person_a_id,person_b_id) end
    having count(*) > 1
  ) then raise exception 'Duplicate intended links are not allowed.' using errcode='22023'; end if;

  if exists(
    select 1 from intended_family_links l join public.relationships r on r.owner_id=v_owner and (
      (l.relationship_type='parent' and r.relationship_type='parent' and r.person_a_id=l.person_a_id and r.person_b_id=l.person_b_id)
      or (l.relationship_type in ('spouse','partner') and r.relationship_type in ('spouse','partner') and l.person_a_id in(r.person_a_id,r.person_b_id) and l.person_b_id in(r.person_a_id,r.person_b_id))
      or (l.relationship_type='sibling' and r.relationship_type='sibling' and l.person_a_id in(r.person_a_id,r.person_b_id) and l.person_b_id in(r.person_a_id,r.person_b_id)))
    where r.relationship_type is distinct from l.relationship_type
       or r.relationship_variant is distinct from nullif(l.variant,'reported')
       or r.start_year is distinct from l.start_year or r.end_year is distinct from l.end_year
       or r.relationship_status is distinct from l.status
       or (l.evidence_supplied and (r.confidence is distinct from l.confidence or r.provenance_note is distinct from l.provenance_note))
  ) then raise exception 'A different relationship in this category is already recorded.' using errcode='23505'; end if;

  if exists(
    with recursive parent_edges(a,b) as (
      select r.person_a_id,r.person_b_id from public.relationships r where r.owner_id=v_owner and r.relationship_type='parent'
      union select l.person_a_id,l.person_b_id from intended_family_links l where l.relationship_type='parent'
    ), paths(root,id) as (
      select a,b from parent_edges
      union select p.root,e.b from paths p join parent_edges e on e.a=p.id
    ) select 1 from paths where root=id
  ) then raise exception 'A parent relationship would create an ancestry cycle.' using errcode='22023'; end if;

  perform fm.id from public.family_members fm
  where fm.id in (select person_a_id from intended_family_links union select person_b_id from intended_family_links)
  order by fm.id for update;

  insert into public.relationships(owner_id,created_by,person_a_id,person_b_id,relationship_type,
    relationship_variant,start_year,end_year,relationship_status,confidence,provenance_note)
  select v_owner,auth.uid(),l.person_a_id,l.person_b_id,l.relationship_type,nullif(l.variant,'reported'),
    l.start_year,l.end_year,l.status,l.confidence,l.provenance_note
  from intended_family_links l
  where not exists(select 1 from public.relationships r where r.owner_id=v_owner and (
    (l.relationship_type='parent' and r.relationship_type='parent' and r.person_a_id=l.person_a_id and r.person_b_id=l.person_b_id)
    or (l.relationship_type in ('spouse','partner') and r.relationship_type in ('spouse','partner') and l.person_a_id in(r.person_a_id,r.person_b_id) and l.person_b_id in(r.person_a_id,r.person_b_id))
    or (l.relationship_type='sibling' and r.relationship_type='sibling' and l.person_a_id in(r.person_a_id,r.person_b_id) and l.person_b_id in(r.person_a_id,r.person_b_id))))
  order by l.ordinal;

  select coalesce(jsonb_agg(r.id order by l.ordinal),'[]'::jsonb) into v_result
  from intended_family_links l join public.relationships r on r.owner_id=v_owner and (
    (l.relationship_type='parent' and r.relationship_type='parent' and r.person_a_id=l.person_a_id and r.person_b_id=l.person_b_id)
    or (l.relationship_type in ('spouse','partner') and r.relationship_type=l.relationship_type and l.person_a_id in(r.person_a_id,r.person_b_id) and l.person_b_id in(r.person_a_id,r.person_b_id))
    or (l.relationship_type='sibling' and r.relationship_type='sibling' and l.person_a_id in(r.person_a_id,r.person_b_id) and l.person_b_id in(r.person_a_id,r.person_b_id)));

  insert into public.family_mutation_requests(id,actor_id,owner_id,operation,result)
  values(p_idempotency_key,auth.uid(),v_owner,'link_family_members_batch',
    jsonb_build_object('request_hash',md5(p_links::text),'result',v_result));
  return v_result;
exception when invalid_text_representation then
  raise exception 'A person ID or relationship value is malformed.' using errcode='22023';
end;
$$;

create or replace function public.link_family_members(
  p_person_a_id uuid,p_person_b_id uuid,p_relationship_type text,p_variant text default null,
  p_start_year integer default null,p_end_year integer default null,p_status text default 'unspecified'
)
returns uuid language plpgsql security definer set search_path='' set row_security=off as $$
declare v_result jsonb;
begin
  v_result:=public.link_family_members_batch(jsonb_build_array(jsonb_build_object(
    'person_a_id',p_person_a_id,'person_b_id',p_person_b_id,'relationship_type',p_relationship_type,
    'variant',p_variant,'start_year',p_start_year,'end_year',p_end_year,'status',p_status)),gen_random_uuid());
  return (v_result->>0)::uuid;
end;
$$;

create or replace function public.link_family_members(
  p_person_a_id uuid,p_person_b_id uuid,p_relationship_type text,p_variant text,
  p_start_year integer,p_end_year integer,p_status text,p_confidence text,p_provenance_note text
)
returns uuid language plpgsql security definer set search_path='' set row_security=off as $$
declare v_result jsonb;
begin
  v_result:=public.link_family_members_batch(jsonb_build_array(jsonb_build_object(
    'person_a_id',p_person_a_id,'person_b_id',p_person_b_id,'relationship_type',p_relationship_type,
    'variant',p_variant,'start_year',p_start_year,'end_year',p_end_year,'status',p_status,
    'confidence',p_confidence,'provenance_note',p_provenance_note)),gen_random_uuid());
  return (v_result->>0)::uuid;
end;
$$;

create or replace function public.link_family_members_bundle(
  p_anchor_id uuid,p_member_id uuid,p_bundle jsonb,p_idempotency_key uuid
)
returns void language plpgsql security definer set search_path='' set row_security=off as $$
declare
  v_anchor public.family_members; v_member public.family_members; v_owner uuid;
  v_primary jsonb; v_item jsonb; v_person uuid; v_links jsonb:='[]'::jsonb; v_previous jsonb;
  v_request_key uuid := (substr(md5(p_idempotency_key::text||':bundle'),1,8)||'-'||substr(md5(p_idempotency_key::text||':bundle'),9,4)||'-4'||substr(md5(p_idempotency_key::text||':bundle'),14,3)||'-a'||substr(md5(p_idempotency_key::text||':bundle'),18,3)||'-'||substr(md5(p_idempotency_key::text||':bundle'),21,12))::uuid;
  v_link_key uuid := (substr(md5(p_idempotency_key::text||':links'),1,8)||'-'||substr(md5(p_idempotency_key::text||':links'),9,4)||'-4'||substr(md5(p_idempotency_key::text||':links'),14,3)||'-a'||substr(md5(p_idempotency_key::text||':links'),18,3)||'-'||substr(md5(p_idempotency_key::text||':links'),21,12))::uuid;
begin
  if auth.uid() is null or p_idempotency_key is null then raise exception 'Authentication and an idempotency key are required.' using errcode='42501'; end if;
  select * into v_anchor from public.family_members where id=p_anchor_id;
  if not found then raise exception 'Family member not found.' using errcode='P0002'; end if;
  v_owner:=v_anchor.owner_id;
  perform private.lock_family_graph(v_owner);
  select result into v_previous from public.family_mutation_requests
  where id=v_request_key and actor_id=auth.uid() and owner_id=v_owner and operation='link_family_members_bundle';
  if found then
    if v_previous->>'request_hash' is distinct from md5(p_anchor_id::text||p_member_id::text||p_bundle::text) then
      raise exception 'That idempotency key was already used for another request.' using errcode='23505';
    end if;
    return;
  end if;
  select * into v_anchor from public.family_members where id=p_anchor_id and owner_id=v_owner;
  select * into v_member from public.family_members where id=p_member_id and owner_id=v_owner;
  if v_anchor.id is null or v_member.id is null
    or not private.can_view_member(auth.uid(),v_anchor) or not private.can_view_member(auth.uid(),v_member)
    or not(private.can_manage_member(auth.uid(),v_anchor) or private.can_manage_member(auth.uid(),v_member)) then
    raise exception 'Family member not found.' using errcode='P0002';
  end if;
  if jsonb_typeof(p_bundle)<>'object' or jsonb_typeof(coalesce(p_bundle->'parents','[]'))<>'array'
    or jsonb_typeof(coalesce(p_bundle->'partners','[]'))<>'array' then raise exception 'Invalid connection bundle.' using errcode='22023'; end if;
  v_primary:=p_bundle->'primary';
  if jsonb_typeof(v_primary) is distinct from 'object' or not (
    (coalesce(v_primary->>'type','')='parent' and coalesce(v_primary->>'direction','') in ('from-anchor','to-anchor'))
    or (coalesce(v_primary->>'type','') in ('sibling','spouse','partner') and coalesce(v_primary->>'direction','')='symmetric')
  ) then raise exception 'Invalid primary relationship type or direction.' using errcode='22023'; end if;
  if exists(select 1 from (
      select value item from jsonb_array_elements(coalesce(p_bundle->'parents','[]'))
      union all select value from jsonb_array_elements(coalesce(p_bundle->'partners','[]'))
      union all select p_bundle->'primary'
    ) items where not private.valid_relationship_evidence(coalesce(items.item->>'confidence','reported'),items.item->>'provenance_note')) then
    raise exception 'Invalid relationship confidence or provenance.' using errcode='22023';
  end if;
  if exists(select 1 from (
      select (value->>'person_id')::uuid id from jsonb_array_elements(coalesce(p_bundle->'parents','[]')) where not (value ? 'placeholder')
      union all select (value->>'person_id')::uuid from jsonb_array_elements(coalesce(p_bundle->'partners','[]')) where not (value ? 'placeholder')
    ) requested left join public.family_members fm on fm.id=requested.id
    where fm.owner_id is distinct from v_owner or not private.can_view_member(auth.uid(),fm)) then
    raise exception 'Every connected person must be visible in the same family graph.' using errcode='42501';
  end if;

  if v_primary->>'type'='parent' then
    v_links:=v_links||jsonb_build_array(v_primary||jsonb_build_object(
      'person_a_id',case when v_primary->>'direction'='from-anchor' then p_anchor_id else p_member_id end,
      'person_b_id',case when v_primary->>'direction'='from-anchor' then p_member_id else p_anchor_id end,
      'relationship_type','parent','variant',case when coalesce(v_primary->>'variant','')='unspecified' then null else v_primary->'variant' end,
      'status','unspecified'));
  elsif v_primary->>'type' in ('spouse','partner') then
    v_links:=v_links||jsonb_build_array(v_primary||jsonb_build_object('person_a_id',p_member_id,'person_b_id',p_anchor_id,'relationship_type',v_primary->>'type'));
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_bundle->'parents','[]')) loop
    if v_item?'placeholder' then
      insert into public.family_members(owner_id,created_by,first_name,surname,gender,is_placeholder,placeholder_label,family_side)
      values(v_owner,auth.uid(),'Unknown',v_member.surname,coalesce(v_item#>>'{placeholder,gender}','unspecified'),true,
        coalesce(nullif(btrim(v_item#>>'{placeholder,label}'),''),'Unknown parent of '||v_member.first_name),v_member.family_side) returning id into v_person;
    else v_person:=(v_item->>'person_id')::uuid; end if;
    v_links:=v_links||jsonb_build_array(v_item||jsonb_build_object(
      'person_a_id',v_person,'person_b_id',p_member_id,'relationship_type','parent',
      'variant',case when coalesce(v_item->>'variant','')='unspecified' then null else v_item->'variant' end,
      'status','unspecified'));
    if v_primary->>'type'='sibling' then
      v_links:=v_links||jsonb_build_array(v_item||jsonb_build_object(
        'person_a_id',v_person,'person_b_id',p_anchor_id,'relationship_type','parent',
        'variant',case when coalesce(v_item->>'variant','')='unspecified' then null else v_item->'variant' end,
        'status','unspecified'));
    end if;
  end loop;
  for v_item in select value from jsonb_array_elements(coalesce(p_bundle->'partners','[]')) loop
    if v_item?'placeholder' then
      insert into public.family_members(owner_id,created_by,first_name,surname,gender,is_placeholder,placeholder_label,family_side)
      values(v_owner,auth.uid(),'Unknown',v_member.surname,coalesce(v_item#>>'{placeholder,gender}','unspecified'),true,
        coalesce(nullif(btrim(v_item#>>'{placeholder,label}'),''),'Unknown partner of '||v_member.first_name),v_member.family_side) returning id into v_person;
    else v_person:=(v_item->>'person_id')::uuid; end if;
    v_links:=v_links||jsonb_build_array(v_item||jsonb_build_object('person_a_id',p_member_id,'person_b_id',v_person,'relationship_type',coalesce(v_item->>'type','spouse'),'status',coalesce(v_item->>'status','unspecified'),'variant',null));
    if coalesce((v_item->>'also_parent_of_anchor')::boolean,false) and v_person<>p_anchor_id then
      v_links:=v_links||jsonb_build_array(jsonb_build_object('person_a_id',v_person,'person_b_id',p_anchor_id,'relationship_type','parent','variant','biological','status','unspecified','confidence',coalesce(v_item->>'confidence','reported'),'provenance_note',v_item->>'provenance_note'));
    end if;
  end loop;
  if v_primary->>'type'='sibling' and jsonb_array_length(coalesce(p_bundle->'parents','[]'))=0 then
    v_links:=v_links||jsonb_build_array(v_primary||jsonb_build_object('person_a_id',p_member_id,'person_b_id',p_anchor_id,'relationship_type','sibling','variant','reported','status','unspecified'));
  end if;
  perform public.link_family_members_batch(v_links,v_link_key);
  insert into public.family_mutation_requests(id,actor_id,owner_id,operation,result)
  values(v_request_key,auth.uid(),v_owner,'link_family_members_bundle',jsonb_build_object(
    'request_hash',md5(p_anchor_id::text||p_member_id::text||p_bundle::text),'result',true));
end;
$$;

create or replace function public.link_family_members_bundle(p_anchor_id uuid,p_member_id uuid,p_bundle jsonb)
returns void language plpgsql security definer set search_path='' set row_security=off as $$
begin
  perform public.link_family_members_bundle(p_anchor_id,p_member_id,p_bundle,gen_random_uuid());
end;
$$;

create or replace function public.create_family_relative(
  p_anchor_id uuid,p_details jsonb,p_bundle jsonb,p_idempotency_key uuid
)
returns jsonb language plpgsql security definer set search_path='' set row_security=off as $$
declare
  v_anchor public.family_members; v_owner uuid; v_member uuid; v_stored jsonb; v_result jsonb;
  v_hash text:=md5(jsonb_build_object('anchor_id',p_anchor_id,'details',p_details,'bundle',p_bundle)::text);
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if p_details is null or jsonb_typeof(p_details)<>'object' or p_bundle is null
    or jsonb_typeof(p_bundle)<>'object' or p_idempotency_key is null then
    raise exception 'Details, relationship bundle, and idempotency key are required.' using errcode='22023';
  end if;
  select * into v_anchor from public.family_members fm where fm.id=p_anchor_id;
  if not found then raise exception 'Family member not found.' using errcode='P0002'; end if;
  v_owner:=v_anchor.owner_id;
  perform private.lock_family_graph(v_owner);
  select * into v_anchor from public.family_members fm where fm.id=p_anchor_id and fm.owner_id=v_owner for update;
  if not found or not private.can_view_member(auth.uid(),v_anchor)
    or not private.can_manage_member(auth.uid(),v_anchor) then
    raise exception 'Family member not found.' using errcode='P0002';
  end if;

  select mr.result into v_stored from public.family_mutation_requests mr
  where mr.id=p_idempotency_key and mr.actor_id=auth.uid() and mr.owner_id=v_owner
    and mr.operation='create_family_relative';
  if found then
    if v_stored->>'request_hash' is distinct from v_hash then
      raise exception 'That idempotency key was already used for another request.' using errcode='23505';
    end if;
    return v_stored->'result';
  end if;
  if exists(select 1 from public.family_mutation_requests mr where mr.id=p_idempotency_key) then
    raise exception 'That idempotency key was already used for another request.' using errcode='23505';
  end if;
  if nullif(btrim(p_details->>'first_name'),'') is null or nullif(btrim(p_details->>'surname'),'') is null then
    raise exception 'First name and surname are required.' using errcode='22023';
  end if;
  insert into public.family_members(owner_id,created_by,first_name,surname,nickname,maiden_name,alternate_names,gender,
    birth_date,birth_year,birth_approximate,birth_location,birth_place,lived_locations,lived_in,
    death_date,death_year,death_approximate,death_location,death_place,fact_confidence,provenance_note,privacy_level,family_side)
  values(v_owner,auth.uid(),btrim(p_details->>'first_name'),btrim(p_details->>'surname'),nullif(btrim(p_details->>'nickname'),''),
    nullif(btrim(p_details->>'maiden_name'),''),coalesce(p_details->'alternate_names','[]'::jsonb),coalesce(p_details->>'gender','unspecified'),
    nullif(p_details->>'birth_date','')::date,nullif(p_details->>'birth_year','')::integer,coalesce((p_details->>'birth_approximate')::boolean,false),
    p_details->'birth_location',nullif(btrim(p_details->>'birth_place'),''),coalesce(p_details->'lived_locations','[]'::jsonb),nullif(btrim(p_details->>'lived_in'),''),
    nullif(p_details->>'death_date','')::date,nullif(p_details->>'death_year','')::integer,coalesce((p_details->>'death_approximate')::boolean,false),
    p_details->'death_location',nullif(btrim(p_details->>'death_place'),''),coalesce(p_details->>'fact_confidence','reported'),
    nullif(btrim(p_details->>'provenance_note'),''),coalesce(p_details->>'privacy_level','family'),coalesce(p_details->>'family_side',v_anchor.family_side))
  returning id into v_member;
  perform public.link_family_members_bundle(p_anchor_id,v_member,p_bundle,p_idempotency_key);
  v_result:=jsonb_build_object('member_id',v_member);
  insert into public.family_mutation_requests(id,actor_id,owner_id,operation,result)
  values(p_idempotency_key,auth.uid(),v_owner,'create_family_relative',jsonb_build_object('request_hash',v_hash,'result',v_result));
  return v_result;
exception when invalid_text_representation or datetime_field_overflow then
  raise exception 'A person ID, date, year, or boolean is malformed.' using errcode='22023';
end;
$$;

create or replace function public.add_placeholder_siblings(
  p_anchor_id uuid,p_desired_total integer,p_displayed_sibling_ids uuid[]
)
returns integer language plpgsql security definer set search_path='' set row_security=off as $$
declare
  v_anchor public.family_members; v_owner uuid; v_existing integer; v_missing integer; v_index integer; v_member uuid;
  v_links jsonb := '[]'::jsonb;
begin
  select * into v_anchor from public.family_members where id=p_anchor_id;
  if not found then raise exception 'Family member not found.' using errcode='P0002'; end if;
  v_owner:=v_anchor.owner_id; perform private.lock_family_graph(v_owner);
  select * into v_anchor from public.family_members where id=p_anchor_id and owner_id=v_owner;
  if not found or not private.can_view_member(auth.uid(),v_anchor)
    or not private.can_manage_member(auth.uid(),v_anchor) then
    raise exception 'Family member not found.' using errcode='P0002';
  end if;
  if p_desired_total not between 0 and 100 then raise exception 'Sibling total must be between 0 and 100.' using errcode='22023'; end if;
  with semantic_siblings as (
    select case when r.person_a_id=p_anchor_id then r.person_b_id else r.person_a_id end id
    from public.relationships r where r.owner_id=v_owner and r.relationship_type='sibling' and p_anchor_id in(r.person_a_id,r.person_b_id)
    union
    select theirs.person_b_id from public.relationships mine join public.relationships theirs
      on theirs.owner_id=mine.owner_id and theirs.relationship_type='parent' and theirs.person_a_id=mine.person_a_id
    where mine.owner_id=v_owner and mine.relationship_type='parent' and mine.person_b_id=p_anchor_id and theirs.person_b_id<>p_anchor_id
  ) select count(*)::integer into v_existing from semantic_siblings;
  if exists(select 1 from unnest(coalesce(p_displayed_sibling_ids,'{}'::uuid[])) shown(id)
    where not exists(
      select 1 from public.relationships r where r.owner_id=v_owner and r.relationship_type='sibling'
        and p_anchor_id in(r.person_a_id,r.person_b_id) and shown.id in(r.person_a_id,r.person_b_id)
      union all
      select 1 from public.relationships mine join public.relationships theirs on theirs.owner_id=mine.owner_id
        and theirs.relationship_type='parent' and theirs.person_a_id=mine.person_a_id
      where mine.owner_id=v_owner and mine.relationship_type='parent' and mine.person_b_id=p_anchor_id and theirs.person_b_id=shown.id
    )) then raise exception 'Displayed sibling data is stale. Refresh and try again.' using errcode='40001'; end if;
  v_missing:=greatest(0,p_desired_total-v_existing);
  for v_index in 1..v_missing loop
    insert into public.family_members(owner_id,created_by,first_name,surname,gender,is_placeholder,placeholder_label,family_side)
    values(v_owner,auth.uid(),'Unknown',v_anchor.surname,'unspecified',true,'Unknown sibling '||(v_existing+v_index),v_anchor.family_side) returning id into v_member;
    v_links:=v_links||jsonb_build_array(jsonb_build_object(
      'person_a_id',v_member,'person_b_id',p_anchor_id,'relationship_type','sibling',
      'variant','reported','status','unspecified','confidence','reported'));
  end loop;
  if v_missing>0 then perform public.link_family_members_batch(v_links,gen_random_uuid()); end if;
  return v_missing;
end;
$$;

create or replace function public.add_placeholder_siblings(p_anchor_id uuid,p_desired_total integer)
returns integer language sql security definer set search_path='' set row_security=off as $$
  select public.add_placeholder_siblings(p_anchor_id,p_desired_total,'{}'::uuid[]);
$$;

create or replace function private.normalize_correction_details(
  p_member public.family_members,
  p_details jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_merged jsonb;
  v_alias jsonb;
  v_aliases jsonb := '[]'::jsonb;
  v_alias_keys text[] := '{}'::text[];
  v_alias_name text;
  v_alias_kind text;
  v_location jsonb;
  v_birth_date date;
  v_death_date date;
  v_birth_year integer;
  v_death_year integer;
  v_result jsonb;
begin
  if jsonb_typeof(p_details) <> 'object' then
    raise exception 'Correction details must be an object.' using errcode='22023';
  end if;
  if exists(
    select 1 from jsonb_object_keys(p_details) as k(key)
    where k.key <> all(array[
      'first_name','surname','nickname','maiden_name','alternate_names','gender',
      'birth_date','birth_year','birth_approximate','birth_location','birth_place',
      'lived_locations','lived_in','death_date','death_year','death_approximate',
      'death_location','death_place','fact_confidence','provenance_note','privacy_level','family_side'
    ])
  ) then
    raise exception 'Correction details contain an unknown or protected field.' using errcode='22023';
  end if;

  v_merged := private.member_edit_details(p_member) || p_details;
  if jsonb_typeof(coalesce(v_merged->'alternate_names','[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(v_merged->'alternate_names','[]'::jsonb)) > 20 then
    raise exception 'Alternate names must be an array with at most 20 entries.' using errcode='22023';
  end if;
  for v_alias in select value from jsonb_array_elements(coalesce(v_merged->'alternate_names','[]'::jsonb)) loop
    if jsonb_typeof(v_alias)<>'object' or exists(
      select 1 from jsonb_object_keys(v_alias) as k(key) where k.key <> all(array['name','kind'])
    ) then raise exception 'Invalid alternate name.' using errcode='22023'; end if;
    v_alias_name:=regexp_replace(btrim(coalesce(v_alias->>'name','')),'\s+',' ','g');
    v_alias_kind:=coalesce(nullif(v_alias->>'kind',''),'other');
    if v_alias_name='' or char_length(v_alias_name)>160
      or v_alias_kind not in ('sindhi_script','roman','former','historical','other') then
      raise exception 'Invalid alternate name.' using errcode='22023';
    end if;
    if private.norm_text(v_alias_name)=any(v_alias_keys) then continue; end if;
    v_alias_keys:=array_append(v_alias_keys,private.norm_text(v_alias_name));
    v_aliases:=v_aliases||jsonb_build_array(jsonb_build_object('name',v_alias_name,'kind',v_alias_kind));
  end loop;

  if jsonb_typeof(coalesce(v_merged->'lived_locations','[]'::jsonb))<>'array'
    or jsonb_array_length(coalesce(v_merged->'lived_locations','[]'::jsonb))>100 then
    raise exception 'Lived locations must be an array with at most 100 entries.' using errcode='22023';
  end if;
  if (v_merged->'birth_location') is not null and jsonb_typeof(v_merged->'birth_location') not in ('object','null')
    or (v_merged->'death_location') is not null and jsonb_typeof(v_merged->'death_location') not in ('object','null') then
    raise exception 'Structured locations must be objects.' using errcode='22023';
  end if;
  if exists(
    select 1 from jsonb_object_keys(case when jsonb_typeof(v_merged->'birth_location')='object'
      then v_merged->'birth_location' else '{}'::jsonb end) as k(key)
    where k.key<>all(array['providerId','city','region','country','countryCode','display','longitude','latitude'])
  ) or exists(
    select 1 from jsonb_object_keys(case when jsonb_typeof(v_merged->'death_location')='object'
      then v_merged->'death_location' else '{}'::jsonb end) as k(key)
    where k.key<>all(array['providerId','city','region','country','countryCode','display','longitude','latitude'])
  ) then raise exception 'A structured location contains an unknown field.' using errcode='22023'; end if;
  if char_length(coalesce(v_merged#>>'{birth_location,display}',''))>300
    or char_length(coalesce(v_merged#>>'{death_location,display}',''))>300
    or (nullif(v_merged#>>'{birth_location,latitude}','')::numeric is not null and nullif(v_merged#>>'{birth_location,latitude}','')::numeric not between -90 and 90)
    or (nullif(v_merged#>>'{death_location,latitude}','')::numeric is not null and nullif(v_merged#>>'{death_location,latitude}','')::numeric not between -90 and 90)
    or (nullif(v_merged#>>'{birth_location,longitude}','')::numeric is not null and nullif(v_merged#>>'{birth_location,longitude}','')::numeric not between -180 and 180)
    or (nullif(v_merged#>>'{death_location,longitude}','')::numeric is not null and nullif(v_merged#>>'{death_location,longitude}','')::numeric not between -180 and 180) then
    raise exception 'Invalid structured location.' using errcode='22023';
  end if;
  for v_location in select value from jsonb_array_elements(coalesce(v_merged->'lived_locations','[]'::jsonb)) loop
    if jsonb_typeof(v_location)<>'object' or exists(
        select 1 from jsonb_object_keys(v_location) as k(key)
        where k.key<>all(array['providerId','city','region','country','countryCode','display','longitude','latitude','residenceId','startYear','endYear'])
      ) or nullif(btrim(v_location->>'display'),'') is null or char_length(v_location->>'display')>300
      or (nullif(v_location->>'latitude','')::numeric is not null and nullif(v_location->>'latitude','')::numeric not between -90 and 90)
      or (nullif(v_location->>'longitude','')::numeric is not null and nullif(v_location->>'longitude','')::numeric not between -180 and 180)
      or (nullif(v_location->>'startYear','') is not null and nullif(v_location->>'startYear','')::integer not between 1800 and 2100)
      or (nullif(v_location->>'endYear','') is not null and nullif(v_location->>'endYear','')::integer not between 1800 and 2100)
      or (nullif(v_location->>'startYear','')::integer is not null and nullif(v_location->>'endYear','')::integer is not null
        and nullif(v_location->>'startYear','')::integer>nullif(v_location->>'endYear','')::integer) then
      raise exception 'Invalid lived location.' using errcode='22023';
    end if;
  end loop;

  v_birth_date:=nullif(v_merged->>'birth_date','')::date;
  v_death_date:=nullif(v_merged->>'death_date','')::date;
  v_birth_year:=nullif(v_merged->>'birth_year','')::integer;
  v_death_year:=nullif(v_merged->>'death_year','')::integer;
  if nullif(regexp_replace(btrim(coalesce(v_merged->>'first_name','')),'\s+',' ','g'),'') is null
    or nullif(regexp_replace(btrim(coalesce(v_merged->>'surname','')),'\s+',' ','g'),'') is null
    or char_length(regexp_replace(btrim(v_merged->>'first_name'),'\s+',' ','g'))>100
    or char_length(regexp_replace(btrim(v_merged->>'surname'),'\s+',' ','g'))>100
    or char_length(regexp_replace(btrim(coalesce(v_merged->>'nickname','')),'\s+',' ','g'))>100
    or char_length(regexp_replace(btrim(coalesce(v_merged->>'maiden_name','')),'\s+',' ','g'))>100
    or char_length(btrim(coalesce(v_merged->>'birth_place','')))>150 or char_length(btrim(coalesce(v_merged->>'death_place','')))>300
    or char_length(btrim(coalesce(v_merged->>'lived_in','')))>150 or char_length(btrim(coalesce(v_merged->>'family_side','')))>100
    or char_length(btrim(coalesce(v_merged->>'provenance_note','')))>2000 then
    raise exception 'A correction text value is missing or too long.' using errcode='22023';
  end if;
  if coalesce(v_merged->>'gender','unspecified') not in ('female','male','nonbinary','unspecified')
    or coalesce(v_merged->>'fact_confidence','reported') not in ('reported','probable','uncertain','documented','disputed')
    or coalesce(v_merged->>'privacy_level','family') not in ('private','family','match_clues')
    or coalesce(v_merged->>'family_side',p_member.family_side) not in ('You','Mother''s side','Father''s side','Partner''s side','Other') then
    raise exception 'Invalid gender, confidence, privacy, or family-side value.' using errcode='22023';
  end if;
  if (v_birth_year is not null and v_birth_year not between 1800 and extract(year from current_date)::integer)
    or (v_death_year is not null and v_death_year not between 1800 and 2200)
    or (v_birth_date is not null and (v_birth_date<date '1800-01-01' or v_birth_date>current_date))
    or (v_death_date is not null and (v_death_date<date '1800-01-01' or v_death_date>current_date))
    or (v_birth_date is not null and v_birth_year is not null and extract(year from v_birth_date)::integer<>v_birth_year)
    or (v_death_date is not null and v_death_year is not null and extract(year from v_death_date)::integer<>v_death_year)
    or (coalesce(v_birth_date,make_date(v_birth_year,1,1)) is not null
      and coalesce(v_death_date,make_date(v_death_year,12,31)) is not null
      and coalesce(v_death_date,make_date(v_death_year,12,31))<coalesce(v_birth_date,make_date(v_birth_year,1,1))) then
    raise exception 'Invalid birth or death date/year.' using errcode='22023';
  end if;

  v_result:=jsonb_build_object(
    'first_name',regexp_replace(btrim(v_merged->>'first_name'),'\s+',' ','g'),
    'surname',regexp_replace(btrim(v_merged->>'surname'),'\s+',' ','g'),
    'nickname',nullif(regexp_replace(btrim(v_merged->>'nickname'),'\s+',' ','g'),''),
    'maiden_name',nullif(regexp_replace(btrim(v_merged->>'maiden_name'),'\s+',' ','g'),''),
    'alternate_names',v_aliases,'gender',coalesce(v_merged->>'gender','unspecified'),
    'birth_date',v_birth_date,'birth_year',v_birth_year,
    'birth_approximate',coalesce((v_merged->>'birth_approximate')::boolean,false),
    'birth_location',v_merged->'birth_location','birth_place',nullif(btrim(v_merged->>'birth_place'),''),
    'lived_locations',coalesce(v_merged->'lived_locations','[]'::jsonb),'lived_in',nullif(btrim(v_merged->>'lived_in'),''),
    'death_date',v_death_date,'death_year',v_death_year,
    'death_approximate',coalesce((v_merged->>'death_approximate')::boolean,false),
    'death_location',v_merged->'death_location','death_place',nullif(btrim(v_merged->>'death_place'),''),
    'fact_confidence',coalesce(v_merged->>'fact_confidence','reported'),
    'provenance_note',nullif(btrim(v_merged->>'provenance_note'),''),
    'privacy_level',coalesce(v_merged->>'privacy_level','family'),
    'family_side',coalesce(nullif(btrim(v_merged->>'family_side'),''),p_member.family_side)
  );
  return jsonb_strip_nulls(v_result);
exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
  raise exception 'A correction date, year, boolean, or location year is malformed.' using errcode='22023';
end;
$$;

create or replace function private.normalize_correction_connections(
  p_user_id uuid,
  p_member public.family_members,
  p_connections jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_category text;
  v_item jsonb;
  v_person uuid;
  v_variant text;
  v_type text;
  v_status text;
  v_start integer;
  v_end integer;
  v_confidence text;
  v_note text;
  v_seen text[] := '{}'::text[];
  v_parents jsonb := '[]'::jsonb;
  v_partners jsonb := '[]'::jsonb;
  v_siblings jsonb := '[]'::jsonb;
  v_normalized jsonb;
begin
  if jsonb_typeof(p_connections)<>'object'
    or exists(select 1 from jsonb_object_keys(p_connections) as k(key) where k.key<>all(array['parents','partners','siblings']))
    or jsonb_typeof(coalesce(p_connections->'parents','[]'::jsonb))<>'array'
    or jsonb_typeof(coalesce(p_connections->'partners','[]'::jsonb))<>'array'
    or jsonb_typeof(coalesce(p_connections->'siblings','[]'::jsonb))<>'array' then
    raise exception 'Connection sets must contain only parent, partner, and sibling arrays.' using errcode='22023';
  end if;
  if jsonb_array_length(coalesce(p_connections->'parents','[]'::jsonb))>20
    or jsonb_array_length(coalesce(p_connections->'partners','[]'::jsonb))>50
    or jsonb_array_length(coalesce(p_connections->'siblings','[]'::jsonb))>100 then
    raise exception 'A connection set is too large.' using errcode='22023';
  end if;

  foreach v_category in array array['parents','partners','siblings'] loop
    for v_item in select value from jsonb_array_elements(coalesce(p_connections->v_category,'[]'::jsonb)) loop
      if jsonb_typeof(v_item)<>'object' or exists(
        select 1 from jsonb_object_keys(v_item) as k(key)
        where (v_category='parents' and k.key<>all(array['person_id','placeholder','variant','confidence','provenance_note']))
          or (v_category='partners' and k.key<>all(array['person_id','placeholder','type','start_year','end_year','status','confidence','provenance_note','also_parent_of_anchor']))
          or (v_category='siblings' and k.key<>all(array['person_id','variant','confidence','provenance_note']))
      ) then raise exception 'A connection contains an unknown field.' using errcode='22023'; end if;
      v_confidence:=coalesce(nullif(v_item->>'confidence',''),'reported');
      v_note:=nullif(btrim(v_item->>'provenance_note'),'');
      if not private.valid_relationship_evidence(v_confidence,v_note) then
        raise exception 'Invalid relationship confidence or provenance.' using errcode='22023';
      end if;

      if v_item ? 'placeholder' then
        if v_category='siblings' or jsonb_typeof(v_item->'placeholder')<>'object'
          or exists(select 1 from jsonb_object_keys(v_item->'placeholder') as k(key) where k.key<>all(array['label','gender']))
          or nullif(btrim(v_item#>>'{placeholder,label}'),'') is null
          or char_length(v_item#>>'{placeholder,label}')>160
          or coalesce(v_item#>>'{placeholder,gender}','unspecified') not in ('female','male','nonbinary','unspecified') then
          raise exception 'Invalid connection placeholder.' using errcode='22023';
        end if;
        v_person:=null;
      else
        v_person:=nullif(v_item->>'person_id','')::uuid;
        if v_person is null or v_person=p_member.id or not exists(
          select 1 from public.family_members fm where fm.id=v_person and fm.owner_id=p_member.owner_id
            and private.can_view_member(p_user_id,fm)
        ) then raise exception 'A connection endpoint is unavailable.' using errcode='42501'; end if;
        if (v_category||':'||v_person::text)=any(v_seen) then raise exception 'Duplicate connections are not allowed.' using errcode='22023'; end if;
        v_seen:=array_append(v_seen,v_category||':'||v_person::text);
      end if;

      if v_category='parents' then
        v_variant:=coalesce(nullif(v_item->>'variant',''),'unspecified');
        if v_variant not in ('unspecified','biological','adoptive','step','guardian') then raise exception 'Invalid parent variant.' using errcode='22023'; end if;
        if v_person is not null and exists(with recursive descendants(id) as (
          select p_member.id union select r.person_b_id from public.relationships r join descendants d on d.id=r.person_a_id
          where r.owner_id=p_member.owner_id and r.relationship_type='parent') select 1 from descendants where id=v_person) then
          raise exception 'That parent connection would create an ancestry cycle.' using errcode='22023';
        end if;
        v_parents:=v_parents||jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'person_id',v_person,'placeholder',v_item->'placeholder','variant',v_variant,
          'confidence',v_confidence,'provenance_note',v_note)));
      elsif v_category='partners' then
        v_type:=coalesce(v_item->>'type',''); v_status:=coalesce(nullif(v_item->>'status',''),'unspecified');
        v_start:=nullif(v_item->>'start_year','')::integer; v_end:=nullif(v_item->>'end_year','')::integer;
        perform coalesce((v_item->>'also_parent_of_anchor')::boolean,false);
        if v_type not in ('spouse','partner') or v_status not in ('current','former','unspecified')
          or (v_status='current' and v_end is not null) or (v_start is not null and v_start not between 1800 and 2100)
          or (v_end is not null and v_end not between 1800 and 2100) or (v_start is not null and v_end is not null and v_start>v_end) then
          raise exception 'Invalid partnership details.' using errcode='22023';
        end if;
        v_partners:=v_partners||jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'person_id',v_person,'placeholder',v_item->'placeholder','type',v_type,
          'start_year',v_start,'end_year',v_end,'status',v_status,
          'confidence',v_confidence,'provenance_note',v_note)));
      else
        v_variant:=coalesce(nullif(v_item->>'variant',''),'reported');
        if v_variant not in ('reported','half') then raise exception 'Invalid sibling variant.' using errcode='22023'; end if;
        v_siblings:=v_siblings||jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'person_id',v_person,'variant',v_variant,'confidence',v_confidence,'provenance_note',v_note)));
      end if;
    end loop;
  end loop;
  v_normalized:=jsonb_build_object('parents',v_parents,'partners',v_partners,'siblings',v_siblings);
  return private.normalize_managed_connections(v_normalized);
exception when invalid_text_representation then
  raise exception 'A connection person ID, year, or boolean is malformed.' using errcode='22023';
end;
$$;

create or replace function public.propose_family_correction(
  p_member_id uuid,p_expected_revision bigint,p_expected_relationship_hash text,
  p_details jsonb,p_connections jsonb,p_reason text default null
)
returns uuid language plpgsql security definer set search_path='' set row_security=off as $$
declare
  v_member public.family_members; v_owner uuid; v_hash text; v_id uuid; v_reviewer uuid;
  v_current_details jsonb; v_current_connections jsonb; v_details jsonb; v_connections jsonb; v_reason text;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  select * into v_member from public.family_members where id=p_member_id;
  if not found then raise exception 'Family member not found.' using errcode='P0002'; end if;
  v_owner:=v_member.owner_id; perform private.lock_family_graph(v_owner);
  select * into v_member from public.family_members where id=p_member_id and owner_id=v_owner;
  if not private.can_view_member(auth.uid(),v_member) then raise exception 'Family member not found.' using errcode='P0002'; end if;
  if private.can_manage_member(auth.uid(),v_member) then raise exception 'Editors should save this record directly.' using errcode='22023'; end if;
  v_current_connections:=private.managed_connection_snapshot(p_member_id,v_owner);
  v_hash:=md5(v_current_connections::text);
  if v_member.revision<>p_expected_revision or p_expected_relationship_hash is null or v_hash is distinct from p_expected_relationship_hash then
    raise exception 'This family member changed since you opened it. Refresh and try again.' using errcode='40001';
  end if;
  v_reason:=nullif(btrim(p_reason),'');
  if char_length(coalesce(v_reason,''))>1000 then raise exception 'Correction reason must be 1000 characters or fewer.' using errcode='22023'; end if;
  v_current_details:=private.normalize_correction_details(v_member,'{}'::jsonb);
  v_details:=private.normalize_correction_details(v_member,p_details);
  v_current_connections:=private.normalize_managed_connections(v_current_connections);
  v_connections:=private.normalize_correction_connections(auth.uid(),v_member,p_connections);
  if v_details=v_current_details and v_connections=v_current_connections then return null; end if;
  v_reviewer:=coalesce(v_member.linked_user_id,v_member.created_by,private.graph_contact_user(v_owner,auth.uid()));
  if v_reviewer is null or v_reviewer=auth.uid() then raise exception 'No separate reviewer is available for this record.'; end if;
  insert into public.profile_change_requests(member_id,proposer_user_id,reviewer_user_id,proposed_changes,
    expected_revision,expected_relationship_hash,base_snapshot,proposed_connections,reason)
  values(p_member_id,auth.uid(),v_reviewer,v_details,p_expected_revision,p_expected_relationship_hash,
    jsonb_build_object('details',v_current_details,'connections',v_current_connections),v_connections,v_reason) returning id into v_id;
  return v_id;
end;
$$;

-- Invitation acceptance merges the invited record into the claimant's identity.
-- The claimant's self record is authoritative for person-level descriptive data;
-- graph-relative fields such as family_side and is_self remain local to each graph.
create or replace function public.respond_family_invitation(p_invitation_id uuid,p_accept boolean)
returns void language plpgsql security definer set search_path='' set row_security=off as $$
declare
  v_inv public.family_invitations%rowtype;
  v_target public.family_members%rowtype;
  v_self public.family_members%rowtype;
  v_email text:=lower(coalesce(auth.jwt()->>'email',''));
  v_target_id uuid;
  v_self_id uuid;
  v_identity uuid;
begin
  if auth.uid() is null or v_email='' then raise exception 'Authentication required.' using errcode='42501'; end if;
  select fi.person_id into v_target_id from public.family_invitations fi
  where fi.id=p_invitation_id and fi.status='pending' and lower(fi.email)=v_email;
  if v_target_id is null then raise exception 'Invitation not found, expired, or already resolved.' using errcode='P0002'; end if;
  select fm.id into v_self_id from public.family_members fm
  where fm.owner_id=auth.uid() and fm.is_self order by fm.created_at,fm.id limit 1;
  if p_accept and v_self_id is null then
    raise exception 'Open Vansh once before accepting this invitation.' using errcode='22023';
  end if;

  perform private.lock_member_mutation(array_remove(array[v_target_id,v_self_id],null));
  select * into v_inv from public.family_invitations fi
  where fi.id=p_invitation_id and fi.status='pending' and lower(fi.email)=v_email for update;
  if not found or v_inv.person_id<>v_target_id then
    raise exception 'Invitation not found, expired, or already resolved.' using errcode='P0002';
  end if;
  if v_inv.expires_at<now() then
    update public.family_invitations set status='expired',responded_at=now() where id=v_inv.id;
    return;
  end if;
  if not p_accept then
    update public.family_invitations set status='rejected',accepted_user_id=auth.uid(),responded_at=now() where id=v_inv.id;
    return;
  end if;

  select * into v_target from public.family_members where id=v_target_id;
  select * into v_self from public.family_members where id=v_self_id;
  if v_target.id is null or v_self.id is null or exists(
    select 1 from public.family_members fm
    where fm.person_identity_id in (v_target.person_identity_id,v_self.person_identity_id)
      and fm.linked_user_id is not null and fm.linked_user_id<>auth.uid()
  ) then raise exception 'That family record has already been claimed by another account.' using errcode='23505'; end if;
  v_identity:=v_target.person_identity_id;
  perform set_config('vansh.system_write','on',true);
  update public.family_members fm set
    person_identity_id=v_identity,
    linked_user_id=case when fm.id=v_target.id then auth.uid() else fm.linked_user_id end,
    first_name=v_self.first_name,surname=v_self.surname,nickname=v_self.nickname,maiden_name=v_self.maiden_name,
    alternate_names=v_self.alternate_names,gender=v_self.gender,birth_year=v_self.birth_year,birth_date=v_self.birth_date,
    birth_approximate=v_self.birth_approximate,birth_location=v_self.birth_location,birth_place=v_self.birth_place,
    lived_locations=v_self.lived_locations,lived_in=v_self.lived_in,death_year=v_self.death_year,death_date=v_self.death_date,
    death_approximate=v_self.death_approximate,death_location=v_self.death_location,death_place=v_self.death_place,
    fact_confidence=v_self.fact_confidence,provenance_note=v_self.provenance_note,privacy_level=v_self.privacy_level
  where fm.id in (v_target.id,v_self.id)
     or fm.person_identity_id in (v_target.person_identity_id,v_self.person_identity_id);
  update public.family_invitations set status='accepted',accepted_user_id=auth.uid(),responded_at=now() where id=v_inv.id;
end;
$$;

create or replace function private.before_vansh_auth_user_delete()
returns trigger language plpgsql security definer set search_path='' set row_security=off as $$
declare
  v_graph uuid;
  v_graphs uuid[];
  v_members uuid[];
begin
  select array_agg(graph_id order by graph_id) into v_graphs from (
    select distinct graph_id from (
      select fm.owner_id graph_id from public.family_members fm
      where fm.owner_id=old.id or fm.linked_user_id=old.id or fm.created_by=old.id or fm.filled_by=old.id
      union
      select fi.graph_owner_id from public.family_invitations fi
      where fi.graph_owner_id=old.id or fi.inviter_id=old.id or fi.accepted_user_id=old.id
    ) affected where graph_id is not null
  ) ordered_graphs;
  select array_agg(fm.id order by fm.id) into v_members from public.family_members fm
  where fm.owner_id=any(coalesce(v_graphs,'{}'::uuid[]))
     or fm.linked_user_id=old.id or fm.created_by=old.id or fm.filled_by=old.id;

  -- This establishes identity advisory locks, graph advisory locks, and member
  -- row locks in that order before FK actions can mutate protected columns.
  perform private.lock_member_mutation(coalesce(v_members,'{}'::uuid[]),coalesce(v_graphs,'{}'::uuid[]));
  perform set_config('vansh.system_write','on',true);

  foreach v_graph in array coalesce(v_graphs,'{}'::uuid[]) loop
    insert into public.family_graphs(id,created_by)
    values(v_graph,case when v_graph=old.id then old.id else null end)
    on conflict(id) do nothing;
    if private.graph_has_other_active_user(v_graph,old.id) then
      update public.family_graphs set status='active',orphaned_at=null,retention_until=null,updated_at=now() where id=v_graph;
    else
      update public.family_graphs set status='orphaned',orphaned_at=coalesce(orphaned_at,now()),
        retention_until=coalesce(retention_until,now()+interval '30 days'),updated_at=now() where id=v_graph;
    end if;
  end loop;
  return old;
end;
$$;

alter table public.family_invitations drop constraint if exists family_invitations_status_check;
alter table public.family_invitations add constraint family_invitations_status_check
  check(status in ('pending','accepted','rejected','revoked','expired'));

create or replace function public.respond_verification_request(p_kind text,p_request_id uuid,p_accept boolean)
returns void language plpgsql security definer set search_path='' set row_security=off as $$
declare
  v_identity public.identity_claim_requests%rowtype; v_candidate public.family_members%rowtype; v_claimant public.family_members%rowtype; v_claimant_id uuid;
begin
  if p_kind='correction' then perform public.respond_profile_correction(p_request_id,p_accept); return; end if;
  if p_kind<>'identity' then
    execute 'select private.respond_verification_request_legacy($1,$2,$3)' using p_kind,p_request_id,p_accept;
    return;
  end if;
  select * into v_identity from public.identity_claim_requests where id=p_request_id;
  if not found or v_identity.status<>'pending' or not (
    (v_identity.initiated_by='claimant' and v_identity.candidate_owner_id=auth.uid())
    or (v_identity.initiated_by='record_owner' and v_identity.claimant_user_id=auth.uid())) then
    raise exception 'Identity request not found or already resolved.';
  end if;
  v_claimant_id:=v_identity.claimant_member_id;
  if p_accept and v_claimant_id is null then
    select fm.id into v_claimant_id from public.family_members fm
    where fm.owner_id=v_identity.claimant_user_id and fm.is_self order by fm.created_at,fm.id limit 1;
    if v_claimant_id is null then raise exception 'The claimant needs to open Vansh once before verification can complete.'; end if;
  end if;
  perform private.lock_member_mutation(array_remove(array[v_identity.candidate_member_id,v_claimant_id],null));
  select * into v_identity from public.identity_claim_requests where id=p_request_id and status='pending' for update;
  if not found then raise exception 'Identity request not found or already resolved.'; end if;
  if p_accept then
    select * into v_candidate from public.family_members where id=v_identity.candidate_member_id;
    select * into v_claimant from public.family_members where id=v_claimant_id;
    if v_candidate.linked_user_id is not null and v_candidate.linked_user_id<>v_identity.claimant_user_id then
      raise exception 'This profile has already been claimed by another account.';
    end if;
    perform set_config('vansh.system_write','on',true);
    update public.family_members fm set
      linked_user_id=v_identity.claimant_user_id, person_identity_id=v_candidate.person_identity_id,
      first_name=v_claimant.first_name,surname=v_claimant.surname,nickname=v_claimant.nickname,maiden_name=v_claimant.maiden_name,
      alternate_names=v_claimant.alternate_names,gender=v_claimant.gender,birth_year=v_claimant.birth_year,birth_date=v_claimant.birth_date,
      birth_approximate=v_claimant.birth_approximate,birth_location=v_claimant.birth_location,birth_place=v_claimant.birth_place,
      lived_locations=v_claimant.lived_locations,lived_in=v_claimant.lived_in,death_year=v_claimant.death_year,death_date=v_claimant.death_date,
      death_approximate=v_claimant.death_approximate,death_location=v_claimant.death_location,death_place=v_claimant.death_place,
      fact_confidence=v_claimant.fact_confidence,provenance_note=v_claimant.provenance_note,privacy_level=v_claimant.privacy_level
    where fm.id=v_candidate.id;
    update public.family_members set person_identity_id=v_candidate.person_identity_id where id=v_claimant.id;
    update public.family_members fm set
      first_name=v_claimant.first_name,surname=v_claimant.surname,nickname=v_claimant.nickname,maiden_name=v_claimant.maiden_name,
      alternate_names=v_claimant.alternate_names,gender=v_claimant.gender,birth_year=v_claimant.birth_year,birth_date=v_claimant.birth_date,
      birth_approximate=v_claimant.birth_approximate,birth_location=v_claimant.birth_location,birth_place=v_claimant.birth_place,
      lived_locations=v_claimant.lived_locations,lived_in=v_claimant.lived_in,death_year=v_claimant.death_year,death_date=v_claimant.death_date,
      death_approximate=v_claimant.death_approximate,death_location=v_claimant.death_location,death_place=v_claimant.death_place,
      fact_confidence=v_claimant.fact_confidence,provenance_note=v_claimant.provenance_note,privacy_level=v_claimant.privacy_level
    where fm.person_identity_id=v_candidate.person_identity_id and fm.id<>v_claimant.id;
    update public.identity_claim_requests set claimant_member_id=v_claimant.id where id=v_identity.id;
    insert into public.verified_identity_links(candidate_member_id,claimant_member_id,record_owner_id,claimant_user_id)
    values(v_candidate.id,v_claimant.id,v_identity.candidate_owner_id,v_identity.claimant_user_id)
    on conflict(candidate_member_id) do update set claimant_member_id=excluded.claimant_member_id,claimant_user_id=excluded.claimant_user_id,verified_at=now();
    update public.identity_claim_requests set status='rejected',resolved_at=now()
    where candidate_member_id=v_candidate.id and id<>v_identity.id and status='pending';
  end if;
  update public.identity_claim_requests set status=case when p_accept then 'accepted' else 'rejected' end,resolved_at=now() where id=v_identity.id;
end;
$$;

revoke all on function private.lock_member_mutation(uuid[],uuid[]) from public,anon,authenticated;
revoke all on function private.valid_relationship_evidence(text,text) from public,anon,authenticated;
revoke all on function private.normalize_family_member_json_nulls() from public,anon,authenticated;
revoke all on function private.normalize_managed_connections(jsonb) from public,anon,authenticated;
revoke all on function private.normalize_correction_details(public.family_members,jsonb) from public,anon,authenticated;
revoke all on function private.normalize_correction_connections(uuid,public.family_members,jsonb) from public,anon,authenticated;
revoke all on function public.link_family_members_batch(jsonb,uuid) from public,anon;
revoke all on function public.link_family_members(uuid,uuid,text,text,integer,integer,text,text,text) from public,anon;
revoke all on function public.link_family_members_bundle(uuid,uuid,jsonb,uuid) from public,anon;
revoke all on function public.add_placeholder_siblings(uuid,integer,uuid[]) from public,anon;
grant execute on function public.link_family_members_batch(jsonb,uuid) to authenticated;
grant execute on function public.link_family_members(uuid,uuid,text,text,integer,integer,text,text,text) to authenticated;
grant execute on function public.link_family_members_bundle(uuid,uuid,jsonb,uuid) to authenticated;
grant execute on function public.add_placeholder_siblings(uuid,integer,uuid[]) to authenticated;

comment on function private.lock_member_mutation(uuid[],uuid[]) is
  'Acquires identity advisory locks, sorted graph advisory locks, then sorted identity replica rows.';
