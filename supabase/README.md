# Vansh Supabase schema

The repository now contains a complete migration path for a fresh project as
well as an additive P0 migration for the existing database.

## Existing database

Apply migrations in the Supabase migration runner/CLI. The P0 migration is
additive: it backfills opaque `person_identity_id` values and does not reset or
truncate family data.

## Fresh database

Run the migrations in filename order. `20260808000000_baseline_schema.sql`
creates the core tables before the historical incremental migrations run.
`20260828090000_p0_identity_permissions_graph.sql` adds the verification,
invitation, correction, duplicate/merge and RLS foundation.

The launch-editing sequence is
`20260919090000_add_family_editing_foundation.sql`,
`20260920090000_reconcile_launch_family_editing.sql`,
`20260920110000_harden_launch_api_privileges.sql`,
`20260920120000_v0151_family_editing_hardening.sql`, then
`20260920121000_fix_invitation_access_compatibility.sql`. The hardening migration adds
the atomic link batch, semantic sibling totals, endpoint authorization,
relationship evidence, and identity-first cross-graph mutation locking. Do not
apply it to a database that is missing an earlier migration in this sequence.
The final migration is a guarded no-op on clean schemas without the legacy
invitation-access helper.

## P0 trust model

- Invitations, identity claims and family matches are separate workflows.
- Identity links are never accepted on app load.
- On invitation acceptance, the accepting account's self record is canonical for
  person-level fields; graph-relative fields such as `family_side` remain local.
- A discovery claim is mutual: one party requests and the other explicitly
  accepts.
- Once a record is claimed, only the linked user may directly change identity
  fields. Relatives submit correction suggestions.
- Claimed records cannot be deleted through normal client deletes.
- `family_members.id` and `person_identity_id` are opaque UUIDs; personal data
  is never encoded in an identifier.
- New people are checked for duplicates before creation and merges are explicit.
- Parent relationship variants support biological, adoptive, step and guardian
  relationships; partnership variants support current/former/unspecified.

## Edge Function configuration

Deploy `send-family-invite` with `VANSH_APP_URL` set to the public Vansh URL for
the environment (for example the production Vercel URL). The function does not
trust a caller-provided Origin header for authentication redirects.
