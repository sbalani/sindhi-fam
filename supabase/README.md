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

## P0 trust model

- Invitations, identity claims and family matches are separate workflows.
- Identity links are never accepted on app load.
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
