# Vansh pre-release setup — v0.13.1

> **September 14, 2026 launch hardening:** also apply
> `supabase/migrations/20260830110000_account_persistence_family_updates.sql` and
> `supabase/migrations/20260914143000_launch_privacy_hardening.sql`.
> Redeploy `search-places` after applying the code changes; it now requires an authenticated user and applies a best-effort per-user burst limit.


This release contains code **and** database/Edge Function changes. The browser UI alone is not enough to test identity claims, invitations, notifications, or account deletion.

## 1. Apply database migrations

Apply migrations in timestamp order. If P0 and the original P1/P2 migration are already on the project, the only new migration for this test round is:

`supabase/migrations/20260830090000_pre_release_family_context_auth_fixes.sql`

This migration:
- normalizes all Vansh foreign keys to `auth.users` so deleting an Auth user is not blocked by legacy `NO ACTION` constraints;
- enables stronger living-person identity suggestions while keeping private records undiscoverable;
- validates marriage/partnership end years.

After it is applied, test deleting a disposable user in **Supabase Authentication > Users** before testing deletion from inside Vansh.

## 2. Deploy the Edge Functions

From the repository after linking the Supabase CLI to the test project:

```powershell
npx supabase functions deploy search-places
npx supabase functions deploy send-family-invite
npx supabase functions deploy send-request-notification
npx supabase functions deploy delete-account
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided by hosted Supabase Edge Functions. Do not expose the service-role key in Vite/browser environment variables.

Set the app URL used by invitation/request links:

```powershell
npx supabase secrets set VANSH_APP_URL=http://localhost:5173
```

For a deployed test build, use that deployment URL instead of localhost.

Request-notification email also needs a mail provider key/sender:

```powershell
npx supabase secrets set RESEND_API_KEY=YOUR_KEY VANSH_FROM_EMAIL="Vansh <you@yourdomain.com>"
```

If these mail secrets are absent, the in-app inbox still remains the source of truth; only the request notification email is skipped/fails.

## 3. Configure signup/sign-in sender branding

Supabase Auth confirmation/sign-in emails are sent by **Supabase Auth**, not by React or the Edge Function. To stop them showing the default Supabase sender, configure **Custom SMTP** in the Supabase Authentication email settings for the test project and use a verified sender/domain that you control.

This same Auth SMTP configuration applies to Auth-managed invitation/OTP mail. Do not put SMTP passwords in `.env` used by Vite.

## 4. City search

The location picker first calls the `search-places` Edge Function. v0.13.1 also falls back to a direct Photon/OpenStreetMap-backed city lookup in the browser if the function has not yet been deployed. A selected result stores coordinates; arbitrary typed text is still not saved.

## 5. Family Journey map

The Family Journey now renders an interactive OpenStreetMap/Leaflet map with pan, zoom, markers, and migration routes. Leaflet is loaded at runtime from the unpkg CDN. If the map library/tile service is unreachable, Vansh shows the built-in fallback map rather than a blank panel.

## 6. Test accounts

Use at least two separate browser sessions/accounts for items 20–28:
- Account A: graph owner/record creator
- Account B: claimant/invitee/collaborator

Use a disposable third account for account-deletion tests.
