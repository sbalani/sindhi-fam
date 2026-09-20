import assert from "node:assert/strict";
import test from "node:test";
import {
  connectionBundleFromForm,
  primaryConnectionFromForm,
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
    p_person_a_id: "a",
    p_person_b_id: "b",
    p_relationship_type: "sibling",
    p_variant: "half",
    p_start_year: null,
    p_end_year: null,
    p_status: "unspecified",
  });
});
