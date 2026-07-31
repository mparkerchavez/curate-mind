// Tests for the pure data point lifecycle/supersede logic (Decision 38).
//
// Exercised with plain fixtures (no Convex runtime).
// Run with: node --import tsx --test convex/lib/supersede.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  chainReaches,
  isLifecycleNoop,
  isLiveDataPoint,
  normalizeStatus,
  resolveLifecyclePatch,
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

// Decision 44 replaced the old write-once lock. The test that used to live
// here asserted that resolveSupersedePatch threw on any non-active data point.
// Reversal is now the point, so the behavior it pinned is gone deliberately;
// what replaces it is the guard-rail coverage below.
test("resolveSupersedePatch re-applies to a non-active data point (Decision 44)", () => {
  for (const currentStatus of ["superseded", "retired"] as const) {
    const patch = resolveSupersedePatch({
      currentStatus,
      replacementId: "dp_new",
      reason: "re-pointing an already retired record after review",
    });
    assert.equal(patch.status, "superseded");
    assert.equal(patch.supersededBy, "dp_new");
  }
});

test("resolveLifecyclePatch restores to active and clears the pointer", () => {
  const patch = resolveLifecyclePatch({
    currentStatus: "retired",
    action: "restore",
    reason: "retired in error during the duplicate cleanup",
  });
  assert.deepEqual(patch, {
    status: "active",
    supersededBy: null,
    supersedeReason: "retired in error during the duplicate cleanup",
  });
});

test("resolveLifecyclePatch requires a replacement for supersede", () => {
  assert.throws(
    () =>
      resolveLifecyclePatch({
        currentStatus: "active",
        action: "supersede",
        reason: "superseding without naming a replacement",
      }),
    /requires a replacementDataPointId/
  );
});

test("resolveLifecyclePatch rejects a replacement on retire and restore", () => {
  for (const action of ["retire", "restore"] as const) {
    assert.throws(
      () =>
        resolveLifecyclePatch({
          currentStatus: "active",
          action,
          replacementId: "dp_new",
          reason: "carrying a replacement where none belongs",
        }),
      /must not carry a replacementDataPointId/
    );
  }
});

test("resolveLifecyclePatch enforces the reason floor on every action", () => {
  for (const action of ["retire", "supersede", "restore"] as const) {
    assert.throws(
      () =>
        resolveLifecyclePatch({
          currentStatus: action === "restore" ? "retired" : "active",
          action,
          replacementId: action === "supersede" ? "dp_new" : null,
          reason: "too short",
        }),
      /at least 10 characters/
    );
  }
});

test("isLifecycleNoop detects same-state requests in each direction", () => {
  assert.equal(
    isLifecycleNoop({ currentStatus: "retired", action: "retire" }),
    true
  );
  assert.equal(
    isLifecycleNoop({ currentStatus: "active", action: "restore" }),
    true
  );
  assert.equal(
    isLifecycleNoop({
      currentStatus: "superseded",
      currentReplacementId: "dp_a",
      action: "supersede",
      replacementId: "dp_a",
    }),
    true
  );
});

test("isLifecycleNoop treats a re-point at a different replacement as real work", () => {
  assert.equal(
    isLifecycleNoop({
      currentStatus: "superseded",
      currentReplacementId: "dp_a",
      action: "supersede",
      replacementId: "dp_b",
    }),
    false
  );
  assert.equal(
    isLifecycleNoop({ currentStatus: "retired", action: "restore" }),
    false
  );
  assert.equal(
    isLifecycleNoop({ currentStatus: "active", action: "retire" }),
    false
  );
});

test("chainReaches rejects a direct A -> B -> A cycle", () => {
  // B currently points at A; superseding A by B would close the loop.
  const next: Record<string, string | null> = { dp_b: "dp_a", dp_a: null };
  assert.equal(chainReaches("dp_b", "dp_a", (id) => next[id] ?? null), true);
});

test("chainReaches rejects a longer cycle", () => {
  const next: Record<string, string | null> = {
    dp_b: "dp_c",
    dp_c: "dp_d",
    dp_d: "dp_a",
    dp_a: null,
  };
  assert.equal(chainReaches("dp_b", "dp_a", (id) => next[id] ?? null), true);
});

test("chainReaches allows an acyclic chain", () => {
  const next: Record<string, string | null> = { dp_b: "dp_c", dp_c: null };
  assert.equal(chainReaches("dp_b", "dp_a", (id) => next[id] ?? null), false);
});

test("chainReaches terminates on a pre-existing loop it is not asked about", () => {
  // dp_b <-> dp_c already loop; asking about an unrelated dp_a must not hang.
  const next: Record<string, string | null> = { dp_b: "dp_c", dp_c: "dp_b" };
  assert.equal(chainReaches("dp_b", "dp_a", (id) => next[id] ?? null), false);
});

test("a retire, restore, retire sequence resolves correctly at each step", () => {
  const one = resolveLifecyclePatch({
    currentStatus: "active",
    action: "retire",
    reason: "duplicate of the successful re-ingest",
  });
  assert.equal(one.status, "retired");

  const two = resolveLifecyclePatch({
    currentStatus: "retired",
    action: "restore",
    reason: "retired in error, the claim is not a duplicate",
  });
  assert.equal(two.status, "active");
  assert.equal(two.supersededBy, null);

  const three = resolveLifecyclePatch({
    currentStatus: "active",
    action: "retire",
    reason: "confirmed duplicate after a second read of the source",
  });
  assert.equal(three.status, "retired");
});
