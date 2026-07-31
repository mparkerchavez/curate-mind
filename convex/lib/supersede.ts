/**
 * Pure lifecycle/supersede logic for data points, with no Convex runtime
 * dependency so it can be unit tested directly with plain fixtures.
 *
 * Decision 38: a data point can be retired (removed, no replacement) or
 * superseded (replaced by another data point) without failing its whole source.
 * The original claimText / anchorQuote stay immutable; only the lifecycle
 * fields (status, supersededBy, supersededAt, supersedeReason) change.
 *
 * Decision 44 (2026-07-30): a lifecycle decision is a curator judgment, and
 * judgments get revised. Lifecycle now follows the same append-and-materialize
 * pattern the `corrections` table has always used: every change appends an
 * immutable row to `lifecycleEvents`, and the current state is materialized on
 * the data point row. A `restore` is a new event, never an erasure of the
 * retire that preceded it, so nothing is lost by changing your mind.
 *
 * This replaces the previous write-once rule. Write-once was stricter than
 * append-only actually requires: true append-only permits reversal by
 * appending a new event, which is exactly what restore does. What stays
 * immutable is provenance (claimText, anchorQuote, source fullText), not
 * classification.
 *
 * Read-path rule is unchanged: superseded/retired data points are excluded
 * from "live" evidence results by default, but stay fetchable by id, and their
 * status is surfaced wherever a data point is returned. Reads never touch
 * `lifecycleEvents`, so no retrieval path pays for the history.
 */

export type DataPointStatus = "active" | "superseded" | "retired";

/** A row carrying just the lifecycle fields we care about. */
export interface SupersedableDataPoint {
  status?: DataPointStatus | null;
  supersededBy?: unknown;
  supersededAt?: number | null;
  supersedeReason?: string | null;
}

/**
 * Normalize the lifecycle status. A missing/null status (every row predating
 * Decision 38) is treated as "active" so reads stay correct even before the
 * backfill migration runs.
 */
export function normalizeStatus(
  status: DataPointStatus | null | undefined
): DataPointStatus {
  return status === "superseded" || status === "retired" ? status : "active";
}

/** True when a data point should appear in live evidence results. */
export function isLiveDataPoint(dp: SupersedableDataPoint): boolean {
  return normalizeStatus(dp.status) === "active";
}

/**
 * A small, serializable view of a data point's lifecycle state, suitable for
 * attaching to any returned data point shape.
 */
export interface SupersedeStateView {
  status: DataPointStatus;
  isLive: boolean;
  supersededBy: string | null;
  supersededAt: number | null;
  supersedeReason: string | null;
}

export function supersedeStateView(
  dp: SupersedableDataPoint
): SupersedeStateView {
  const status = normalizeStatus(dp.status);
  return {
    status,
    isLive: status === "active",
    supersededBy:
      dp.supersededBy != null ? String(dp.supersededBy) : null,
    supersededAt: dp.supersededAt ?? null,
    supersedeReason: dp.supersedeReason ?? null,
  };
}

/** The three lifecycle actions recorded in `lifecycleEvents`. */
export type LifecycleAction = "retire" | "supersede" | "restore";

/**
 * Whether a request is a no-op against the current state.
 *
 * Deliberately NOT an error. `correctClaim` throws on a no-op because
 * correcting a claim to what it already says has no legitimate use. A
 * lifecycle no-op is different: retiring an already-retired data point is
 * expected during batch work and retries, and throwing there would turn a
 * normal condition into per-item error handling.
 *
 * Silent success would be worse than either, so callers surface this as an
 * explicit `outcome: "noop"` and write no event.
 *
 * Re-superseding an already-superseded point at a DIFFERENT replacement is not
 * a no-op: that is a genuine re-point, which is now allowed and recorded.
 */
export function isLifecycleNoop(args: {
  currentStatus: DataPointStatus;
  currentReplacementId?: string | null;
  action: LifecycleAction;
  replacementId?: string | null;
}): boolean {
  const current = args.currentReplacementId ?? null;
  const next = normalizeReplacementId(args.replacementId);

  if (args.action === "restore") return args.currentStatus === "active";
  if (args.action === "retire") return args.currentStatus === "retired";
  return args.currentStatus === "superseded" && current === next;
}

function normalizeReplacementId(id?: string | null): string | null {
  return id != null && String(id).trim() !== "" ? String(id) : null;
}

