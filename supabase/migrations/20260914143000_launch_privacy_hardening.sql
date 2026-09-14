-- Vansh launch privacy hardening.
-- Matching is intentionally performed server-side with precise values, but
-- pre-approval RPC results expose only masked names and qualitative clues.
-- Exact birth dates/years and locations remain private until explicit access
-- is granted through an invitation/verified connection.


create or replace function private.graph_contact_user(
  p_graph_id uuid,
  p_excluding uuid default null
)
returns uuid
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select candidates.user_id
  from (
    select fm.linked_user_id as user_id, 1 as priority
      from public.family_members fm
      where fm.owner_id = p_graph_id and fm.linked_user_id is not null
    union all
    select fi.accepted_user_id, 2
      from public.family_invitations fi
      where fi.graph_owner_id = p_graph_id
        and fi.status = 'accepted'
        and fi.accepted_user_id is not null
    union all
    select fm.created_by, 3
      from public.family_members fm
      where fm.owner_id = p_graph_id and fm.created_by is not null
    union all
    select fm.filled_by, 4
      from public.family_members fm
      where fm.owner_id = p_graph_id and fm.filled_by is not null
    union all
    select p_graph_id, 5
      where exists(select 1 from auth.users au where au.id = p_graph_id)
  ) candidates
  join auth.users au on au.id = candidates.user_id
  where candidates.user_id is not null
    and (p_excluding is null or candidates.user_id <> p_excluding)
  order by candidates.priority, candidates.user_id
  limit 1;
$$;

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
        'Same first name'::text,
        'Same surname'::text,
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
  select id, person_code, masked_name, least(match_score, 100), clues,
         null::integer, null::text, null::text
  from scored
  where match_score >= 75
  order by match_score desc, masked_name
  limit 20;
$$;


