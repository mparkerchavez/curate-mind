/**
 * Pure reverse-lookup aggregation for the usage queries.
 *
 * These functions hold the "what references this" logic with no Convex runtime
 * dependency, so they can be unit tested directly with plain fixtures.
 * convex/usage.ts fetches rows from the database, normalizes IDs to strings,
 * and hands plain arrays to these functions.
 *
 * Read-only: nothing here mutates state. "Live" references mean the current
 * position version only.
 *
 * Note on superseded versions: the approved plan considered reporting a count of
 * references in older (non-current) position versions "if cheap". It is not
 * cheap on this corpus. Position version rows each carry a 1536-dimension
 * embedding, and reading every version of every position exceeds Convex's
 * per-execution read budget. We therefore report live references only and do not
 * scan historical versions.
 *
 * Note on scanning: data points, observations, and sources carry heavy fields
 * (embeddings / full text). The convex/usage.ts handlers read only bounded data
 * inline (each position's current version) and paginate the unbounded table
 * scans (related data points, observations, derivative sources) across separate
 * query executions. These pure helpers operate on one page's worth of plain
 * rows at a time.
 */

export type EvidenceRole = "supporting" | "counter" | "both";

function includesId(
  ids: readonly string[] | undefined,
  target: string
): boolean {
  if (!ids) return false;
  return ids.some((id) => String(id) === target);
}

function intersects(
  ids: readonly string[] | undefined,
  targets: ReadonlySet<string>
): boolean {
  if (!ids) return false;
  return ids.some((id) => targets.has(String(id)));
}

/**
 * Whether a data point appears in a version's evidence arrays, and in what role.
 * Returns null when the data point is not referenced at all.
 */
export function roleForDataPoint(
  supportingEvidence: readonly string[] | undefined,
  counterEvidence: readonly string[] | undefined,
  dataPointId: string
): EvidenceRole | null {
  const inSupporting = includesId(supportingEvidence, dataPointId);
  const inCounter = includesId(counterEvidence, dataPointId);
  if (inSupporting && inCounter) return "both";
  if (inSupporting) return "supporting";
  if (inCounter) return "counter";
  return null;
}

/**
 * First non-empty line of an observation, trimmed to a short recognizable label.
 */
export function shortLabel(text: string, maxLength = 120): string {
  const firstLine =
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "";
  if (firstLine.length <= maxLength) return firstLine;
  return firstLine.slice(0, maxLength).trimEnd() + "...";
}

// ── Shared shapes ─────────────────────────────────────────────────

export interface UsagePositionVersion {
  positionId: string;
  title: string;
  themeId: string;
  themeTitle: string | null;
  currentVersionId: string | null;
  supportingEvidence?: readonly string[];
  counterEvidence?: readonly string[];
}

export interface UsageObservation {
  _id: string;
  observationText: string;
  referencedDataPoints?: readonly string[];
}

export interface UsageRelatedDataPoint {
  _id: string;
  dpSequenceNumber: number;
  sourceId: string;
  sourceTitle: string | null;
  relatedDataPoints?: readonly string[];
}

export interface UsageDerivativeCandidate {
  _id: string;
  title: string;
  derivedFrom?: string | null;
  derivedFromKind?: string | null;
}

export interface BlastRadiusPosition {
  positionId: string;
  title: string;
  themeId: string;
  themeTitle: string | null;
  currentVersionId: string | null;
}

// ── Data point usage ──────────────────────────────────────────────

export interface LivePosition extends BlastRadiusPosition {
  evidenceRole: EvidenceRole;
}

/**
 * Current position versions that cite a data point, with their evidence role.
 */
export function computeLivePositions(
  dataPointId: string,
  positions: UsagePositionVersion[]
): { livePositions: LivePosition[]; supportingCount: number; counterCount: number } {
  const livePositions: LivePosition[] = [];
  let supportingCount = 0;
  let counterCount = 0;

  for (const position of positions) {
    const role = roleForDataPoint(
      position.supportingEvidence,
      position.counterEvidence,
      dataPointId
    );
    if (!role) continue;
    if (role === "supporting" || role === "both") supportingCount++;
    if (role === "counter" || role === "both") counterCount++;
    livePositions.push({
      positionId: position.positionId,
      title: position.title,
      themeId: position.themeId,
      themeTitle: position.themeTitle,
      currentVersionId: position.currentVersionId,
      evidenceRole: role,
    });
  }

  return { livePositions, supportingCount, counterCount };
}

/**
 * One page of data points filtered to those that list `dataPointId` in their
 * relatedDataPoints (and are not the data point itself).
 */
export function filterRelatedFrom(
  dataPointId: string,
  candidates: UsageRelatedDataPoint[]
): Array<{
  _id: string;
  dpSequenceNumber: number;
  sourceId: string;
  sourceTitle: string | null;
}> {
  return candidates
    .filter(
      (dp) =>
        String(dp._id) !== dataPointId &&
        includesId(dp.relatedDataPoints, dataPointId)
    )
    .map((dp) => ({
      _id: dp._id,
      dpSequenceNumber: dp.dpSequenceNumber,
      sourceId: dp.sourceId,
      sourceTitle: dp.sourceTitle,
    }));
}

// ── Shared: observations and positions by data point set ──────────

/**
 * One page of observations filtered to those referencing any data point in the
 * set. Works for a single data point (pass one id) or a source's full set.
 */
export function filterObservationsByDataPointIds(
  dataPointIds: readonly string[],
  observations: UsageObservation[]
): Array<{ _id: string; label: string }> {
  const set = new Set(dataPointIds.map(String));
  return observations
    .filter((obs) => intersects(obs.referencedDataPoints, set))
    .map((obs) => ({ _id: obs._id, label: shortLabel(obs.observationText) }));
}

/**
 * Current position versions referencing any data point in the set.
 */
export function filterBlastRadiusPositions(
  dataPointIds: readonly string[],
  positions: UsagePositionVersion[]
): BlastRadiusPosition[] {
  const set = new Set(dataPointIds.map(String));
  return positions
    .filter(
      (p) =>
        intersects(p.supportingEvidence, set) ||
        intersects(p.counterEvidence, set)
    )
    .map((p) => ({
      positionId: p.positionId,
      title: p.title,
      themeId: p.themeId,
      themeTitle: p.themeTitle,
      currentVersionId: p.currentVersionId,
    }));
}

// ── Source usage ──────────────────────────────────────────────────

/**
 * One page of sources filtered to those whose derivedFrom points at `sourceId`.
 */
export function filterDerivativeSources(
  sourceId: string,
  candidates: UsageDerivativeCandidate[]
): Array<{ _id: string; title: string; derivedFromKind: string | null }> {
  return candidates
    .filter((s) => s.derivedFrom != null && String(s.derivedFrom) === sourceId)
    .map((s) => ({
      _id: s._id,
      title: s.title,
      derivedFromKind: s.derivedFromKind ?? null,
    }));
}
