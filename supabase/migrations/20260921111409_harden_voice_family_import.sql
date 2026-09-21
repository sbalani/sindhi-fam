alter function public.import_voice_family_story(uuid,jsonb,jsonb,uuid) set schema private;
alter function private.import_voice_family_story(uuid,jsonb,jsonb,uuid) rename to import_voice_family_story_unchecked;
revoke all on function private.import_voice_family_story_unchecked(uuid,jsonb,jsonb,uuid) from public,anon,authenticated;

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
begin
  if jsonb_typeof(p_people) is distinct from 'array'
    or jsonb_typeof(p_relationships) is distinct from 'array' then
    raise exception 'People and relationships must be arrays.' using errcode='22023';
  end if;

  if exists(
    select 1
    from jsonb_array_elements(p_people) person
    where jsonb_typeof(person.value) <> 'object'
      or (
        nullif(person.value->>'existing_id','') is null
        and (
          nullif(regexp_replace(btrim(coalesce(person.value->>'first_name','')),'\s+',' ','g'),'') is null
          or nullif(regexp_replace(btrim(coalesce(person.value->>'surname','')),'\s+',' ','g'),'') is null
          or char_length(regexp_replace(btrim(coalesce(person.value->>'first_name','')),'\s+',' ','g')) > 100
          or char_length(regexp_replace(btrim(coalesce(person.value->>'surname','')),'\s+',' ','g')) > 100
          or coalesce(person.value->>'gender','unspecified') not in ('female','male','nonbinary','unspecified')
          or char_length(btrim(coalesce(person.value->>'birth_place',''))) > 150
          or char_length(btrim(coalesce(person.value->>'lived_in',''))) > 150
          or char_length(btrim(coalesce(person.value->>'placeholder_label',''))) > 200
          or char_length(btrim(coalesce(person.value->>'provenance_note',''))) > 2000
          or (
            nullif(person.value->>'birth_year','')::integer is not null
            and nullif(person.value->>'birth_year','')::integer not between 1800 and extract(year from current_date)::integer
          )
        )
      )
  ) then
    raise exception 'A voice import contains invalid person details.' using errcode='22023';
  end if;

  return private.import_voice_family_story_unchecked(
    p_narrator_id,
    p_people,
    p_relationships,
    p_idempotency_key
  );
exception when invalid_text_representation or datetime_field_overflow then
  raise exception 'A person ID, year, boolean, or relationship value is malformed.' using errcode='22023';
end;
$$;

revoke all on function public.import_voice_family_story(uuid,jsonb,jsonb,uuid) from public,anon;
grant execute on function public.import_voice_family_story(uuid,jsonb,jsonb,uuid) to authenticated;
