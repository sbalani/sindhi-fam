-- Create a fully named spouse/partner and apply the edited connection set in
-- one transaction. This prevents failed edits from leaving orphan people.
create or replace function public.edit_family_member_with_new_partners(
  p_member_id uuid,
  p_expected_revision bigint,
  p_expected_relationship_hash text,
  p_details jsonb,
  p_connections jsonb
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
  v_person_details jsonb;
  v_person uuid;
  v_partners jsonb:='[]'::jsonb;
  v_first_name text;
  v_surname text;
  v_nickname text;
  v_maiden_name text;
  v_gender text;
  v_birth_date date;
begin
  if v_user is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if jsonb_typeof(p_connections)<>'object'
    or jsonb_typeof(coalesce(p_connections->'partners','[]'::jsonb))<>'array' then
    raise exception 'Connection sets must be an object with a partner array.' using errcode='22023';
  end if;
  select * into v_member from public.family_members where id=p_member_id;
  if not found then raise exception 'Family member not found.' using errcode='P0002'; end if;
  v_owner:=v_member.owner_id;
  perform private.lock_family_graph(v_owner);
  select * into v_member from public.family_members where id=p_member_id and owner_id=v_owner for update;
  if not found or not private.can_manage_member(v_user,v_member) then
    raise exception 'Family member not found.' using errcode='P0002';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_connections->'partners','[]'::jsonb)) loop
    if v_item ? 'new_person' then
      if v_item ? 'person_id' or v_item ? 'placeholder' or jsonb_typeof(v_item->'new_person')<>'object'
        or exists(select 1 from jsonb_object_keys(v_item->'new_person') as k(key)
          where k.key<>all(array['first_name','surname','nickname','maiden_name','gender','birth_date'])) then
        raise exception 'Invalid new spouse or partner details.' using errcode='22023';
      end if;
      v_person_details:=v_item->'new_person';
      v_first_name:=nullif(btrim(v_person_details->>'first_name'),'');
      v_surname:=nullif(btrim(v_person_details->>'surname'),'');
      v_nickname:=nullif(btrim(v_person_details->>'nickname'),'');
      v_maiden_name:=nullif(btrim(v_person_details->>'maiden_name'),'');
      v_gender:=coalesce(nullif(v_person_details->>'gender',''),'unspecified');
      v_birth_date:=nullif(v_person_details->>'birth_date','')::date;
      if v_first_name is null or v_surname is null
        or char_length(v_first_name)>160 or char_length(v_surname)>160
        or char_length(coalesce(v_nickname,''))>100 or char_length(coalesce(v_maiden_name,''))>160
        or v_gender not in ('female','male','nonbinary','unspecified')
        or (v_birth_date is not null and extract(year from v_birth_date)::integer not between 1800 and 2200) then
        raise exception 'Invalid new spouse or partner details.' using errcode='22023';
      end if;
      if v_birth_date is not null and exists(
        select 1 from public.family_members fm
        where fm.owner_id=v_owner and lower(fm.first_name)=lower(v_first_name)
          and lower(fm.surname)=lower(v_surname) and fm.birth_date=v_birth_date
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
      v_partners:=v_partners||jsonb_build_array((v_item-'new_person')||jsonb_build_object('person_id',v_person));
    else
      v_partners:=v_partners||jsonb_build_array(v_item);
    end if;
  end loop;
  return private.apply_family_member_edit(
    v_user,p_member_id,p_expected_revision,p_expected_relationship_hash,p_details,
    jsonb_set(p_connections,'{partners}',v_partners,true)
  );
exception when invalid_text_representation or datetime_field_overflow then
  raise exception 'A new spouse or partner date is malformed.' using errcode='22023';
end;
$$;

revoke all on function public.edit_family_member_with_new_partners(uuid,bigint,text,jsonb,jsonb) from public,anon;
grant execute on function public.edit_family_member_with_new_partners(uuid,bigint,text,jsonb,jsonb) to authenticated;
