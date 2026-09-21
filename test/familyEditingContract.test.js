import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260920090000_reconcile_launch_family_editing.sql", import.meta.url), "utf8");
const hardening = readFileSync(new URL("../supabase/migrations/20260920120000_v0151_family_editing_hardening.sql", import.meta.url), "utf8");
const diagnostic = readFileSync(new URL("../supabase/tests/v0151_family_editing_diagnostic.sql", import.meta.url), "utf8");

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
  for (const rpc of ["ensure_self_family_member", "edit_family_member", "create_family_relative", "add_placeholder_siblings", "link_family_members_bundle", "link_family_members_batch", "delete_family_member"]) {
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
  const start = hardening.indexOf("function private.sync_claimed_identity");
  const end = hardening.indexOf("create or replace function private.valid_relationship_evidence", start);
  const body = hardening.slice(start, end);
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

test("member mutations lock identities, sorted graphs, then sorted replica rows", () => {
  const start = hardening.indexOf("function private.lock_member_mutation");
  const end = hardening.indexOf("create or replace function private.lock_family_graph", start);
  const body = hardening.slice(start, end);
  assert.ok(body.indexOf("pg_advisory_xact_lock") < body.indexOf("for v_owner"));
  assert.ok(body.indexOf("for v_owner") < body.indexOf("for update"));
  assert.match(body, /order by fm\.owner_id, fm\.id\s+for update/);
  assert.match(hardening, /Claimed identity mutations require the identity advisory lock/);
});

test("batch links validate visibility, management, evidence, and cycles before insert", () => {
  const start = hardening.indexOf("function public.link_family_members_batch");
  const end = hardening.indexOf("create or replace function public.link_family_members(", start);
  const body = hardening.slice(start, end);
  const insert = body.indexOf("insert into public.relationships");
  assert.match(body, /can_view_member\(auth\.uid\(\),a\)/);
  assert.match(body, /can_view_member\(auth\.uid\(\),b\)/);
  assert.match(body, /can_manage_member\(auth\.uid\(\),a\).*can_manage_member\(auth\.uid\(\),b\)/s);
  assert.match(body, /valid_relationship_evidence/);
  assert.match(body, /with recursive parent_edges/);
  assert.ok(body.indexOf("valid_relationship_evidence") < insert);
  assert.ok(body.indexOf("with recursive parent_edges") < insert);
  assert.match(body, /delete from intended_family_links duplicate/);
  assert.match(body, /Family relationship endpoint not found.*errcode='P0002'/s);
});

test("bundles require a valid primary type and matching direction", () => {
  const start = hardening.indexOf("function public.link_family_members_bundle(");
  const end = hardening.indexOf("create or replace function public.link_family_members_bundle(p_anchor_id", start);
  const body = hardening.slice(start, end);
  assert.match(body, /type',''\)='parent'.*direction',''\) in \('from-anchor','to-anchor'\)/s);
  assert.match(body, /type',''\) in \('sibling','spouse','partner'\).*direction',''\)='symmetric'/s);
  assert.match(body, /Invalid primary relationship type or direction/);
  assert.doesNotMatch(body, /Anchor not found|Both records must be visible/);
  assert.match(body, /Family member not found\.' using errcode='P0002'/);
});

