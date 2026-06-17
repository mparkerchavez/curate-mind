// Regression tests for the pure reverse-lookup aggregation used by the
// cm_get_data_point_usage and cm_get_source_usage queries.
//
// These exercise the aggregation logic with plain fixtures (no Convex runtime).
// Run with: node --import tsx --test convex/lib/usage.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  computeLivePositions,
  filterBlastRadiusPositions,
  filterDerivativeSources,
  filterObservationsByDataPointIds,
  filterRelatedFrom,
  roleForDataPoint,
  shortLabel,
} from "./usage";

const positionsFixture = [
  {
    positionId: "pos1",
    title: "Net deskilling",
    themeId: "theme1",
    themeTitle: "Workforce",
    currentVersionId: "ver1",
    supportingEvidence: ["dp1", "dp9"],
    counterEvidence: ["dp2"],
  },
  {
    positionId: "pos2",
    title: "Unrelated",
    themeId: "theme1",
    themeTitle: "Workforce",
    currentVersionId: "ver2",
    supportingEvidence: ["dp7"],
    counterEvidence: ["dp8"],
  },
];

test("roleForDataPoint reports supporting, counter, both, or none", () => {
  assert.equal(roleForDataPoint(["dp1"], [], "dp1"), "supporting");
  assert.equal(roleForDataPoint([], ["dp1"], "dp1"), "counter");
  assert.equal(roleForDataPoint(["dp1"], ["dp1"], "dp1"), "both");
  assert.equal(roleForDataPoint(["dp2"], ["dp3"], "dp1"), null);
  assert.equal(roleForDataPoint(undefined, undefined, "dp1"), null);
});

test("shortLabel takes the first non-empty line and truncates", () => {
  assert.equal(shortLabel("\n  First line  \nSecond line"), "First line");
  const long = "x".repeat(200);
  assert.equal(shortLabel(long).length, 123); // 120 chars + "..."
  assert.ok(shortLabel(long).endsWith("..."));
});

test("computeLivePositions finds the live position citing a data point as supporting", () => {
  const result = computeLivePositions("dp1", positionsFixture);
  assert.equal(result.livePositions.length, 1);
  assert.equal(result.livePositions[0].positionId, "pos1");
  assert.equal(result.livePositions[0].evidenceRole, "supporting");
  assert.equal(result.supportingCount, 1);
  assert.equal(result.counterCount, 0);
});

test("computeLivePositions reports counter role and ignores unrelated positions", () => {
  const result = computeLivePositions("dp2", positionsFixture);
  assert.equal(result.livePositions.length, 1);
  assert.equal(result.livePositions[0].evidenceRole, "counter");
  assert.equal(result.counterCount, 1);

  assert.equal(computeLivePositions("dp404", positionsFixture).livePositions.length, 0);
});

test("filterRelatedFrom keeps data points that list the target, drops the rest", () => {
  const matches = filterRelatedFrom("dp1", [
    { _id: "dp42", dpSequenceNumber: 1, sourceId: "src2", sourceTitle: "Source Two", relatedDataPoints: ["dp1", "dp9"] },
    // does not list dp1 — excluded
    { _id: "dp43", dpSequenceNumber: 2, sourceId: "src2", sourceTitle: "Source Two", relatedDataPoints: ["dp9"] },
    // is the data point itself — excluded
    { _id: "dp1", dpSequenceNumber: 3, sourceId: "src1", sourceTitle: "Source One", relatedDataPoints: ["dp1"] },
  ]);

  assert.deepEqual(matches.map((m) => m._id), ["dp42"]);
  assert.equal(matches[0].sourceTitle, "Source Two");
});

test("filterObservationsByDataPointIds matches on any id in the set", () => {
  const observations = [
    { _id: "obs1", observationText: "Touches dp1.\nmore", referencedDataPoints: ["dp1"] },
    { _id: "obs2", observationText: "Touches dp3", referencedDataPoints: ["dp3", "dp5"] },
    { _id: "obs3", observationText: "Off topic", referencedDataPoints: ["dp99"] },
  ];

  // single-id case (data point usage)
  assert.deepEqual(
    filterObservationsByDataPointIds(["dp1"], observations).map((o) => o._id),
    ["obs1"]
  );
  // set case (source usage)
  assert.deepEqual(
    filterObservationsByDataPointIds(["dp1", "dp3"], observations).map((o) => o._id),
    ["obs1", "obs2"]
  );
  assert.equal(filterObservationsByDataPointIds(["dp1"], observations)[0].label, "Touches dp1.");
});

test("filterBlastRadiusPositions returns positions referencing any data point in the set", () => {
  // srcA owns dp2 (counter on pos1) — pos1 included, pos2 excluded
  const blast = filterBlastRadiusPositions(["dp2", "dp404"], positionsFixture);
  assert.deepEqual(blast.map((p) => p.positionId), ["pos1"]);
  // shape is the lean blast-radius shape (no evidenceRole)
  assert.deepEqual(Object.keys(blast[0]).sort(), [
    "currentVersionId",
    "positionId",
    "themeId",
    "themeTitle",
    "title",
  ]);
});

test("filterDerivativeSources keeps only sources derived from the target", () => {
  const derivatives = filterDerivativeSources("srcA", [
    { _id: "srcB", title: "Commentary", derivedFrom: "srcA", derivedFromKind: "commentary" },
    { _id: "srcC", title: "Unrelated", derivedFrom: null, derivedFromKind: null },
    { _id: "srcA", title: "Self", derivedFrom: null, derivedFromKind: null },
  ]);
  assert.deepEqual(derivatives.map((s) => s._id), ["srcB"]);
  assert.equal(derivatives[0].derivedFromKind, "commentary");
});
