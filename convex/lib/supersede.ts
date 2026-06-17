/**
 * Pure lifecycle/supersede logic for data points, with no Convex runtime
 * dependency so it can be unit tested directly with plain fixtures.
 *
 * Decision 38: a data point can be retired (removed, no replacement) or
 * superseded (replaced by another data point) without failing its whole source.
 * The original claimText / anchorQuote stay immutable; only the lifecycle fields
 * (status, supersededBy, supersededAt, supersedeReason) are set, append-only and
 * set once (never re-pointed).
 *
 * Read-path rule: superseded/retired data points are excluded from "live"
 * evidence results by default, but stay fetchable by id, and their status is
 * surfaced wherever a data point is returned.
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

/**
 * Validate a supersede/retire request and resolve the target status.
 * Mirrors the corrections tools: reason must be at least 10 characters.
 * Throws on invalid input. Returns the lifecycle patch to apply (minus the
 * timestamp, which the mutation stamps with Date.now()).
 *
 * `currentStatus` is the data point's existing (normalized) status — a data
 * point that is already superseded or retired cannot be re-superseded, because
 * that would overwrite a prior pointer (not append-only).
 */
export function resolveSupersedePatch(args: {
  currentStatus: DataPointStatus;
  replacementId?: string | null;
  reason: string;
}): {
  status: Exclude<DataPointStatus, "active">;
  supersededBy: string | null;
  supersedeReason: string;
} {
  if (args.currentStatus !== "active") {
    throw new Error(
      `Data point is already ${args.currentStatus}; supersede/retire is append-only and cannot be re-applied`
    );
  }

  const reason = args.reason.trim();
  if (reason.length < 10) {
    throw new Error("reason is required and must be at least 10 characters");
  }

  const replacementId =
    args.replacementId != null && String(args.replacementId).trim() !== ""
      ? String(args.replacementId)
      : null;

  return replacementId
    ? { status: "superseded", supersededBy: replacementId, supersedeReason: reason }
    : { status: "retired", supersededBy: null, supersedeReason: reason };
}
