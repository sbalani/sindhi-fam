alter table public.family_members
add column if not exists nickname text
check (nickname is null or char_length(nickname) <= 100);

comment on column public.family_members.nickname is
'Optional familiar name used by family members alongside the canonical first name.';
