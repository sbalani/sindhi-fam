# Vansh changelog

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
