-- Treat the anchor as authorization context, not a mandatory relationship.
-- New relatives may instead be connected through parents, children, or partners.

create or replace function public.link_family_members_bundle(
  p_anchor_id uuid,p_member_id uuid,p_bundle jsonb,p_idempotency_key uuid
)
returns void language plpgsql security definer set search_path='' set row_security=off as $$
declare
  v_anchor public.family_members; v_member public.family_members; v_owner uuid;
  v_fallback jsonb; v_item jsonb; v_person uuid; v_links jsonb:='[]'::jsonb; v_previous jsonb;
  v_legacy_primary boolean;
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
    or not private.can_manage_member(auth.uid(),v_anchor) then
    raise exception 'Family member not found.' using errcode='P0002';
  end if;
  if p_bundle is null or jsonb_typeof(p_bundle)<>'object'
    or jsonb_typeof(coalesce(p_bundle->'parents','[]'))<>'array'
    or jsonb_typeof(coalesce(p_bundle->'children','[]'))<>'array'
    or jsonb_typeof(coalesce(p_bundle->'partners','[]'))<>'array'
    or jsonb_array_length(coalesce(p_bundle->'parents','[]'))>50
    or jsonb_array_length(coalesce(p_bundle->'children','[]'))>50
    or jsonb_array_length(coalesce(p_bundle->'partners','[]'))>50 then
    raise exception 'Invalid connection bundle.' using errcode='22023';
  end if;

  v_legacy_primary:=not (p_bundle?'fallback') and (p_bundle?'primary');
  v_fallback:=coalesce(p_bundle->'fallback',p_bundle->'primary');
  if jsonb_typeof(v_fallback) not in ('object','null') then
    raise exception 'Invalid fallback relationship.' using errcode='22023';
  end if;
  if jsonb_typeof(v_fallback)='object' and not (
    (coalesce(v_fallback->>'type','')='parent' and coalesce(v_fallback->>'direction','') in ('from-anchor','to-anchor'))
    or (coalesce(v_fallback->>'type','') in ('sibling','spouse','partner') and coalesce(v_fallback->>'direction','')='symmetric')
  ) then raise exception 'Invalid fallback relationship type or direction.' using errcode='22023'; end if;
  if not v_legacy_primary and jsonb_typeof(v_fallback)='object' and exists(select 1 from (
      select value from jsonb_array_elements(coalesce(p_bundle->'parents','[]')) where not (value ? 'placeholder') and nullif(value->>'person_id','') is not null
      union all select value from jsonb_array_elements(coalesce(p_bundle->'children','[]')) where nullif(value->>'person_id','') is not null
      union all select value from jsonb_array_elements(coalesce(p_bundle->'partners','[]')) where not (value ? 'placeholder') and nullif(value->>'person_id','') is not null
    ) connected) then
    raise exception 'A fallback relationship cannot be combined with an existing parent, child, or partner.' using errcode='22023';
  end if;

  if exists(select 1 from (
      select value item from jsonb_array_elements(coalesce(p_bundle->'parents','[]'))
      union all select value from jsonb_array_elements(coalesce(p_bundle->'children','[]'))
      union all select value from jsonb_array_elements(coalesce(p_bundle->'partners','[]'))
      union all select v_fallback where jsonb_typeof(v_fallback)='object'
    ) items where not private.valid_relationship_evidence(coalesce(items.item->>'confidence','reported'),items.item->>'provenance_note')) then
    raise exception 'Invalid relationship confidence or provenance.' using errcode='22023';
  end if;
  if exists(select 1 from (
      select (value->>'person_id')::uuid id from jsonb_array_elements(coalesce(p_bundle->'parents','[]')) where not (value ? 'placeholder')
      union all select (value->>'person_id')::uuid from jsonb_array_elements(coalesce(p_bundle->'children','[]'))
      union all select (value->>'person_id')::uuid from jsonb_array_elements(coalesce(p_bundle->'partners','[]')) where not (value ? 'placeholder')
    ) requested left join public.family_members fm on fm.id=requested.id
    where fm.owner_id is distinct from v_owner or not private.can_view_member(auth.uid(),fm)) then
    raise exception 'Every connected person must be visible in the same family graph.' using errcode='42501';
  end if;
  if exists(select 1 from (
      select 'parent' category,value->>'person_id' person_id from jsonb_array_elements(coalesce(p_bundle->'parents','[]')) where not (value ? 'placeholder')
      union all select 'child',value->>'person_id' from jsonb_array_elements(coalesce(p_bundle->'children','[]'))
      union all select 'partner',value->>'person_id' from jsonb_array_elements(coalesce(p_bundle->'partners','[]')) where not (value ? 'placeholder')
    ) requested group by category,person_id having count(*)>1) then
    raise exception 'The same person cannot be selected twice in one connection group.' using errcode='22023';
  end if;
  if jsonb_typeof(v_fallback) is distinct from 'object' and not exists(select 1 from (
      select value from jsonb_array_elements(coalesce(p_bundle->'parents','[]')) where not (value ? 'placeholder') and nullif(value->>'person_id','') is not null
      union all select value from jsonb_array_elements(coalesce(p_bundle->'children','[]')) where nullif(value->>'person_id','') is not null
      union all select value from jsonb_array_elements(coalesce(p_bundle->'partners','[]')) where not (value ? 'placeholder') and nullif(value->>'person_id','') is not null
    ) connected) then
    raise exception 'Choose an existing parent, child, or partner, or provide a fallback relationship.' using errcode='22023';
  end if;

  if jsonb_typeof(v_fallback)='object' and v_fallback->>'type'='parent' then
    v_links:=v_links||jsonb_build_array(v_fallback||jsonb_build_object(
      'person_a_id',case when v_fallback->>'direction'='from-anchor' then p_anchor_id else p_member_id end,
      'person_b_id',case when v_fallback->>'direction'='from-anchor' then p_member_id else p_anchor_id end,
      'relationship_type','parent','variant',case when coalesce(v_fallback->>'variant','')='unspecified' then null else v_fallback->'variant' end,
      'status','unspecified'));
  elsif jsonb_typeof(v_fallback)='object' and v_fallback->>'type' in ('spouse','partner') then
    v_links:=v_links||jsonb_build_array(v_fallback||jsonb_build_object(
      'person_a_id',p_member_id,'person_b_id',p_anchor_id,'relationship_type',v_fallback->>'type','variant',null));
  elsif jsonb_typeof(v_fallback)='object' and v_fallback->>'type'='sibling'
    and (not v_legacy_primary or jsonb_array_length(coalesce(p_bundle->'parents','[]'))=0) then
    v_links:=v_links||jsonb_build_array(v_fallback||jsonb_build_object(
      'person_a_id',p_member_id,'person_b_id',p_anchor_id,'relationship_type','sibling','variant','reported'));
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_bundle->'parents','[]')) loop
    if v_item?'placeholder' then
      insert into public.family_members(owner_id,created_by,first_name,surname,gender,is_placeholder,placeholder_label,family_side)
      values(v_owner,auth.uid(),'Unknown',v_member.surname,coalesce(v_item#>>'{placeholder,gender}','unspecified'),true,
        coalesce(nullif(btrim(v_item#>>'{placeholder,label}'),''),'Unknown parent of '||v_member.first_name),v_member.family_side) returning id into v_person;
    else v_person:=(v_item->>'person_id')::uuid; end if;
    v_links:=v_links||jsonb_build_array(v_item||jsonb_build_object(
      'person_a_id',v_person,'person_b_id',p_member_id,'relationship_type','parent',
      'variant',case when coalesce(v_item->>'variant','')='unspecified' then null else v_item->'variant' end,'status','unspecified'));
    if v_legacy_primary and v_fallback->>'type'='sibling' then
      v_links:=v_links||jsonb_build_array(v_item||jsonb_build_object(
        'person_a_id',v_person,'person_b_id',p_anchor_id,'relationship_type','parent',
        'variant',case when coalesce(v_item->>'variant','')='unspecified' then null else v_item->'variant' end,'status','unspecified'));
    end if;
  end loop;
  for v_item in select value from jsonb_array_elements(coalesce(p_bundle->'children','[]')) loop
    v_links:=v_links||jsonb_build_array(v_item||jsonb_build_object(
      'person_a_id',p_member_id,'person_b_id',(v_item->>'person_id')::uuid,'relationship_type','parent',
      'variant',case when coalesce(v_item->>'variant','')='unspecified' then null else v_item->'variant' end,'status','unspecified'));
  end loop;
  for v_item in select value from jsonb_array_elements(coalesce(p_bundle->'partners','[]')) loop
    if v_item?'placeholder' then
      insert into public.family_members(owner_id,created_by,first_name,surname,gender,is_placeholder,placeholder_label,family_side)
      values(v_owner,auth.uid(),'Unknown',v_member.surname,coalesce(v_item#>>'{placeholder,gender}','unspecified'),true,
        coalesce(nullif(btrim(v_item#>>'{placeholder,label}'),''),'Unknown partner of '||v_member.first_name),v_member.family_side) returning id into v_person;
    else v_person:=(v_item->>'person_id')::uuid; end if;
    v_links:=v_links||jsonb_build_array(v_item||jsonb_build_object(
      'person_a_id',p_member_id,'person_b_id',v_person,'relationship_type',coalesce(v_item->>'type','spouse'),
      'status',coalesce(v_item->>'status','unspecified'),'variant',null));
    if v_legacy_primary and coalesce((v_item->>'also_parent_of_anchor')::boolean,false) and v_person<>p_anchor_id then
      v_links:=v_links||jsonb_build_array(jsonb_build_object(
        'person_a_id',v_person,'person_b_id',p_anchor_id,'relationship_type','parent','variant','biological',
        'status','unspecified','confidence',coalesce(v_item->>'confidence','reported'),'provenance_note',v_item->>'provenance_note'));
    end if;
  end loop;
  perform public.link_family_members_batch(v_links,v_link_key);
  insert into public.family_mutation_requests(id,actor_id,owner_id,operation,result)
  values(v_request_key,auth.uid(),v_owner,'link_family_members_bundle',jsonb_build_object(
    'request_hash',md5(p_anchor_id::text||p_member_id::text||p_bundle::text),'result',true));
exception when invalid_text_representation then
  raise exception 'A person ID or relationship value is malformed.' using errcode='22023';
end;
$$;

create or replace function public.link_family_members_bundle(p_anchor_id uuid,p_member_id uuid,p_bundle jsonb)
returns void language plpgsql security definer set search_path='' set row_security=off as $$
begin
  perform public.link_family_members_bundle(p_anchor_id,p_member_id,p_bundle,gen_random_uuid());
end;
$$;

revoke all on function public.link_family_members_bundle(uuid,uuid,jsonb,uuid) from public,anon;
revoke all on function public.link_family_members_bundle(uuid,uuid,jsonb) from public,anon;
grant execute on function public.link_family_members_bundle(uuid,uuid,jsonb,uuid) to authenticated;
grant execute on function public.link_family_members_bundle(uuid,uuid,jsonb) to authenticated;
