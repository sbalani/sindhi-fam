-- Historical live-schema reconciliation marker.
--
-- The original generated diff repeated the functions and policy installed by
-- 20260816210000_v014_mutual_identity_verification.sql and
-- 20260828090000_p0_identity_permissions_graph.sql, then attempted unguarded
-- drops and duplicate index/constraint creation. Later migrations replace
-- those functions again. Keep only the schema normalizations that a clean
-- baseline still needs; each statement is safe on the historical dev schema.

alter table public.family_members
  alter column created_by set default auth.uid();

update public.family_members
set person_identity_id = gen_random_uuid()
where person_identity_id is null;

alter table public.family_members
  alter column person_identity_id set not null;

update public.profiles
set discovery_code = gen_random_uuid()
where discovery_code is null;

alter table public.profiles
  alter column discovery_code set not null,
  alter column display_name set default ''::text;

alter table public.relationships
  alter column created_by set default auth.uid(),
  alter column relationship_variant drop default,
  alter column relationship_variant drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.relationships'::regclass
      and conname = 'relationships_relationship_type_check'
  ) then
    alter table public.relationships
      add constraint relationships_relationship_type_check
      check (relationship_type in ('parent', 'sibling', 'spouse', 'partner')) not valid;
    alter table public.relationships validate constraint relationships_relationship_type_check;
  end if;
end;
$$;
