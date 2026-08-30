-- Read-only diagnostic for Supabase Authentication > Users deletion failures.
-- confdeltype: c = CASCADE, n = SET NULL, a = NO ACTION, r = RESTRICT.
select
  n.nspname as schema_name,
  t.relname as table_name,
  c.conname as constraint_name,
  string_agg(a.attname, ', ' order by a.attnum) as local_columns,
  c.confdeltype as delete_action_code
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
join unnest(c.conkey) as ck(attnum) on true
join pg_attribute a on a.attrelid = t.oid and a.attnum = ck.attnum
where c.contype = 'f'
  and c.confrelid = 'auth.users'::regclass
  and n.nspname = 'public'
group by n.nspname, t.relname, c.conname, c.confdeltype
order by t.relname, c.conname;
