# Vansh launch-hardening test checklist

This checklist is for the September 14, 2026 launch-hardening patch. Use disposable accounts.

## 0. Apply and deploy

From the project root:

```powershell
npm ci
npm test
npm run lint
npm run build
npx supabase migration list
```

Check the migration list **before** pushing. If your remote migration history is aligned with this repository, run:

```powershell
npx supabase db push
npx supabase functions deploy search-places
npx supabase functions deploy send-family-invite
npx supabase functions deploy send-request-notification
npx supabase functions deploy delete-account
```

If the remote migration history is not aligned, do not force or repair old migration history blindly. In Supabase SQL Editor, apply only the missing launch migrations in timestamp order:
1. `20260830110000_account_persistence_family_updates.sql` if it is not already applied.
2. `20260914143000_launch_privacy_hardening.sql`.

Expected:
- unit tests pass;
- ESLint has no errors;
- Vite production build succeeds;
- both launch migrations above are applied.

Do not commit `node_modules`, `voice_backend/.venv`, `.env`, `dist`, or `supabase/.temp`.

## 1. Onboarding cannot trap a new user

1. Create Account A.
2. Add parent 1.
3. Confirm the checklist asks for parent 2.
4. Add parent 2.
5. Add one grandparent.
6. Press **I don't know more grandparents — continue**.
7. Confirm the checklist advances to **Known places**.
8. Press **Add a family place**.
9. Select a family member, search for a city, select it, and save.

Expected:
- two-parent flow works;
- grandparent step can be skipped;
- the Journey page can actually add/edit a place.

## 2. Place-search authentication

Signed in:
1. Open any location picker.
2. Search `Hyderabad`.
3. Confirm city results appear.

Signed out / direct function test:
1. Call the deployed `search-places` function without an Authorization bearer token.
2. Expected HTTP status: `401`.

Burst test:
1. Send more than 30 direct calls within one minute using the same signed-in token.
2. Expected: later calls receive `429` with `Retry-After: 60`.

Note: the UI retains a direct Photon fallback for resilience, so test the Edge Function directly when checking the 401/429 behavior.

## 3. Family-update notifications

1. Account A creates a tree and adds a grandparent.
2. A invites Account B and B accepts.
3. In B's session, edit a family record that A can access.
4. Return to A.

Expected:
- A's Connections badge/bell count increases;
- **Connections → Family tree updates** shows the change;
- B does not receive a notification for B's own edit;
- **Mark all read** clears the unread count.

## 4. Shared-tree account deletion

1. Account A creates a tree.
2. A invites B and B accepts.
3. Record the names/relationships in the tree.
4. In A, open profile → **Delete my account**.
5. Confirm the preview says the shared tree will be preserved.
6. Type `DELETE` and complete deletion.
7. Sign in as B.

Expected:
- A's Auth account is gone;
- B can still see the shared family records and relationships;
- the family graph remains `active`;
- any record previously linked to A is unlinked rather than deleting the genealogy;
- B can still edit records they are allowed to manage.

Repeat once by deleting a disposable owner directly in **Supabase → Authentication → Users**. The same preservation trigger must run.

## 5. Solo-tree deletion safety

1. Create Account C with no collaborator.
2. Add at least one family record.
3. Delete C's account.

Expected:
- the graph is not immediately destroyed;
- `family_graphs.status = 'orphaned'`;
- `retention_until` is approximately 30 days after deletion.

This release creates the safety archive state; permanent orphan cleanup should be a separate reviewed retention job, not an implicit cascade.

## 6. Claim after original owner deletion

This tests the edge case fixed by the launch patch.

1. A creates an unclaimed person record for `Ravi Nanwani` with DOB/place data.
2. A invites B into that graph; B accepts.
3. A deletes their account.
4. Create Account C with profile details strongly matching Ravi.
5. C opens **Connections** and requests the identity claim.

Expected:
- the suggestion is still available if privacy settings permit it;
- the request is routed to an active relative/collaborator (B), not the deleted A UUID;
- B can accept/reject it.

## 7. Matching privacy

Create two accounts/graphs that intentionally satisfy the match rules.

Expected before mutual approval:
- candidate names are masked, e.g. `Ravi N.` or `R. Nanwani`;
- exact birth date is never returned;
- exact birth year/location fields are not returned by the matching RPC;
- the UI shows qualitative clues such as **Same birth place as your profile**;
- no email address or full family tree is exposed.

Check the Network panel/RPC response, not only what React renders.

## 8. RLS isolation

Use unrelated Accounts A and D.

Expected:
- D cannot select A's private family records through direct Supabase queries;
- D cannot update/delete A's records;
- D only receives records made available through an accepted invitation/verified workflow.

Run `supabase/tests/p1_p2_rls.sql` as the regression guide after a local reset.

## 9. Export

From Profile:
1. Export JSON.
2. Export CSV.
3. Export GEDCOM.

Expected:
- each file downloads;
- JSON contains people + relationships;
- CSV opens with one person per row;
- GEDCOM imports into a genealogy viewer without malformed header/trailer records.

## 10. Final release smoke test

Test desktop + mobile width:
- signup/signin;
- add/edit/delete an unclaimed relative;
- add two parents;
- spouse/remarriage fields;
- family tree filters and zoom;
- Journey place editing;
- invitation acceptance/rejection;
- identity claim acceptance/rejection;
- family match request;
- notification badge;
- profile privacy save;
- export;
- account deletion.

Do not launch publicly until the production database migrations and Edge Functions match the code being deployed.