create or replace function public.request_identity_claim(p_candidate_member_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_graph_id uuid;
  v_reviewer uuid;
  v_self_id uuid;
  v_score integer;
  v_shared text[];
  v_request_id uuid;
begin
  select c.score, c.shared_details into v_score, v_shared
  from public.find_identity_claim_candidates() c
  where c.candidate_member_id = p_candidate_member_id;
  if v_score is null then
    raise exception 'This record is not an eligible identity suggestion.';
  end if;

  select fm.id into v_self_id
  from public.family_members fm
  where fm.linked_user_id = auth.uid() and fm.is_self
  order by fm.created_at
  limit 1;
  if v_self_id is null then
    select fm.id into v_self_id
    from public.family_members fm
    where fm.owner_id = auth.uid() and fm.is_self
    order by fm.created_at
    limit 1;
  end if;
  if v_self_id is null then raise exception 'Your self record is missing.'; end if;

  select fm.owner_id into v_graph_id
  from public.family_members fm
  where fm.id = p_candidate_member_id and fm.linked_user_id is null;

  v_reviewer := private.graph_contact_user(v_graph_id, auth.uid());
  if v_reviewer is null then
    raise exception 'This family record has no active relative available to review a claim.';
  end if;

  insert into public.identity_claim_requests(
    candidate_member_id, candidate_owner_id, claimant_user_id, claimant_member_id,
    initiated_by, status, score, shared_details
  ) values (
    p_candidate_member_id, v_reviewer, auth.uid(), v_self_id,
    'claimant', 'pending', v_score, coalesce(v_shared, '{}')
  )
  returning id into v_request_id;

  return v_request_id;
end;
$$;

create or replace function public.dismiss_identity_candidate(p_candidate_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_graph_id uuid;
  v_reviewer uuid;
  v_self_id uuid;
begin
  select fm.owner_id into v_graph_id
  from public.family_members fm
  where fm.id = p_candidate_member_id;

  v_reviewer := private.graph_contact_user(v_graph_id, auth.uid());

  select fm.id into v_self_id
  from public.family_members fm
  where (fm.linked_user_id = auth.uid() or fm.owner_id = auth.uid())
    and fm.is_self
  order by case when fm.linked_user_id = auth.uid() then 0 else 1 end, fm.created_at
  limit 1;

  if v_reviewer is null or v_self_id is null then return; end if;

  if not exists(
    select 1 from public.identity_claim_requests r
    where r.candidate_member_id = p_candidate_member_id
      and r.claimant_user_id = auth.uid()
  ) then
    insert into public.identity_claim_requests(
      candidate_member_id, candidate_owner_id, claimant_user_id, claimant_member_id,
      initiated_by, status, score, shared_details, resolved_at
    ) values (
      p_candidate_member_id, v_reviewer, auth.uid(), v_self_id,
      'claimant', 'dismissed', 0, '{}', now()
    );
  end if;
end;
$$;

create or replace function public.find_member_user_candidates(p_member_id uuid)
returns table(
  candidate_code uuid,
  display_name text,
  score integer,
  shared_details text[],
  birth_year integer,
  current_location text,
  birth_location text
)
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  with member as (
    select fm.* from public.family_members fm
    where fm.id = p_member_id
      and fm.linked_user_id is null
      and not fm.is_placeholder
      and coalesce(fm.privacy_level, 'family') <> 'private'
      and public.can_manage_family_member(auth.uid(), fm.id)
  ), scored as (
    select
      p.discovery_code,
      trim(concat_ws(
        ' ',
        case when coalesce(p.first_name, '') <> '' then upper(left(p.first_name, 1)) || '.' end,
        p.surname
      )) as masked_name,
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
        case when m.birth_date is not null and p.birth_date = m.birth_date then 'Exact birth date matches the record' end,
        case when m.birth_year is not null and p.birth_date is not null and extract(year from p.birth_date)::int = m.birth_year then 'Same birth year as the record' end,
        case when private.norm_text(coalesce(m.birth_place,m.birth_location->>'display')) <> '' and private.norm_text(p.birth_location_text)=private.norm_text(coalesce(m.birth_place,m.birth_location->>'display')) then 'Same birth place as the record' end,
        case when private.norm_text(coalesce(m.lived_in,'')) <> '' and private.norm_text(p.current_location_text)=private.norm_text(m.lived_in) then 'Same current / last known place as the record' end
      ],null)::text[] as clues
    from member m
    join public.profiles p
      on p.id <> auth.uid()
     and p.discovery_enabled
     and p.living_person_privacy in ('relatives','match_clues')
     and private.norm_text(p.first_name)=private.norm_text(m.first_name)
     and (
       private.norm_text(p.surname)=private.norm_text(m.surname)
       or private.norm_text(p.surname)=private.norm_text(coalesce(m.maiden_name,''))
     )
    where not exists(
      select 1 from public.identity_claim_requests r
      where r.candidate_member_id=m.id and r.claimant_user_id=p.id
    )
      and not exists(
        select 1 from public.verified_identity_links v
        where v.candidate_member_id=m.id
      )
  )
  select discovery_code, masked_name, least(match_score,100), clues,
         null::integer, null::text, null::text
  from scored
  where match_score >= 75
  order by match_score desc, masked_name
  limit 10;
$$;

create or replace function public.find_surname_connections()
returns table (
  candidate_code uuid,
  display_name text,
  surname text,
  birth_year integer,
  current_location text,
  birth_location text
)
language sql
security definer
set search_path = ''
stable
as $$
  with me as (
    select * from public.profiles where id = auth.uid()
  )
  select
    p.discovery_code,
    trim(concat_ws(
      ' ',
      case when coalesce(p.first_name, '') <> '' then upper(left(p.first_name, 1)) || '.' end,
      p.surname
    )) as display_name,
    p.surname,
    null::integer as birth_year,
    null::text as current_location,
    null::text as birth_location
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
  order by p.surname, p.first_name
  limit 50;
$$;

