-- Run in Supabase SQL Editor if Authentication -> Users still says
-- "Database error deleting user" after applying v0.13.2.

-- 1) Every remaining FK to auth.users and its delete action.
select
  n.nspname as schema_name,
  t.relname as table_name,
  c.conname as constraint_name,
  string_agg(a.attname, ', ' order by k.ord) as columns,
  case c.confdeltype
    when 'a' then 'NO ACTION'
    when 'r' then 'RESTRICT'
    when 'c' then 'CASCADE'
    when 'n' then 'SET NULL'
    when 'd' then 'SET DEFAULT'
    else c.confdeltype::text
  end as on_delete
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
join unnest(c.conkey) with ordinality k(attnum, ord) on true
join pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum
where c.contype = 'f'
  and c.confrelid = 'auth.users'::regclass
group by n.nspname, t.relname, c.conname, c.confdeltype
order by n.nspname, t.relname, c.conname;

-- 2) These graph-key columns should return ZERO rows after v0.13.2.
select n.nspname as schema_name, t.relname as table_name, a.attname as column_name, c.conname
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
join unnest(c.conkey) k(attnum) on true
join pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum
where c.contype = 'f'
  and c.confrelid = 'auth.users'::regclass
  and n.nspname = 'public'
  and (
    (t.relname = 'family_members' and a.attname = 'owner_id')
    or (t.relname = 'relationships' and a.attname = 'owner_id')
    or (t.relname = 'family_invitations' and a.attname = 'graph_owner_id')
  );

-- 3) Confirm the preservation trigger exists on auth.users.
select event_object_schema, event_object_table, trigger_name, action_timing, event_manipulation
from information_schema.triggers
where event_object_schema = 'auth'
  and event_object_table = 'users'
  and trigger_name = 'vansh_before_auth_user_delete';

-- 4) Current graph lifecycle state.
select id, status, created_by, orphaned_at, retention_until, updated_at
from public.family_graphs
order by updated_at desc;
