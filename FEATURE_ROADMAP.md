# Proposed Feature Roadmap

The remote feature branches were reviewed as product proposals rather than merged.

## Shipped First

### Private family Places

- Maps only records already visible through existing family graph RLS.
- Uses the structured city coordinates already stored on member records.
- Supports both current `latitude`/`longitude` and proposed `lat`/`lon` shapes.
- Flags legacy or unmapped places for correction.

### Relationship qualifiers

- Half-sibling is stored as `sibling + half`.
- Adoptive parent is stored as `parent + adoptive`.
- Qualifiers are available in both add-relative and link-existing flows.
- Step relationships are deferred because storing them as ordinary parent edges would produce false ancestry.

## Next Isolated Project

### Reviewed typed-story import

The safe flow is:

1. Select the narrator.
2. Type or paste a family story.
3. Interpret it into an editable draft.
4. Review every proposed person and direct relationship.
5. Commit the reviewed payload through one transactional, idempotent Supabase RPC.

The RPC must validate all references before writing, derive graph ownership from the authenticated user, insert people and relationships in one transaction, and return the previous result when an idempotency key is retried. Parser output is untrusted and never writes directly to family records.

Microphone capture and transcription are separate from interpretation. They remain deferred until recording cleanup, browser-service disclosure, language accuracy, upload limits, authentication, and temporary-audio deletion are addressed.

## Deferred For Product And Privacy Design

### Step-family modeling

Step-parent and step-sibling connections need explicit social-family semantics rather than qualified biological parent edges.

### Mutual identity verification and surname discovery

This requires explicit consent, rate limits, abuse controls, revocation, audit history, and clear ownership/access outcomes. Private profile data must not be probeable through broad security-definer matching functions.

### Community diaspora map

A safe aggregate requires graph-owner opt-in, coarse geography, separate birth/residence time semantics, minimum cohort suppression, fixed aggregate releases, and protection against differencing attacks. Raw or singleton coordinates must never be returned.
