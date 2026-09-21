import test from "node:test";
import assert from "node:assert/strict";
import { buildVoiceImportPayload } from "../src/utils/voiceImport.js";

const draft = () => ({
  importId: "11111111-1111-4111-a111-111111111111",
  narratorTempId: "existing:self",
  transcript: "My mother is Asha and she is 60.",
  people: [
    { tempId: "existing:self", existingId: "self", isNarrator: true, surname: "Advani", status: "confirmed" },
    { tempId: "p1", firstName: "Asha", surname: "Advani", age: 60, gender: "female", status: "confirmed", evidence: "My mother is Asha" },
    { tempId: "p2", firstName: "Ignored", surname: "Advani", status: "rejected" },
  ],
  relationships: [
    { from: "p1", to: "existing:self", type: "parent", status: "confirmed", evidence: "My mother" },
    { from: "p2", to: "existing:self", type: "sibling", status: "rejected" },
  ],
});

test("voice import includes only confirmed people and relationships", () => {
  const payload = buildVoiceImportPayload(draft());
  assert.equal(payload.people.length, 2);
  assert.equal(payload.relationships.length, 1);
  assert.equal(payload.relationships[0].relationship_type, "parent");
  assert.equal(payload.relationships[0].variant, null);
  assert.equal(payload.idempotencyKey, "11111111-1111-4111-a111-111111111111");
});

test("voice import converts a stated age to an approximate birth year", () => {
  const payload = buildVoiceImportPayload(draft());
  const relative = payload.people.find((person) => person.temp_id === "p1");
  assert.equal(relative.birth_year, new Date().getFullYear() - 60);
  assert.equal(relative.birth_approximate, true);
});

test("voice import rejects a review with no confirmed relative", () => {
  const value = draft();
  value.people[1].status = "rejected";
  assert.throws(() => buildVoiceImportPayload(value), /Confirm at least one relative/);
});

test("voice import rejects a confirmed but disconnected person", () => {
  const value = draft();
  value.people.push({ tempId: "p3", firstName: "Detached", surname: "Advani", status: "confirmed" });
  assert.throws(() => buildVoiceImportPayload(value), /needs a confirmed relationship/);
});

test("voice import never downgrades a step sibling to an ordinary sibling", () => {
  const value = draft();
  value.relationships[0] = { ...value.relationships[0], type: "sibling", variant: "step" };
  assert.throws(() => buildVoiceImportPayload(value), /need parent context/);
});
