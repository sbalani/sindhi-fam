# Vansh v0.14.0 — Mutual identity verification

## Added

- Random Vansh person IDs (`person_identity_id`) for every family-member record.
- Expanded sign-up identity data: first name, surname, date of birth, birth place, and current location.
- Opt-in same-surname discovery, disabled by default.
- Strong **Could this be you?** matching against unlinked family records.
- Reverse identity matching when a family creator adds/edits a relative whose details strongly match an existing Vansh account; the registered user must still approve.
- Mutual identity-claim workflow: claimant requests, original record owner approves/rejects.
- Verified identity-link records without automatically merging either family tree.
- Privacy-limited same-surname discovery between registered users.
- Mutual family-connection requests for surname leads.
- Bell notification drawer for incoming verification requests.
- New Connections hub with profile matching settings, identity candidates, surname discovery, and request history.
- User-visible random `VNSH-...` identifier on family-member cards.
- Verified family records receive a **Verified Vansh identity** status after both sides accept.
- Anonymous Sindhis-worldwide counts deduplicate records that have been mutually verified as the same person, reducing double-counting across trees.
- Full date-of-birth field for family members in addition to approximate birth year.

## Voice import

- Relationship is now editable during one-by-one review, including a **Not sure / choose relation** state instead of forcing a fallback relation.
- Corrected relation rewrites the draft graph before saving.
- Supports direct, half, step, adoptive, spouse/partner, maternal/paternal grandparent, and maternal/paternal uncle/aunt corrections.
- A fragment beginning with `from ...` after a kinship cue is no longer treated as a person's literal name.

## Privacy model

- The random person ID references identity data; it does not contain or hash personal details into a visible identifier.
- Same-surname discovery returns only data from users who explicitly opt in.
- Full dates of birth and email addresses are never returned by surname discovery.
- No identity or family connection is verified from a one-sided suggestion.
- Identity verification does not automatically merge family graphs.
