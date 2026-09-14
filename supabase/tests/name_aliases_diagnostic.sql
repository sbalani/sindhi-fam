-- Run in Supabase SQL Editor after applying 20260914153000_explicit_name_aliases.sql.
-- This is read-only.
select
  exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='family_members' and column_name='alternate_names'
  ) as alternate_names_column_exists,
  exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname='member_name_matches'
  ) as alias_match_helper_exists,
  exists (
    select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
    where c.relname='family_members' and t.tgname='preserve_name_aliases_on_merge_delete' and not t.tgisinternal
  ) as merge_preservation_trigger_exists;
