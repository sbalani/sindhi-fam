# Vansh

Current release: **0.15.1** - see `CHANGELOG.md` and `P0_DEPLOYMENT.md`.

A private, collaborative Sindhi family tree for recording relatives, relationships, family locations, and migration history.

Live app: https://sindhi-fam.vercel.app

## Development

Requirements:

- Node.js
- A Supabase project

Create `.env.local` from `.env.example` and provide the project URL and publishable key.

```bash
npm install
npm run dev
```

## Verification

```bash
npm run lint
npm run build
```

Supabase Edge Functions and tracked database migrations are under `supabase/`.

The v0.15.1 database stack must be applied in order:
`20260919090000_add_family_editing_foundation.sql`,
`20260920090000_reconcile_launch_family_editing.sql`,
`20260920110000_harden_launch_api_privileges.sql`,
`20260920120000_v0151_family_editing_hardening.sql`, then
`20260920121000_fix_invitation_access_compatibility.sql`.
