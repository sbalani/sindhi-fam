import assert from "node:assert/strict";
import test from "node:test";
import {
  connectionBundleFromForm,
  correctionSubmissionOutcome,
  hasExistingConnection,
  primaryConnectionFromForm,
  correctionPayloadChanged,
  loadConnectionSnapshots,
  parentLinksForMember,
  relationSwitchValues,
  relationshipRpcArgs,
} from "../src/utils/familyEditing.js";

test("normalizes qualifiers and canonical partnership status", () => {
  const bundle = connectionBundleFromForm(
    {
      firstName: "Asha",
      parentLinks: [{ mode: "existing", personId: "parent", variant: "step", confidence: "documented", provenanceNote: "Birth certificate" }],
      partnerLinks: [{ mode: "existing", personId: "partner", type: "spouse", variant: "current", startYear: "1970", endYear: "", confidence: "probable", provenanceNote: "Family account" }],
    },
    { id: "member" },
    [{ from: "member", to: "sibling", type: "sibling", variant: "half", confidence: "uncertain", provenanceNote: "Oral history" }],
  );
  assert.equal(bundle.parents[0].variant, "step");
  assert.equal(bundle.partners[0].status, "current");
  assert.equal(bundle.partners[0].start_year, 1970);
  assert.equal(bundle.siblings[0].variant, "half");
  assert.equal("children" in bundle, false);
  assert.deepEqual(
    [bundle.parents[0].confidence, bundle.parents[0].provenance_note],
    ["documented", "Birth certificate"],
  );
  assert.deepEqual(
    [bundle.partners[0].confidence, bundle.partners[0].provenance_note],
    ["probable", "Family account"],
  );
  assert.deepEqual(
    [bundle.siblings[0].confidence, bundle.siblings[0].provenance_note],
    ["uncertain", "Oral history"],
  );
});

test("represents placeholders inside the atomic connection bundle", () => {
  const bundle = connectionBundleFromForm({
    firstName: "Asha",
    parentLinks: [{ mode: "placeholder", placeholderLabel: "Unknown mother", placeholderGender: "female", variant: "biological" }],
    partnerLinks: [],
  });
  assert.deepEqual(bundle.parents[0].placeholder, {
    label: "Unknown mother",
    gender: "female",
  });
});

test("serializes children and recognizes only existing-person graph connections", () => {
  const bundle = connectionBundleFromForm({
    firstName: "Asha",
    parentLinks: [],
    childLinks: [{ personId: "child", variant: "adoptive", confidence: "documented" }],
    partnerLinks: [],
  });
  assert.deepEqual(bundle.children, [{
    person_id: "child",
    variant: "adoptive",
    confidence: "documented",
    provenance_note: null,
  }]);
  assert.equal(hasExistingConnection(bundle), true);
  assert.equal(hasExistingConnection({
    parents: [{ placeholder: { label: "Unknown parent" } }],
    children: [],
    partners: [],
  }), false);
});

test("serializes a new named partner for atomic creation", () => {
  const bundle = connectionBundleFromForm({
    firstName: "Asha",
    parentLinks: [],
    partnerLinks: [{
      mode: "new",
      type: "spouse",
      variant: "current",
      newPerson: { firstName: "Dev", surname: "Advani", nickname: "D", maidenName: "", gender: "male", birthDate: "1970-02-03" },
    }],
  });
  assert.deepEqual(bundle.partners[0].new_person, {
    first_name: "Dev",
    surname: "Advani",
    nickname: "D",
    maiden_name: null,
    gender: "male",
    birth_date: "1970-02-03",
  });
});

test("normalizes unspecified parent variants to SQL null in every payload helper", () => {
  const bundle = connectionBundleFromForm({
    firstName: "Asha",
    parentLinks: [{ mode: "existing", personId: "parent", variant: "unspecified" }],
    partnerLinks: [],
  });
  assert.equal(bundle.parents[0].variant, null);
  assert.equal(
    primaryConnectionFromForm({ parentVariant: "unspecified" }, { type: "parent", direction: "to-anchor" }).variant,
    null,
  );
  assert.equal(relationshipRpcArgs("parent", "child", "parent", { variant: "unspecified" }).variant, null);
});

