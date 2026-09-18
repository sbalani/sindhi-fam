# Vansh

Current release: **0.12.0** — see `CHANGELOG.md` and `P0_DEPLOYMENT.md`.

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
