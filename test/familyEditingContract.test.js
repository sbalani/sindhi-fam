import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260920090000_reconcile_launch_family_editing.sql", import.meta.url), "utf8");

const sourceFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) return sourceFiles(url);
    return /\.[jt]sx?$/.test(entry.name) ? [url] : [];
  });

const mutationChainsFor = (source, table) => {
  const marker = new RegExp(`\\.from\\(["']${table}["']\\)`, "g");
  return [...source.matchAll(marker)].map((match) => {
    const semicolon = source.indexOf(";", match.index);
    return source.slice(match.index, semicolon < 0 ? source.length : semicolon + 1);
  });
};

test("browser graph mutations use RPCs instead of table DML", () => {
  for (const file of sourceFiles(new URL("../src/", import.meta.url))) {
    const source = readFileSync(file, "utf8");
    for (const chain of mutationChainsFor(source, "relationships")) {
      assert.doesNotMatch(chain, /\.(?:insert|upsert|update|delete)\(/, `${file.pathname} relationship chain is read-only`);
    }
    for (const chain of mutationChainsFor(source, "family_members")) {
      assert.doesNotMatch(chain, /\.(?:insert|upsert|update|delete)\(/, `${file.pathname} member chain is read-only`);
    }
  }
  for (const rpc of ["ensure_self_family_member", "edit_family_member", "create_family_relative", "add_placeholder_siblings", "link_family_members", "delete_family_member"]) {
    assert.match(app, new RegExp(`rpc\\(["']${rpc}["']`));
  }
});

test("reconciliation keeps one audit stack and revokes graph DML", () => {
  assert.match(migration, /drop trigger if exists record_family_member_revision/);
  assert.match(migration, /drop trigger if exists record_relationship_revision/);
  assert.match(migration, /revoke all privileges on table public\.relationships from public, anon, authenticated/);
  assert.match(migration, /revoke all privileges on table public\.family_members from public, anon, authenticated/);
  assert.match(migration, /grant select on table public\.family_members to authenticated/);
  assert.match(migration, /grant select on table public\.relationships to authenticated/);
  for (const table of ["family_members", "relationships"]) {
    const grants = [...migration.matchAll(new RegExp(`grant\\s+([^;]+)\\s+on table public\\.${table}\\s+to\\s+([^;]+)`, "gi"))];
    assert.ok(grants.length > 0, `${table} has an explicit read grant`);
    for (const grant of grants) assert.equal(grant[1].trim().toLowerCase(), "select");
  }
  assert.doesNotMatch(migration, /grant [^;]*(?:delete|truncate|trigger|references)[^;]* on table/i);
  assert.match(migration, /relationship_status in \('current', 'former', 'unspecified'\)/);
  assert.match(migration, /relationship_variant in \('biological', 'adoptive', 'step', 'guardian'\)/);
});

test("self onboarding is server-derived, graph-locked, and idempotent", () => {
  const start = migration.indexOf("function public.ensure_self_family_member");
  const end = migration.indexOf("create or replace function", start + 30);
  const body = migration.slice(start, end);
  assert.ok(start >= 0, "ensure_self_family_member exists");
  assert.match(body, /v_user uuid:=auth\.uid\(\)/);
  assert.match(body, /from public\.profiles where id=v_user/);
  assert.ok(body.indexOf("private.lock_family_graph") < body.indexOf("for update"));
  assert.match(body, /where owner_id=v_user and is_self/);
  assert.match(body, /if found then/);
});

test("claimed identity synchronization covers every rich canonical field", () => {
  const start = migration.indexOf("function private.sync_claimed_identity");
  const end = migration.indexOf("drop trigger if exists family_members_guard_write", start);
  const body = migration.slice(start, end);
  for (const field of [
    "alternate_names",
    "birth_approximate",
    "birth_location",
    "lived_locations",
    "death_date",
    "death_year",
    "death_approximate",
    "death_location",
    "death_place",
    "fact_confidence",
    "provenance_note",
    "privacy_level",
  ]) {
    assert.match(body, new RegExp(`new\\.${field}`), `${field} is detected and propagated`);
  }
});

test("relationship snapshots and editor writes retain evidence", () => {
  assert.match(migration, /'confidence',r\.confidence,'provenance_note',r\.provenance_note/g);
  assert.match(migration, /confidence=coalesce\(c\.confidence,r\.confidence\)/g);
  assert.match(migration, /provenance_note=coalesce\(c\.provenance_note,r\.provenance_note\)/g);
});

test("atomic edits and corrections enforce graph-first locking and stale hashes", () => {
  for (const functionName of ["private.apply_family_member_edit", "public.propose_family_correction", "public.respond_profile_correction"]) {
    const start = migration.indexOf(`function ${functionName}`);
    const end = migration.indexOf("create or replace function", start + 30);
    const body = migration.slice(start, end < 0 ? undefined : end);
    assert.ok(start >= 0, `${functionName} exists`);
    assert.ok(body.indexOf("private.lock_family_graph") < body.indexOf("for update"), `${functionName} locks graph first`);
    assert.match(body, /expected_relationship_hash|relationship_hash/);
  }
});
