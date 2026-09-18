# Vansh v0.15 — Explicit alternate names

Each family member can now keep deliberate alternate names without changing the primary display name.

Supported alias categories:
- Sindhi-script name
- Roman spelling
- Former / earlier name
- Historical spelling
- Other

Aliases are stored in `family_members.alternate_names` as a JSON array of `{ name, kind }` objects. The UI limits a person to 20 aliases, each up to 160 characters.

## Behaviour
- My Family search includes aliases.
- Global search includes aliases.
- Person profiles show aliases under “Also known as”.
- Same-graph duplicate detection can match a newly entered primary name against an existing explicit alias.
- Cross-graph identity discovery can use an exact explicit alias internally, but does not expose the alias before approval.
- Claimed profiles keep the existing correction workflow: relatives propose alias changes rather than overwriting them.
- Duplicate merges preserve aliases from the record being merged away.

The existing Sindhi/Roman-Sindhi phonetic search remains client-side. Explicit aliases complement that fuzzy layer by storing spellings the family knows are genuinely associated with the person.
