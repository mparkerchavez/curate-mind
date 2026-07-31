# Design: reversible lifecycle via appended events

**Status: IMPLEMENTED, deployed, and backfilled 2026-07-30.**

Built as designed. 71 tests pass, both packages typecheck, MCP rebuilt. The backfill reconstructed
134 events: 82 from that day's duplicate cleanup, 50 from an earlier cleanup on "The AI Layoff
Trap" that had left no visible history, 1 pre-existing Next Era supersede, and 1 throwaway test
row. Re-running the backfill wrote nothing, confirming idempotency.

Verified live against the deployed backend: restore applies and appends an event; a repeat restore
returns `outcome: "noop"` and writes no event; the cycle guard rejected a real loop attempt against
the batch 5 supersede chain; and `cm_get_source_usage` reports `restoreCount` on a data point that
reads "retired" but was flipped three times.

`CURATE_MIND_TOOLSET` is now `admin` in the Claude MCP config, so the repair tier is available in
normal use.

Drafted 2026-07-30 as the concrete proposal for option F in
`Source_DataPoint_Lifecycle_Scope_2026-07-30.md`.

## The finding that makes this smaller than expected

I proposed "derive current status from an event log." Reading `corrections` closely, that is **not**
what this codebase does, and the thing it actually does is better.

`correctClaim` ([convex/corrections.ts:393](convex/corrections.ts:393)) does two writes:

1. `insertCorrection(...)` appends an immutable audit row carrying `previousValue`, `newValue`,
   `reason`, `correctedAt`, `correctedBy`.
2. `ctx.db.patch(dataPointId, { claimText: correctedClaimText })` materializes the new current
   value onto the row itself.

Current state lives on the row and stays cheap to read. History lives in a separate append-only
table. `resolveEffectiveContent` ([convex/dataPoints.ts:43](convex/dataPoints.ts:43)) reads the
history only to report *whether* a correction exists, not to reconstruct the value.

So the pattern is **append event, then materialize**, not derive-on-read.

This matters a lot for cost. Deriving lifecycle from events would add a query per data point to
`search.ts`, `tags.ts`, `chat.ts`, and `publicResearch.ts`, on hot retrieval paths. Materializing
means **zero read-path changes**. `isLiveDataPoint` keeps reading `dp.status` exactly as it does
today, and all six liveness call sites stay untouched.

What actually changes is one thing: the write-once lock at
[convex/lib/supersede.ts:89](convex/lib/supersede.ts:89) is replaced by an appended event.

## Schema

A new table, mirroring `corrections` field-for-field where the concepts line up.

```ts
lifecycleEvents: defineTable({
  projectId: v.id("projects"),
  targetType: v.union(v.literal("dataPoint"), v.literal("source")),
  targetId: v.union(v.id("dataPoints"), v.id("sources")),
  action: v.union(
    v.literal("retire"),    // -> retired, no replacement
    v.literal("supersede"), // -> superseded, replacement required
    v.literal("restore")    // -> active
  ),
  previousStatus: v.string(),
  newStatus: v.string(),
  previousReplacementId: v.union(v.id("dataPoints"), v.id("sources"), v.null()),
  newReplacementId: v.union(v.id("dataPoints"), v.id("sources"), v.null()),
  reason: v.string(),
  recordedAt: v.number(),
  recordedBy: v.union(
    v.literal("curator"),
    v.literal("agent"),
    v.literal("pipeline")
  ),
})
  .index("by_project_target", ["projectId", "targetType", "targetId"])
  .index("by_target", ["targetType", "targetId", "recordedAt"]),
```

Both indexes copy `corrections` exactly, including the trailing timestamp on `by_target` so the
newest row is simply the last one collected. That is the convention `resolveEffectiveContent`
already relies on.

No change to the `dataPoints` table. `status`, `supersededBy`, `supersededAt`, and `supersedeReason`
keep their current meaning as the materialized current state.

## Changes to the pure logic

`convex/lib/supersede.ts` holds the testable core. Two changes:

