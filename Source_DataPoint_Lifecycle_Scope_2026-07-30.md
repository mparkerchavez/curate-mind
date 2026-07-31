# Scope: keeping data point liveness consistent with source lifecycle

Investigated 2026-07-30, after the duplicate cleanup. No code has been changed.

## Correction to the earlier diagnosis

I previously said the root cause was a field-name collision: that a data point's pipeline
status and its lifecycle status share the `status` field, and that `normalizeStatus` treats the
pipeline value `"failed"` as active. **That was wrong, and the conclusion drawn from it was wrong.**

What actually happens is a reporting bug in the tool I used to investigate.
[convex/usage.ts:242](convex/usage.ts:242) builds each data point row for `cm_get_source_usage` as:

```js
const dataPoints = dps.map((dp) => ({
  _id: String(dp._id),
  dpSequenceNumber: dp.dpSequenceNumber,
  status: source.status,            // the SOURCE's status, under a data point's key
  supersedeState: supersedeStateView(dp),
}));
```

So the `"failed"` and `"extracted"` values I read as data point status were the **source's**
status wearing a data point's label. Checked directly against the database, data point rows carry
proper lifecycle values only.

The lifecycle field is in good health:

- The schema union is strict: `"active" | "superseded" | "retired"`, nothing else.
- Only two writers exist in the whole codebase: the Decision 38 backfill
  ([convex/migrations.ts:333](convex/migrations.ts:333)) and `supersedeDataPoint`
  ([convex/dataPoints.ts:617](convex/dataPoints.ts:617)).
- `insertDataPoint` and `insertBatch` do not accept a `status` argument, so extraction cannot
  write one.

There is no legacy pollution to migrate and no field collision to untangle.

## The real gap

Source lifecycle and data point lifecycle are completely independent, and nothing bridges them.

- `supersedeSource` marks the old source `failed` and sets lineage, and never touches its data
  points ([convex/sources.ts:227](convex/sources.ts:227)).
- `updateStatus` is a bare patch that can set any source to `failed` with no data point handling
  ([convex/sources.ts:204](convex/sources.ts:204)), and it is exposed to agents as
  `cm_update_source_status`.
- Six read paths decide liveness, and **not one of them consults the parent source**:
  `search.ts:72`, `chat.ts:1156`, `sources.ts:564`, `publicResearch.ts:291`, `tags.ts:265`, plus
  `usage.ts` for reporting.

So a source can be retired while its evidence stays fully live in `cm_ask`, `cm_search`, tag
retrieval, and the public routes. That is exactly what happened: the OpenAI cluster had correct
source lineage from 2026-06-17 and 18 live data points until today.

Two ways in:

1. **Re-ingest.** Curator supersedes a source and does not know the data points need a separate
   pass. This is the one that actually bit.
2. **Failed extraction.** A source is marked `failed` after partial extraction, and the partial
   data points stay live.

Note this is not a contradiction of Decision 38. That decision established that a data point can be
retired *without* failing its whole source. It says nothing about the reverse direction, which is
the direction that is unhandled.

## Current exposure: zero

All 16 sources currently at status `failed` were checked. Every one has **zero live data points**.
The cleanup closed the existing exposure completely, so nothing here is urgent and no backfill is
required. This is entirely about preventing recurrence.

## Options

### Option A: cascade inside `supersedeSource`

Retire the source's live data points in the same mutation.

- Fixes the failure that actually occurred, in one place.
- Matches curator intent: a re-ingest replaces the old record wholesale.
- Removes the judgment call. Batch 5 showed judgment is sometimes needed: one data point deserved a
  `supersededBy` pointer to its live equivalent rather than a bare retire, and a blind cascade would
  have flattened that.
- Does not cover the failed-extraction path, since that goes through `updateStatus`.
- Watch the transaction size. Data point rows carry a 1536-dimension embedding, which is why the
  backfill migration pages at 256 rows. Per-source counts here are 10 to 25, so this is fine, but it
  should read through the `by_sourceId` index and not collect the table.

### Option B: derive liveness from the parent source

Teach the read paths to treat a data point as non-live when its source is `failed`.

- One conceptual rule that covers both entry paths and any future one.
- `isLiveDataPoint(dp)` is currently a pure function over the data point row with no source access,
  so all six call sites would need the parent source. Most already resolve the source for display,
  but `tags.ts` and `search.ts` would take an extra read per candidate.
- Changes the meaning of the stored field: a data point could read `active` while being invisible.
  That is a real cost in a system whose whole premise is explicit, inspectable, append-only state.
- No retroactive effect today, since exposure is already zero.

### Option C: make the gap loud instead of silent

Return a `liveDataPointCount` from `supersedeSource` and surface it as a warning in the MCP tool
response, in the same style as the existing `warnings` array on `supersedeDataPoint`.

- Smallest change, no semantic shift, preserves curator judgment.
- Does not prevent anything on its own. It converts a silent gap into a visible one.

### Option D: batch retirement tool

There is no batch supersede or retire. The sibling batch tools exist
(`cm_enrich_data_points_batch`, `cm_update_data_points_tags_batch`,
`cm_remove_data_point_tag_batch`), but retirement is one call per data point. This cleanup took 82
individual calls, which is the main reason the whole thing felt heavy enough to defer.

### Option E: fix the reporting bug

One line at [convex/usage.ts:242](convex/usage.ts:242). Either drop the field or rename it to
`sourceStatus`, which is what the neighbouring `summaryCore` already calls it.

- `cm_get_source_usage` is described as the tool for checking blast radius before retiring a
  source. Right now it reports a data point's status as something it is not, on the exact screen a
  curator uses to make that decision. It misled me for several steps.

