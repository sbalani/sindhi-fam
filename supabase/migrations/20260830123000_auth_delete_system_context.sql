-- Vansh v0.13.3
-- Fix Supabase Authentication -> Users deletion failing with
-- "Database error deleting user".
--
-- Why this was happening:
-- auth.users deletion correctly uses ON DELETE SET NULL for family_members
-- attribution / identity-link columns. Those FK actions are UPDATEs on
-- family_members. The P0 write-guard intentionally rejects direct changes to
-- linked_user_id / created_by unless the transaction is a trusted Vansh
-- system write. A dashboard/admin Auth deletion therefore reached the guard
-- without that context and the FK cleanup was rejected.
--
-- The BEFORE DELETE trigger below sets the transaction-local system-write flag
-- before PostgreSQL executes the FK cascade / SET NULL actions. Normal browser
-- writes remain protected because this flag is only enabled inside an actual
-- auth.users DELETE transaction.

create or replace function private.before_vansh_auth_user_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare g uuid;
begin
  -- Allow only the FK cleanup caused by this Auth deletion to pass protected
  -- family-member write guards. `true` makes this transaction-local.
  perform set_config('vansh.system_write', 'on', true);

  -- Ensure all graphs touched by this account have a durable lifecycle row.
  for g in
    select distinct graph_id from (
      select fm.owner_id as graph_id from public.family_members fm
        where fm.owner_id = old.id or fm.linked_user_id = old.id or fm.created_by = old.id or fm.filled_by = old.id
      union
      select fi.graph_owner_id from public.family_invitations fi
        where fi.graph_owner_id = old.id or fi.inviter_id = old.id or fi.accepted_user_id = old.id
    ) q where graph_id is not null
  loop
    insert into public.family_graphs(id, created_by)
    values (g, case when g = old.id then old.id else null end)
    on conflict (id) do nothing;

    if private.graph_has_other_active_user(g, old.id) then
      update public.family_graphs
      set status = 'active', orphaned_at = null, retention_until = null, updated_at = now()
      where id = g;
    else
      update public.family_graphs
      set status = 'orphaned', orphaned_at = coalesce(orphaned_at, now()),
          retention_until = coalesce(retention_until, now() + interval '30 days'), updated_at = now()
      where id = g;
    end if;
  end loop;
  return old;
end;
$$;

-- Recreate to make the intended trigger state explicit even if an earlier
-- migration partially ran.
drop trigger if exists vansh_before_auth_user_delete on auth.users;
create trigger vansh_before_auth_user_delete
before delete on auth.users
for each row execute function private.before_vansh_auth_user_delete();

-- Useful verification: this must return one row after the migration.
-- select trigger_name, action_timing, event_manipulation
-- from information_schema.triggers
-- where event_object_schema='auth' and event_object_table='users'
--   and trigger_name='vansh_before_auth_user_delete';
