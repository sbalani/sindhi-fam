import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const historicalMarker = readFileSync(
  new URL("../supabase/migrations/20260828105509_p0_live_schema.sql", import.meta.url),
  "utf8",
);
const reconciliation = readFileSync(
  new URL("../supabase/migrations/20260920090000_reconcile_launch_family_editing.sql", import.meta.url),
  "utf8",
);
const privilegeHardening = readFileSync(
  new URL("../supabase/migrations/20260920110000_harden_launch_api_privileges.sql", import.meta.url),
  "utf8",
);
const p0Foundation = readFileSync(
  new URL("../supabase/migrations/20260828090000_p0_identity_permissions_graph.sql", import.meta.url),
  "utf8",
);

test("generated live-schema diff is reduced to safe schema normalization", () => {
  assert.match(historicalMarker, /Historical live-schema reconciliation marker/);
  assert.doesNotMatch(historicalMarker, /create or replace function/i);
  assert.doesNotMatch(historicalMarker, /create policy|drop policy|drop extension/i);
  assert.doesNotMatch(historicalMarker, /create (?:unique )?index/i);
  assert.match(historicalMarker, /alter column relationship_variant drop not null/);
  assert.match(historicalMarker, /relationships_relationship_type_check/);
  assert.doesNotMatch(historicalMarker, /relationships_start_year_check|family_members_nickname_check/);
  assert.match(historicalMarker, /if not exists \(\s*select 1 from pg_constraint/);
});

test("legacy invitation access columns are reconciled before use", () => {
  const reconciliationAt = p0Foundation.indexOf("rename column person_id to member_id");
  const createAt = p0Foundation.indexOf("create table if not exists public.family_invitation_access");
  assert.ok(reconciliationAt >= 0 && reconciliationAt < createAt);
  assert.match(p0Foundation, /v_access_table regclass:=to_regclass\('public\.family_invitation_access'\)/);
  assert.doesNotMatch(p0Foundation.slice(0, createAt), /family_invitation_access'::regclass/);
  assert.match(p0Foundation, /add column if not exists created_at timestamptz not null default now\(\)/);
});

test("verification correction responses use only the atomic correction responder", () => {
  assert.match(reconciliation, /to_regprocedure\('private\.respond_verification_request_legacy\(text,uuid,boolean\)'\)/);
  assert.match(reconciliation, /alter function public\.respond_verification_request\(text,uuid,boolean\)[\s\S]*set schema private/);
  const start = reconciliation.indexOf("function public.respond_verification_request(p_kind text");
  const end = reconciliation.indexOf("create or replace function", start + 30);
  const wrapper = reconciliation.slice(start, end);
  assert.match(wrapper, /if p_kind='correction' then\s+perform public\.respond_profile_correction\(p_request_id,p_accept\)/);
  assert.match(wrapper, /select private\.respond_verification_request_legacy\(\$1,\$2,\$3\)/);
  assert.match(reconciliation, /revoke all on function private\.respond_verification_request_legacy\(text,uuid,boolean\) from public,anon,authenticated/);
});

test("merge reconciliation tolerates an already-renamed or unavailable overload", () => {
  assert.match(reconciliation, /to_regprocedure\('public\.merge_family_members_reconciled_inner\(uuid,uuid,jsonb\)'\)/);
  assert.match(reconciliation, /to_regprocedure\('public\.merge_family_members\(uuid,uuid,jsonb\)'\) is not null/);
  assert.match(reconciliation, /execute 'select public\.merge_family_members_reconciled_inner\(\$1,\$2,\$3\)'/);
});

test("internal and audit tables receive a deny-all privilege baseline", () => {
  for (const table of [
    "profile_change_requests",
    "member_change_history",
    "relationship_change_history",
    "member_revision_history",
    "relationship_revision_history",
    "family_correction_requests",
    "family_mutation_requests",
    "member_merge_audit",
    "application_errors",
    "family_update_notifications",
  ]) {
    assert.match(
      reconciliation,
      new RegExp(`revoke all privileges on table public\\.${table} from public, anon, authenticated`),
    );
  }
});

test("launch API privileges are deny-by-default", () => {
  assert.match(privilegeHardening, /alter table public\.family_graphs enable row level security/i);
  assert.match(privilegeHardening, /public\.family_connection_requests[\s\S]*from public, anon, authenticated/i);
  assert.match(privilegeHardening, /where n\.nspname = 'public'[\s\S]*and p\.prosecdef/i);
  assert.match(privilegeHardening, /revoke all on function %s from public, anon/i);
  assert.match(privilegeHardening, /grant select on table public\.family_members, public\.relationships to authenticated/i);
  assert.match(privilegeHardening, /create policy "Read own identity claim activity"/i);
  assert.match(privilegeHardening, /create policy "Read own family invitation activity"/i);
  assert.match(privilegeHardening, /create policy "Read own family connection activity"/i);
  assert.match(privilegeHardening, /public\.identity_claim_requests,[\s\S]*public\.family_invitations,[\s\S]*public\.family_connection_requests[\s\S]*to authenticated/i);
});
