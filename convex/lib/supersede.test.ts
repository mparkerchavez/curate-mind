// Tests for the pure data point lifecycle/supersede logic (Decision 38).
//
// Exercised with plain fixtures (no Convex runtime).
// Run with: node --import tsx --test convex/lib/supersede.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  isLiveDataPoint,
  normalizeStatus,
  resolveSupersedePatch,
  supersedeStateView,
} from "./supersede";

test("normalizeStatus treats missing/null/active as active", () => {
  assert.equal(normalizeStatus(undefined), "active");
  assert.equal(normalizeStatus(null), "active");
  assert.equal(normalizeStatus("active"), "active");
  assert.equal(normalizeStatus("superseded"), "superseded");
  assert.equal(normalizeStatus("retired"), "retired");
});

test("isLiveDataPoint is true only for active (incl. legacy unset rows)", () => {
  assert.equal(isLiveDataPoint({}), true);
  assert.equal(isLiveDataPoint({ status: "active" }), true);
  assert.equal(isLiveDataPoint({ status: "superseded" }), false);
  assert.equal(isLiveDataPoint({ status: "retired" }), false);
});

test("supersedeStateView surfaces normalized lifecycle fields", () => {
  assert.deepEqual(supersedeStateView({}), {
    status: "active",
    isLive: true,
    supersededBy: null,
    supersededAt: null,
    supersedeReason: null,
  });

  assert.deepEqual(
    supersedeStateView({
      status: "superseded",
      supersededBy: "dp_new",
      supersededAt: 1234,
      supersedeReason: "replaced with corrected figure",
    }),
    {
      status: "superseded",
      isLive: false,
      supersededBy: "dp_new",
      supersededAt: 1234,
      supersedeReason: "replaced with corrected figure",
    }
  );
});

test("resolveSupersedePatch -> superseded when a replacement is supplied", () => {
  const patch = resolveSupersedePatch({
    currentStatus: "active",
    replacementId: "dp_new",
    reason: "replaced with the corrected restatement",
  });
  assert.equal(patch.status, "superseded");
  assert.equal(patch.supersededBy, "dp_new");
  assert.equal(patch.supersedeReason, "replaced with the corrected restatement");
});

test("resolveSupersedePatch -> retired when no replacement is supplied", () => {
  for (const replacementId of [undefined, null, "", "   "]) {
    const patch = resolveSupersedePatch({
      currentStatus: "active",
      replacementId,
      reason: "retired because the claim no longer holds",
    });
    assert.equal(patch.status, "retired");
    assert.equal(patch.supersededBy, null);
  }
});

test("resolveSupersedePatch rejects reasons shorter than 10 characters", () => {
  assert.throws(
    () =>
      resolveSupersedePatch({
        currentStatus: "active",
        replacementId: "dp_new",
        reason: "too short",
      }),
    /at least 10 characters/
  );
});

test("resolveSupersedePatch refuses to re-apply to a non-active data point", () => {
  for (const currentStatus of ["superseded", "retired"] as const) {
    assert.throws(
      () =>
        resolveSupersedePatch({
          currentStatus,
          replacementId: "dp_new",
          reason: "trying to re-point an already retired record",
        }),
      /append-only/
    );
  }
});
