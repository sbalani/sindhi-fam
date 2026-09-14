-- Vansh v0.15: explicit alternate names for genealogy records.
-- Stores deliberate aliases separately from the primary display name so Sindhi
-- script, Roman spellings, former names and historical spellings remain
-- searchable without overwriting the person's canonical family record.

alter table public.family_members
  add column if not exists alternate_names jsonb not null default '[]'::jsonb;

create or replace function private.valid_name_aliases(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_item jsonb;
  v_name text;
  v_kind text;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'array' then return false; end if;
  if jsonb_array_length(p_value) > 20 then return false; end if;
  for v_item in select value from jsonb_array_elements(p_value) loop
    if jsonb_typeof(v_item) <> 'object' then return false; end if;
    v_name := trim(coalesce(v_item->>'name',''));
    v_kind := coalesce(v_item->>'kind','other');
    if v_name = '' or char_length(v_name) > 160 then return false; end if;
    if v_kind not in ('sindhi_script','roman','former','historical','other') then return false; end if;
  end loop;
  return true;
end;
$$;

do $$ begin
  alter table public.family_members
    add constraint family_member_alternate_names_check
    check (private.valid_name_aliases(alternate_names));
exception when duplicate_object then null; end $$;

create or replace function private.member_name_matches(
  p_first_name text,
  p_surname text,
  p_maiden_name text,
  p_alternate_names jsonb,
  p_query_first_name text,
  p_query_surname text
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    (
      private.norm_text(p_first_name) = private.norm_text(p_query_first_name)
      and (
        private.norm_text(p_surname) = private.norm_text(p_query_surname)
        or private.norm_text(coalesce(p_maiden_name,'')) = private.norm_text(p_query_surname)
      )
    )
    or exists (
      select 1
      from jsonb_array_elements(coalesce(p_alternate_names,'[]'::jsonb)) alias
      where private.norm_text(alias->>'name') = private.norm_text(trim(concat_ws(' ', p_query_first_name, p_query_surname)))
    );
$$;

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
    'first_name','surname','nickname','maiden_name','alternate_names','gender','birth_date','birth_year',
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
    alternate_names = case when p_changes ? 'alternate_names' then coalesce(p_changes->'alternate_names','[]'::jsonb) else fm.alternate_names end,
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
    'first_name','surname','nickname','maiden_name','alternate_names','gender','birth_year','birth_date',
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
  v_reviewer := coalesce(v_member.linked_user_id, v_member.created_by, private.graph_contact_user(v_member.owner_id, auth.uid()));
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
  v_expected_reviewer := coalesce(v_change.reviewer_user_id, v_member.linked_user_id, v_member.created_by, private.graph_contact_user(v_member.owner_id, auth.uid()));
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
      alternate_names = case when v_change.proposed_changes ? 'alternate_names' then coalesce(v_change.proposed_changes->'alternate_names','[]'::jsonb) else fm.alternate_names end,
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

-- Same-graph duplicate checks can use explicit aliases without exposing them.
create or replace function public.find_duplicate_members(
  p_owner_id uuid,
  p_first_name text,
  p_surname text,
  p_birth_date date default null,
  p_birth_year integer default null,
  p_birth_place text default null,
  p_exclude_id uuid default null
)
returns table(member_id uuid,display_name text,score integer,birth_year integer,birth_place text,lived_in text,claimed boolean)
language sql
stable
security definer
set search_path=''
as $$
  select
    fm.id,
    trim(concat_ws(' ',fm.first_name,fm.surname)),
    least(100,
      55
      + case
          when p_birth_date is not null and fm.birth_date=p_birth_date then 30
          when p_birth_year is not null and fm.birth_year=p_birth_year then 20
          else 0
        end
      + case when private.norm_text(p_birth_place)<>'' and private.norm_text(coalesce(fm.birth_place,fm.birth_location->>'display'))=private.norm_text(p_birth_place) then 15 else 0 end
    )::int,
    fm.birth_year,
    coalesce(fm.birth_place,fm.birth_location->>'display'),
    fm.lived_in,
    fm.linked_user_id is not null
  from public.family_members fm
  where fm.owner_id=p_owner_id
    and fm.id is distinct from p_exclude_id
    and not fm.is_placeholder
    and public.can_access_family_member(auth.uid(),fm.id)
    and private.member_name_matches(fm.first_name,fm.surname,fm.maiden_name,fm.alternate_names,p_first_name,p_surname)
  order by 3 desc,2
  limit 10;
$$;

-- Cross-graph identity discovery may score against a deliberate alternate name,
-- but the alias itself is never returned before mutual approval.
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
      trim(concat_ws(
        ' ',
        fm.first_name,
        case when coalesce(fm.surname, '') <> '' then upper(left(fm.surname, 1)) || '.' end
      )) as masked_name,
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
        case
          when private.norm_text(fm.first_name)=private.norm_text(me.first_name)
           and (private.norm_text(fm.surname)=private.norm_text(me.surname) or private.norm_text(coalesce(fm.maiden_name,''))=private.norm_text(me.surname))
            then 'Primary name matches your profile'
          else 'A recorded alternate name matches your profile'
        end,
        case when me.birth_date is not null and fm.birth_date = me.birth_date then 'Exact birth date matches your profile' end,
        case when me.birth_date is not null and fm.birth_date is distinct from me.birth_date and fm.birth_year = extract(year from me.birth_date)::integer then 'Same birth year as your profile' end,
        case when private.norm_text(me.birth_location_text) <> '' and private.norm_text(coalesce(fm.birth_place, fm.birth_location ->> 'display')) = private.norm_text(me.birth_location_text) then 'Same birth place as your profile' end,
        case when private.norm_text(me.current_location_text) <> '' and private.norm_text(coalesce(fm.lived_in, '')) = private.norm_text(me.current_location_text) then 'Same current / last known place as your profile' end
      ], null)::text[] as clues
    from me
    join public.family_members fm
      on fm.owner_id <> auth.uid()
     and not fm.is_placeholder
     and fm.linked_user_id is null
     and coalesce(fm.created_by, fm.owner_id) <> auth.uid()
     and private.graph_contact_user(fm.owner_id, auth.uid()) is not null
     and coalesce(fm.privacy_level, 'family') <> 'private'
     and private.member_name_matches(fm.first_name,fm.surname,fm.maiden_name,fm.alternate_names,me.first_name,me.surname)
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
  select id, person_code, masked_name, least(match_score, 100), clues,
         null::integer, null::text, null::text
  from scored
  where match_score >= 75
  order by match_score desc, masked_name
  limit 20;