### Option F: make lifecycle an appended event, not a write-once field

Added after the curator observed that six months of real use call for the ability to fix issues as
they arise, both during processing and later while querying.

This does not require giving up append-only. It requires applying the interpretation of
append-only the codebase **already uses elsewhere**.

There are two different readings of the principle live in this repo right now:

| | Reading | Behavior |
|---|---|---|
| `corrections` table | Append an event, derive current state | Freely repeatable, full history, nothing lost |
| Lifecycle (`supersede`/`retire`) | Mutate a field once, then refuse forever | One shot, permanent, no history of the decision itself |

The `corrections` table is the good one. Each correction inserts a row carrying `previousValue`,
`newValue`, `reason`, `correctedAt`, and `correctedBy`, the effective content is materialized from
it, and the audit trail reads back through `getForTarget`. Critically, `correctClaim` has **no
"already corrected" guard**: the only checks are that a reason is present and that the change is
not a no-op. A curator can correct a claim, then correct it again, forever, and every step is
preserved.

Lifecycle does the opposite. `resolveSupersedePatch` throws the moment `currentStatus !== "active"`
([convex/lib/supersede.ts:89](convex/lib/supersede.ts:89)), and the source lineage pointers are
likewise set once ([convex/sources.ts:225](convex/sources.ts:225)).

That is not append-only. It is write-once-immutable, which is strictly stronger. True append-only
would permit reversal by *appending a new event that supersedes the prior decision*, keeping both
on the record.

Lifecycle is also the outlier. Everything else a curator touches is already revisable:

- Corrections: repeatable, with history
- Tags: `updateTagsBatch`, `removeTagBatch`
- Evidence links: `linkEvidence`, `unlinkEvidenceFromPosition`, `replaceEvidenceOnPosition`
- Positions: versioned, with previous versions preserved

Data point lifecycle status and source lineage are the only write-once surfaces in the system.

**What this would look like:** a `lifecycleEvents` table mirroring `corrections`
(`targetType`, `targetId`, `action` of retire / supersede / restore, `previousStatus`, `newStatus`,
`replacementId`, `reason`, `at`, `by`). Current status is derived from the latest event rather than
stored as a one-shot field. `isLiveDataPoint` reads the derived state, so no read path changes.

**What stays immutable, and should:** the original `claimText` and `anchorQuote`, source
`fullText`, data point identity, and position version history. Those are provenance. A curator's
*classification* of a data point is a judgment, and judgments are exactly the thing six months of
use will revise.

**Evidence from today:** this cleanup needed a five-batch structure, a deliberately chosen pilot,
and verification at every step, entirely because the operations could not be undone. Under an event
model it would have been one call, checked afterward, reversed if wrong. The cost of write-once
showed up concretely today, in hours.

## Recommendation

**Revised after the curator reframe. Do F first, then E, D, and C. A becomes viable once F lands.
Still hold B.**

The reframe changes the ordering because irreversibility was the hidden constraint behind my
original answer. I recommended against the cascade (A) specifically because a blind cascade would
permanently flatten judgment calls like the one in batch 5. Once lifecycle decisions can be
reversed, that objection mostly dissolves: cascade becomes a fast default that a curator can refine
afterward, rather than a permanent commitment made on incomplete information.

- **F** is the unlock. It is the largest item here, but it is not a new architecture: it ports an
  existing, working pattern from `corrections` onto lifecycle. It also removes the reason the other
  fixes felt risky.
- **E** stays exactly as before: a one-line correctness fix, independent of everything else.
- **D** matters more under this framing, not less. Fixing issues as they arise means the fix has to
  be cheap. 82 individual calls is not cheap.
- **C** stays, and pairs naturally with D.
- **A** moves from "skip" to "reasonable once F exists," ideally as an opt-in cascade with a preview
  of what it will touch.
- **B** still held in reserve. Under F, current state is already derived, so if source-aware
  liveness is ever wanted it becomes a much smaller change layered on the same machinery.

Sequencing: E immediately, since it is trivial and independent. Then F, because it changes the risk
profile of everything after it. Then D and C together. Then reconsider A.

### The prior recommendation, for the record

Before the reframe I recommended E, C, D, and explicitly advised skipping A and B, on the reasoning
that curator judgment should be preserved at each irreversible step. That advice was correct given
an assumption I had not examined: that write-once lifecycle was a fixed constraint. It is not. It is
a design choice, and one the `corrections` table already contradicts.

- **E** is a one-line correctness fix to the tool that exists specifically to inform this decision.
  Do it regardless of everything else.
- **C** closes the knowledge gap that caused the incident. The curator did the right thing at the
  source level and had no way to know a second step existed.
- **D** removes the friction that made the second step feel expensive. C and D together mean the
  next re-ingest surfaces the count and offers a single call to act on it.
- **A** is tempting but trades away the judgment that batch 5 proved valuable, and it still misses
  the `updateStatus` path. Worth revisiting if re-ingests become frequent enough that the prompting
  from C is just noise.
- **B** is the most complete answer and the most invasive. It makes stored state stop meaning what
  it says, which is the opposite of how this project treats its data. Hold it in reserve.

Sequencing: E first since it is independent and tiny. Then D, because C's warning is most useful
when it can point at a single remediation call. Then C.

## Verification for whichever path is taken

- Existing unit coverage lives in `convex/lib/supersede.test.ts` and already pins the
  `normalizeStatus` and `isLiveDataPoint` contract. Extend it rather than replacing it.
- End-to-end check: supersede a source that has live data points, then confirm
  `cm_get_source_usage` reports the live count honestly and that `cm_search` stops returning the
  retired evidence. That is the same check that verified the five cleanup batches.
