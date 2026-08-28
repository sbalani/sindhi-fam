drop extension if exists "pg_net";

drop policy "Update manageable family members" on "public"."family_members";

alter table "public"."relationships" drop constraint "relationships_check";

alter table "public"."identity_claim_requests" drop constraint "identity_claim_requests_claimant_member_id_fkey";

alter table "public"."family_members" alter column "created_by" set default auth.uid();

alter table "public"."family_members" alter column "person_identity_id" set not null;

alter table "public"."identity_claim_requests" alter column "initiated_by" set default 'claimant'::text;

alter table "public"."profiles" alter column "discovery_code" set not null;

alter table "public"."profiles" alter column "display_name" set default ''::text;

alter table "public"."relationships" alter column "created_by" set default auth.uid();

alter table "public"."relationships" alter column "relationship_variant" drop default;

alter table "public"."relationships" alter column "relationship_variant" drop not null;

CREATE INDEX family_connection_from_idx ON public.family_connection_requests USING btree (from_user_id, status);

CREATE INDEX family_connection_to_idx ON public.family_connection_requests USING btree (to_user_id, status);

CREATE INDEX family_members_created_by_idx ON public.family_members USING btree (created_by);

CREATE INDEX family_members_linked_user_id_idx ON public.family_members USING btree (linked_user_id);

CREATE INDEX family_members_name_match_idx ON public.family_members USING btree (lower(first_name), lower(surname));

CREATE INDEX family_members_owner_id_idx ON public.family_members USING btree (owner_id);

CREATE INDEX identity_claim_claimant_idx ON public.identity_claim_requests USING btree (claimant_user_id, status);

CREATE INDEX identity_claim_owner_idx ON public.identity_claim_requests USING btree (candidate_owner_id, status);

CREATE UNIQUE INDEX identity_claim_pending_uidx ON public.identity_claim_requests USING btree (candidate_member_id, claimant_user_id) WHERE (status = 'pending'::text);

CREATE INDEX profiles_surname_lower_idx ON public.profiles USING btree (lower(surname));

CREATE INDEX relationships_owner_id_idx ON public.relationships USING btree (owner_id);

CREATE INDEX relationships_person_a_id_idx ON public.relationships USING btree (person_a_id);

CREATE INDEX relationships_person_b_id_idx ON public.relationships USING btree (person_b_id);

CREATE UNIQUE INDEX verified_family_connections_request_id_key ON public.verified_family_connections USING btree (request_id);

CREATE INDEX verified_identity_claimant_user_idx ON public.verified_identity_links USING btree (claimant_user_id);

CREATE UNIQUE INDEX verified_identity_links_candidate_member_id_claimant_member_key ON public.verified_identity_links USING btree (candidate_member_id, claimant_member_id);

alter table "public"."family_connection_requests" add constraint "family_connection_requests_check" CHECK ((from_user_id <> to_user_id)) not valid;

alter table "public"."family_connection_requests" validate constraint "family_connection_requests_check";

alter table "public"."family_members" add constraint "family_members_age_as_reported_check" CHECK (((age_as_reported IS NULL) OR ((age_as_reported >= 0) AND (age_as_reported <= 124)))) not valid;

alter table "public"."family_members" validate constraint "family_members_age_as_reported_check";

alter table "public"."family_members" add constraint "family_members_nickname_check" CHECK (((nickname IS NULL) OR (char_length(nickname) <= 100))) not valid;

alter table "public"."family_members" validate constraint "family_members_nickname_check";

alter table "public"."identity_claim_requests" add constraint "identity_claim_requests_score_check" CHECK (((score >= 0) AND (score <= 100))) not valid;

alter table "public"."identity_claim_requests" validate constraint "identity_claim_requests_score_check";

alter table "public"."relationships" add constraint "relationships_different_people" CHECK ((person_a_id <> person_b_id)) not valid;

alter table "public"."relationships" validate constraint "relationships_different_people";

alter table "public"."relationships" add constraint "relationships_relationship_type_check" CHECK ((relationship_type = ANY (ARRAY['parent'::text, 'sibling'::text, 'spouse'::text, 'partner'::text]))) not valid;

alter table "public"."relationships" validate constraint "relationships_relationship_type_check";

alter table "public"."relationships" add constraint "relationships_start_year_check" CHECK (((start_year IS NULL) OR ((start_year >= 1800) AND (start_year <= 2100)))) not valid;

alter table "public"."relationships" validate constraint "relationships_start_year_check";

alter table "public"."verified_family_connections" add constraint "verified_family_connections_check" CHECK ((user_a_id <> user_b_id)) not valid;

alter table "public"."verified_family_connections" validate constraint "verified_family_connections_check";

alter table "public"."verified_family_connections" add constraint "verified_family_connections_request_id_key" UNIQUE using index "verified_family_connections_request_id_key";

alter table "public"."verified_identity_links" add constraint "verified_identity_links_candidate_member_id_claimant_member_key" UNIQUE using index "verified_identity_links_candidate_member_id_claimant_member_key";

alter table "public"."identity_claim_requests" add constraint "identity_claim_requests_claimant_member_id_fkey" FOREIGN KEY (claimant_member_id) REFERENCES public.family_members(id) ON DELETE CASCADE not valid;

