alter table public.relationships
add column if not exists relationship_variant text;

alter table public.relationships
drop constraint if exists relationships_relationship_variant_check;

alter table public.relationships
add constraint relationships_relationship_variant_check check (
  relationship_variant is null
  or (relationship_type = 'sibling' and relationship_variant = 'half')
  or (relationship_type = 'parent' and relationship_variant = 'adoptive')
);

comment on column public.relationships.relationship_variant is
'Optional direct-relationship qualifier. Supported values are half for sibling and adoptive for parent.';