test("excludes a child primary edge duplicated by suggested parent links", () => {
  const primary = { type: "parent", direction: "from-anchor", variant: "biological" };
  const bundle = connectionBundleFromForm(
    {
      firstName: "Asha",
      anchorId: "anchor",
      parentLinks: [
        { mode: "existing", personId: "anchor", variant: "biological" },
        { mode: "existing", personId: "co-parent", variant: "biological" },
      ],
      partnerLinks: [],
    },
    null,
    [],
    primary,
  );
  assert.deepEqual(bundle.parents.map((parent) => parent.person_id), ["co-parent"]);
});

test("a direct parent anchor is not repeated in the additional parent bundle", () => {
  const primary = { type: "parent", direction: "from-anchor", variant: "biological" };
  const bundle = connectionBundleFromForm(
    {
      firstName: "Asha",
      anchorId: "anchor",
      parentLinks: [{ mode: "existing", personId: "co-parent", variant: "biological" }],
      partnerLinks: [],
    },
    null,
    [],
    primary,
  );
  assert.deepEqual(bundle.parents.map((parent) => parent.person_id), ["co-parent"]);
});

test("prefills an unfilled reported sibling with the recorded sibling's parents", () => {
  const relationships = [
    { id: "s", from: "aunt", to: "father", type: "sibling", variant: "reported" },
    { id: "p1", from: "grandmother", to: "father", type: "parent", variant: "biological" },
    { id: "p2", from: "grandfather", to: "father", type: "parent", variant: "biological" },
  ];
  const links = parentLinksForMember("aunt", relationships);
  assert.deepEqual(links.map((link) => link.personId), ["grandmother", "grandfather"]);
  assert.ok(links.every((link) => link.relationshipId === null));
});

test("does not guess both parents for a half sibling", () => {
  const relationships = [
    { id: "s", from: "aunt", to: "father", type: "sibling", variant: "half" },
    { id: "p1", from: "grandmother", to: "father", type: "parent", variant: "biological" },
  ];
  assert.deepEqual(parentLinksForMember("aunt", relationships), []);
});

test("rejects inconsistent partnership dates before calling the RPC", () => {
  assert.throws(
    () => connectionBundleFromForm({ firstName: "A", parentLinks: [], partnerLinks: [{ mode: "existing", personId: "p", type: "partner", startYear: "2000", endYear: "1999" }] }),
    /before its start/,
  );
});

test("normalizes primary links and single-link RPC arguments", () => {
  const primary = primaryConnectionFromForm(
    { marriageYear: "1990", relationshipEndYear: "2000", partnershipVariant: "current" },
    { type: "spouse", direction: "symmetric" },
  );
  assert.equal(primary.status, "former");
  assert.equal(primary.variant, null);
  assert.deepEqual(relationshipRpcArgs("a", "b", "sibling", { variant: "half" }), {
    person_a_id: "a",
    person_b_id: "b",
    relationship_type: "sibling",
    variant: "half",
    start_year: null,
    end_year: null,
    status: "unspecified",
    confidence: "reported",
    provenance_note: null,
  });
});

test("relation switches clear hidden partnership arguments", () => {
  assert.deepEqual(relationSwitchValues("parent"), {
    marriageYear: "",
    relationshipEndYear: "",
    partnershipVariant: "unspecified",
  });
  assert.equal(relationSwitchValues("spouse").partnershipVariant, "current");
});

test("correction comparison ignores object key order but detects graph changes", () => {
  assert.equal(correctionPayloadChanged({ details: { surname: "A", first_name: "B" } }, { details: { first_name: "B", surname: "A" } }), false);
  assert.equal(correctionPayloadChanged({ connections: { parents: [] } }, { connections: { parents: [{ person_id: "p" }] } }), true);
});

test("maps a null correction RPC result to an informational no-op", () => {
  assert.deepEqual(correctionSubmissionOutcome(null), {
    noChanges: true,
    message: "No changes to submit.",
  });
  assert.deepEqual(correctionSubmissionOutcome("request-id"), {
    suggested: true,
    requestId: "request-id",
  });
});

test("snapshot loading surfaces RPC errors and maps successful snapshots", async () => {
  await assert.rejects(
    loadConnectionSnapshots({ rpc: async () => ({ error: new Error("snapshot failed") }) }, [{ id: "a" }]),
    /snapshot failed/,
  );
  const rows = await loadConnectionSnapshots(
    { rpc: async () => ({ data: [{ member_id: "a", content_hash: "hash", connections: { parents: [] } }] }) },
    [{ id: "a", first_name: "A" }],
  );
  assert.equal(rows[0]._relationship_hash, "hash");
  assert.deepEqual(rows[0]._connection_snapshot, { parents: [] });
});
