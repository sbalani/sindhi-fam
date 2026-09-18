-- Preserve an age exactly as a narrator stated it during voice import.
-- We deliberately do not convert age into a guessed birth year.

alter table public.family_members
  add column if not exists age_as_reported integer
  check (age_as_reported is null or age_as_reported between 0 and 124);

alter table public.family_members
  add column if not exists age_recorded_at date;

comment on column public.family_members.age_as_reported is
  'Age stated during a family-story import. This is not converted into a guessed birth year.';

comment on column public.family_members.age_recorded_at is
  'Date on which age_as_reported was recorded, so the age remains historically interpretable.';