alter table "public"."identity_claim_requests" validate constraint "identity_claim_requests_claimant_member_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.dismiss_surname_candidate(p_candidate_code uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_target uuid;
begin
  select p.id into v_target
  from public.profiles p
  where p.discovery_code = p_candidate_code;
  if v_target is null or v_target = auth.uid() then return; end if;
  if not exists (
    select 1 from public.family_connection_requests r
    where (r.from_user_id = auth.uid() and r.to_user_id = v_target)
       or (r.from_user_id = v_target and r.to_user_id = auth.uid())
  ) then
    insert into public.family_connection_requests(from_user_id, to_user_id, status, resolved_at)
    values (auth.uid(), v_target, 'dismissed', now());
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.find_surname_connections()
 RETURNS TABLE(candidate_code uuid, display_name text, surname text, birth_year integer, current_location text, birth_location text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with me as (
    select * from public.profiles where id = auth.uid()
  )
  select
    p.discovery_code,
    p.display_name,
    p.surname,
    case when p.birth_date is not null then extract(year from p.birth_date)::integer else null end,
    case when coalesce(p.current_location_text, '') ~ '[0-9]' then null else p.current_location_text end,
    case when coalesce(p.birth_location_text, '') ~ '[0-9]' then null else p.birth_location_text end
  from me
  join public.profiles p
    on p.id <> auth.uid()
   and p.discovery_enabled
   and private.norm_text(p.surname) = private.norm_text(me.surname)
  where coalesce(me.surname, '') <> ''
    and not exists (
      select 1 from public.family_connection_requests r
      where (r.from_user_id = auth.uid() and r.to_user_id = p.id)
         or (r.from_user_id = p.id and r.to_user_id = auth.uid())
    )
    and not exists (
      select 1 from public.verified_family_connections v
      where (v.user_a_id = auth.uid() and v.user_b_id = p.id)
         or (v.user_a_id = p.id and v.user_b_id = auth.uid())
    )
  order by p.display_name
  limit 50;
$function$
;

CREATE OR REPLACE FUNCTION public.get_sindhi_location_counts()
 RETURNS TABLE(city text, country text, lat double precision, lon double precision, people_count bigint, country_people_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with identity_keys as (
    select
      fm.id as person_id,
      coalesce(
        'user:' || verified.claimant_user_id::text,
        'member:' || fm.id::text
      ) as canonical_person
    from public.family_members fm
    left join lateral (
      select v.claimant_user_id
      from public.verified_identity_links v
      where v.candidate_member_id = fm.id or v.claimant_member_id = fm.id
      order by v.verified_at
      limit 1
    ) verified on true
  ), raw_locations as (
    select k.canonical_person, fm.birth_location as location
    from public.family_members fm
    join identity_keys k on k.person_id = fm.id
    where fm.birth_location is not null

    union all

    select k.canonical_person, residence.location
    from public.family_members fm
    join identity_keys k on k.person_id = fm.id
    cross join lateral jsonb_array_elements(coalesce(fm.lived_locations, '[]'::jsonb)) as residence(location)
  ), normalized as (
    select
      canonical_person,
      nullif(trim(location ->> 'city'), '') as city,
      nullif(trim(location ->> 'country'), '') as country,
      case when (location ->> 'lat') ~ '^-?[0-9]+(\.[0-9]+)?$' then (location ->> 'lat')::double precision end as lat,
      case when (location ->> 'lon') ~ '^-?[0-9]+(\.[0-9]+)?$' then (location ->> 'lon')::double precision end as lon
    from raw_locations
  ), country_counts as (
    select country, count(distinct canonical_person)::bigint as country_people_count
    from normalized
    where country is not null
    group by country
  ), city_counts as (
    select
      coalesce(city, '') as city,
      country,
      round(lat::numeric, 4)::double precision as lat,
      round(lon::numeric, 4)::double precision as lon,
      count(distinct canonical_person)::bigint as people_count
    from normalized
    where country is not null and lat is not null and lon is not null
    group by coalesce(city, ''), country, round(lat::numeric, 4), round(lon::numeric, 4)
  )
  select c.city, c.country, c.lat, c.lon, c.people_count, cc.country_people_count
  from city_counts c
  join country_counts cc using (country)
  order by c.people_count desc, c.country, c.city;
$function$
;

CREATE OR REPLACE FUNCTION public.request_family_connection(p_candidate_code uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_target uuid;
  v_my_surname text;
  v_target_surname text;
  v_id uuid;
begin
  select p.surname into v_my_surname from public.profiles p where p.id = auth.uid();
  select p.id, p.surname into v_target, v_target_surname
  from public.profiles p
  where p.discovery_code = p_candidate_code and p.discovery_enabled;

  if v_target is null or v_target = auth.uid() then
    raise exception 'This person is not available for discovery.';
  end if;
  if private.norm_text(v_my_surname) = '' or private.norm_text(v_my_surname) <> private.norm_text(v_target_surname) then
    raise exception 'Surname discovery only allows same-surname requests.';
  end if;
  if exists (
    select 1 from public.family_connection_requests r
    where (r.from_user_id = auth.uid() and r.to_user_id = v_target)
       or (r.from_user_id = v_target and r.to_user_id = auth.uid())
  ) then
    raise exception 'A decision already exists for this person.';
  end if;

  insert into public.family_connection_requests(from_user_id, to_user_id, status)
  values (auth.uid(), v_target, 'pending')
  returning id into v_id;
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.guard_family_member_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v_system boolean := coalesce(current_setting('vansh.system_write', true), '') = 'on';
  v_identity_changed boolean;
begin
  if tg_op = 'INSERT' then
    if not v_system then
      -- Browser-created records always receive a fresh opaque identity id.
      -- The only direct linked insert allowed is a user's own self record.
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
    else
      if new.person_identity_id is null then new.person_identity_id := gen_random_uuid(); end if;
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

  v_identity_changed :=
    new.first_name is distinct from old.first_name
    or new.surname is distinct from old.surname
    or new.nickname is distinct from old.nickname
    or new.maiden_name is distinct from old.maiden_name
    or new.gender is distinct from old.gender
    or new.birth_year is distinct from old.birth_year
    or new.birth_date is distinct from old.birth_date
    or new.birth_location is distinct from old.birth_location
    or new.birth_place is distinct from old.birth_place
    or new.lived_locations is distinct from old.lived_locations
    or new.lived_in is distinct from old.lived_in;

  if not v_system and (
    new.linked_user_id is distinct from old.linked_user_id
    or new.person_identity_id is distinct from old.person_identity_id
  ) then
    raise exception 'Identity linkage can only be changed through the Vansh verification workflow.';
  end if;

  if not v_system and old.linked_user_id is not null and old.linked_user_id <> v_user and v_identity_changed then
    raise exception 'This profile has been claimed. Suggest a correction instead of editing identity details directly.';
  end if;

  new.updated_at := now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.norm_text(v text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select regexp_replace(lower(trim(coalesce(v, ''))), '[^a-z0-9]+', '', 'g');
$function$
;

CREATE OR REPLACE FUNCTION private.populate_invitation_access()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_depth int;
begin
  v_depth := case new.scope when 'connection' then 0 when 'immediate' then 1 else 2 end;
  insert into public.family_invitation_access(invitation_id,member_id)
  with recursive walk(id,depth) as (
    select new.person_id,0
    union
    select case when r.person_a_id=w.id then r.person_b_id else r.person_a_id end,w.depth+1
    from walk w join public.relationships r on r.person_a_id=w.id or r.person_b_id=w.id
    where w.depth < v_depth
  ) select new.id,id from walk on conflict do nothing;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.sync_claimed_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_changed boolean;
begin
  if tg_op <> 'UPDATE' or pg_trigger_depth() > 1 then return new; end if;
  if new.linked_user_id is null or new.linked_user_id <> auth.uid() then return new; end if;
  v_changed :=
    new.first_name is distinct from old.first_name
    or new.surname is distinct from old.surname
    or new.nickname is distinct from old.nickname
    or new.maiden_name is distinct from old.maiden_name
    or new.gender is distinct from old.gender
    or new.birth_year is distinct from old.birth_year
    or new.birth_date is distinct from old.birth_date
    or new.birth_location is distinct from old.birth_location
    or new.birth_place is distinct from old.birth_place
    or new.lived_locations is distinct from old.lived_locations
    or new.lived_in is distinct from old.lived_in;
  if not v_changed or new.person_identity_id is null then return new; end if;

  perform set_config('vansh.system_write','on',true);
  update public.family_members fm set
    first_name = new.first_name,
    surname = new.surname,
    nickname = new.nickname,
    maiden_name = new.maiden_name,
    gender = new.gender,
    birth_year = new.birth_year,
    birth_date = new.birth_date,
    birth_location = new.birth_location,
    birth_place = new.birth_place,
    lived_locations = new.lived_locations,
    lived_in = new.lived_in
  where fm.person_identity_id = new.person_identity_id
    and fm.id <> new.id;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.can_access_family_member(p_user_id uuid, p_member_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
  select exists (
    select 1
    from public.family_members fm
    where fm.id = p_member_id
      and (
        fm.owner_id = p_user_id
        or fm.created_by = p_user_id
        or fm.linked_user_id = p_user_id
        or fm.filled_by = p_user_id
        or (
          fm.person_identity_id is not null
          and exists (
            select 1
            from public.family_members mine
            where mine.person_identity_id = fm.person_identity_id
              and mine.linked_user_id = p_user_id
          )
        )
        or exists (
          select 1
          from public.family_invitation_access fia
          join public.family_invitations fi
            on fi.id = fia.invitation_id
          where fia.member_id = fm.id
            and fi.status = 'accepted'
            and fi.accepted_user_id = p_user_id
        )
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.can_create_family_member_for_owner(p_user_id uuid, p_owner_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
  select
    p_user_id = p_owner_id
    or exists (
      select 1
      from public.family_members anchor
      where anchor.owner_id = p_owner_id
        and public.can_access_family_member(p_user_id, anchor.id)
    );
$function$
;

CREATE OR REPLACE FUNCTION public.can_manage_family_member(p_user_id uuid, p_member_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
  select exists (
    select 1
    from public.family_members fm
    where fm.id = p_member_id
      and (
        (fm.linked_user_id is not null and fm.linked_user_id = p_user_id)
        or (
          fm.linked_user_id is null
          and (
            fm.owner_id = p_user_id
            or fm.created_by = p_user_id
            or fm.filled_by = p_user_id
          )
        )
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.dismiss_family_match(p_candidate_member_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_owner uuid;
begin
  select fm.owner_id into v_owner from public.family_members fm
  where fm.id=p_candidate_member_id and fm.owner_id<>auth.uid();
  if v_owner is null then return; end if;
  if not exists(
    select 1 from public.family_connection_requests r
    where r.from_user_id=auth.uid() and r.to_user_id=v_owner
      and r.candidate_member_id=p_candidate_member_id
  ) then
    insert into public.family_connection_requests(from_user_id,to_user_id,status,connection_kind,candidate_member_id,resolved_at)
    values(auth.uid(),v_owner,'dismissed','family_match',p_candidate_member_id,now());
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dismiss_identity_candidate(p_candidate_member_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_owner uuid; v_self_id uuid;
begin
  select coalesce(fm.created_by,fm.owner_id) into v_owner from public.family_members fm where fm.id=p_candidate_member_id;
  select fm.id into v_self_id from public.family_members fm where fm.owner_id=auth.uid() and fm.is_self order by fm.created_at limit 1;
  if v_owner is null or v_self_id is null then return; end if;
  if not exists(select 1 from public.identity_claim_requests r where r.candidate_member_id=p_candidate_member_id and r.claimant_user_id=auth.uid()) then
    insert into public.identity_claim_requests(candidate_member_id,candidate_owner_id,claimant_user_id,claimant_member_id,initiated_by,status,score,shared_details,resolved_at)
    values(p_candidate_member_id,v_owner,auth.uid(),v_self_id,'claimant','dismissed',0,'{}',now());
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dismiss_member_identity_candidate(p_member_id uuid, p_candidate_code uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_target_user uuid; v_target_self uuid;
begin
  if not exists(select 1 from public.family_members fm where fm.id=p_member_id and fm.linked_user_id is null and (fm.created_by=auth.uid() or fm.owner_id=auth.uid())) then return; end if;
  select p.id into v_target_user from public.profiles p where p.discovery_code=p_candidate_code;
  if v_target_user is null then return; end if;
  select fm.id into v_target_self from public.family_members fm where fm.owner_id=v_target_user and fm.is_self order by fm.created_at limit 1;
  if not exists(select 1 from public.identity_claim_requests r where r.candidate_member_id=p_member_id and r.claimant_user_id=v_target_user) then
    insert into public.identity_claim_requests(candidate_member_id,candidate_owner_id,claimant_user_id,claimant_member_id,initiated_by,status,score,shared_details,resolved_at)
    values(p_member_id,auth.uid(),v_target_user,v_target_self,'record_owner','dismissed',0,'{}',now());
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.find_duplicate_members(p_owner_id uuid, p_first_name text, p_surname text, p_birth_date date DEFAULT NULL::date, p_birth_year integer DEFAULT NULL::integer, p_birth_place text DEFAULT NULL::text, p_exclude_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(member_id uuid, display_name text, score integer, birth_year integer, birth_place text, lived_in text, claimed boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    and private.norm_text(fm.first_name)=private.norm_text(p_first_name)
    and (private.norm_text(fm.surname)=private.norm_text(p_surname) or private.norm_text(coalesce(fm.maiden_name,''))=private.norm_text(p_surname))
  order by 3 desc,2
  limit 10;
$function$
;

CREATE OR REPLACE FUNCTION public.find_family_matches()
 RETURNS TABLE(candidate_member_id uuid, candidate_owner_id uuid, display_name text, score integer, shared_details text[], birth_year integer, birth_place text, lived_in text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.find_identity_claim_candidates()
 RETURNS TABLE(candidate_member_id uuid, person_code text, display_name text, score integer, shared_details text[], birth_year integer, birth_place text, lived_in text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.find_member_user_candidates(p_member_id uuid)
 RETURNS TABLE(candidate_code uuid, display_name text, score integer, shared_details text[], birth_year integer, current_location text, birth_location text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with member as (
    select fm.* from public.family_members fm
    where fm.id = p_member_id
      and fm.linked_user_id is null
      and not fm.is_placeholder
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
     and private.norm_text(p.first_name)=private.norm_text(m.first_name)
     and (private.norm_text(p.surname)=private.norm_text(m.surname) or private.norm_text(p.surname)=private.norm_text(coalesce(m.maiden_name,'')))
    where not exists(select 1 from public.identity_claim_requests r where r.candidate_member_id=m.id and r.claimant_user_id=p.id)
      and not exists(select 1 from public.verified_identity_links v where v.candidate_member_id=m.id)
  )
  select discovery_code,display_name,least(match_score,100),clues,byear,current_location_text,birth_location_text
  from scored where match_score >= 80 order by match_score desc,display_name limit 10;
$function$
;

CREATE OR REPLACE FUNCTION public.get_verification_inbox()
 RETURNS TABLE(kind text, request_id uuid, direction text, status text, counterpart_name text, subject_name text, score integer, shared_details text[], created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      case when fm.linked_user_id=auth.uid() then 'incoming' else 'outgoing' end::text,
      c.status,
      coalesce(pp.display_name,'A relative')::text,
      trim(concat_ws(' ',fm.first_name,fm.surname))::text,
      null::int,
      array['Suggested profile correction']::text[] || coalesce(
        (select array_agg(replace(e.key, '_', ' ') || ': ' || left(e.value::text, 120))
         from jsonb_each(c.proposed_changes) e),
        '{}'::text[]
      ),
      c.created_at
    from public.profile_change_requests c
    join public.family_members fm on fm.id=c.member_id
    left join public.profiles pp on pp.id=c.proposer_user_id
    where fm.linked_user_id=auth.uid() or c.proposer_user_id=auth.uid()

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
      and fi.status in ('pending','accepted','rejected','expired')
  ) as inbox(kind, request_id, direction, status, counterpart_name, subject_name, score, shared_details, created_at)
  order by case when inbox.status='pending' and inbox.direction='incoming' then 0 when inbox.status='pending' then 1 else 2 end, inbox.created_at desc
  limit 80;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_first_name text; v_surname text; v_display_name text; v_birth_date date; v_discovery boolean;
begin
  v_first_name:=coalesce(nullif(new.raw_user_meta_data->>'first_name',''),nullif(split_part(coalesce(new.raw_user_meta_data->>'display_name',''),' ',1),''),split_part(new.email,'@',1),'User');
  v_surname:=nullif(new.raw_user_meta_data->>'family_surname','');
  v_display_name:=coalesce(nullif(new.raw_user_meta_data->>'display_name',''),trim(concat_ws(' ',v_first_name,v_surname)),split_part(new.email,'@',1),'User');
  v_birth_date:=case when (new.raw_user_meta_data->>'birth_date')~'^\d{4}-\d{2}-\d{2}$' then (new.raw_user_meta_data->>'birth_date')::date end;
  v_discovery:=lower(coalesce(new.raw_user_meta_data->>'discovery_enabled','true')) in ('true','1','yes');
  insert into public.profiles(id,display_name,first_name,surname,location,birth_date,birth_location_text,current_location_text,discovery_enabled)
  values(new.id,v_display_name,v_first_name,v_surname,nullif(new.raw_user_meta_data->>'location',''),v_birth_date,nullif(new.raw_user_meta_data->>'birth_location',''),nullif(new.raw_user_meta_data->>'location',''),v_discovery)
  on conflict(id) do update set display_name=excluded.display_name,first_name=excluded.first_name,surname=excluded.surname,location=excluded.location,birth_date=excluded.birth_date,birth_location_text=excluded.birth_location_text,current_location_text=excluded.current_location_text,discovery_enabled=excluded.discovery_enabled,updated_at=now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.merge_family_members(p_keep_id uuid, p_merge_id uuid, p_field_choices jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  k public.family_members%rowtype;
  m public.family_members%rowtype;
  rel record;
  new_a uuid;
  new_b uuid;
begin
  if p_keep_id=p_merge_id then raise exception 'Choose two different records.'; end if;
  select * into k from public.family_members where id=p_keep_id for update;
  select * into m from public.family_members where id=p_merge_id for update;
  if k.id is null or m.id is null or k.owner_id<>m.owner_id then raise exception 'Duplicates must belong to the same family graph.'; end if;
  if not public.can_manage_family_member(auth.uid(),k.id) or not public.can_manage_family_member(auth.uid(),m.id) then raise exception 'You do not have permission to merge both records.'; end if;
  if k.is_self or m.is_self then raise exception 'Self records cannot be merged through duplicate cleanup.'; end if;
  if k.linked_user_id is not null or m.linked_user_id is not null then raise exception 'Claimed profiles cannot be merged automatically. Resolve the identity link first.'; end if;
  if exists (
    select 1 from public.identity_claim_requests r
    where r.status='pending'
      and (r.candidate_member_id in (k.id,m.id) or r.claimant_member_id in (k.id,m.id))
  ) then
    raise exception 'Resolve pending identity claims before merging these records.';
  end if;

  insert into public.member_merge_audit(kept_member_id,merged_member_id,merged_by,kept_snapshot,merged_snapshot,field_choices)
  values(k.id,m.id,auth.uid(),to_jsonb(k),to_jsonb(m),coalesce(p_field_choices,'{}'::jsonb));

  perform set_config('vansh.system_write','on',true);
  update public.family_members set
    first_name = case when p_field_choices->>'first_name'='merge' then m.first_name else k.first_name end,
    surname = case when p_field_choices->>'surname'='merge' then m.surname else k.surname end,
    nickname = case when p_field_choices->>'nickname'='merge' then m.nickname else coalesce(k.nickname,m.nickname) end,
    maiden_name = case when p_field_choices->>'maiden_name'='merge' then m.maiden_name else coalesce(k.maiden_name,m.maiden_name) end,
    gender = case when p_field_choices->>'gender'='merge' then m.gender else k.gender end,
    birth_year = case when p_field_choices->>'birth_year'='merge' then m.birth_year else coalesce(k.birth_year,m.birth_year) end,
    birth_date = case when p_field_choices->>'birth_date'='merge' then m.birth_date else coalesce(k.birth_date,m.birth_date) end,
    birth_location = case when p_field_choices->>'birth_location'='merge' then m.birth_location else coalesce(k.birth_location,m.birth_location) end,
    birth_place = case when p_field_choices->>'birth_place'='merge' then m.birth_place else coalesce(k.birth_place,m.birth_place) end,
    lived_locations = case when p_field_choices->>'lived_locations'='merge' then m.lived_locations else case when jsonb_array_length(coalesce(k.lived_locations,'[]'::jsonb))=0 then m.lived_locations else k.lived_locations end end,
    lived_in = case when p_field_choices->>'lived_in'='merge' then m.lived_in else coalesce(k.lived_in,m.lived_in) end
  where id=k.id;

  -- Transfer the duplicate's graph edges one at a time. A direct relationship
  -- between the two duplicate records would become k -> k and violate the
  -- relationships_different_people constraint, so it is removed. If replacing
  -- m with k would create an edge that already exists, keep the existing edge
  -- and remove the duplicate one before updating anything.
  for rel in
    select *
    from public.relationships
    where person_a_id=m.id or person_b_id=m.id
    order by created_at nulls last, id
  loop
    new_a := case when rel.person_a_id=m.id then k.id else rel.person_a_id end;
    new_b := case when rel.person_b_id=m.id then k.id else rel.person_b_id end;

    if new_a = new_b then
      delete from public.relationships where id=rel.id;
    elsif exists (
      select 1
      from public.relationships d
      where d.id <> rel.id
        and d.owner_id = rel.owner_id
        and d.person_a_id = new_a
        and d.person_b_id = new_b
        and d.relationship_type = rel.relationship_type
        and coalesce(d.relationship_variant,'') = coalesce(rel.relationship_variant,'')
    ) then
      delete from public.relationships where id=rel.id;
    else
      update public.relationships
      set person_a_id=new_a,
          person_b_id=new_b
      where id=rel.id;
    end if;
  end loop;

  -- Defensive cleanup for legacy duplicate edges.
  delete from public.relationships where person_a_id=person_b_id;
  delete from public.relationships r
  using public.relationships d
  where r.id>d.id and r.owner_id=d.owner_id and r.person_a_id=d.person_a_id and r.person_b_id=d.person_b_id
    and r.relationship_type=d.relationship_type and coalesce(r.relationship_variant,'')=coalesce(d.relationship_variant,'');

  -- A duplicate may already participate in pending workflows. Preserve those
  -- references rather than deleting them through cascading foreign keys.
  update public.identity_claim_requests set candidate_member_id=k.id where candidate_member_id=m.id;
  update public.identity_claim_requests set claimant_member_id=k.id where claimant_member_id=m.id;
  update public.family_connection_requests set candidate_member_id=k.id where candidate_member_id=m.id;
  update public.match_decisions set candidate_member_id=k.id where candidate_member_id=m.id;

  -- If both duplicate records have an equivalent pending invitation, keep the
  -- oldest one and remove the collision before repointing the remainder.
  delete from public.family_invitations mi
  using public.family_invitations ki
  where mi.person_id=m.id and ki.person_id=k.id
    and lower(mi.email)=lower(ki.email)
    and mi.status='pending' and ki.status='pending';
  update public.family_invitations set person_id=k.id where person_id=m.id;
  update public.family_invitations set inviter_person_id=k.id where inviter_person_id=m.id;
  insert into public.family_invitation_access(invitation_id,member_id)
    select invitation_id,k.id from public.family_invitation_access where member_id=m.id on conflict do nothing;
  delete from public.family_invitation_access where member_id=m.id;
  update public.profile_change_requests set member_id=k.id where member_id=m.id;
  delete from public.family_members where id=m.id;
  return k.id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.preview_family_invitation_scope(p_person_id uuid, p_scope text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with recursive walk(id,depth) as (
    select fm.id,0 from public.family_members fm
    where fm.id=p_person_id and public.can_access_family_member(auth.uid(),fm.id)
    union
    select case when r.person_a_id=w.id then r.person_b_id else r.person_a_id end,
           w.depth+1
    from walk w
    join public.relationships r on r.person_a_id=w.id or r.person_b_id=w.id
    where w.depth < case p_scope when 'connection' then 0 when 'immediate' then 1 else 2 end
  )
  select count(distinct id)::int from walk;
$function$
;

CREATE OR REPLACE FUNCTION public.request_family_match(p_candidate_member_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_owner uuid; v_id uuid;
begin
  select c.candidate_owner_id into v_owner from public.find_family_matches() c where c.candidate_member_id=p_candidate_member_id;
  if v_owner is null then raise exception 'This family suggestion is no longer available.'; end if;
  insert into public.family_connection_requests(from_user_id,to_user_id,status,connection_kind,candidate_member_id)
  values(auth.uid(),v_owner,'pending','family_match',p_candidate_member_id) returning id into v_id;
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.request_identity_claim(p_candidate_member_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_candidate_owner uuid;
  v_self_id uuid;
  v_score integer;
  v_shared text[];
  v_request_id uuid;
begin
  select c.score, c.shared_details into v_score, v_shared
  from public.find_identity_claim_candidates() c
  where c.candidate_member_id = p_candidate_member_id;
  if v_score is null then raise exception 'This record is not an eligible identity suggestion.'; end if;

  select fm.id into v_self_id
  from public.family_members fm
  where fm.linked_user_id = auth.uid() and fm.is_self
  order by fm.created_at limit 1;
  if v_self_id is null then
    select fm.id into v_self_id from public.family_members fm
    where fm.owner_id = auth.uid() and fm.is_self order by fm.created_at limit 1;
  end if;
  if v_self_id is null then raise exception 'Your self record is missing.'; end if;

  select coalesce(fm.created_by, fm.owner_id) into v_candidate_owner
  from public.family_members fm where fm.id = p_candidate_member_id and fm.linked_user_id is null;
  if v_candidate_owner is null then raise exception 'This family record is no longer claimable.'; end if;

  insert into public.identity_claim_requests(
    candidate_member_id,candidate_owner_id,claimant_user_id,claimant_member_id,
    initiated_by,status,score,shared_details
  ) values (
    p_candidate_member_id,v_candidate_owner,auth.uid(),v_self_id,
    'claimant','pending',v_score,coalesce(v_shared,'{}')
  ) returning id into v_request_id;
  return v_request_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.request_member_identity_verification(p_member_id uuid, p_candidate_code uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_target_user uuid;
  v_target_self uuid;
  v_score integer;
  v_shared text[];
  v_id uuid;
begin
  select p.id into v_target_user from public.profiles p where p.discovery_code=p_candidate_code and p.discovery_enabled;
  select c.score,c.shared_details into v_score,v_shared from public.find_member_user_candidates(p_member_id) c where c.candidate_code=p_candidate_code;
  if v_target_user is null or v_score is null then raise exception 'This user is not an eligible identity suggestion for that family record.'; end if;
  select fm.id into v_target_self from public.family_members fm where fm.owner_id=v_target_user and fm.is_self order by fm.created_at limit 1;
  insert into public.identity_claim_requests(candidate_member_id,candidate_owner_id,claimant_user_id,claimant_member_id,initiated_by,status,score,shared_details)
  values(p_member_id,auth.uid(),v_target_user,v_target_self,'record_owner','pending',v_score,coalesce(v_shared,'{}')) returning id into v_id;
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.respond_family_invitation(p_invitation_id uuid, p_accept boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_inv public.family_invitations%rowtype;
  v_self uuid;
  v_identity uuid;
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
begin
  select * into v_inv from public.family_invitations fi
  where fi.id=p_invitation_id and fi.status='pending' and lower(fi.email)=v_email for update;
  if v_inv.id is null then raise exception 'Invitation not found, expired, or already resolved.'; end if;
  if v_inv.expires_at < now() then
    update public.family_invitations set status='expired',responded_at=now() where id=v_inv.id;
    raise exception 'This invitation has expired.';
  end if;
  if p_accept then
    if exists(select 1 from public.family_members fm where fm.id=v_inv.person_id and fm.linked_user_id is not null and fm.linked_user_id<>auth.uid()) then
      raise exception 'That family record has already been claimed by another account.';
    end if;
    perform set_config('vansh.system_write','on',true);
    select fm.id,fm.person_identity_id into v_self,v_identity from public.family_members fm
      where fm.owner_id=auth.uid() and fm.is_self order by fm.created_at limit 1;
    update public.family_members set linked_user_id=auth.uid() where id=v_inv.person_id;
    select fm.person_identity_id into v_identity from public.family_members fm where fm.id=v_inv.person_id;
    if v_self is not null then update public.family_members set person_identity_id=v_identity where id=v_self; end if;
    update public.family_invitations set status='accepted',accepted_user_id=auth.uid(),responded_at=now() where id=v_inv.id;
  else
    update public.family_invitations set status='rejected',accepted_user_id=auth.uid(),responded_at=now() where id=v_inv.id;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.respond_verification_request(p_kind text, p_request_id uuid, p_accept boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_identity public.identity_claim_requests%rowtype;
  v_connection public.family_connection_requests%rowtype;
  v_change public.profile_change_requests%rowtype;
  v_candidate public.family_members%rowtype;
  v_claimant public.family_members%rowtype;
begin
  if p_kind='identity' then
    select * into v_identity from public.identity_claim_requests
    where id=p_request_id and status='pending'
      and ((initiated_by='claimant' and candidate_owner_id=auth.uid()) or (initiated_by='record_owner' and claimant_user_id=auth.uid()))
    for update;
    if v_identity.id is null then raise exception 'Identity request not found or already resolved.'; end if;

    if p_accept then
      select * into v_candidate from public.family_members where id=v_identity.candidate_member_id for update;
      if v_candidate.linked_user_id is not null and v_candidate.linked_user_id<>v_identity.claimant_user_id then
        raise exception 'This profile has already been claimed by another account.';
      end if;
      if v_identity.claimant_member_id is null then
        select * into v_claimant from public.family_members where owner_id=v_identity.claimant_user_id and is_self order by created_at limit 1;
        if v_claimant.id is null then raise exception 'The claimant needs to open Vansh once before verification can complete.'; end if;
        update public.identity_claim_requests set claimant_member_id=v_claimant.id where id=v_identity.id;
      else
        select * into v_claimant from public.family_members where id=v_identity.claimant_member_id;
      end if;
      perform set_config('vansh.system_write','on',true);
      update public.family_members set linked_user_id=v_identity.claimant_user_id where id=v_candidate.id;
      update public.family_members set person_identity_id=v_candidate.person_identity_id where id=v_claimant.id;
      insert into public.verified_identity_links(candidate_member_id,claimant_member_id,record_owner_id,claimant_user_id)
      values(v_candidate.id,v_claimant.id,v_identity.candidate_owner_id,v_identity.claimant_user_id)
      on conflict(candidate_member_id) do update set claimant_member_id=excluded.claimant_member_id,claimant_user_id=excluded.claimant_user_id,verified_at=now();
      update public.identity_claim_requests set status='rejected',resolved_at=now()
      where candidate_member_id=v_candidate.id and id<>v_identity.id and status='pending';
    end if;
    update public.identity_claim_requests set status=case when p_accept then 'accepted' else 'rejected' end,resolved_at=now() where id=v_identity.id;

  elsif p_kind in ('family_match','surname') then
    select * into v_connection from public.family_connection_requests
    where id=p_request_id and to_user_id=auth.uid() and status='pending' for update;
    if v_connection.id is null then raise exception 'Family connection request not found or already resolved.'; end if;
    update public.family_connection_requests set status=case when p_accept then 'accepted' else 'rejected' end,resolved_at=now() where id=v_connection.id;
    if p_accept then
      insert into public.verified_family_connections(request_id,user_a_id,user_b_id)
      values(v_connection.id,v_connection.from_user_id,v_connection.to_user_id) on conflict(request_id) do nothing;
    end if;

  elsif p_kind='correction' then
    select c.* into v_change
    from public.profile_change_requests c
    join public.family_members fm on fm.id=c.member_id
    where c.id=p_request_id and c.status='pending' and fm.linked_user_id=auth.uid()
    for update;
    if v_change.id is null then raise exception 'Correction request not found or already resolved.'; end if;
    if p_accept then
      update public.family_members fm set
        first_name = case when v_change.proposed_changes ? 'first_name' then nullif(v_change.proposed_changes->>'first_name','') else fm.first_name end,
        surname = case when v_change.proposed_changes ? 'surname' then nullif(v_change.proposed_changes->>'surname','') else fm.surname end,
        nickname = case when v_change.proposed_changes ? 'nickname' then nullif(v_change.proposed_changes->>'nickname','') else fm.nickname end,
        maiden_name = case when v_change.proposed_changes ? 'maiden_name' then nullif(v_change.proposed_changes->>'maiden_name','') else fm.maiden_name end,
        gender = case when v_change.proposed_changes ? 'gender' then v_change.proposed_changes->>'gender' else fm.gender end,
        birth_year = case when v_change.proposed_changes ? 'birth_year' then nullif(v_change.proposed_changes->>'birth_year','')::int else fm.birth_year end,
        birth_date = case when v_change.proposed_changes ? 'birth_date' then nullif(v_change.proposed_changes->>'birth_date','')::date else fm.birth_date end,
        birth_place = case when v_change.proposed_changes ? 'birth_place' then nullif(v_change.proposed_changes->>'birth_place','') else fm.birth_place end,
        lived_in = case when v_change.proposed_changes ? 'lived_in' then nullif(v_change.proposed_changes->>'lived_in','') else fm.lived_in end,
        birth_location = case when v_change.proposed_changes ? 'birth_location' then v_change.proposed_changes->'birth_location' else fm.birth_location end,
        lived_locations = case when v_change.proposed_changes ? 'lived_locations' then v_change.proposed_changes->'lived_locations' else fm.lived_locations end
      where fm.id=v_change.member_id;
    end if;
    update public.profile_change_requests set status=case when p_accept then 'accepted' else 'rejected' end,resolved_at=now() where id=v_change.id;
  else
    raise exception 'Unknown request kind.';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.suggest_member_correction(p_member_id uuid, p_changes jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid; v_linked uuid;
begin
  select fm.linked_user_id into v_linked from public.family_members fm where fm.id=p_member_id and public.can_access_family_member(auth.uid(),fm.id);
  if v_linked is null then raise exception 'This record is not claimed; edit it directly instead.'; end if;
  if v_linked=auth.uid() then raise exception 'You own this profile; edit it directly.'; end if;
  if p_changes is null or p_changes='{}'::jsonb then raise exception 'No correction was supplied.'; end if;
  if exists (
    select 1 from jsonb_object_keys(p_changes) k
    where k not in (
      'first_name','surname','nickname','maiden_name','gender','birth_year',
      'birth_date','birth_location','birth_place','lived_locations','lived_in'
    )
  ) then
    raise exception 'The correction contains an unsupported profile field.';
  end if;
  insert into public.profile_change_requests(member_id,proposer_user_id,proposed_changes)
  values(p_member_id,auth.uid(),p_changes) returning id into v_id;
  return v_id;
end;
$function$
;


  create policy "Update manageable family members"
  on "public"."family_members"
  as permissive
  for update
  to authenticated
using (public.can_manage_family_member(( SELECT auth.uid() AS uid), id))
with check (public.can_manage_family_member(( SELECT auth.uid() AS uid), id));