$$;

-- Preserve aliases when two duplicate records are merged. The existing merge
-- RPC writes member_merge_audit before deleting the duplicate, which gives this
-- trigger a safe pointer to the kept record.
create or replace function private.preserve_name_aliases_on_merge_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_keep_id uuid;
begin
  select a.kept_member_id into v_keep_id
  from public.member_merge_audit a
  where a.merged_member_id = old.id
    and a.created_at >= now() - interval '5 minutes'
  order by a.created_at desc
  limit 1;

  if v_keep_id is not null and jsonb_array_length(coalesce(old.alternate_names,'[]'::jsonb)) > 0 then
    update public.family_members keep_member
    set alternate_names = (
      select coalesce(jsonb_agg(item.value), '[]'::jsonb)
      from (
        select distinct value
        from jsonb_array_elements(coalesce(keep_member.alternate_names,'[]'::jsonb) || coalesce(old.alternate_names,'[]'::jsonb))
      ) item
    )
    where keep_member.id = v_keep_id;
  end if;
  return old;
end;
$$;

drop trigger if exists preserve_name_aliases_on_merge_delete on public.family_members;
create trigger preserve_name_aliases_on_merge_delete
before delete on public.family_members
for each row execute function private.preserve_name_aliases_on_merge_delete();

comment on column public.family_members.alternate_names is
  'Explicit searchable name aliases. JSON array of {name, kind}; kinds: sindhi_script, roman, former, historical, other.';
