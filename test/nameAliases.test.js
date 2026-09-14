import test from "node:test";
import assert from "node:assert/strict";
import { cleanNameAliases } from "../src/utils/nameAliases.js";

test("cleans and deduplicates alternate names across whitespace/case", () => {
  assert.deepEqual(cleanNameAliases([
    { name: "  Ramesh   Nanwani ", kind: "roman" },
    { name: "ramesh nanwani", kind: "historical" },
    { name: "رميش نانواڻي", kind: "sindhi_script" },
  ]), [
    { name: "Ramesh Nanwani", kind: "roman" },
    { name: "رميش نانواڻي", kind: "sindhi_script" },
  ]);
});

test("limits the number and size of alternate names", () => {
  assert.throws(() => cleanNameAliases([{ name: "x".repeat(161), kind: "other" }]), /160 characters/);
  assert.throws(() => cleanNameAliases(Array.from({ length: 21 }, (_, i) => ({ name: `Alias ${i}`, kind: "other" }))), /up to 20/);
});