create or replace function public.find_family_matches()
returns table(
  candidate_member_id uuid,
  candidate_owner_id uuid,
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
  with mine as (
    select fm.*
    from public.family_members fm
    where public.can_access_family_member(auth.uid(), fm.id)
      and not fm.is_placeholder
  ), candidates as (
    select distinct on (other.id)
      other.id,
      private.graph_contact_user(other.owner_id, auth.uid()) as contact_user_id,
      trim(concat_ws(
        ' ',
        case when coalesce(other.first_name, '') <> '' then upper(left(other.first_name, 1)) || '.' end,
        other.surname
      )) as masked_name,
      (35
       + case when private.norm_text(coalesce(m.birth_place,m.birth_location->>'display'))<>'' and private.norm_text(coalesce(other.birth_place,other.birth_location->>'display'))=private.norm_text(coalesce(m.birth_place,m.birth_location->>'display')) then 30 else 0 end
       + case when private.norm_text(coalesce(m.lived_in,''))<>'' and private.norm_text(coalesce(other.lived_in,''))=private.norm_text(coalesce(m.lived_in,'')) then 20 else 0 end
       + case when m.birth_year is not null and other.birth_year is not null and abs(m.birth_year-other.birth_year)<=35 then 10 else 0 end
      )::int as match_score,
      array_remove(array[
        'Same family surname'::text,
        case when private.norm_text(coalesce(m.birth_place,m.birth_location->>'display'))<>'' and private.norm_text(coalesce(other.birth_place,other.birth_location->>'display'))=private.norm_text(coalesce(m.birth_place,m.birth_location->>'display')) then 'A recorded birth place overlaps' end,
        case when private.norm_text(coalesce(m.lived_in,''))<>'' and private.norm_text(coalesce(other.lived_in,''))=private.norm_text(coalesce(m.lived_in,'')) then 'A recorded residence overlaps' end
      ],null)::text[] as clues
    from mine m
    join public.family_members other
      on other.owner_id <> m.owner_id
     and not other.is_placeholder
     and (
       other.death_date is not null
       or other.death_year is not null
       or (
         other.privacy_level='match_clues'
         and other.birth_year is not null
         and other.birth_year <= extract(year from current_date)::int - 18
       )
     )
     and private.norm_text(other.surname)=private.norm_text(m.surname)
     and private.norm_text(other.first_name)<>private.norm_text(m.first_name)
     and private.graph_contact_user(other.owner_id, auth.uid()) is not null
    where not exists(
      select 1 from public.family_connection_requests r
      where (
        (r.from_user_id=auth.uid() and r.to_user_id=private.graph_contact_user(other.owner_id, auth.uid()))
        or (r.to_user_id=auth.uid() and r.from_user_id=private.graph_contact_user(other.owner_id, auth.uid()))
      )
        and r.status in ('pending','accepted','dismissed')
    )
    order by other.id, match_score desc
  )
  select id, contact_user_id, masked_name, least(match_score,100), clues,
         null::integer, null::text, null::text
  from candidates
  where match_score>=65
  order by match_score desc, masked_name
  limit 30;
$$;


create or replace function public.dismiss_family_match(p_candidate_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_graph_id uuid;
  v_contact_user uuid;
begin
  select fm.owner_id into v_graph_id
  from public.family_members fm
  where fm.id = p_candidate_member_id;

  v_contact_user := private.graph_contact_user(v_graph_id, auth.uid());
  if v_contact_user is null then return; end if;

  if not exists(
    select 1
    from public.family_connection_requests r
    where r.from_user_id = auth.uid()
      and r.to_user_id = v_contact_user
      and r.candidate_member_id = p_candidate_member_id
  ) then
    insert into public.family_connection_requests(
      from_user_id, to_user_id, status, connection_kind, candidate_member_id, resolved_at
    ) values (
      auth.uid(), v_contact_user, 'dismissed', 'family_match', p_candidate_member_id, now()
    );
  end if;
end;
$$;

revoke all on function public.find_identity_claim_candidates() from public;
revoke all on function public.find_member_user_candidates(uuid) from public;
revoke all on function public.find_surname_connections() from public;
revoke all on function public.find_family_matches() from public;

grant execute on function public.find_identity_claim_candidates() to authenticated;
grant execute on function public.request_identity_claim(uuid) to authenticated;
grant execute on function public.dismiss_identity_candidate(uuid) to authenticated;
grant execute on function public.find_member_user_candidates(uuid) to authenticated;
grant execute on function public.find_surname_connections() to authenticated;
grant execute on function public.find_family_matches() to authenticated;
grant execute on function public.dismiss_family_match(uuid) to authenticated;
