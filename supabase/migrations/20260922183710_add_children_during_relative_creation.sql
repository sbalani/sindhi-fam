-- Create a family member and their newly entered children in one transaction.
create or replace function public.create_family_relative_with_new_children(
  p_anchor_id uuid,
  p_details jsonb,
  p_bundle jsonb,
  p_additions jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user uuid:=auth.uid();
  v_anchor public.family_members;
  v_member public.family_members;
  v_owner uuid;
  v_item jsonb;
  v_person uuid;
  v_co_parent uuid;
  v_variant text;
  v_first_name text;
  v_surname text;
  v_nickname text;
  v_maiden_name text;
  v_gender text;
  v_birth_date date;
  v_links jsonb:='[]'::jsonb;
  v_relationship_ids jsonb:='[]'::jsonb;
  v_child_ids jsonb:='[]'::jsonb;
  v_hash text:=md5(jsonb_build_object(
    'anchor_id',p_anchor_id,'details',p_details,'bundle',p_bundle,'additions',p_additions
  )::text);
  v_stored jsonb;
  v_result jsonb;
  v_create_key uuid := (substr(md5(p_idempotency_key::text||':create-relative'),1,8)||'-'||substr(md5(p_idempotency_key::text||':create-relative'),9,4)||'-4'||substr(md5(p_idempotency_key::text||':create-relative'),14,3)||'-a'||substr(md5(p_idempotency_key::text||':create-relative'),18,3)||'-'||substr(md5(p_idempotency_key::text||':create-relative'),21,12))::uuid;
  v_link_key uuid := (substr(md5(p_idempotency_key::text||':new-child-links'),1,8)||'-'||substr(md5(p_idempotency_key::text||':new-child-links'),9,4)||'-4'||substr(md5(p_idempotency_key::text||':new-child-links'),14,3)||'-a'||substr(md5(p_idempotency_key::text||':new-child-links'),18,3)||'-'||substr(md5(p_idempotency_key::text||':new-child-links'),21,12))::uuid;
begin
  if v_user is null or p_idempotency_key is null then
    raise exception 'Authentication and an idempotency key are required.' using errcode='42501';
  end if;
  if jsonb_typeof(p_additions) is distinct from 'object'
    or exists(select 1 from jsonb_object_keys(p_additions) as k(key) where k.key<>'children')
    or jsonb_typeof(coalesce(p_additions->'children','[]'::jsonb))<>'array'
    or jsonb_array_length(coalesce(p_additions->'children','[]'::jsonb)) not between 1 and 20
    or pg_column_size(p_details)+pg_column_size(p_bundle)+pg_column_size(p_additions)>1048576 then
    raise exception 'Invalid new-child request.' using errcode='22023';
  end if;
  if exists(
    select 1 from jsonb_array_elements(p_additions->'children') item
    where jsonb_typeof(item)<>'object' or not (item?'new_person')
      or exists(select 1 from jsonb_object_keys(item) as k(key)
        where k.key<>all(array['new_person','co_parent_id','variant','confidence','provenance_note']))
      or jsonb_typeof(item->'new_person')<>'object'
      or exists(select 1 from jsonb_object_keys(item->'new_person') as k(key)
        where k.key<>all(array['first_name','surname','nickname','maiden_name','gender','birth_date']))
      or not private.valid_relationship_evidence(coalesce(item->>'confidence','reported'),item->>'provenance_note')
  ) then
    raise exception 'Invalid new child details.' using errcode='22023';
  end if;

  select * into v_anchor from public.family_members where id=p_anchor_id;
  if not found then raise exception 'Family member not found.' using errcode='P0002'; end if;
  v_owner:=v_anchor.owner_id;
  perform private.lock_family_graph(v_owner);
  select * into v_anchor from public.family_members where id=p_anchor_id and owner_id=v_owner for update;
  if not found or not private.can_view_member(v_user,v_anchor) or not private.can_manage_member(v_user,v_anchor) then
    raise exception 'Family member not found.' using errcode='P0002';
  end if;

  select result into v_stored from public.family_mutation_requests
  where id=p_idempotency_key and actor_id=v_user and owner_id=v_owner
    and operation='create_family_relative_with_new_children';
  if found then
    if v_stored->>'request_hash' is distinct from v_hash then
      raise exception 'That idempotency key was already used for another request.' using errcode='23505';
    end if;
    return v_stored->'result';
  end if;
  if exists(select 1 from public.family_mutation_requests where id=p_idempotency_key) then
    raise exception 'That idempotency key was already used for another request.' using errcode='23505';
  end if;

  v_result:=public.create_family_relative(p_anchor_id,p_details,p_bundle,v_create_key);
  select * into v_member from public.family_members
  where id=(v_result->>'member_id')::uuid and owner_id=v_owner for update;
  if not found then raise exception 'Created family member was not found.' using errcode='P0002'; end if;

  for v_item in select value from jsonb_array_elements(p_additions->'children') loop
    v_first_name:=nullif(btrim(v_item#>>'{new_person,first_name}'),'');
    v_surname:=nullif(btrim(v_item#>>'{new_person,surname}'),'');
    v_nickname:=nullif(btrim(v_item#>>'{new_person,nickname}'),'');
    v_maiden_name:=nullif(btrim(v_item#>>'{new_person,maiden_name}'),'');
    v_gender:=coalesce(nullif(v_item#>>'{new_person,gender}',''),'unspecified');
    v_birth_date:=nullif(v_item#>>'{new_person,birth_date}','')::date;
    if v_first_name is null or v_surname is null
      or char_length(v_first_name)>100 or char_length(v_surname)>100
      or char_length(coalesce(v_nickname,''))>100 or char_length(coalesce(v_maiden_name,''))>160
      or v_gender not in ('female','male','nonbinary','unspecified')
      or (v_birth_date is not null and (v_birth_date<date '1800-01-01' or v_birth_date>current_date)) then
      raise exception 'Invalid new child details.' using errcode='22023';
    end if;
    if v_birth_date is not null and exists(
      select 1 from public.family_members fm where fm.owner_id=v_owner
        and lower(fm.first_name)=lower(v_first_name) and lower(fm.surname)=lower(v_surname)
        and fm.birth_date=v_birth_date
    ) then
      raise exception 'A person with those details already exists. Select them from the list instead.' using errcode='23505';
    end if;
    v_variant:=nullif(coalesce(v_item->>'variant','unspecified'),'unspecified');
    if v_variant is not null and v_variant not in ('biological','adoptive','step','guardian') then
      raise exception 'Invalid parent variant.' using errcode='22023';
    end if;

    insert into public.family_members(
      owner_id,created_by,first_name,surname,nickname,maiden_name,gender,
      birth_date,birth_year,fact_confidence,privacy_level,family_side
    ) values(
      v_owner,v_user,v_first_name,v_surname,v_nickname,v_maiden_name,v_gender,
      v_birth_date,extract(year from v_birth_date)::integer,'reported','family',v_member.family_side
    ) returning id into v_person;
    v_child_ids:=v_child_ids||to_jsonb(v_person);
    v_links:=v_links||jsonb_build_array(jsonb_build_object(
      'person_a_id',v_member.id,'person_b_id',v_person,'relationship_type','parent','variant',v_variant,
      'status','unspecified','confidence',coalesce(v_item->>'confidence','reported'),'provenance_note',v_item->>'provenance_note'));

    v_co_parent:=nullif(v_item->>'co_parent_id','')::uuid;
    if v_co_parent is not null then
      if v_co_parent in (v_member.id,v_person) or not exists(
        select 1 from public.family_members fm where fm.id=v_co_parent and fm.owner_id=v_owner and private.can_view_member(v_user,fm)
      ) or not exists(
        select 1 from public.relationships r where r.owner_id=v_owner and r.relationship_type in ('spouse','partner')
          and v_member.id in(r.person_a_id,r.person_b_id) and v_co_parent in(r.person_a_id,r.person_b_id)
      ) then
        raise exception 'The other parent must be a recorded partner in this family.' using errcode='22023';
      end if;
      v_links:=v_links||jsonb_build_array(jsonb_build_object(
        'person_a_id',v_co_parent,'person_b_id',v_person,'relationship_type','parent','variant',v_variant,
        'status','unspecified','confidence',coalesce(v_item->>'confidence','reported'),'provenance_note',v_item->>'provenance_note'));
    end if;
  end loop;

  v_relationship_ids:=public.link_family_members_batch(v_links,v_link_key);
  v_result:=v_result||jsonb_build_object('child_ids',v_child_ids,'relationship_ids',v_relationship_ids);
  insert into public.family_mutation_requests(id,actor_id,owner_id,operation,result)
  values(p_idempotency_key,v_user,v_owner,'create_family_relative_with_new_children',jsonb_build_object(
    'request_hash',v_hash,'result',v_result));
  return v_result;
exception when invalid_text_representation or datetime_field_overflow then
  raise exception 'A person ID, date, or value is malformed.' using errcode='22023';
end;
$$;

revoke all on function public.create_family_relative_with_new_children(uuid,jsonb,jsonb,jsonb,uuid) from public,anon;
grant execute on function public.create_family_relative_with_new_children(uuid,jsonb,jsonb,jsonb,uuid) to authenticated;
