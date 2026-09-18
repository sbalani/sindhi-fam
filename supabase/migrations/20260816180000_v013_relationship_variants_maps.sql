-- Vansh v0.13: nuanced relationships, family-owner deletion and anonymous map counts.

alter table public.relationships
  add column if not exists relationship_variant text
  check (relationship_variant is null or relationship_variant in ('half', 'step', 'adoptive'));

comment on column public.relationships.relationship_variant is
  'Optional qualifier for a direct relationship, e.g. half sibling, step relation, or adoptive parent.';

-- The owner of a private family graph may remove an incorrect non-self record,
-- even when another family member originally created that row.
drop policy if exists "Delete created family members" on public.family_members;
drop policy if exists "Delete family graph members" on public.family_members;
create policy "Delete family graph members"
on public.family_members for delete to authenticated
using (
  not is_self
  and (
    owner_id = (select auth.uid())
    or created_by = (select auth.uid())
  )
);

-- Anonymous aggregate only. No member ids, names, emails, family ids or profile
-- fields are returned to the caller.
create or replace function public.get_sindhi_location_counts()
returns table (
  city text,
  country text,
  lat double precision,
  lon double precision,
  people_count bigint,
  country_people_count bigint
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with raw_locations as (
    select
      fm.id as person_id,
      fm.birth_location as location
    from public.family_members fm
    where fm.birth_location is not null

    union all

    select
      fm.id as person_id,
      residence.location
    from public.family_members fm
    cross join lateral jsonb_array_elements(coalesce(fm.lived_locations, '[]'::jsonb)) as residence(location)
  ),
  normalized as (
    select
      person_id,
      nullif(trim(location ->> 'city'), '') as city,
      nullif(trim(location ->> 'country'), '') as country,
      case when (location ->> 'lat') ~ '^-?[0-9]+(\.[0-9]+)?$' then (location ->> 'lat')::double precision end as lat,
      case when (location ->> 'lon') ~ '^-?[0-9]+(\.[0-9]+)?$' then (location ->> 'lon')::double precision end as lon
    from raw_locations
  )
  , country_counts as (
    select country, count(distinct person_id)::bigint as country_people_count
    from normalized
    where country is not null
    group by country
  ), city_counts as (
    select
      coalesce(city, '') as city,
      country,
      round(lat::numeric, 4)::double precision as lat,
      round(lon::numeric, 4)::double precision as lon,
      count(distinct person_id)::bigint as people_count
    from normalized
    where country is not null and lat is not null and lon is not null
    group by coalesce(city, ''), country, round(lat::numeric, 4), round(lon::numeric, 4)
  )
  select c.city, c.country, c.lat, c.lon, c.people_count, cc.country_people_count
  from city_counts c
  join country_counts cc using (country)
  order by c.people_count desc, c.country, c.city;
$$;

revoke all on function public.get_sindhi_location_counts() from public;
grant execute on function public.get_sindhi_location_counts() to authenticated;