**Remove the lock.** `resolveSupersedePatch` currently throws when `currentStatus !== "active"`.
That single condition is the whole feature being removed.

**Replace it with guard rails, not a lock.** Following the `correctClaim` precedent, which rejects
no-ops and applies a sanity bound but never refuses on the grounds that a change already happened:

- Reason still required at 10 characters, reusing the existing `validateReason` shape.
- Reject no-ops: retiring an already-retired point, or restoring an active one.
- `supersede` still requires a replacement; `retire` and `restore` must not carry one.
- **Cycle guard, new and necessary.** Today `supersededBy` is set once, so a cycle is impossible by
  construction. Once it can be re-pointed, A superseded by B and later B superseded by A becomes
  reachable, and anything that follows the chain would hang. Walk the chain before writing and
  reject if the target is already reachable from the replacement. Cap the walk depth.

The existing test `resolveSupersedePatch refuses to re-apply to a non-active data point`
([convex/lib/supersede.test.ts:90](convex/lib/supersede.test.ts:90)) is the one test that pins the
old behavior. It gets replaced rather than deleted, by tests asserting the new guard rails.

## Mutation surface

Keep `supersedeDataPoint` working exactly as it does now, so the existing
`cm_supersede_data_point` tool and everything written against it keep functioning. Internally it
gains the event append and loses the lock.

Add one mutation, `restoreDataPoint(dataPointId, reason, recordedBy?)`, which appends a `restore`
event and patches the row back to `status: "active"` with the lineage pointers cleared.

Both follow `correctClaim` step for step: validate, reject no-op, append event, patch row, return a
result rich enough to verify without a second call.

**Return warnings rather than refusing.** `supersedeDataPoint` already has a `warnings` array. Two
cases deserve one on restore, and neither should block:

- Restoring a point that was superseded *with* a replacement puts two near-duplicate claims back in
  live evidence. That is sometimes the right call, which is exactly why it should warn, not refuse.
- Restoring a point whose parent source is `failed` produces live evidence under a retired source.

## Sources, deliberately deferred

`supersedeSource` has the same write-once lock on `supersededBy` and `replaces`
([convex/sources.ts:225](convex/sources.ts:225)). The table above already carries
`targetType: "source"` so the schema does not need revisiting, but the source mutations should be a
second pass. Data point lifecycle is where the pain actually was, and shipping the smaller change
first keeps the review honest.

## Backfill

Existing retired and superseded rows have no event history. They can be reconstructed losslessly,
because the row already carries `supersedeReason` and `supersededAt`. A paged migration in the style
of `backfillDataPointStatus` ([convex/migrations.ts:304](convex/migrations.ts:304)) can emit one
synthetic event per non-active row, marked `recordedBy: "pipeline"` so reconstructed history is
never mistaken for a decision someone actually recorded at the time.

This recovers today's 82 retirements with their real reasons and timestamps intact, which is a
useful first test of the reader.

Follow the existing paging discipline. Data point rows carry a 1536-dimension embedding, which is
why that migration pages at 256 rows.

## Reads

No read path changes. Optionally, a `getLifecycleHistory` query mirroring `getForTarget`
([convex/corrections.ts:459](convex/corrections.ts:459)), surfaced as a curator tool so the
question "why is this retired, and did we already reverse it once?" has an answer.

`cm_get_source_usage` is the natural place to expose it, since that is already the
before-you-retire screen, and as of today it reports lifecycle state honestly.

## Test plan

Pure-logic tests in `convex/lib/`, plain fixtures, no Convex runtime, matching the existing
convention in `corrections.test.ts` and `supersede.test.ts`:

- retire, supersede, and restore each produce the right status, pointers, and event shape
- no-op rejection in each direction
- restore clears `supersededBy` rather than leaving it dangling
- cycle guard rejects a direct A to B to A loop and a longer one
- reason validation still enforced on every action
- a retire, restore, retire sequence leaves three events and a correct final row

End-to-end, the same check that verified the five cleanup batches: retire a data point, confirm it
leaves `cm_search`, restore it, confirm it returns and the history shows both events.

