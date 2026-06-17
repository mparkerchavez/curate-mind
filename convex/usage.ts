/**
 * Reverse-lookup ("usage") queries — see where a data point or source is
 * referenced before correcting, retiring, or replacing it.
 *
 * Read-only. No schema changes, no mutations. "Live" references mean the
 * CURRENT position version only (resolved via researchPositions.currentVersionId).
 *
 * Convex enforces a per-execution read budget (16 MB). Data point and position
 * version rows each carry a 1536-dimension embedding, and source rows carry full
 * text, so broad table scans are expensive. To stay within budget:
 *   - Only bounded data is read inline: each position's CURRENT version (one
 *     db.get per position). Historical versions are never scanned, so references
 *     that live only in superseded versions are not reported (see ./lib/usage).
 *   - The unbounded reverse scans — related data points, observations, and
 *     derivative sources — have no reverse index, so each is paginated across
 *     separate query executions (getDataPointRelatedFromPage, getObservationsPage,
 *     getSourceDerivativesPage). The MCP tools loop the cursor.
 *
 * If positions grow into the thousands, the inline current-version read could
 * also need paginating; revisit then. The cleaner long-term fix is moving
 * embeddings/full text off these hot rows, which is a schema change excluded here.
 *
 * Aggregation logic lives in ./lib/usage so it can be unit tested without a
 * Convex runtime. Handlers here fetch rows, normalize IDs to strings, and delegate.
 */

import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { supersedeStateView } from "./lib/supersede";
import {
  computeLivePositions,
  filterBlastRadiusPositions,
  filterDerivativeSources,
  filterObservationsByDataPointIds,
  filterRelatedFrom,
  type UsagePositionVersion,
} from "./lib/usage";

// Page sizes tuned to keep each execution well under the 16 MB read budget.
// Data points and observations carry embeddings (~12 KB each); sources carry
// full text (variable, can be large), so they page in smaller chunks.
const DATA_POINT_PAGE_SIZE = 256;
const OBSERVATION_PAGE_SIZE = 256;
const SOURCE_PAGE_SIZE = 32;

function toIdStrings(ids: readonly Id<"dataPoints">[] | undefined): string[] {
  return (ids ?? []).map((id) => String(id));
}

/**
 * Current version (with evidence arrays) for every position in a project.
 * Project scope is resolved through researchThemes.by_projectId ->
 * researchPositions.by_themeId. Reads one current version per position only.
 */
async function collectProjectCurrentVersions(
  ctx: QueryCtx,
  projectId: Id<"projects">
): Promise<UsagePositionVersion[]> {
  const themes = await ctx.db
    .query("researchThemes")
    .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
    .collect();

  const positions: UsagePositionVersion[] = [];

  for (const theme of themes) {
    const themePositions = await ctx.db
      .query("researchPositions")
      .withIndex("by_themeId", (q) => q.eq("themeId", theme._id))
      .collect();

    for (const position of themePositions) {
      const currentVersion = position.currentVersionId
        ? await ctx.db.get(position.currentVersionId)
        : null;

      positions.push({
        positionId: String(position._id),
        title: position.title,
        themeId: String(theme._id),
        themeTitle: theme.title,
        currentVersionId: position.currentVersionId
          ? String(position.currentVersionId)
          : null,
        supportingEvidence: toIdStrings(currentVersion?.supportingEvidence),
        counterEvidence: toIdStrings(currentVersion?.counterEvidence),
      });
    }
  }

  return positions;
}

// ============================================================
// Data point usage — core (live positions only)
// Observations and related data points are fetched via the paginated scans
// below to stay within the per-execution read budget.
// ============================================================
export const getDataPointUsage = query({
  args: { dataPointId: v.id("dataPoints") },
  handler: async (ctx, args) => {
    const dp = await ctx.db.get(args.dataPointId);
    if (!dp) return null;

    const dataPointId = String(args.dataPointId);
    const source = await ctx.db.get(dp.sourceId);
    const projectId = source?.projectId;

    const positions = projectId
      ? await collectProjectCurrentVersions(ctx, projectId)
      : [];

    const { livePositions, supportingCount, counterCount } =
      computeLivePositions(dataPointId, positions);

    const supersedeState = supersedeStateView(dp);

    return {
      dataPoint: {
        _id: dataPointId,
        dpSequenceNumber: dp.dpSequenceNumber,
        sourceId: String(dp.sourceId),
        sourceTitle: source?.title ?? null,
        sourceStatus: source?.status ?? null,
        supersedeState,
      },
      livePositions,
      summaryCore: {
        livePositionCount: livePositions.length,
        supportingCount,
        counterCount,
        sourceStatus: source?.status ?? null,
        dataPointStatus: supersedeState.status,
        supersededBy: supersedeState.supersededBy,
      },
    };
  },
});

