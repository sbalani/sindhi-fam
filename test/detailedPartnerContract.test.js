import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260922105337_add_atomic_detailed_partners.sql", import.meta.url),
  "utf8",
);
const hardening = readFileSync(
  new URL("../supabase/migrations/20260922110420_harden_atomic_detailed_partners.sql", import.meta.url),
  "utf8",
);
const relatives = readFileSync(
  new URL("../supabase/migrations/20260922125055_add_atomic_detailed_relatives.sql", import.meta.url),
  "utf8",
);
const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const editor = readFileSync(new URL("../src/components/FamilyConnectionsEditor.jsx", import.meta.url), "utf8");

test("named partner creation and relationship editing are one transaction", () => {
  assert.match(migration, /function public\.edit_family_member_with_new_partners/);
  assert.match(migration, /insert into public\.family_members/);
  assert.match(migration, /return private\.apply_family_member_edit/);
  assert.ok(migration.indexOf("private.lock_family_graph") < migration.indexOf("insert into public.family_members"));
  assert.match(app, /rpc\("edit_family_member_with_new_relatives"/);
  assert.match(relatives, /private\.apply_family_member_edit/);
});

test("partner editor enters detailed-person mode and prevents cycle-prone choices", () => {
  assert.match(editor, /link\.mode === "new" \? NEW_PERSON/);
  assert.match(editor, /value === NEW_PERSON \? "new" : "existing"/);
  assert.match(editor, /link\.mode === "new"/);
  assert.doesNotMatch(editor, /Create placeholder spouse \/ partner/);
  assert.match(app, /excludedParentIds=\{excludedParentIds\}/);
  assert.match(app, /relationship\.type === "parent" && relationship\.from === parentId/);
});

test("children and siblings are created atomically with the member edit", () => {
  assert.match(relatives, /function public\.edit_family_member_with_new_relatives/);
  assert.match(relatives, /p_additions jsonb/);
  assert.match(relatives, /p_idempotency_key uuid/);
  assert.match(app, /function PersonModal[\s\S]*idempotencyKey: crypto\.randomUUID\(\)/);
  assert.match(relatives, /'person_a_id',p_member_id,'person_b_id',v_person,'relationship_type','parent'/);
  assert.match(relatives, /has_different_parents/);
  assert.match(relatives, /r\.person_b_id=p_member_id/);
  assert.ok(relatives.indexOf("private.lock_family_graph") < relatives.indexOf("insert into public.family_members"));
  assert.ok(relatives.indexOf("private.apply_family_member_edit") < relatives.indexOf("public.link_family_members_batch"));
  assert.match(relatives, /family_mutation_requests/);
  assert.match(relatives, /p_connections->'parents'.*>50/s);
  assert.match(relatives, /p_connections->'siblings'.*>50/s);
  assert.match(relatives, /jsonb_typeof\(p_details\) is distinct from 'object'/);
  assert.match(relatives, /pg_column_size\(p_details\)\+pg_column_size\(p_connections\)\+pg_column_size\(p_additions\)>1048576/);
  assert.match(relatives, /Spouses and partners require an existing person or person details/);
  assert.match(relatives, /revoke all on function public\.edit_family_member_with_new_relatives.*uuid\) from public,anon/);
  assert.match(relatives, /grant execute on function public\.edit_family_member_with_new_relatives.*uuid\) to authenticated/);
});

test("named partner RPC is authenticated, managed, validated, and direct DML remains revoked", () => {
  assert.match(migration, /private\.can_manage_member\(v_user,v_member\)/);
  assert.match(migration, /k\.key<>all\(array\['first_name','surname','nickname','maiden_name','gender','birth_date'\]\)/);
  assert.match(hardening, /jsonb_array_length\(coalesce\(p_connections->'partners','\[\]'::jsonb\)\)>50/);
  assert.match(hardening, /v_birth_date>current_date/);
  assert.match(migration, /revoke all on function public\.edit_family_member_with_new_partners.*from public,anon/);
  assert.match(migration, /grant execute on function public\.edit_family_member_with_new_partners.*to authenticated/);
});