## Sizing

Roughly, smallest to largest: the schema table and the pure-logic change are small and well-pinned
by tests. The two mutations are a moderate, mechanical port of `correctClaim`. The backfill is
small but needs the paging discipline. The MCP tool surface is small. Source lifecycle is a
comparable second pass, deliberately deferred.

The risky part is not the code, it is the cycle guard, because it is the one genuinely new
invariant rather than a port of something already working.

## Resolved decisions

### 1. Restore is curator-only, via the admin toolset

Decided by the curator on 2026-07-30.

One wrinkle found while specifying it. The toolsets are **cumulative capability tiers, not role
separation**: `daily` is a subset of `pipeline`, which is a subset of `admin`
([mcp/src/toolsets.ts:137](mcp/src/toolsets.ts:137)). There is no set that a curator has and a
pipeline agent does not, other than `admin`. The default when `CURATE_MIND_TOOLSET` is unset is
`pipeline` ([mcp/src/toolsets.ts:150](mcp/src/toolsets.ts:150)), which is what the curator's own
session runs today.

So `cm_restore_data_point` goes in `ADMIN_EXTRA_TOOLS`. That excludes extraction sub-agents, which
is the point. The consequence is that the curator reaches it by running the admin toolset rather
than the default.

That fits how `ADMIN_EXTRA_TOOLS` is already used. It currently holds `cm_retire_tag`,
`cm_update_source_metadata`, `cm_get_position_history`, and the correction readers: it is already
the repair tier. Restore belongs with them, and needing an explicit switch into repair mode keeps
the action deliberate without making it permanent.

`recordedBy` still defaults to `"curator"`. The toolset is the access control; `recordedBy` is the
audit trail.

### 2. No-ops return an explicit outcome, they do not throw and do not silently succeed

`correctClaim` throws on a no-op, and this design deliberately diverges. The reason is that the two
no-ops mean different things:

- Correcting a claim to exactly what it already says is a caller mistake with no legitimate use.
  Throwing is right.
- Retiring an already-retired data point is **expected** during batch work and retries. Under
  option D a batch retire will hit this constantly, and a throw turns a normal condition into
  per-item error handling.

Silent success is the worse failure though: pass the wrong identifier list, get a cheerful result,
learn nothing. So the mutation returns `outcome: "applied" | "noop"` alongside the existing
`previousStatus`, and **a no-op appends no event**, so history stays free of "nothing happened"
rows.

Evidence from the cleanup: all 82 calls returned `previousStatus: "active"`, and that field is how
I confirmed nothing was stale or double-applied. The return shape already carries the signal, so
this is an extension of something that already worked rather than a new idea.

Genuinely invalid input still throws: missing or too-short reason, unknown identifier, a
`supersede` without a replacement, or a cycle.

### 3. Count plus latest, plus one field that count-plus-latest would hide

The curator's instinct here is right and matches `resolveEffectiveContent`, which reports booleans
plus `latestCorrectionAt` and `latestReason` rather than the full list.

There is one way lifecycle differs from corrections, and it matters: **lifecycle can be reversed.**
A count plus latest would render a data point retired today as "retired, 2026-07-30" whether that
was a single clean decision or the third flip in a retire, restore, retire sequence. That is
precisely the fact worth knowing before trusting a retirement.

So `cm_get_source_usage` reports count, latest action, latest reason, latest timestamp, **and a
`restoreCount`**. One extra integer, carrying the one thing the summary would otherwise conceal.

Full history stays available on demand through a separate `cm_get_lifecycle_history` call, mirroring
how `getForTarget` exists alongside `resolveEffectiveContent` rather than inside it.

There is a payload argument for the same answer. `cm_get_source_usage` already paginates its data
points and runs them through `takeItemsWithinJsonLimit`
([mcp/src/tools/query.ts:1892](mcp/src/tools/query.ts:1892)). Embedding a full event list per data
point would fight that budget on a screen that already lists every data point in a source.