test("placeholder totals use semantic sibling paths and displayed IDs", () => {
  const start = hardening.indexOf("function public.add_placeholder_siblings(\n  p_anchor_id uuid");
  const end = hardening.indexOf("create or replace function public.add_placeholder_siblings(p_anchor_id", start);
  const body = hardening.slice(start, end);
  assert.match(body, /semantic_siblings/);
  assert.match(body, /join public\.relationships theirs/);
  assert.match(body, /p_displayed_sibling_ids/);
  assert.match(body, /greatest\(0,p_desired_total-v_existing\)/);
  assert.doesNotMatch(body, /Anchor not found|not authorized to edit siblings/);
  assert.match(body, /Family member not found\.' using errcode='P0002'/);
});

test("no-op corrections return null before creating a request", () => {
  const start = hardening.indexOf("function public.propose_family_correction");
  const end = hardening.indexOf("create or replace function public.respond_family_invitation", start);
  const body = hardening.slice(start, end);
  assert.ok(body.indexOf("return null") < body.indexOf("insert into public.profile_change_requests"));
  assert.match(body, /normalize_correction_details\(v_member,p_details\)/);
  assert.match(body, /normalize_correction_connections\(auth\.uid\(\),v_member,p_connections\)/);
});

test("correction proposals validate protected fields, endpoints, cycles, and evidence", () => {
  const detailStart = hardening.indexOf("function private.normalize_correction_details");
  const connectionStart = hardening.indexOf("function private.normalize_correction_connections");
  const proposalStart = hardening.indexOf("function public.propose_family_correction");
  const details = hardening.slice(detailStart, connectionStart);
  const connections = hardening.slice(connectionStart, proposalStart);
  assert.match(details, /unknown or protected field/);
  assert.match(details, /Alternate names must be an array/);
  assert.match(details, /Invalid birth or death date\/year/);
  assert.match(details, /birth_place',''\)\)\)>150/);
  assert.match(details, /lived_in',''\)\)\)>150/);
  assert.match(details, /v_death_year not between 1800 and 2200/);
  assert.match(details, /'You','Mother''s side','Father''s side','Partner''s side','Other'/);
  assert.match(details, /return jsonb_strip_nulls\(v_result\)/);
  assert.match(connections, /can_view_member\(p_user_id,fm\)/);
  assert.match(connections, /Duplicate connections are not allowed/);
  assert.match(connections, /ancestry cycle/);
  assert.match(connections, /valid_relationship_evidence/);
});

test("member writes convert JSON null locations to SQL null", () => {
  assert.match(hardening, /function private\.normalize_family_member_json_nulls/);
  assert.match(hardening, /new\.birth_location='null'::jsonb then new\.birth_location:=null/);
  assert.match(hardening, /new\.death_location='null'::jsonb then new\.death_location:=null/);
  assert.match(hardening, /before insert or update on public\.family_members/);
});

test("correction no-ops stay in the modal and skip notification", () => {
  assert.match(app, /if \(outcome\.noChanges\) return outcome;/);
  assert.match(app, /if \(result\?\.noChanges\) \{[\s\S]*setMessage\(result\.message\);[\s\S]*return;/);
  assert.ok(app.indexOf("if (outcome.noChanges) return outcome;") < app.indexOf('supabase.functions.invoke("send-request-notification"'));
});

test("invitation acceptance locks first and uses claimant self data as canonical", () => {
  const start = hardening.indexOf("function public.respond_family_invitation");
  const end = hardening.indexOf("create or replace function private.before_vansh_auth_user_delete", start);
  const body = hardening.slice(start, end);
  assert.ok(body.indexOf("private.lock_member_mutation") < body.indexOf("for update"));
  assert.match(body, /first_name=v_self\.first_name/);
  assert.match(body, /person_identity_id=v_identity/);
  assert.match(body, /status='rejected'/);
});

test("auth deletion locks affected identities and graph rows before lifecycle writes", () => {
  const start = hardening.indexOf("function private.before_vansh_auth_user_delete");
  const end = hardening.indexOf("alter table public.family_invitations", start);
  const body = hardening.slice(start, end);
  assert.ok(body.indexOf("private.lock_member_mutation") < body.indexOf("set_config('vansh.system_write'"));
  assert.ok(body.indexOf("set_config('vansh.system_write'") < body.indexOf("insert into public.family_graphs"));
  assert.match(body, /array_agg\(fm\.id order by fm\.id\)/);
});

test("relative creation binds idempotency keys to canonical request content", () => {
  const start = hardening.indexOf("function public.create_family_relative");
  const end = hardening.indexOf("create or replace function public.add_placeholder_siblings", start);
  const body = hardening.slice(start, end);
  assert.match(body, /v_hash text:=md5\(jsonb_build_object/);
  assert.match(body, /operation='create_family_relative'/);
  assert.match(body, /v_stored->>'request_hash' is distinct from v_hash/);
  assert.match(body, /raise exception 'Family member not found\.'/);
  assert.doesNotMatch(body, /where fm\.id=p_anchor_id and private\.can_manage_member/);
  assert.ok(body.indexOf("where fm.id=p_anchor_id;") < body.indexOf("private.lock_family_graph"));
  assert.ok(body.indexOf("private.lock_family_graph") < body.indexOf("private.can_manage_member"));
});

test("v0.15.1 diagnostic is rollback-only and covers final review regressions", () => {
  assert.match(diagnostic, /^--[\s\S]*\nbegin;/);
  assert.match(diagnostic, /accepted correction did not preserve boundaries or SQL NULL locations/);
  assert.match(diagnostic, /missing and inaccessible first endpoints expose different errors/);
  assert.match(diagnostic, /malformed primary relationship direction was accepted/);
  assert.match(diagnostic, /duplicate-shaped child bundle did not collapse to one parent edge/);
  assert.match(diagnostic, /insert into auth\.users\(/);
  assert.match(diagnostic, /@example\.invalid/);
  assert.match(diagnostic, /is_sso_user,is_anonymous/);
  assert.match(diagnostic, /rollback;\s*$/);
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