/**
 * Walk the supersede chain from `startId` and report whether `targetId` is
 * reachable. Used to reject cycles.
 *
 * This guard is new and is the one genuinely new invariant in Decision 44.
 * Under the old write-once rule a cycle was impossible by construction, since
 * a pointer could never be re-pointed. Now that supersede can be re-applied,
 * "A superseded by B" followed by "B superseded by A" is reachable, and
 * anything that follows the chain would spin forever.
 *
 * `resolveNext` returns the replacement id for a given id, or null. It may be
 * sync (plain fixtures in tests) or async (a Convex db read, or a batch's
 * pending re-points checked ahead of stored rows). Keeping ONE implementation
 * matters: a cycle guard that has to be re-established by every future caller
 * is an invariant waiting to be forgotten, and a duplicate walk means the
 * version covered by tests is not the version that runs.
 *
 * The depth cap is a second backstop in case the data already contains a loop.
 */
export async function chainReaches(
  startId: string | null,
  targetId: string,
  resolveNext: (id: string) => string | null | Promise<string | null>,
  maxDepth = 64
): Promise<boolean> {
  let current = startId;
  const seen = new Set<string>();
  for (let i = 0; i < maxDepth && current != null; i++) {
    if (current === targetId) return true;
    if (seen.has(current)) return false; // pre-existing loop, stop walking
    seen.add(current);
    current = await resolveNext(current);
  }
  return false;
}

/**
 * Validate a lifecycle request and resolve the patch to materialize on the
 * data point row. Throws on invalid input. Returns the patch minus the
 * timestamp, which the mutation stamps with Date.now().
 *
 * No longer refuses on the grounds that a change already happened. Callers
 * should check `isLifecycleNoop` first and short-circuit; by the time this is
 * called the request is a real change.
 */
export function resolveLifecyclePatch(args: {
  currentStatus: DataPointStatus;
  action: LifecycleAction;
  replacementId?: string | null;
  reason: string;
}): {
  status: DataPointStatus;
  supersededBy: string | null;
  supersedeReason: string;
} {
  const reason = args.reason.trim();
  if (reason.length < 10) {
    throw new Error("reason is required and must be at least 10 characters");
  }

  const replacementId = normalizeReplacementId(args.replacementId);

  if (args.action === "supersede" && replacementId == null) {
    throw new Error(
      "supersede requires a replacementDataPointId; omit it to retire instead"
    );
  }
  if (args.action !== "supersede" && replacementId != null) {
    throw new Error(
      `${args.action} must not carry a replacementDataPointId; use supersede to point at a replacement`
    );
  }

  if (args.action === "restore") {
    return { status: "active", supersededBy: null, supersedeReason: reason };
  }
  if (args.action === "retire") {
    return { status: "retired", supersededBy: null, supersedeReason: reason };
  }
  return {
    status: "superseded",
    supersededBy: replacementId,
    supersedeReason: reason,
  };
}

/**
 * Resolve the status a source should return to when its supersede is reversed.
 *
 * `supersedeSource` overwrites status to "failed" without recording what it
 * was, so a restore has to read the prior status out of the lifecycle event
 * that set it. Guessing is not safe in either direction: guessing "extracted"
 * would promote a merely-indexed source into the corpus as though its evidence
 * had been extracted, and forcing "indexed" on a source that was genuinely
 * "failed" before invents a state it never held.
 *
 * So: replay the recorded status exactly, including "failed". Only when there
 * is no event at all (lineage predating the backfill) fall back to "indexed",
 * which is the safe unknown because it means "needs review" rather than
 * "trusted", and say so.
 */
export function resolveRestoredSourceStatus(
  previousStatus: string | null | undefined
): { status: "indexed" | "extracted" | "failed"; warning: string | null } {
  if (
    previousStatus === "indexed" ||
    previousStatus === "extracted" ||
    previousStatus === "failed"
  ) {
    return { status: previousStatus, warning: null };
  }
  return {
    status: "indexed",
    warning:
      'No lifecycle event records this source\'s status before it was superseded, so it is restored to "indexed" for review rather than assumed extracted.',
  };
}

/**
 * Back-compat wrapper for the pre-Decision-44 call shape: a replacement means
 * supersede, its absence means retire. Retained so existing callers and tests
 * keep working while the lock itself is gone.
 */
export function resolveSupersedePatch(args: {
  currentStatus: DataPointStatus;
  replacementId?: string | null;
  reason: string;
}): {
  status: DataPointStatus;
  supersededBy: string | null;
  supersedeReason: string;
} {
  return resolveLifecyclePatch({
    currentStatus: args.currentStatus,
    action: normalizeReplacementId(args.replacementId)
      ? "supersede"
      : "retire",
    replacementId: args.replacementId,
    reason: args.reason,
  });
}
