# Vansh P1/P2 Test Checklist

This checklist covers the P1, P2, Engineering, and follow-up implementation in branch `p1-p2-all`.

## Automated checks

- [ ] Run `npm ci`
- [ ] Run `npm test` — current utility suite: 11/11 passing in the provided working copy
- [ ] Run `npm run lint`
- [ ] Run `npm run build`
- [ ] Apply migrations to a clean Supabase project / run a local Supabase reset
- [ ] Execute `supabase/tests/p1_p2_rls.sql` against the test database

> Note: `npm run build` could not be verified in the packaging environment because dependency installation timed out and `vite` was not available locally. Run `npm ci` first on your machine.

## P1

### P1-12 — Derived family branches
- [ ] Create relatives on maternal and paternal paths.
- [ ] Add a remarriage / multiple-partner path.
- [ ] Verify branch labels are derived relative to the currently viewed/root person rather than stored permanently on the person.

### P1-13 — Provenance and history
- [ ] Create a person and edit the record twice.
- [ ] Verify creator/updater/timestamp/revision metadata is retained.
- [ ] Verify the change history/audit trail records edits.

### P1-14 — Collaborative corrections
- [ ] User A opens a claimed/shared profile owned by User B.
- [ ] User A submits a suggested correction rather than directly overwriting protected fields.
- [ ] User B can review and Accept or Reject it.
- [ ] Verify the record changes only after acceptance.

### P1-15 — Realtime synchronization
- [ ] Open the same family in two browser sessions/accounts.
- [ ] Add/edit a person in session A.
- [ ] Verify session B updates/refetches without a manual full-page refresh.
- [ ] Repeat for relationships/requests/claims.

### P1-16 — Concurrency protection
- [ ] Open the same person for editing in two sessions.
- [ ] Save in A.
- [ ] Attempt to save the stale version in B.
- [ ] Verify a revision/conflict error is shown rather than silently overwriting A.

### P1-17 — Signup identity data
- [ ] Sign up with structured first name, surname, optional birth surname, birth date/year, birthplace and current location.
- [ ] Verify structured location data is stored.
- [ ] Verify the same location component is used as family-member entry.

### P1-18 — Conservative matching
- [ ] Create a same-surname-only record and verify that alone does not produce a strong identity match.
- [ ] Add matching name + birth year/date + place signals and verify score increases.
- [ ] Verify UI says `match score` / `possible match` / `strong match`, not uncalibrated percentage confidence.

### P1-19 — Discoverability
- [ ] Disable profile discoverability.
- [ ] Verify the user is no longer suggested cross-family.
- [ ] Re-enable it and confirm only limited match clues are exposed before approval.

### P1-20 — Invitation preview
- [ ] Create invitation using each scope.
- [ ] Open `Preview shared people` before sending.
- [ ] Verify the exact people shown match what the recipient gains access to.

### P1-21 — Invitation management
- [ ] Verify Pending / Accepted / Expired states.
- [ ] Resend an invitation.
- [ ] Revoke an invitation.
- [ ] Verify expired/revoked links cannot grant access.
- [ ] Verify redirect URL comes from environment configuration rather than a hard-coded production URL.

### P1-22 — Invitation abuse controls
- [ ] Trigger resend/rate-limit protections.
- [ ] Verify quotas prevent rapid repetitive invitation sending.

### P1-23 — Unknown siblings
- [ ] Add two children with the same parent(s) without creating an explicit sibling edge.
- [ ] Verify sibling counts derive from common parents.
- [ ] Verify no extra `Unknown sibling` placeholder appears.

### P1-24 — Person validation
- [ ] Reject blank/whitespace-only names.
- [ ] Reject impossible/future years.
- [ ] Reject death before birth.
- [ ] Reject residence ending/starting impossibly relative to birth.
- [ ] Reject duplicate structured residence entries.

### P1-25 — Death information
- [ ] Add death date/year and place.
- [ ] Verify it appears on detail/edit views and exports.
- [ ] Verify living/deceased state feeds privacy logic.

### P1-26 — Family Journey map
- [ ] Add birthplace/residence locations with coordinates.
- [ ] Verify locations and migration paths render.
- [ ] Test surname/branch/generation/time filters where available.

### P1-27 — Voice-assisted entry
- [ ] Open voice entry.
- [ ] Say/type: `My father's older brother was called Kishore and he lived in Pune.`
- [ ] Verify proposed people/relations are shown before committing.
- [ ] Confirm, then verify the resulting person/relationship.

## P2

### P2-28 — Previously non-functional controls
- [ ] Bell opens notification/request UI.
- [ ] Connections badge is data-driven, not hard-coded.
- [ ] `Find someone` works.
- [ ] Branch filtering works.
- [ ] Surname exploration opens meaningful results.

