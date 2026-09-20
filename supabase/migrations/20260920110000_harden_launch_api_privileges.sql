-- Remove broad default API grants left by historical launch migrations.
-- Internal workflow tables are reachable only through audited SECURITY DEFINER
-- RPCs; family data tables remain read-only to authenticated browser clients.

alter table public.family_graphs enable row level security;

revoke all on table
  public.family_graphs,
  public.family_connection_requests,
  public.family_invitation_access,
  public.family_invitations,
  public.identity_claim_requests,
  public.match_decisions,
  public.verified_family_connections,
  public.verified_identity_links,
  public.member_merge_audit,
  public.member_change_history,
  public.relationship_change_history,
  public.member_revision_history,
  public.relationship_revision_history,
  public.family_correction_requests,
  public.family_mutation_requests
from public, anon, authenticated;

revoke all on table public.family_members, public.relationships
from public, anon, authenticated;
grant select on table public.family_members, public.relationships to authenticated;

-- These tables drive the authenticated Realtime refresh subscriptions. Expose
-- only rows involving the signed-in participant; all writes remain RPC-only.
drop policy if exists "Read own identity claim activity" on public.identity_claim_requests;
create policy "Read own identity claim activity"
on public.identity_claim_requests for select to authenticated
using (
  candidate_owner_id = (select auth.uid())
  or claimant_user_id = (select auth.uid())
);

drop policy if exists "Read own family invitation activity" on public.family_invitations;
create policy "Read own family invitation activity"
on public.family_invitations for select to authenticated
using (
  graph_owner_id = (select auth.uid())
  or inviter_id = (select auth.uid())
  or accepted_user_id = (select auth.uid())
  or lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
);

drop policy if exists "Read own family connection activity" on public.family_connection_requests;
create policy "Read own family connection activity"
on public.family_connection_requests for select to authenticated
using (
  from_user_id = (select auth.uid())
  or to_user_id = (select auth.uid())
);

grant select on table
  public.identity_claim_requests,
  public.family_invitations,
  public.family_connection_requests
to authenticated;

-- CREATE FUNCTION grants EXECUTE to PUBLIC unless explicitly revoked. Remove
-- that default from every elevated public RPC, while retaining the explicit
-- authenticated grants established by the feature migrations.
do $$
declare
  v_function regprocedure;
begin
  for v_function in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    execute format('revoke all on function %s from public, anon', v_function);
  end loop;
end;
$$;

alter function public.accept_family_invitations() set search_path = '';

comment on table public.family_graphs is
  'Internal graph lifecycle state. Browser access is provided through authenticated RPCs.';
