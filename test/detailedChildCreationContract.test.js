import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const editor = readFileSync(new URL("../src/components/FamilyConnectionsEditor.jsx", import.meta.url), "utf8");
const migration = readFileSync(
  new URL("../supabase/migrations/20260922183710_add_children_during_relative_creation.sql", import.meta.url),
  "utf8",
);

test("add-person popup exposes detailed child creation without exposing every new-person control", () => {
  assert.match(app, /allowNewPeople=\{Boolean\(person\?\.canEdit\)\}/);
  assert.match(app, /allowNewChildren=\{!person \|\| Boolean\(person\?\.canEdit\)\}/);
  assert.match(editor, /allowNewChildren = allowNewPeople/);
  assert.match(editor, /allowNewChildren && <option value=\{NEW_PERSON\}>Create a new child with details…<\/option>/);
  assert.match(editor, /mode: allowNewChildren \? "new" : "existing"/);
  assert.match(editor, /link\.mode === "new" && \(\s*<NewPersonFields/);
  assert.match(editor, /link\.mode === "new" \|\| allowExistingChildCoParent/);
  assert.match(app, /Create new to include children/);
});

test("new person and detailed children use one atomic RPC", () => {
  assert.match(app, /additions\.children\.filter\(\(child\) => child\.new_person\)/);
  assert.match(app, /rpc\("create_family_relative_with_new_children"/);
  assert.match(app, /p_additions: newChildAdditions/);
  assert.match(migration, /function public\.create_family_relative_with_new_children/);
  assert.match(migration, /perform private\.lock_family_graph\(v_owner\)/);
  assert.match(migration, /v_result:=public\.create_family_relative\(p_anchor_id,p_details,p_bundle,v_create_key\)/);
  assert.match(migration, /insert into public\.family_members\(/);
  assert.match(migration, /'person_a_id',v_member\.id,'person_b_id',v_person,'relationship_type','parent'/);
  assert.match(migration, /v_relationship_ids:=public\.link_family_members_batch\(v_links,v_link_key\)/);
  assert.match(migration, /family_mutation_requests/);
  assert.match(migration, /request_hash/);
});

test("detailed child creation is bounded, validated, and authenticated-only", () => {
  assert.match(migration, /jsonb_array_length\(coalesce\(p_additions->'children','\[\]'::jsonb\)\) not between 1 and 20/);
  assert.match(migration, /pg_column_size\(p_details\)\+pg_column_size\(p_bundle\)\+pg_column_size\(p_additions\)>1048576/);
  assert.match(migration, /private\.valid_relationship_evidence/);
  assert.match(migration, /private\.can_manage_member\(v_user,v_anchor\)/);
  assert.match(migration, /The other parent must be a recorded partner in this family/);
  assert.match(migration, /revoke all on function public\.create_family_relative_with_new_children.*from public,anon/);
  assert.match(migration, /grant execute on function public\.create_family_relative_with_new_children.*to authenticated/);
});