### P2-29 — Surname statistic
- [ ] Create at least five distinct surnames.
- [ ] Verify dashboard total is >4 when appropriate while the compact visual list may still show only the first four.

### P2-30 — Person detail page
- [ ] Click a person.
- [ ] Verify profile/details open before edit.
- [ ] Verify parents, children, siblings, partners, birth/death, residences, migration/provenance/status and linked-account state are represented where data exists.

### P2-31 — Global search
- [ ] Search a person name.
- [ ] Search a surname.
- [ ] Search a place.
- [ ] Verify results are grouped/actionable rather than plain string matches.

### P2-32 — Onboarding
- [ ] Create a fresh account.
- [ ] Verify guided onboarding for self/family/places/invitation entry.
- [ ] Complete onboarding and verify it does not restart unnecessarily.

### P2-33 — Large-tree interaction
- [ ] Test a larger multi-generation family.
- [ ] Test focus-on-person / relationship path behavior where exposed.
- [ ] Test zoom/pan/scrolling and generation/branch visibility.
- [ ] Verify half/step/remarriage structures remain readable.

### P2-34 — URL routing
- [ ] Directly open `/family`, `/tree`, `/connections`/matching-related routes, journey route and `/person/:id` where applicable.
- [ ] Refresh each route.
- [ ] Verify browser Back/Forward works.
- [ ] Verify Vercel SPA rewrite does not produce 404s.

### P2-35 — Accessibility
- [ ] Keyboard-tab through modals.
- [ ] Verify focus trapping/restoration.
- [ ] Verify Escape closes dialogs.
- [ ] Verify icon buttons have labels.
- [ ] Verify person cards/tree actions can be reached with a keyboard.

### P2-36 — Status wording
- [ ] Inspect unclaimed person.
- [ ] Inspect claimed person.
- [ ] Inspect self-linked/verified person.
- [ ] Inspect record needing review/disputed correction.
- [ ] Verify a generic family record does not receive a misleading verification indicator.

### P2-37 — Export/deletion
- [ ] Export JSON.
- [ ] Export CSV.
- [ ] Export GEDCOM where exposed.
- [ ] Delete an account with private-only records.
- [ ] Delete an account participating in shared family data and verify shared genealogy is not inadvertently destroyed.

### P2-38 — Living-person privacy
- [ ] Test living adult record visibility.
- [ ] Test deceased record visibility.
- [ ] Test a minor/living-person case.
- [ ] Verify cross-graph matching reveals only permitted clues prior to mutual approval.

## Engineering

### Engineering-39 — Modularization
- [ ] Verify new components/hooks/utils are imported and exercised.
- [ ] Verify kinship calculation lives in reusable pure utilities.

### Engineering-40 — Graph tests
- [ ] `npm test` passes.
- [ ] Verify full siblings, half siblings, step siblings, remarriage, branch derivation and de-duplication tests.
- [ ] Execute Supabase RLS test script for permission/data-integrity cases.

### Engineering-41 — Dependency versions
- [ ] Verify `package.json` contains explicit versions and no `latest` dependencies.

### Engineering-42 — Errors/audit/backups
- [ ] Force an application/Edge Function error and verify it is observable/logged as configured.
- [ ] Modify/delete relevant records and inspect audit/change history.
- [ ] Confirm Supabase project backup/PITR settings separately in the Supabase dashboard.

### Engineering-43 — Prototype data
- [ ] Verify old production `src/data.js` is no longer treated as live app data.
- [ ] Verify prototype/seed content is isolated under fixtures.

## Follow-up items 44–49

### 44 — Personal profile via top-right control
- [ ] Open the top-right profile control.
- [ ] Verify personal profile/account details are accessible and editable according to permissions.

### 45 — Tree update after verification
- [ ] Complete an identity claim/verification flow from a second session.
- [ ] Verify the corresponding person updates to the linked account state.
- [ ] Verify duplicate display identities are de-duplicated.

### 46 — Match on first entry / notification
- [ ] Create/sign in with profile attributes that resemble an existing record.
- [ ] Verify a visible identity suggestion/banner/notification appears.
- [ ] Verify no identity is linked automatically.

### 47 — Half-sibling indication
- [ ] Create full siblings (two shared parents).
- [ ] Create half siblings (one shared biological parent).
- [ ] Verify the UI distinguishes the half-sibling relationship visually/textually.

### 48 — Additional mother/parent
- [ ] Create a person who already has a mother/parent.
- [ ] Add another valid parent relation (e.g. adoptive/step/additional parent).
- [ ] Verify it is not blocked by an artificial two-parent/single-mother assumption.

### 49 — Verification/request email
- [ ] Register a new account and verify signup confirmation email behavior.
- [ ] Trigger a supported request/invitation notification and verify the email function receives/sends the expected event.

