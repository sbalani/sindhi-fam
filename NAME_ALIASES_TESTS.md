# Vansh v0.15 — test checklist

## 1. Apply database migration
Run:

```powershell
npx supabase db push --dry-run
```

The new migration should be:

`20260914153000_explicit_name_aliases.sql`

Then apply it:

```powershell
npx supabase db push
```

Verify:

```powershell
npx supabase migration list
```

Local and Remote should match for `20260914153000`.

## 2. Code checks

```powershell
npm test
npm run lint
npm run build
npm run dev
```

Expected automated test result: 25 passing tests. The two existing Fast Refresh warnings in `FamilyConnectionsEditor.jsx` are non-blocking.

## 3. Add aliases
1. Open a family member and choose Edit details.
2. Under Alternate names choose Add name.
3. Add a Sindhi-script alias, for example `رميش نانواڻي`.
4. Add a Roman or historical spelling, for example `Ramesh Nanwani`.
5. Save.
6. Re-open the person and confirm the aliases persist.
7. Open the person's profile and confirm they appear under “Also known as”.

## 4. Search
1. Give a person a primary name different from one of the aliases.
2. Search My Family using the alias. The person should appear.
3. Use Global Search with the same alias. The person should appear.
4. Search a Sindhi-script alias and its Roman spelling; both should resolve through the existing Sindhi-aware matcher when appropriate.

## 5. Claimed-profile permissions
1. Account A owns/claims a profile.
2. Account B, who can view that profile, chooses Suggest correction.
3. B adds or changes an alternate name.
4. A should receive the correction request.
5. The alias must not change until A accepts.
6. After A accepts, it should appear on the profile and in search.

## 6. Duplicate detection
1. Existing person primary name: `Ramesh Nanwani`.
2. Add explicit alias: `Ramesh N. Nanwani`.
3. Try to add a new family member whose primary name is exactly `Ramesh N. Nanwani` in the same family graph.
4. Vansh should present the existing person as a possible duplicate rather than silently creating/merging.

## 7. Merge preservation
1. Create two unclaimed duplicate test records.
2. Put an alias only on the record that will be merged away.
3. Merge the records using duplicate cleanup.
4. Open the kept record. The alias from the merged record should still exist.

## 8. Identity privacy
For a cross-graph identity candidate that matched via an alias, verify the pre-approval card says only that a recorded alternate name matches. The exact private alias should not be displayed by the candidate RPC.
