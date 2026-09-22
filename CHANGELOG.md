# Vansh changelog

## 0.17.4 - Clearer family paths

- Reduced avoidable family-tree crossings and connector lengths by ordering generations in both directions.
- Oriented couples toward their recorded parent branches and kept the reported family groups together.
- Added direct-connection highlighting for pointer and keyboard focus.
- Added deterministic family-unit colors across couples, children and later generations.

## 0.17.3 - Detailed relatives and cleaner family branches

- Added atomic creation of detailed children with an optional recorded co-parent.
- Replaced new spouse placeholders with named spouse and partner details.
- Added sibling creation that copies recorded parents or marks a different-parent half sibling.
- Grouped family-tree branches beneath their actual parent couples and separated unrelated connector lanes.

## 0.17.2 - Relationship-first family entry

- Removed the mandatory direct-relative choice when adding a person.
- Added parent, child and partner connections that place a person in the graph and infer relationships such as siblings.
- Kept direct relationships as an optional fallback only when immediate family details are unknown.

## 0.17.1 - Clearer relationship editing and tree navigation

- Added atomic creation of a fully named spouse or partner from an existing person's connection editor.
- Clarified that the parent rows belong to the new person and removed direct anchors and descendants from cycle-prone choices.
- Added middle-mouse drag panning to both desktop family-tree views.

## 0.17.0 - Private friends and clearer family trees

- Added exact-code friend requests with independent, reciprocal tree-sharing controls.
- Added privacy-filtered, read-only friend trees and recorded relationship paths when both people exist in the shared graph.
- Kept friendship separate from family matching, identity claims, genealogy editing and raw family-table access.
- Grouped current couples while preserving precise parent and remarriage edge endpoints.
- Added anchor-aware surname suggestions and functional mobile tree zoom-out.
- Added migrations `20260922075915_add_private_friendships.sql` and `20260922080805_harden_friend_tree_privacy.sql`.

## 0.16.0 - Voice import and family chronology

- Replaced the one-relative voice helper with a review-first, multi-person family-story import.
- Added an authenticated, graph-locked and idempotent RPC that saves each confirmed import atomically.
- Prevented detached relatives, oversized audio, hidden background saves and anonymous RPC execution.
- Added stable route colors, an interactive route legend and a dated cross-family chronology to Family Journey.
- Preserved the Privacy Policy and Terms of Use as visibly marked drafts until operator, contact, domain and jurisdiction details are supplied.
- Added migrations `20260921110236_add_voice_family_import.sql` and `20260921111409_harden_voice_family_import.sql`.

## 0.15.1 - Family editing hardening

- Made multi-edge sibling linking one graph-locked, validated, idempotent transaction.
- Required visibility of both relationship endpoints and management of at least one endpoint.
- Added identity-first advisory locking and deterministic claimed-identity synchronization across graphs.
- Aligned unknown-sibling totals with full, half, step and explicitly reported sibling semantics.
- Preserved confidence and provenance through relative creation, linking and correction proposals.
- Enabled relationship corrections, rejected no-op proposals, cleared hidden partnership fields, and surfaced snapshot load failures.
- Added replay contracts for legacy relationship variants and the `can_access_family_member` function signature.
- Added forward migration `20260920120000_v0151_family_editing_hardening.sql`.
- Added a guarded compatibility migration for legacy invitation-access helpers.

## 0.12.0 — P0 trust, identity and graph foundation

This release preserves existing family data and changes how identity, editing and family matching are handled.

### Identity verification

- Removed automatic identity/invitation linking on app load.
- Added explicit identity claim suggestions: “This might be you”.
- Identity claims require a request plus approval by the other party.
- Added an opaque `person_identity_id` UUID for every family member. Personal data is never encoded into the identifier.
- Reused the existing `identity_claim_requests` and `verified_identity_links` architecture.
- Added an identity code display derived from the UUID for human-readable reference only.

### Claimed-person authority

- Once a family record is claimed, the linked person becomes authoritative for identity fields.
- Other relatives can no longer directly overwrite a claimed person’s identity data.
- Relatives can submit a correction suggestion instead.
- Claimed records are protected against normal client deletion.
- Accepted corrections update the claimed identity consistently across records representing the same verified person.

### Verification inbox

- Added a notification/verification inbox in the header.
- Keeps identity claims, family matches, invitations and correction suggestions visibly separate.
- Incoming requests can be accepted or rejected explicitly.
- Pending notification count is now dynamic instead of a hard-coded badge.

### Invitations

- Invitations no longer imply automatic identity acceptance.
- Added explicit invitation accept/reject handling.
- Invitations expire after 30 days.
- Added duplicate-pending-invitation protection.
- Added a basic sender rate limit in the Edge Function.
- Production/staging redirect URL now uses `VANSH_APP_URL` instead of being hard-coded.

### Duplicate prevention and merge

- Before creating a non-placeholder person, Vansh checks the current family graph for likely duplicates.
- The user can use the existing person or deliberately create a separate record.
- Added an explicit merge workflow with side-by-side field choices.
- Claimed people and self records cannot be silently merged.
- Pending identity claims block a merge until resolved.
- Relationship, invitation and request references are transferred safely during a merge.
- Added a merge audit table.

### Family graph model

- Sibling status is derived from parent links instead of relying on a standalone sibling label.
- One shared parent = half sibling.
- Two or more shared parents = full sibling.
- Added relationship variants for parent relationships such as biological, adoptive, step and guardian.
- Partnership relationships support current/former/unspecified variants.
- The model supports multiple parent and partner relationships instead of assuming one fixed couple unit.

### Database permissions

- Added a canonical baseline schema for new Supabase projects.
- Added an additive P0 migration for the current live database; it does not truncate/reset existing rows.
- Added database-side permission helpers and RLS policies.
- Added a write guard so browser clients cannot directly change graph ownership or identity linkage.
- Claimed-person restrictions are enforced in Postgres, not only in React.
- Workflow tables are accessed through `SECURITY DEFINER` RPCs rather than direct browser CRUD.

### UI/data improvements

- Added exact date-of-birth support alongside birth year.
- Added duplicate review and merge modal UI.
- Added claimed/unclaimed status treatment and correction actions.
- Added parent-selection guidance for full vs half siblings.
- Version bumped from 0.11.1 to 0.12.0.

## 0.13.2 — Account persistence, family update activity, onboarding repair
- Decoupled persistent family graph keys from `auth.users` so deleting a login no longer cascades through shared genealogy.
- Accepted/shared invitation access now survives deletion of the original inviter; deleted account attribution becomes null rather than deleting family facts.
- Added a 30-day orphaned-tree safety state for a tree with no surviving account, while shared trees remain active.
- Added account-deletion impact preview and simplified the delete Edge Function so it no longer tries to rewrite graph ownership through guarded browser-write triggers.
- Added family tree update notifications for accessible changes made by another relative.
- Fixed onboarding to require two parents, anchor grandparents to the actual parent instead of the signed-in user, and allow unknown grandparents to be skipped.
