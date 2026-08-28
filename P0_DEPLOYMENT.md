# Vansh 0.12.0 deployment notes

## 1. Back up Supabase first

Before applying database changes, create/confirm a Supabase database backup. The P0 migration is additive and designed to preserve existing data, but a backup is still required for a production schema change.

## 2. Apply the P0 migration to the existing database

For the current live database, apply:

`supabase/migrations/20260828090000_p0_identity_permissions_graph.sql`

Do **not** reset the database.

`20260808000000_baseline_schema.sql` exists so a fresh Supabase project can be reconstructed from the repository. It is not a request to recreate the live database.

## 3. Deploy the invite Edge Function

Deploy:

`supabase/functions/send-family-invite/index.ts`

Set this environment variable for the deployed function:

`VANSH_APP_URL=https://sindhi-fam.vercel.app`

Use a different URL for staging/dev when applicable.

## 4. Frontend environment

Create `.env.local` using `.env.example` and provide your normal Supabase public project values.

Never commit the service-role key or database password to the frontend repository.

## 5. Install and verify locally

```bash
npm install
npm run build
npm run dev
```

Then test at `http://localhost:5173`.

## 6. Critical acceptance checks

Before deploying the frontend publicly, verify these with two separate test accounts:

1. A new user sees a plausible existing-person match but is **not** linked automatically.
2. The claimant sends a claim and the record creator can accept/reject it in the verification inbox.
3. After acceptance, the original creator cannot directly overwrite the claimed person’s identity fields.
4. The original creator can submit a correction; the claimed user can accept/reject it.
5. A claimed person cannot be deleted through the normal UI/client delete.
6. A family invitation requires explicit acceptance and does not auto-accept on page load.
7. Duplicate creation warns before save, and explicit merge transfers relationships correctly.
8. One shared parent renders/reads as half sibling; two shared parents as full sibling.
9. Multiple partners and more than two parent links can coexist without overwriting earlier relationships.
10. Existing family members and relationships are still present after migration.
