// Tests for the pure correction logic (Chunk 4 correction tooling).
//
// Exercised with plain fixtures (no Convex runtime).
// Run with: node --import tsx --test convex/lib/corrections.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseTier,
  buildTierCorrection,
  shouldResetEmbedding,
} from "./corrections";

test("parseTier accepts the three valid tiers as numbers and strings", () => {
  assert.equal(parseTier(1), 1);
  assert.equal(parseTier(2), 2);
  assert.equal(parseTier(3), 3);
  assert.equal(parseTier("1"), 1);
  assert.equal(parseTier(" 3 "), 3);
});

test("parseTier rejects out-of-range, non-integer, and junk values", () => {
  assert.throws(() => parseTier(0), /must be 1, 2, or 3/);
  assert.throws(() => parseTier(4), /must be 1, 2, or 3/);
  assert.throws(() => parseTier(2.5), /must be 1, 2, or 3/);
  assert.throws(() => parseTier("two"), /must be 1, 2, or 3/);
  assert.throws(() => parseTier(""), /must be 1, 2, or 3/);
  assert.throws(() => parseTier(null), /must be 1, 2, or 3/);
});

test("buildTierCorrection shapes the audit row and the numeric patch", () => {
  const result = buildTierCorrection({ previousTier: 2, rawNewValue: "1" });
  assert.deepEqual(result, {
    patchTier: 1,
    previousValue: "2",
    newValue: "1",
  });
});

test("buildTierCorrection rejects a no-op re-tier", () => {
  assert.throws(
    () => buildTierCorrection({ previousTier: 1, rawNewValue: "1" }),
    /already tier 1/
  );
});

test("buildTierCorrection propagates tier validation", () => {
  assert.throws(
    () => buildTierCorrection({ previousTier: 1, rawNewValue: "9" }),
    /must be 1, 2, or 3/
  );
});

test("shouldResetEmbedding is true only for a claim correction", () => {
  assert.equal(shouldResetEmbedding("dp_claim_text"), true);
});

test("shouldResetEmbedding is false for anchor and attribution corrections", () => {
  for (const type of [
    "anchor_text",
    "anchor_passage",
    "anchor_missing",
    "anchor_swap",
    "source_publisher",
    "source_author",
    "source_url",
    "source_published_date",
    "source_tier",
    "dp_speaker_attribution",
  ]) {
    assert.equal(shouldResetEmbedding(type), false, `${type} must not re-embed`);
  }
});
