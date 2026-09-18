# Vansh launch-hardening changes — 2026-09-14

This patch is based on the uploaded `sindhi-fam(2).zip`.

## What was already present in the uploaded version

The uploaded version already contained:
- P0 identity/permissions migrations;
- mutual identity verification;
- family invitations;
- account deletion Edge Function;
- durable `family_graphs`;
- family-update notifications;
- profile export (JSON/CSV/GEDCOM);
- onboarding with two-parent flow and grandparent skip;
- Journey place editing.

Those features were not duplicated.

## Changes in this patch

### Database/privacy
- Added `20260914143000_launch_privacy_hardening.sql`.
- Pre-approval identity/family/surname matching now returns masked names and qualitative clues rather than exact birth year/location fields.
- Added `private.graph_contact_user(...)` so preserved graphs can route new verification/match requests to an active relative after the original creator deletes their account.
- Identity claim request/dismiss and family-match dismiss now use an active graph contact instead of assuming the graph UUID is still an Auth user.
- Orphaned graphs with no active reviewer are not offered as claimable identity suggestions.

### Place search
- `search-places` now requires a valid Supabase Auth bearer token.
- Added a best-effort 30-requests/minute per-user in-instance throttle.
- Server responses use private caching.
- The existing direct Photon fallback remains in the browser for resilience.

### React/runtime stability
- Fixed conditional-hook usage in onboarding.
- Fixed ref writes during render in realtime refresh and dialog accessibility.
- Avoided synchronous identity-prompt state changes inside an effect.
- Removed two unused values that made lint fail.
- Updated the test script so Node only runs project tests rather than accidentally traversing renamed dependency folders.

### Repository hygiene
- Cleaned `.gitignore`.
- Added ignores for Python virtual environments, Supabase temp data and generated output.
- ESLint now ignores generated/dependency folders.

## Validation performed here

- `npm test`: **11 passed, 0 failed**.
- ESLint: **0 errors**, 3 Fast Refresh development warnings.
- Production Vite build could not be executed in the Linux sandbox because the uploaded `node_modules` contains the Windows Rolldown native binary. Run `npm ci` on the target machine, then `npm run build`.

See `LAUNCH_HARDENING_TESTS.md` for the end-to-end release test plan.
