// Tests for the pure evidence-array edit logic (Chunk 3 correction tooling).
//
// Exercised with plain fixtures (no Convex runtime).
// Run with: node --import tsx --test convex/lib/evidenceEdit.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  computeReplace,
  computeUnlink,
  sanitizeChangeSummary,
} from "./evidenceEdit";

test("computeUnlink removes from supporting and reports removed vs notFound", () => {
  const result = computeUnlink(["a", "b", "c"], ["x", "y"], ["b", "z"]);
  assert.deepEqual(result.supporting, ["a", "c"]);
  assert.deepEqual(result.counter, ["x", "y"]);
  assert.deepEqual(result.removed, ["b"]);
  assert.deepEqual(result.notFound, ["z"]);
});

test("computeUnlink removes from counter", () => {
  const result = computeUnlink(["a"], ["x", "y"], ["y"]);
  assert.deepEqual(result.supporting, ["a"]);
  assert.deepEqual(result.counter, ["x"]);
  assert.deepEqual(result.removed, ["y"]);
  assert.deepEqual(result.notFound, []);
});

test("computeUnlink of an unlinked id is a no-op reported in notFound", () => {
  const result = computeUnlink(["a", "b"], ["x"], ["nope"]);
  assert.deepEqual(result.supporting, ["a", "b"]);
  assert.deepEqual(result.counter, ["x"]);
  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.notFound, ["nope"]);
});

test("computeUnlink can empty both arrays (zero-evidence detectable by caller)", () => {
  const result = computeUnlink(["a"], ["x"], ["a", "x"]);
  assert.deepEqual(result.supporting, []);
  assert.deepEqual(result.counter, []);
  assert.deepEqual(result.removed, ["a", "x"]);
});

test("computeUnlink does not mutate its inputs", () => {
  const supporting = ["a", "b"];
  const counter = ["x"];
  computeUnlink(supporting, counter, ["a"]);
  assert.deepEqual(supporting, ["a", "b"]);
  assert.deepEqual(counter, ["x"]);
});

test("computeReplace swaps in the supporting array and preserves it", () => {
  const result = computeReplace(["a", "b", "c"], ["x"], "b", "new");
  assert.equal(result.array, "supporting");
  assert.equal(result.oldFound, true);
  assert.equal(result.newAlreadyPresent, false);
  assert.deepEqual(result.supporting, ["a", "c", "new"]);
  assert.deepEqual(result.counter, ["x"]);
});

test("computeReplace swaps in the counter array and preserves it", () => {
  const result = computeReplace(["a"], ["x", "y"], "x", "new");
  assert.equal(result.array, "counter");
  assert.deepEqual(result.supporting, ["a"]);
  assert.deepEqual(result.counter, ["y", "new"]);
});

test("computeReplace returns array null when old id is absent", () => {
  const result = computeReplace(["a"], ["x"], "missing", "new");
  assert.equal(result.array, null);
  assert.equal(result.oldFound, false);
  assert.deepEqual(result.supporting, ["a"]);
  assert.deepEqual(result.counter, ["x"]);
});

test("computeReplace dedupes when new id already present", () => {
  const result = computeReplace(["a", "b", "new"], ["x"], "b", "new");
  assert.equal(result.array, "supporting");
  assert.equal(result.newAlreadyPresent, true);
  assert.deepEqual(result.supporting, ["a", "new"]);
});

test("sanitizeChangeSummary strips em and en dashes", () => {
  assert.equal(
    sanitizeChangeSummary("Unlinked 1 data point — stale figure"),
    "Unlinked 1 data point; stale figure"
  );
  assert.equal(
    sanitizeChangeSummary("Replaced A with B – corrected source"),
    "Replaced A with B; corrected source"
  );
  assert.equal(
    sanitizeChangeSummary("No dashes here, just commas."),
    "No dashes here, just commas."
  );
});
