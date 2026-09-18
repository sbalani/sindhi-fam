-- Launch-hardening diagnostics. Run in Supabase SQL Editor after applying
-- 20260830110000_account_persistence_family_updates.sql and
-- 20260914143000_launch_privacy_hardening.sql.

-- A. Required preservation trigger.
select event_object_schema, event_object_table, trigger_name, action_timing, event_manipulation
from information_schema.triggers
where event_object_schema = 'auth'
  and event_object_table = 'users'
  and trigger_name = 'vansh_before_auth_user_delete';

-- Expected: one BEFORE DELETE trigger.

-- B. Graph-key columns must not still have destructive auth.users FKs.
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

-- Expected: zero rows.

-- C. Family graph lifecycle state.
select id, status, created_by, orphaned_at, retention_until, updated_at
from public.family_graphs
order by updated_at desc;

-- D. Notification volume and unread state.
select recipient_user_id, count(*) as total,
       count(*) filter (where read_at is null) as unread
from public.family_update_notifications
group by recipient_user_id
order by total desc;

-- E. Confirm launch-hardening functions exist.
select p.proname, pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public','private')
  and p.proname in (
    'graph_contact_user',
    'find_identity_claim_candidates',
    'find_member_user_candidates',
    'find_surname_connections',
    'find_family_matches',
    'request_identity_claim',
    'dismiss_identity_candidate',
    'preview_account_deletion',
    'get_family_update_notifications'
  )
order by p.proname;