# v0.13.1 pre-release retest additions

These checks correspond to the issues found during the 30 August manual test round.

## Person creation/edit context
- [ ] Create a new child and use **Parents** in the creation form to select Parent 1 and Parent 2 before saving.
- [ ] Create a parent as a placeholder from the same form; verify the placeholder appears in the tree and can later be opened/filled in.
- [ ] Edit an existing person and add/remove/change their parent links.
- [ ] Add more than two valid parent relationships (e.g. biological + adoptive/step) and verify they coexist.
- [ ] Add spouse/partner relationship while creating/editing a person.
- [ ] Save a marriage/start year.
- [ ] Save an optional divorce/end year and verify end year cannot be before start year.
- [ ] Add a second spouse/partner (remarriage) and verify the first relationship remains.

## Tree scrolling
- [ ] Open a family tree tall enough for the page to scroll.
- [ ] Put the cursor over the white tree canvas and use the mouse wheel/trackpad vertically.
- [ ] Verify the page continues to scroll vertically instead of trapping the wheel inside the tree.
- [ ] Verify horizontal tree scrolling still works when needed.

## Identity suggestion first-entry popup / items 20–24
- [ ] Apply `20260830090000_pre_release_family_context_auth_fixes.sql` first.
- [ ] Account A creates an unclaimed, non-private person with the same first name + surname as Account B plus at least one independent clue (same birth year/date OR matching birthplace/current place).
- [ ] Account B has discoverability enabled and signs in in a separate browser.
- [ ] Verify **Could an existing record be you?** opens automatically once for the candidate in that browser session.
- [ ] Click **Review later**, reload, and verify the dashboard/Connections suggestion remains without automatic linking.
- [ ] Click **Yes, this is me — request verification** and verify Account A receives an inbox request.
- [ ] Accept as Account A and verify the linked person de-duplicates/updates in Account B.
- [ ] Verify Account A can no longer silently overwrite/delete Account B's claimed identity; correction flow is used.
- [ ] Keep the same edit open in both browsers, save A then stale B, and verify revision/concurrency protection.
- [ ] Edit/create in A while B is open and verify Realtime refreshes B without a full page reload.

## Invitations / items 25–26
- [ ] Deploy `send-family-invite` before testing.
- [ ] Preview connection/immediate/extended scope and compare the exact names shown before sending.
- [ ] Send an invitation and verify it appears under invitation activity.
- [ ] Test resend, revoke, accepted and expired states.
- [ ] Verify `VANSH_APP_URL` points to the environment currently being tested.

## Duplicates and merge / items 27–28
- [ ] Create a person with the same normalized name and overlapping year/place as an existing accessible record.
- [ ] Verify Vansh offers **Use existing** / **Create anyway** before saving another record.
- [ ] Choose **Create anyway**, then open merge.
- [ ] Review field differences and merge; verify relationships are preserved and duplicate edges/self-loops are not introduced.

## Onboarding / item 31
- [ ] For a brand-new account, verify You → Parents → Grandparents → Known places → Invite relatives.
- [ ] For an existing/complete account, click **Setup checklist** on Overview to reopen the checklist for testing; use **Hide checklist** when finished.

## Account deletion / item 36
- [ ] Apply the new FK migration, then delete a disposable test user directly from Supabase Authentication > Users. It should no longer return `Database error deleting user`.
- [ ] Deploy `delete-account` before testing the in-app button.
- [ ] Delete a private-only disposable account from Vansh and verify Auth sign-out/deletion completes.
- [ ] Delete a disposable graph owner who has an accepted/verified collaborator and verify the shared graph is transferred rather than destroyed.
- [ ] Confirm no `SUPABASE_SERVICE_ROLE_KEY` is present in `.env`/browser code.

## Email sender
- [ ] Configure Supabase Auth Custom SMTP with a verified sender/domain you control.
- [ ] Create a disposable account and verify the confirmation/sign-in email no longer shows the default Supabase sender.
- [ ] Configure `RESEND_API_KEY`, `VANSH_FROM_EMAIL` and `VANSH_APP_URL`, then trigger a request and verify request-notification mail uses the configured Vansh sender.

## City search + Family Journey
- [ ] Search `Delhi`, `Pune`, `Ajmer` and another city; verify selectable city/country results appear.
- [ ] Temporarily leave `search-places` undeployed/unavailable and verify the direct Photon fallback still returns results where the browser/network permits it.
- [ ] Select a city and verify latitude/longitude-backed data saves; arbitrary typed text alone must not save.
- [ ] Open Family Journey and verify a real OpenStreetMap base map, zoom/pan, markers and route lines.
- [ ] Click a marker to open that person.
- [ ] Verify surname/branch/generation/period filters alter the plotted journeys.