// ============================================================
// One page of the related-data-point reverse lookup.
// Scans the dataPoints table a page at a time. MCP loops `cursor` until `isDone`.
// ============================================================
export const getDataPointRelatedFromPage = query({
  args: {
    dataPointId: v.id("dataPoints"),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const dataPointId = String(args.dataPointId);

    const page = await ctx.db.query("dataPoints").paginate({
      numItems: DATA_POINT_PAGE_SIZE,
      cursor: args.cursor ?? null,
    });

    const candidates = page.page.map((other) => ({
      _id: String(other._id),
      dpSequenceNumber: other.dpSequenceNumber,
      sourceId: String(other.sourceId),
      sourceTitle: null as string | null,
      relatedDataPoints: toIdStrings(other.relatedDataPoints),
    }));

    const matches = filterRelatedFrom(dataPointId, candidates);

    // Resolve source titles only for the (few) matches.
    const titleCache = new Map<string, string | null>();
    const withTitles = [];
    for (const match of matches) {
      let title = titleCache.get(match.sourceId);
      if (title === undefined) {
        const matchSource = await ctx.db.get(match.sourceId as Id<"sources">);
        title = matchSource?.title ?? null;
        titleCache.set(match.sourceId, title);
      }
      withTitles.push({ ...match, sourceTitle: title });
    }

    return {
      matches: withTitles,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

// ============================================================
// One page of observations referencing any of the given data point IDs.
// Used by both data point usage (one ID) and source usage (a source's set).
// ============================================================
export const getObservationsPage = query({
  args: {
    dataPointIds: v.array(v.id("dataPoints")),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const dataPointIds = args.dataPointIds.map((id) => String(id));

    const page = await ctx.db.query("curatorObservations").paginate({
      numItems: OBSERVATION_PAGE_SIZE,
      cursor: args.cursor ?? null,
    });

    const observations = page.page.map((obs) => ({
      _id: String(obs._id),
      observationText: obs.observationText,
      referencedDataPoints: toIdStrings(obs.referencedDataPoints),
    }));

    return {
      matches: filterObservationsByDataPointIds(dataPointIds, observations),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

// ============================================================
// Source usage — core (the source's data points + blast-radius positions)
// Observations and derivative sources are fetched via the paginated scans.
// ============================================================
export const getSourceUsage = query({
  args: { sourceId: v.id("sources") },
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.sourceId);
    if (!source) return null;

    const sourceId = String(args.sourceId);

    const dps = await ctx.db
      .query("dataPoints")
      .withIndex("by_sourceId", (q) => q.eq("sourceId", args.sourceId))
      .collect();
    dps.sort((a, b) => a.dpSequenceNumber - b.dpSequenceNumber);

    const dataPointIds = dps.map((dp) => String(dp._id));
    const dataPoints = dps.map((dp) => ({
      _id: String(dp._id),
      dpSequenceNumber: dp.dpSequenceNumber,
      status: source.status,
      supersedeState: supersedeStateView(dp),
    }));
    const supersededDataPointCount = dps.filter(
      (dp) => supersedeStateView(dp).status !== "active"
    ).length;

    const positions = await collectProjectCurrentVersions(
      ctx,
      source.projectId
    );
    const blastRadiusPositions = filterBlastRadiusPositions(
      dataPointIds,
      positions
    );

    return {
      source: {
        _id: sourceId,
        title: source.title,
        status: source.status,
        supersededBy: source.supersededBy ? String(source.supersededBy) : null,
        replaces: source.replaces ? String(source.replaces) : null,
        supersededAt: source.supersededAt ?? null,
        supersedeReason: source.supersedeReason ?? null,
      },
      projectId: String(source.projectId),
      dataPoints,
      dataPointIds,
      positions: blastRadiusPositions,
      summaryCore: {
        dataPointCount: dataPoints.length,
        supersededDataPointCount,
        positionCount: blastRadiusPositions.length,
        sourceStatus: source.status,
        supersededBy: source.supersededBy ? String(source.supersededBy) : null,
        replaces: source.replaces ? String(source.replaces) : null,
      },
    };
  },
});

// ============================================================
// One page of sources in a project whose derivedFrom points at `sourceId`.
// ============================================================
export const getSourceDerivativesPage = query({
  args: {
    projectId: v.id("projects"),
    sourceId: v.id("sources"),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const sourceId = String(args.sourceId);

    const page = await ctx.db
      .query("sources")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .paginate({ numItems: SOURCE_PAGE_SIZE, cursor: args.cursor ?? null });

    const candidates = page.page.map((s) => ({
      _id: String(s._id),
      title: s.title,
      derivedFrom: s.derivedFrom ? String(s.derivedFrom) : null,
      derivedFromKind: s.derivedFromKind ?? null,
    }));

    return {
      matches: filterDerivativeSources(sourceId, candidates),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});
