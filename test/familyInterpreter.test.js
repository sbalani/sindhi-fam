import test from "node:test";
import assert from "node:assert/strict";
import { interpretFamilyStory, overrideDraftRelation } from "../src/familyInterpreter.js";

const narrator = {
  id: "self",
  name: "Maya Nanwani",
  firstName: "Maya",
  surname: "Nanwani",
  gender: "female",
  isSelf: true,
};

test("English family stories produce a connected multi-generation draft", () => {
  const draft = interpretFamilyStory({
    narrator,
    language: "en",
    transcript: "My father is Rajesh Nanwani, he is 55 and lives in Barcelona. His mother was Kamla. My mother is Anita Nanwani, she is 52 and was born in Mumbai. My mother's brother is Vijay Nanwani.",
  });
  const names = draft.people.map((person) => person.firstName);
  assert.ok(names.includes("Rajesh"));
  assert.ok(names.includes("Kamla"));
  assert.ok(names.includes("Anita"));
  assert.ok(names.includes("Vijay"));
  const ids = new Set(draft.people.map((person) => person.tempId));
  assert.ok(draft.relationships.every((relationship) => ids.has(relationship.from) && ids.has(relationship.to)));
});

test("Spanish and Sindhi direct kinship statements remain reviewable", () => {
  const spanish = interpretFamilyStory({ narrator, language: "es", transcript: "Mi padre se llama Carlos Nanwani y vive en Madrid. Mi madre se llama Anita Nanwani." });
  const sindhi = interpretFamilyStory({ narrator, language: "sd", transcript: "منهنجو بابا Rajesh Nanwani آهي. منهنجي اما Anita Nanwani آهي." });
  assert.equal(spanish.people.filter((person) => !person.isNarrator).length, 2);
  assert.equal(sindhi.people.filter((person) => !person.isNarrator).length, 2);
  assert.ok(spanish.relationships.length >= 2);
  assert.ok(sindhi.relationships.length >= 2);
});

test("review corrections replace the interpreted relationship", () => {
  const draft = interpretFamilyStory({ narrator, language: "en", transcript: "My father is Rajesh Nanwani." });
  const relative = draft.people.find((person) => !person.isNarrator);
  const corrected = overrideDraftRelation(draft, relative.tempId, "brother");
  const link = corrected.relationships.find((relationship) => relationship.from === relative.tempId || relationship.to === relative.tempId);
  assert.equal(corrected.people.find((person) => person.tempId === relative.tempId).relationToNarrator, "Brother");
  assert.equal(link.type, "sibling");
});

test("review corrections preserve relationships not on the narrator path", () => {
  const draft = interpretFamilyStory({ narrator, language: "en", transcript: "My father is Rajesh Nanwani. His mother was Kamla Nanwani." });
  const father = draft.people.find((person) => person.firstName === "Rajesh");
  const grandmother = draft.people.find((person) => person.firstName === "Kamla");
  const corrected = overrideDraftRelation(draft, father.tempId, "adoptive_father");
  assert.ok(corrected.relationships.some((relationship) => relationship.from === grandmother.tempId && relationship.to === father.tempId));
  assert.ok(corrected.relationships.some((relationship) => relationship.from === father.tempId && relationship.to === draft.narratorTempId && relationship.variant === "adoptive"));
});

test("unsupported step-sibling interpretations require a supported review choice", () => {
  const draft = interpretFamilyStory({ narrator, language: "en", transcript: "My stepbrother is Rajesh Nanwani." });
  const relative = draft.people.find((person) => !person.isNarrator);
  assert.equal(relative.relationKey, "stepbrother");
  assert.equal(overrideDraftRelation(draft, relative.tempId, "unknown").relationships.length, 0);
});
