import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
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
const baseline = readFileSync(new URL("../supabase/migrations/20260808000000_baseline_schema.sql", import.meta.url), "utf8");
const qualifiers = readFileSync(new URL("../supabase/migrations/20260821185306_add_relationship_qualifiers.sql", import.meta.url), "utf8");
const editingFoundation = readFileSync(new URL("../supabase/migrations/20260919090000_add_family_editing_foundation.sql", import.meta.url), "utf8");
const hardening = readFileSync(new URL("../supabase/migrations/20260920120000_v0151_family_editing_hardening.sql", import.meta.url), "utf8");
const invitationAccessCompatibility = readFileSync(
  new URL("../supabase/migrations/20260920121000_fix_invitation_access_compatibility.sql", import.meta.url),
  "utf8",
);
const voiceImport = readFileSync(
  new URL("../supabase/migrations/20260921110236_add_voice_family_import.sql", import.meta.url),
  "utf8",
);
const voiceImportHardening = readFileSync(
  new URL("../supabase/migrations/20260921111409_harden_voice_family_import.sql", import.meta.url),
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

test("migration filenames have unique sortable timestamps", () => {
  const names = readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter((name) => name.endsWith(".sql"));
  assert.ok(names.every((name) => /^\d{14}_[a-z0-9_]+\.sql$/.test(name)));
  const timestamps = names.map((name) => name.slice(0, 14)).toSorted();
  assert.equal(new Set(timestamps).size, timestamps.length);
  assert.equal(timestamps.at(-1), "20260922125055");
});

test("voice family import is atomic, graph-locked, idempotent, and RPC-only", () => {
  assert.match(voiceImport, /function public\.import_voice_family_story\(/i);
  assert.match(voiceImport, /perform private\.lock_family_graph\(v_owner\)/i);
  assert.match(voiceImport, /operation='import_voice_family_story'/i);
  assert.match(voiceImport, /perform public\.link_family_members_batch\(v_links,v_link_key\)/i);
  assert.match(voiceImport, /private\.can_manage_member\(auth\.uid\(\),v_narrator\)/i);
  assert.match(voiceImport, /private\.can_view_member\(auth\.uid\(\),member\)/i);
  assert.match(voiceImport, /revoke all on function public\.import_voice_family_story\(uuid,jsonb,jsonb,uuid\) from public,anon/i);
  assert.match(voiceImport, /grant execute on function public\.import_voice_family_story\(uuid,jsonb,jsonb,uuid\) to authenticated/i);
  assert.match(voiceImportHardening, /set schema private/i);
  assert.match(voiceImportHardening, /revoke all on function private\.import_voice_family_story_unchecked\(uuid,jsonb,jsonb,uuid\) from public,anon,authenticated/i);
  assert.match(voiceImportHardening, /char_length[\s\S]*> 100/i);
  assert.match(voiceImportHardening, /gender','unspecified'\) not in \('female','male','nonbinary','unspecified'\)/i);
  assert.match(voiceImportHardening, /birth_year[\s\S]*not between 1800 and extract\(year from current_date\)/i);
});

test("can_access_family_member keeps one parameter contract through P0 replacement", () => {
  assert.match(baseline, /can_access_family_member\(p_user_id uuid, p_person_id uuid\)/);
  assert.match(p0Foundation, /can_access_family_member\(p_user_id uuid, p_person_id uuid\)/);
  assert.doesNotMatch(baseline, /can_access_family_member\(p_user_id uuid, p_member_id uuid\)/);
});

test("historical relationship constraints accept legacy rows until reconciliation", () => {
  assert.match(qualifiers, /relationship_variant = 'unspecified'/);
  assert.match(qualifiers, /'biological', 'adoptive', 'step', 'guardian'/);
  assert.match(qualifiers, /relationship_type in \('spouse', 'partner'\)[\s\S]*'current', 'former'/);
  const normalizeAt = editingFoundation.indexOf("set relationship_status = relationship_variant");
  const constraintAt = editingFoundation.indexOf("add constraint relationships_relationship_status_check");
  assert.ok(normalizeAt >= 0 && normalizeAt < constraintAt);
  assert.match(editingFoundation, /'biological', 'adoptive', 'step', 'guardian'/);
});

test("forward hardening keeps direct graph DML revoked and grants only RPC execution", () => {
  assert.match(hardening, /function public\.link_family_members_batch\(p_links jsonb, p_idempotency_key uuid\)/);
  assert.match(hardening, /revoke all on function public\.link_family_members_batch\(jsonb,uuid\) from public,anon/);
  assert.match(hardening, /grant execute on function public\.link_family_members_batch\(jsonb,uuid\) to authenticated/);
  assert.doesNotMatch(hardening, /grant (?:insert|update|delete|all).*public\.(?:family_members|relationships)/i);
});

test("invitation status reconciliation retains explicit rejection", () => {
  assert.match(p0Foundation, /status in \('pending',\s*'accepted',\s*'rejected',\s*'revoked',\s*'expired'\)/);
  assert.match(hardening, /drop constraint if exists family_invitations_status_check/);
  assert.match(hardening, /check\(status in \('pending','accepted','rejected','revoked','expired'\)\)/);
});

test("parent unspecified is normalized before relationship validation and writes", () => {
  const start = hardening.indexOf("function public.link_family_members_batch");
  const end = hardening.indexOf("create or replace function public.link_family_members(", start);
  const body = hardening.slice(start, end);
  assert.match(body, /relationship_type'='parent'[\s\S]*variant',''\)='unspecified'[\s\S]*then null/);
});

test("legacy invitation access helpers write the reconciled member column", () => {
  assert.match(invitationAccessCompatibility, /to_regprocedure\('public\.populate_family_invitation_access\(uuid\)'\)/i);
  assert.doesNotMatch(invitationAccessCompatibility, /\(invitation_id, person_id\)/i);
  assert.match(invitationAccessCompatibility, /\(invitation_id, member_id\)/i);
  assert.match(invitationAccessCompatibility, /revoke all on function public\.populate_family_invitation_access\(uuid\)/i);
});
