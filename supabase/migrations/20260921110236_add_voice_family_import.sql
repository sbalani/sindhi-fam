create or replace function public.import_voice_family_story(
  p_narrator_id uuid,
  p_people jsonb,
  p_relationships jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_narrator public.family_members;
  v_owner uuid;
  v_previous jsonb;
  v_hash text := md5(jsonb_build_object(
    'narrator_id', p_narrator_id,
    'people', p_people,
    'relationships', p_relationships
  )::text);
  v_person jsonb;
  v_relationship jsonb;
  v_member_id uuid;
  v_from_id uuid;
  v_to_id uuid;
  v_id_map jsonb := '{}'::jsonb;
  v_links jsonb := '[]'::jsonb;
  v_link_key uuid := (substr(md5(p_idempotency_key::text || ':voice-links'),1,8) || '-' ||
    substr(md5(p_idempotency_key::text || ':voice-links'),9,4) || '-4' ||
    substr(md5(p_idempotency_key::text || ':voice-links'),14,3) || '-a' ||
    substr(md5(p_idempotency_key::text || ':voice-links'),18,3) || '-' ||
    substr(md5(p_idempotency_key::text || ':voice-links'),21,12))::uuid;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if p_narrator_id is null or p_idempotency_key is null
    or jsonb_typeof(p_people) is distinct from 'array'
    or jsonb_typeof(p_relationships) is distinct from 'array'
    or jsonb_array_length(p_people) not between 2 and 50
    or jsonb_array_length(p_relationships) not between 1 and 100 then
    raise exception 'A narrator, 2-50 people, 1-100 relationships, and an idempotency key are required.' using errcode='22023';
  end if;

  select * into v_narrator from public.family_members where id=p_narrator_id;
  if not found or not private.can_manage_member(auth.uid(),v_narrator) then
    raise exception 'Narrator not found.' using errcode='P0002';
  end if;
  v_owner := v_narrator.owner_id;
  perform private.lock_family_graph(v_owner);

  select result into v_previous from public.family_mutation_requests
  where id=p_idempotency_key and actor_id=auth.uid() and owner_id=v_owner and operation='import_voice_family_story';
  if found then
    if v_previous->>'request_hash' is distinct from v_hash then
      raise exception 'That idempotency key was already used for another request.' using errcode='23505';
    end if;
    return v_previous->'result';
  end if;
  if exists(select 1 from public.family_mutation_requests where id=p_idempotency_key) then
    raise exception 'That idempotency key was already used for another request.' using errcode='23505';
  end if;

  create temporary table if not exists intended_voice_people(
    ordinal bigint,
    temp_id text primary key,
    existing_id uuid,
    resolved_id uuid,
    payload jsonb
  ) on commit drop;
  truncate intended_voice_people;

  insert into intended_voice_people(ordinal,temp_id,existing_id,payload)
  select item.ordinality, nullif(btrim(item.value->>'temp_id'),''),
    nullif(item.value->>'existing_id','')::uuid, item.value
  from jsonb_array_elements(p_people) with ordinality item(value,ordinality);

  if exists(select 1 from intended_voice_people where temp_id is null)
    or not exists(select 1 from intended_voice_people where existing_id=p_narrator_id)
    or exists(
      select 1 from intended_voice_people intended
      join public.family_members member on member.id=intended.existing_id
      where intended.existing_id is not null and (
        member.owner_id is distinct from v_owner or not private.can_view_member(auth.uid(),member)
      )
    )
    or exists(
      select 1 from intended_voice_people intended
      left join public.family_members member on member.id=intended.existing_id
      where intended.existing_id is not null and member.id is null
    ) then
    raise exception 'Every existing person must be visible in the narrator family.' using errcode='42501';
  end if;

  if exists(
    with recursive edges(a,b) as (
      select value->>'from_temp_id',value->>'to_temp_id' from jsonb_array_elements(p_relationships)
      union all
      select value->>'to_temp_id',value->>'from_temp_id' from jsonb_array_elements(p_relationships)
    ), reached(id) as (
      select temp_id from intended_voice_people where existing_id=p_narrator_id
      union
      select edges.b from reached join edges on edges.a=reached.id
    )
    select 1 from intended_voice_people where temp_id not in (select id from reached)
  ) then
    raise exception 'Every imported person must connect to the narrator.' using errcode='22023';
  end if;

  update intended_voice_people set resolved_id=existing_id where existing_id is not null;
  for v_person in select payload from intended_voice_people where existing_id is null order by ordinal loop
    if nullif(btrim(v_person->>'first_name'),'') is null or nullif(btrim(v_person->>'surname'),'') is null then
      raise exception 'Every new person needs a first name and surname.' using errcode='22023';
    end if;
    insert into public.family_members(
      owner_id,created_by,first_name,surname,gender,birth_year,birth_approximate,
      birth_place,lived_in,is_placeholder,placeholder_label,fact_confidence,provenance_note,privacy_level,family_side
    ) values (
      v_owner,auth.uid(),btrim(v_person->>'first_name'),btrim(v_person->>'surname'),
      coalesce(nullif(v_person->>'gender',''),'unspecified'),nullif(v_person->>'birth_year','')::integer,
      coalesce((v_person->>'birth_approximate')::boolean,false),nullif(btrim(v_person->>'birth_place'),''),
      nullif(btrim(v_person->>'lived_in'),''),coalesce((v_person->>'is_placeholder')::boolean,false),
      nullif(btrim(v_person->>'placeholder_label'),''),'reported',nullif(btrim(v_person->>'provenance_note'),''),
      'family',v_narrator.family_side
    ) returning id into v_member_id;
    update intended_voice_people set resolved_id=v_member_id where temp_id=v_person->>'temp_id';
  end loop;

  select coalesce(jsonb_object_agg(temp_id,resolved_id),'{}'::jsonb) into v_id_map from intended_voice_people;

  for v_relationship in select value from jsonb_array_elements(p_relationships) loop
    v_from_id := null;
    v_to_id := null;
    select resolved_id into v_from_id from intended_voice_people where temp_id=v_relationship->>'from_temp_id';
    select resolved_id into v_to_id from intended_voice_people where temp_id=v_relationship->>'to_temp_id';
    if v_from_id is null or v_to_id is null then
      raise exception 'A relationship references a person outside this import.' using errcode='22023';
    end if;
    v_links := v_links || jsonb_build_array(jsonb_build_object(
      'person_a_id',v_from_id,
      'person_b_id',v_to_id,
      'relationship_type',v_relationship->>'relationship_type',
      'variant',v_relationship->'variant',
      'status','unspecified',
      'confidence',coalesce(nullif(v_relationship->>'confidence',''),'reported'),
      'provenance_note',nullif(btrim(v_relationship->>'provenance_note'),'')
    ));
  end loop;

  perform public.link_family_members_batch(v_links,v_link_key);
  v_result := jsonb_build_object(
    'member_ids',v_id_map,
    'created_count',(select count(*) from intended_voice_people where existing_id is null),
    'relationship_count',jsonb_array_length(v_links)
  );
  insert into public.family_mutation_requests(id,actor_id,owner_id,operation,result)
  values(p_idempotency_key,auth.uid(),v_owner,'import_voice_family_story',jsonb_build_object('request_hash',v_hash,'result',v_result));
  return v_result;
exception when invalid_text_representation or datetime_field_overflow then
  raise exception 'A person ID, year, or relationship value is malformed.' using errcode='22023';
end;
$$;

revoke all on function public.import_voice_family_story(uuid,jsonb,jsonb,uuid) from public,anon;
grant execute on function public.import_voice_family_story(uuid,jsonb,jsonb,uuid) to authenticated;
