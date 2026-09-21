alter table public.relationships
add column if not exists relationship_variant text;

alter table public.relationships
drop constraint if exists relationships_relationship_variant_check;

-- Historical clients stored partnership state in relationship_variant. Keep
-- those values valid until the family-editing migration moves them into the
-- dedicated relationship_status column.
alter table public.relationships
add constraint relationships_relationship_variant_check check (
  relationship_variant is null
  or relationship_variant = 'unspecified'
  or (relationship_type = 'sibling' and relationship_variant = 'half')
  or (
    relationship_type = 'parent'
    and relationship_variant in ('biological', 'adoptive', 'step', 'guardian')
  )
  or (
    relationship_type in ('spouse', 'partner')
    and relationship_variant in ('current', 'former')
  )
);

comment on column public.relationships.relationship_variant is
'Optional direct-relationship qualifier. Historical partnership state is normalized by a later migration.';
