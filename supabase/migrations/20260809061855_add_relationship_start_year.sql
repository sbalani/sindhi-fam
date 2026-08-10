alter table public.relationships
add column if not exists start_year integer
check (start_year is null or start_year between 1800 and 2100);

comment on column public.relationships.start_year is
'Year a dated relationship began, currently used for marriage or partnership year.';
