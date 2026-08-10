// Tests for the pure project-scoping retrieval logic (Decision 45).
//
// Exercised with plain fixtures (no Convex runtime).
// Run with: node --import tsx --test convex/lib/projectScope.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  describeMalformedLabels,
  describeRetrievalScope,
  emptyEnforcement,
  findMalformedCitationLabels,
  mergeRankedIds,
  shouldWidenRetrieval,
  totalEnforced,
} from "./projectScope";

test("mergeRankedIds keeps filtered results ahead of widened ones", () => {
  assert.deepEqual(mergeRankedIds(["a", "b"], ["c", "d"]), ["a", "b", "c", "d"]);
});

test("mergeRankedIds drops duplicates without reordering the survivor", () => {
  assert.deepEqual(mergeRankedIds(["a", "b"], ["b", "c", "a"]), ["a", "b", "c"]);
});

test("mergeRankedIds ignores empty ids and handles empty inputs", () => {
  assert.deepEqual(mergeRankedIds([], []), []);
  assert.deepEqual(mergeRankedIds(["a"], []), ["a"]);
  assert.deepEqual(mergeRankedIds([], ["a", ""]), ["a"]);
});

test("shouldWidenRetrieval fires only when the filtered pass under-fills", () => {
  assert.equal(shouldWidenRetrieval(0, 12), true);
  assert.equal(shouldWidenRetrieval(11, 12), true);
  assert.equal(shouldWidenRetrieval(12, 12), false);
  assert.equal(shouldWidenRetrieval(20, 12), false);
});

test("totalEnforced folds several entity results into one set of counts", () => {
  const totals = totalEnforced([
    { kept: ["a", "b"], dropped: ["x"], unresolved: [] },
    { kept: ["c"], dropped: ["y", "z"], unresolved: ["q"] },
    emptyEnforcement(),
  ]);
  assert.deepEqual(totals, { kept: 3, dropped: 3, unresolved: 1 });
});

test("describeRetrievalScope stays silent when nothing was enforced", () => {
  assert.deepEqual(
    describeRetrievalScope({
      projectId: "p1",
      widened: false,
      droppedForProject: 0,
      unresolvedProject: 0,
    }),
    []
  );
});

test("describeRetrievalScope reports drops, unresolved rows, and widening", () => {
  const warnings = describeRetrievalScope({
    projectId: "p1",
    widened: true,
    droppedForProject: 8,
    unresolvedProject: 2,
  });

  assert.equal(warnings.length, 3);
  assert.match(warnings[0], /8 retrieved item\(s\) belonged to a different project/);
  assert.match(warnings[1], /2 retrieved item\(s\) carry no resolvable project/);
  assert.match(warnings[2], /not indexed under it yet/);
  assert.match(warnings[2], /backfillProjectScope/);
  assert.match(
    warnings[2],
    /project boundary still held/,
    "a recall note must not read as a boundary failure"
  );
});

test("findMalformedCitationLabels accepts bare evidence labels", () => {
  const answer = "Pricing is converging [E1]. Adoption lags it [E12].";
  assert.deepEqual(findMalformedCitationLabels(answer), []);
});

test("findMalformedCitationLabels catches the hybrid stance label", () => {
  const answer = "Seat pricing is dominant [E1, cited within P1].";
  const found = findMalformedCitationLabels(answer);

  assert.equal(found.length, 1);
  assert.equal(found[0].token, "[E1, cited within P1]");
  assert.match(found[0].reason, /bare \[E followed by digits\]/);
});

test("findMalformedCitationLabels catches a self-reported stance-text citation", () => {
  const answer =
    "The floor sits near thirty dollars [E4 context, but the specific figure is from P4's stance text, not a labeled evidence point].";
  const found = findMalformedCitationLabels(answer);

  assert.equal(found.length, 1);
  assert.match(found[0].token, /^\[E4 context/);
});

test("findMalformedCitationLabels catches counter-evidence labels copied from a stance", () => {
  const found = findMalformedCitationLabels("Adoption is slower than claimed [C3].");

  assert.equal(found.length, 1);
  assert.equal(found[0].token, "[C3]");
  assert.match(found[0].reason, /position's own evidence chain/);
});

test("findMalformedCitationLabels leaves position labels and prose brackets alone", () => {
  const answer =
    "The current stance [P1] holds. See the note [editor's aside] and the [Estimate 2026] table.";
  assert.deepEqual(findMalformedCitationLabels(answer), []);
});

test("findMalformedCitationLabels does not flag markdown links", () => {
  const answer = "Read it here: [E1 pricing teardown](https://example.com/report).";
  assert.deepEqual(findMalformedCitationLabels(answer), []);
});

test("findMalformedCitationLabels reports each distinct token once", () => {
  const answer = "First [E1, per P1]. Again [E1, per P1]. And [E2, per P2].";
  const found = findMalformedCitationLabels(answer);

  assert.deepEqual(
    found.map((label) => label.token),
    ["[E1, per P1]", "[E2, per P2]"]
  );
});

test("describeMalformedLabels renders one warning line per label", () => {
  const warnings = describeMalformedLabels(
    findMalformedCitationLabels("Seat pricing dominates [E1, cited within P1].")
  );

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /^Malformed citation label \[E1, cited within P1\]\./);
});
