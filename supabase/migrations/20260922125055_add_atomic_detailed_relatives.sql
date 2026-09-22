-- Create named partners, children and siblings as part of one stale-checked
-- member edit. Any invalid connection rolls the entire transaction back.
create or replace function public.edit_family_member_with_new_relatives(
  p_member_id uuid,
  p_expected_revision bigint,
  p_expected_relationship_hash text,
  p_details jsonb,
  p_connections jsonb,
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
  v_member public.family_members;
  v_owner uuid;
  v_item jsonb;
  v_new record;
  v_person_details jsonb;
  v_person uuid;
  v_co_parent uuid;
  v_variant text;
  v_partners jsonb:='[]'::jsonb;
  v_links jsonb:='[]'::jsonb;
  v_created jsonb:='{"partner":{},"child":{},"sibling":{}}'::jsonb;
  v_seen_children uuid[]:='{}'::uuid[];
  v_first_name text;
  v_surname text;
  v_nickname text;
  v_maiden_name text;
  v_gender text;
  v_birth_date date;
  v_revision bigint;
  v_has_parent boolean;
  v_link_result jsonb:='[]'::jsonb;
  v_hash text:=md5(jsonb_build_object(
    'member_id',p_member_id,'expected_revision',p_expected_revision,
    'expected_relationship_hash',p_expected_relationship_hash,'details',p_details,
    'connections',p_connections,'additions',p_additions
  )::text);
  v_stored jsonb;
  v_result jsonb;
  v_link_key uuid := (substr(md5(p_idempotency_key::text||':relative-links'),1,8)||'-'||substr(md5(p_idempotency_key::text||':relative-links'),9,4)||'-4'||substr(md5(p_idempotency_key::text||':relative-links'),14,3)||'-a'||substr(md5(p_idempotency_key::text||':relative-links'),18,3)||'-'||substr(md5(p_idempotency_key::text||':relative-links'),21,12))::uuid;
begin
  if v_user is null or p_idempotency_key is null then raise exception 'Authentication and an idempotency key are required.' using errcode='42501'; end if;
  if jsonb_typeof(p_details) is distinct from 'object'
    or jsonb_typeof(p_connections) is distinct from 'object'
    or jsonb_typeof(coalesce(p_connections->'parents','[]'::jsonb))<>'array'
    or jsonb_typeof(coalesce(p_connections->'partners','[]'::jsonb))<>'array'
    or jsonb_typeof(coalesce(p_connections->'siblings','[]'::jsonb))<>'array'
    or jsonb_array_length(coalesce(p_connections->'parents','[]'::jsonb))>50
    or jsonb_array_length(coalesce(p_connections->'partners','[]'::jsonb))>50
    or jsonb_array_length(coalesce(p_connections->'siblings','[]'::jsonb))>50
    or jsonb_typeof(p_additions) is distinct from 'object'
    or jsonb_typeof(coalesce(p_additions->'children','[]'::jsonb))<>'array'
    or jsonb_typeof(coalesce(p_additions->'siblings','[]'::jsonb))<>'array'
    or jsonb_array_length(coalesce(p_additions->'children','[]'::jsonb))>20
    or jsonb_array_length(coalesce(p_additions->'siblings','[]'::jsonb))>20
    or pg_column_size(p_details)+pg_column_size(p_connections)+pg_column_size(p_additions)>1048576 then
    raise exception 'Invalid detailed-relative request.' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_object_keys(p_connections) as k(key) where k.key<>all(array['parents','partners','siblings']))
    or exists(select 1 from jsonb_object_keys(p_additions) as k(key) where k.key<>all(array['children','siblings']))
    or exists(select 1 from jsonb_object_keys(p_details) as k(key) where k.key<>all(array[
      'first_name','surname','nickname','maiden_name','alternate_names','gender','birth_date','birth_year',
      'birth_approximate','birth_location','birth_place','lived_locations','lived_in','death_date','death_year',
      'death_approximate','death_location','death_place','fact_confidence','provenance_note','privacy_level','family_side','fill_placeholder'
    ])) then
    raise exception 'Detailed-relative request contains unknown fields.' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(coalesce(p_additions->'children','[]'::jsonb)) item
      where jsonb_typeof(item)<>'object'
        or exists(select 1 from jsonb_object_keys(item) as k(key) where k.key<>all(array['new_person','person_id','co_parent_id','variant','confidence','provenance_note']))
        or ((item?'new_person')=(item?'person_id')))
    or exists(select 1 from jsonb_array_elements(coalesce(p_additions->'siblings','[]'::jsonb)) item
      where jsonb_typeof(item)<>'object' or not (item?'new_person')
        or exists(select 1 from jsonb_object_keys(item) as k(key) where k.key<>all(array['new_person','has_different_parents','confidence','provenance_note']))) then
    raise exception 'Invalid child or sibling details.' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(coalesce(p_connections->'partners','[]'::jsonb)) item
    where item?'placeholder' or ((item?'new_person') and (item?'person_id'))) then
    raise exception 'Spouses and partners require an existing person or person details.' using errcode='22023';
  end if;
  if exists(select 1 from (
      select value item from jsonb_array_elements(coalesce(p_additions->'children','[]'::jsonb))
      union all select value from jsonb_array_elements(coalesce(p_additions->'siblings','[]'::jsonb))
    ) additions where not private.valid_relationship_evidence(coalesce(additions.item->>'confidence','reported'),additions.item->>'provenance_note')) then
    raise exception 'Invalid relationship confidence or provenance.' using errcode='22023';
  end if;

  select * into v_member from public.family_members where id=p_member_id;
  if not found then raise exception 'Family member not found.' using errcode='P0002'; end if;
  v_owner:=v_member.owner_id;
  perform private.lock_family_graph(v_owner);
  select * into v_member from public.family_members where id=p_member_id and owner_id=v_owner for update;
  if not found or not private.can_manage_member(v_user,v_member) then
    raise exception 'Family member not found.' using errcode='P0002';
  end if;
  select result into v_stored from public.family_mutation_requests
  where id=p_idempotency_key and actor_id=v_user and owner_id=v_owner and operation='edit_family_member_with_new_relatives';
  if found then
    if v_stored->>'request_hash' is distinct from v_hash then
      raise exception 'That idempotency key was already used for another request.' using errcode='23505';
    end if;
    return v_stored->'result';
  end if;
  if exists(select 1 from public.family_mutation_requests where id=p_idempotency_key) then
    raise exception 'That idempotency key was already used for another request.' using errcode='23505';
  end if;

  for v_new in
    select 'partner'::text category,ordinality::text ordinal,item->'new_person' details
      from jsonb_array_elements(coalesce(p_connections->'partners','[]'::jsonb)) with ordinality entries(item,ordinality) where item?'new_person'
    union all
    select 'child',ordinality::text,item->'new_person'
      from jsonb_array_elements(coalesce(p_additions->'children','[]'::jsonb)) with ordinality entries(item,ordinality) where item?'new_person'
    union all
    select 'sibling',ordinality::text,item->'new_person'
      from jsonb_array_elements(coalesce(p_additions->'siblings','[]'::jsonb)) with ordinality entries(item,ordinality)
  loop
    v_person_details:=v_new.details;
    if jsonb_typeof(v_person_details)<>'object'
      or exists(select 1 from jsonb_object_keys(v_person_details) as k(key)
        where k.key<>all(array['first_name','surname','nickname','maiden_name','gender','birth_date'])) then
      raise exception 'Invalid new person details.' using errcode='22023';
    end if;
    v_first_name:=nullif(btrim(v_person_details->>'first_name'),'');
    v_surname:=nullif(btrim(v_person_details->>'surname'),'');
    v_nickname:=nullif(btrim(v_person_details->>'nickname'),'');
    v_maiden_name:=nullif(btrim(v_person_details->>'maiden_name'),'');
    v_gender:=coalesce(nullif(v_person_details->>'gender',''),'unspecified');
    v_birth_date:=nullif(v_person_details->>'birth_date','')::date;
    if v_first_name is null or v_surname is null
      or char_length(v_first_name)>100 or char_length(v_surname)>100
      or char_length(coalesce(v_nickname,''))>100 or char_length(coalesce(v_maiden_name,''))>160
      or v_gender not in ('female','male','nonbinary','unspecified')
      or (v_birth_date is not null and (v_birth_date<date '1800-01-01' or v_birth_date>current_date)) then
      raise exception 'Invalid new person details.' using errcode='22023';
    end if;
    if v_birth_date is not null and exists(
      select 1 from public.family_members fm where fm.owner_id=v_owner
        and lower(fm.first_name)=lower(v_first_name) and lower(fm.surname)=lower(v_surname)
        and fm.birth_date=v_birth_date
    ) then
      raise exception 'A person with those details already exists. Select them from the list instead.' using errcode='23505';
    end if;
    insert into public.family_members(
      owner_id,created_by,first_name,surname,nickname,maiden_name,gender,
      birth_date,birth_year,fact_confidence,privacy_level,family_side
    ) values(
      v_owner,v_user,v_first_name,v_surname,v_nickname,v_maiden_name,v_gender,
      v_birth_date,extract(year from v_birth_date)::integer,'reported','family',v_member.family_side
    ) returning id into v_person;
    v_created:=jsonb_set(v_created,array[v_new.category,v_new.ordinal],to_jsonb(v_person),true);
  end loop;

  for v_new in select item,ordinality::text ordinal
    from jsonb_array_elements(coalesce(p_connections->'partners','[]'::jsonb)) with ordinality entries(item,ordinality)
  loop
    if v_new.item?'new_person' then
      v_partners:=v_partners||jsonb_build_array((v_new.item-'new_person')||jsonb_build_object('person_id',v_created#>>array['partner',v_new.ordinal]));
    else
      v_partners:=v_partners||jsonb_build_array(v_new.item);
    end if;
  end loop;
  v_revision:=private.apply_family_member_edit(
    v_user,p_member_id,p_expected_revision,p_expected_relationship_hash,p_details,
    jsonb_set(p_connections,'{partners}',v_partners,true)
  );

  for v_new in select item,ordinality::text ordinal
    from jsonb_array_elements(coalesce(p_additions->'children','[]'::jsonb)) with ordinality entries(item,ordinality)
  loop
    v_person:=case when v_new.item?'new_person' then (v_created#>>array['child',v_new.ordinal])::uuid else (v_new.item->>'person_id')::uuid end;
    if v_person=p_member_id or v_person=any(v_seen_children) then
      raise exception 'A child can only be added once and cannot be the edited person.' using errcode='22023';
    end if;
    v_seen_children:=array_append(v_seen_children,v_person);
    v_variant:=nullif(coalesce(v_new.item->>'variant','unspecified'),'unspecified');
    if v_variant is not null and v_variant not in ('biological','adoptive','step','guardian') then
      raise exception 'Invalid parent variant.' using errcode='22023';
    end if;
    if not exists(select 1 from public.family_members fm where fm.id=v_person and fm.owner_id=v_owner and private.can_view_member(v_user,fm)) then
      raise exception 'Family member not found.' using errcode='P0002';
    end if;
    v_links:=v_links||jsonb_build_array(jsonb_build_object(
      'person_a_id',p_member_id,'person_b_id',v_person,'relationship_type','parent','variant',v_variant,
      'status','unspecified','confidence',coalesce(v_new.item->>'confidence','reported'),'provenance_note',v_new.item->>'provenance_note'));
    v_co_parent:=nullif(v_new.item->>'co_parent_id','')::uuid;
    if v_co_parent is not null then
      if v_co_parent in (p_member_id,v_person) or not exists(
        select 1 from public.family_members fm where fm.id=v_co_parent and fm.owner_id=v_owner and private.can_view_member(v_user,fm)
      ) or not exists(
        select 1 from public.relationships r where r.owner_id=v_owner and r.relationship_type in ('spouse','partner')
          and p_member_id in(r.person_a_id,r.person_b_id) and v_co_parent in(r.person_a_id,r.person_b_id)
      ) then raise exception 'The other parent must be a recorded partner in this family.' using errcode='22023'; end if;
      v_links:=v_links||jsonb_build_array(jsonb_build_object(
        'person_a_id',v_co_parent,'person_b_id',v_person,'relationship_type','parent','variant',v_variant,
        'status','unspecified','confidence',coalesce(v_new.item->>'confidence','reported'),'provenance_note',v_new.item->>'provenance_note'));
    end if;
  end loop;

  for v_new in select item,ordinality::text ordinal
    from jsonb_array_elements(coalesce(p_additions->'siblings','[]'::jsonb)) with ordinality entries(item,ordinality)
  loop
    v_person:=(v_created#>>array['sibling',v_new.ordinal])::uuid;
    if coalesce((v_new.item->>'has_different_parents')::boolean,false) then
      v_links:=v_links||jsonb_build_array(jsonb_build_object(
        'person_a_id',p_member_id,'person_b_id',v_person,'relationship_type','sibling','variant','half',
        'status','unspecified','confidence',coalesce(v_new.item->>'confidence','reported'),'provenance_note',v_new.item->>'provenance_note'));
    else
      v_has_parent:=false;
      for v_item in select jsonb_build_object(
          'person_a_id',r.person_a_id,'person_b_id',v_person,'relationship_type','parent','variant',r.relationship_variant,
          'status','unspecified','confidence',r.confidence,'provenance_note',r.provenance_note)
        from public.relationships r where r.owner_id=v_owner and r.relationship_type='parent' and r.person_b_id=p_member_id
      loop
        v_has_parent:=true;
        v_links:=v_links||jsonb_build_array(v_item);
      end loop;
      if not v_has_parent then
        v_links:=v_links||jsonb_build_array(jsonb_build_object(
          'person_a_id',p_member_id,'person_b_id',v_person,'relationship_type','sibling','variant','reported',
          'status','unspecified','confidence',coalesce(v_new.item->>'confidence','reported'),'provenance_note',v_new.item->>'provenance_note'));
      end if;
      if v_has_parent then
        v_links:=v_links||jsonb_build_array(jsonb_build_object(
          'person_a_id',p_member_id,'person_b_id',v_person,'relationship_type','sibling','variant','reported',
          'status','unspecified','confidence',coalesce(v_new.item->>'confidence','reported'),'provenance_note',v_new.item->>'provenance_note'));
      end if;
    end if;
  end loop;

  if jsonb_array_length(v_links)>0 then
    v_link_result:=public.link_family_members_batch(v_links,v_link_key);
  end if;
  v_result:=jsonb_build_object('revision',v_revision,'relationship_ids',v_link_result);
  insert into public.family_mutation_requests(id,actor_id,owner_id,operation,result)
  values(p_idempotency_key,v_user,v_owner,'edit_family_member_with_new_relatives',jsonb_build_object('request_hash',v_hash,'result',v_result));
  return v_result;
exception when invalid_text_representation or datetime_field_overflow then
  raise exception 'A new relative ID, date, or value is malformed.' using errcode='22023';
end;
$$;

revoke all on function public.edit_family_member_with_new_relatives(uuid,bigint,text,jsonb,jsonb,jsonb,uuid) from public,anon;
grant execute on function public.edit_family_member_with_new_relatives(uuid,bigint,text,jsonb,jsonb,jsonb,uuid) to authenticated;
