import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const editor = readFileSync(new URL("../src/components/FamilyConnectionsEditor.jsx", import.meta.url), "utf8");
const migration = readFileSync(
  new URL("../supabase/migrations/20260922114500_allow_connection_based_relative_creation.sql", import.meta.url),
  "utf8",
);

test("new relatives use graph connections instead of a mandatory direct relationship", () => {
  assert.doesNotMatch(app, />\s*Related directly to\s*</);
  assert.match(app, /Connection when family details are unknown/);
  assert.match(app, /No additional relationship/);
  assert.match(app, /hasExistingConnection\(connections\)/);
  assert.match(app, /!hasSelectedExistingConnection/);
  assert.match(app, /const bundle = \{ fallback: primary, \.\.\.connections \}/);
  assert.match(app, /canReuse: Boolean\(people\.find/);
  assert.match(app, /person\.canEdit/);
  assert.match(app, /Managed by another relative/);
  assert.match(editor, /Children of \{subjectName\}/);
  assert.match(editor, /Shared parents let Vansh infer siblings/);
});

test("connection-based creation remains atomic, managed, bounded, and validated", () => {
  assert.match(migration, /not private\.can_manage_member\(auth\.uid\(\),v_anchor\)/);
  assert.match(migration, /coalesce\(p_bundle->'fallback',p_bundle->'primary'\)/);
  assert.match(migration, /coalesce\(p_bundle->'children','\[\]'\)/);
  assert.match(migration, /jsonb_array_length\(coalesce\(p_bundle->'children','\[\]'\)\)>50/);
  assert.match(migration, /private\.valid_relationship_evidence/);
  assert.match(migration, /Every connected person must be visible in the same family graph/);
  assert.match(migration, /Choose an existing parent, child, or partner, or provide a fallback relationship/);
  assert.match(migration, /A fallback relationship cannot be combined with an existing parent, child, or partner/);
  assert.match(migration, /The same person cannot be selected twice in one connection group/);
  assert.match(migration, /v_legacy_primary/);
  assert.match(migration, /also_parent_of_anchor/);
  assert.match(migration, /'person_a_id',p_member_id,'person_b_id',\(v_item->>'person_id'\)::uuid,'relationship_type','parent'/);
  assert.match(migration, /perform public\.link_family_members_batch\(v_links,v_link_key\)/);
  assert.match(migration, /revoke all on function public\.link_family_members_bundle\(uuid,uuid,jsonb,uuid\) from public,anon/);
});
