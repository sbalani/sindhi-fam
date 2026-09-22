import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260922075915_add_private_friendships.sql", import.meta.url),
  "utf8",
);

test("friendships remain separate from genealogy and direct browser DML", () => {
  assert.match(migration, /create table if not exists public\.friendships/);
  assert.match(migration, /revoke all on table private\.friend_discovery_codes, public\.friendships from public, anon, authenticated/);
  assert.doesNotMatch(migration, /can_access_family_member[\s\S]*friendship/i);
  assert.doesNotMatch(migration, /verified_family_connections/);
});

test("friend requests use full private codes and canonical unique pairs", () => {
  assert.match(migration, /create table if not exists private\.friend_discovery_codes/);
  assert.match(migration, /constraint friendships_canonical_pair check \(user_a_id < user_b_id\)/);
  assert.match(migration, /constraint friendships_unique_pair unique \(user_a_id, user_b_id\)/);
  assert.match(migration, /where fdc\.code=p_code/);
  assert.doesNotMatch(migration, /like|substring\(.*code/i);
});

test("tree sharing is reciprocal, side-specific, and returns redacted snapshots", () => {
  assert.match(migration, /user_a_shares_tree boolean not null default false/);
  assert.match(migration, /user_b_shares_tree boolean not null default false/);
  assert.match(migration, /function public\.set_friend_tree_sharing/);
  assert.match(migration, /function public\.get_shared_friend_tree/);
  assert.match(migration, /coalesce\(fm\.privacy_level,'family'\)='family'/);
  assert.match(migration, /fm\.linked_user_id is null or fm\.linked_user_id in \(v_user,v_friend\)/);
  for (const sensitive of ["birth_date", "birth_year", "linked_user_id", "person_identity_id", "provenance_note"]) {
    const snapshot = migration.slice(migration.indexOf("function public.get_shared_friend_tree"));
    assert.doesNotMatch(snapshot, new RegExp(`'${sensitive}'`), `${sensitive} is not emitted`);
  }
});

test("every friendship RPC is authenticated-only", () => {
  for (const fn of [
    "get_my_friend_discovery_code",
    "rotate_my_friend_discovery_code",
    "request_friend_by_code",
    "get_friendships",
    "respond_friend_request",
    "cancel_friend_request",
    "remove_friend",
    "set_friend_tree_sharing",
    "get_shared_friend_tree",
  ]) {
    assert.match(migration, new RegExp(`grant execute on function public\\.${fn}`));
    assert.match(migration, new RegExp(`revoke all on function public\\.${fn}`));
  }
});
