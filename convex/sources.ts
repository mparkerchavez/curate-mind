import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  chainReaches,
  isLiveDataPoint,
  resolveRestoredSourceStatus,
  supersedeStateView,
} from "./lib/supersede";

export type ResolvedLinkKind = "storage" | "canonical" | "internal";

export type ResolvedSourceMeta = {
  _id: Id<"sources">;
  title: string;
  authorName?: string;
  publisherName?: string;
  canonicalUrl?: string;
  publishedDate?: string;
  ingestedDate?: string;
  sourceType: Doc<"sources">["sourceType"];
  tier: Doc<"sources">["tier"];
  derivedFrom: Id<"sources"> | null;
  derivedFromKind: Doc<"sources">["derivedFromKind"] | null;
  status: Doc<"sources">["status"];
  supersededBy: Id<"sources"> | null;
  replaces: Id<"sources"> | null;
  storageUrl: string | null;
  resolvedUrl: string;
  resolvedLinkKind: ResolvedLinkKind;
  sourcePagePath: string;
};

const derivedFromKindValidator = v.union(
  v.literal("commentary"),
  v.literal("summary"),
  v.literal("presentation"),
  v.literal("translation")
);

function normalizeStoredUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

export async function resolveSourceMeta(
  ctx: QueryCtx,
  source: Doc<"sources">
): Promise<ResolvedSourceMeta> {
  const sourcePagePath = `/sources/${source._id}`;
  const canonicalUrl = normalizeStoredUrl(source.canonicalUrl);
  const storageUrl = source.storageId
    ? await ctx.storage.getUrl(source.storageId)
    : null;

  let resolvedUrl = sourcePagePath;
  let resolvedLinkKind: ResolvedLinkKind = "internal";

  if (storageUrl) {
    resolvedUrl = storageUrl;
    resolvedLinkKind = "storage";
  } else if (canonicalUrl) {
    resolvedUrl = canonicalUrl;
    resolvedLinkKind = "canonical";
  }

  return {
    _id: source._id,
    title: source.title,
    authorName: source.authorName,
    publisherName: source.publisherName,
    canonicalUrl,
    publishedDate: source.publishedDate,
    ingestedDate: source.ingestedDate,
    sourceType: source.sourceType,
    tier: source.tier,
    derivedFrom: source.derivedFrom ?? null,
    derivedFromKind: source.derivedFromKind ?? null,
    status: source.status,
    supersededBy: source.supersededBy ?? null,
    replaces: source.replaces ?? null,
    storageUrl,
    resolvedUrl,
    resolvedLinkKind,
    sourcePagePath,
  };
}

// ============================================================
// Insert a new source into the system
// Status starts as "indexed" (ready for extraction)
// ============================================================
export const insertSource = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    authorName: v.optional(v.string()),
    publisherName: v.optional(v.string()),
    canonicalUrl: v.optional(v.string()),
    publishedDate: v.optional(v.string()),
    sourceType: v.union(
      v.literal("article"),
      v.literal("report"),
      v.literal("podcast"),
      v.literal("video"),
      v.literal("whitepaper"),
      v.literal("book"),
      v.literal("newsletter"),
      v.literal("social"),
      v.literal("other")
    ),
    tier: v.union(v.literal(1), v.literal(2), v.literal(3)),
    intakeNote: v.optional(v.string()),
    urlAccessibility: v.union(
      v.literal("public"),
      v.literal("paywalled"),
      v.literal("private")
    ),
    fullText: v.string(),
    contentHash: v.string(),
    storageId: v.optional(v.id("_storage")),
    wordCount: v.number(),
    derivedFrom: v.optional(v.id("sources")),
    derivedFromKind: v.optional(derivedFromKindValidator),
    sourceRelationships: v.optional(
      v.array(
        v.object({
          sourceId: v.id("sources"),
          relationship: v.union(
            v.literal("derivative"),
            v.literal("responds-to"),
            v.literal("updates"),
            v.literal("related")
          ),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    if (args.derivedFrom !== undefined || args.derivedFromKind !== undefined) {
      if (args.derivedFrom === undefined) {
        throw new Error("derivedFromKind requires derivedFrom");
      }
      if (args.derivedFromKind === undefined) {
        throw new Error("derivedFrom requires derivedFromKind");
      }
      const parentSource = await ctx.db.get(args.derivedFrom);
      if (!parentSource) {
        throw new Error(`Source not found: ${args.derivedFrom}`);
      }
    }

    // Check for duplicate via content hash
    const existing = await ctx.db
      .query("sources")
      .withIndex("by_contentHash", (q) => q.eq("contentHash", args.contentHash))
      .first();

    if (existing) {
      return { duplicate: true, existingId: existing._id, newId: null };
    }

    const now = new Date().toISOString();
    const id = await ctx.db.insert("sources", {
      ...args,
      ingestedDate: now,
      status: "indexed",
    });

    return { duplicate: false, existingId: null, newId: id };
  },
});

// ============================================================
// Generate an upload URL for file storage (Tier 1/2 PDFs)
// ============================================================
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

// ============================================================
// Attach a storage ID to a source after file upload
// ============================================================
export const attachFileToSource = mutation({
  args: {
    sourceId: v.id("sources"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sourceId, { storageId: args.storageId });
  },
});

// ============================================================
// Update source status (indexed → extracted, or → failed)
// ============================================================
export const updateStatus = mutation({
  args: {
    sourceId: v.id("sources"),
    status: v.union(
      v.literal("indexed"),
      v.literal("extracted"),
      v.literal("failed")
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sourceId, { status: args.status });
  },
});

// ============================================================
// Source replacement lineage (Decision 38, extended by Decision 44)
//
// Used when a source is re-ingested as a corrected/updated version. Sets the
// forward pointer on the old (retired) source and the back pointer on the new
// source, and marks the old source "failed". Source content is never touched.
//
// Decision 44 brings source lineage in line with data point lifecycle: every
// change appends a row to `lifecycleEvents` (targetType "source") and the
// current state stays materialized on the source rows. The write-once lock is
// gone, so a mistaken lineage can be re-pointed or reversed with
// `restoreSource`, and the history of both decisions survives.
//
// It also closes the gap that caused the 2026-07-30 duplicate cleanup:
// superseding a source does NOT retire its data points, and nothing in the
// read paths consults the parent source. The result now reports
// `liveDataPointCount` and warns when it is non-zero, so the second step
// cannot be silently missed.
// ============================================================

/** Count the old source's data points that are still live in retrieval. */
async function countLiveDataPoints(ctx: any, sourceId: Id<"sources">) {
  const dps = await ctx.db
    .query("dataPoints")
    .withIndex("by_sourceId", (q: any) => q.eq("sourceId", sourceId))
    .collect();
  return {
    total: dps.length,
    live: dps.filter((dp: any) => isLiveDataPoint(dp)).length,
  };
}

export const supersedeSource = mutation({
  args: {
    oldSourceId: v.id("sources"),
    newSourceId: v.id("sources"),
    reason: v.string(),
    recordedBy: v.optional(
      v.union(v.literal("curator"), v.literal("agent"), v.literal("pipeline"))
    ),
  },
  handler: async (ctx, args) => {
    if (args.oldSourceId === args.newSourceId) {
      throw new Error("oldSourceId and newSourceId must be different");
    }

    const reason = args.reason.trim();
    if (reason.length < 10) {
      throw new Error("reason is required and must be at least 10 characters");
    }

    const oldSource = await ctx.db.get(args.oldSourceId);
    if (!oldSource) {
      throw new Error(`Source not found: ${args.oldSourceId}`);
    }
    const newSource = await ctx.db.get(args.newSourceId);
    if (!newSource) {
      throw new Error(`Source not found: ${args.newSourceId}`);
    }
    if (oldSource.projectId !== newSource.projectId) {
      throw new Error("Both sources must be in the same project");
    }

    const warnings: string[] = [];
    const previousReplacementId = oldSource.supersededBy ?? null;

    // No-op: already superseded by exactly this source. Matches the data point
    // rule so retries and batch work stay safe.
    if (
      previousReplacementId &&
      String(previousReplacementId) === String(args.newSourceId)
    ) {
      const counts = await countLiveDataPoints(ctx, args.oldSourceId);
      return {
        oldSourceId: String(args.oldSourceId),
        newSourceId: String(args.newSourceId),
        outcome: "noop" as const,
        previousStatus: oldSource.status,
        status: oldSource.status,
        supersededAt: oldSource.supersededAt ?? null,
        reason: oldSource.supersedeReason ?? null,
        lifecycleEventId: null,
        dataPointCount: counts.total,
        liveDataPointCount: counts.live,
        warnings,
      };
    }

    // Cycle guard (Decision 44). Re-pointing is now allowed, so a loop is
    // reachable. Same shared walk the data point lifecycle uses.
    if (
      await chainReaches(
        String(args.newSourceId),
        String(args.oldSourceId),
        async (id: string) => {
          const row: any = await ctx.db.get(id as Id<"sources">);
          return row?.supersededBy ? String(row.supersededBy) : null;
        }
      )
    ) {
      throw new Error(
        `Refusing to create a source supersede cycle: ${args.oldSourceId} is already reachable from ${args.newSourceId}`
      );
    }

    if (
      newSource.replaces &&
      String(newSource.replaces) !== String(args.oldSourceId)
    ) {
      throw new Error(
        `Source ${args.newSourceId} already replaces ${newSource.replaces}; re-point that lineage first`
      );
    }

    if (previousReplacementId) {
      warnings.push(
        `Re-pointing lineage: ${args.oldSourceId} was superseded by ${previousReplacementId} and now points at ${args.newSourceId}.`
      );
    }

    // The gap that caused the duplicate cleanup. Retiring a source leaves its
    // evidence live, because no read path consults the parent source.
    const counts = await countLiveDataPoints(ctx, args.oldSourceId);
    if (counts.live > 0) {
      warnings.push(
        `${counts.live} of this source's ${counts.total} data points are still LIVE in cm_ask, cm_search, tag retrieval, and the public routes. Superseding the source does not retire them. Use cm_supersede_data_points_batch to retire them.`
      );
    }

    const supersededAt = Date.now();
    const lifecycleEventId = await ctx.db.insert("lifecycleEvents", {
      projectId: oldSource.projectId,
      targetType: "source" as const,
      targetId: args.oldSourceId,
      action: "supersede" as const,
      previousStatus: oldSource.status,
      newStatus: "failed",
      previousReplacementId: previousReplacementId ?? null,
      newReplacementId: args.newSourceId,
      reason,
      recordedAt: supersededAt,
      recordedBy: args.recordedBy ?? "curator",
    });

    await ctx.db.patch(args.oldSourceId, {
      supersededBy: args.newSourceId,
      supersededAt,
      supersedeReason: reason,
      status: "failed",
    });
    await ctx.db.patch(args.newSourceId, {
      replaces: args.oldSourceId,
    });

    // Clear the stale back pointer if this re-points away from a prior target.
    if (
      previousReplacementId &&
      String(previousReplacementId) !== String(args.newSourceId)
    ) {
      const stale: any = await ctx.db.get(previousReplacementId);
      if (stale && String(stale.replaces) === String(args.oldSourceId)) {
        await ctx.db.patch(previousReplacementId, { replaces: undefined });
      }
    }

    return {
      oldSourceId: String(args.oldSourceId),
      newSourceId: String(args.newSourceId),
      outcome: "applied" as const,
      previousStatus: oldSource.status,
      status: "failed" as const,
      supersededAt,
      reason,
      lifecycleEventId: String(lifecycleEventId),
      dataPointCount: counts.total,
      liveDataPointCount: counts.live,
      warnings,
    };
  },
});

// ============================================================
// Reverse a source supersede (Decision 44)
//
// Restores the source's status from the lifecycle event that retired it, so a
// source that was "indexed" before does not come back as "extracted". Clears
// both lineage pointers and appends a restore event. Curator-only.
// ============================================================
export const restoreSource = mutation({
  args: {
    sourceId: v.id("sources"),
    reason: v.string(),
    recordedBy: v.optional(
      v.union(v.literal("curator"), v.literal("agent"), v.literal("pipeline"))
    ),
  },
  handler: async (ctx, args) => {
    const reason = args.reason.trim();
    if (reason.length < 10) {
      throw new Error("reason is required and must be at least 10 characters");
    }

    const source = await ctx.db.get(args.sourceId);
    if (!source) {
      throw new Error(`Source not found: ${args.sourceId}`);
    }

    const warnings: string[] = [];
    const previousReplacementId = source.supersededBy ?? null;

    if (!previousReplacementId) {
      return {
        sourceId: String(args.sourceId),
        outcome: "noop" as const,
        previousStatus: source.status,
        status: source.status,
        restoredFrom: null,
        lifecycleEventId: null,
        warnings,
      };
    }

    // Recover the pre-supersede status from the event that set it. Falls back
    // to "indexed" (the safest: needs review, not treated as extracted) when
    // no event exists, which can only happen for lineage that predates the
    // backfill.
    const events = await ctx.db
      .query("lifecycleEvents")
      .withIndex("by_target", (q: any) =>
        q.eq("targetType", "source").eq("targetId", args.sourceId)
      )
      .collect();
    const lastSupersede = [...events]
      .reverse()
      .find((e: any) => e.action === "supersede");

    const restored = resolveRestoredSourceStatus(
      lastSupersede ? lastSupersede.previousStatus : null
    );
    const restoredStatus = restored.status;
    if (restored.warning) warnings.push(restored.warning);

    const recordedAt = Date.now();
    const lifecycleEventId = await ctx.db.insert("lifecycleEvents", {
      projectId: source.projectId,
      targetType: "source" as const,
      targetId: args.sourceId,
      action: "restore" as const,
      previousStatus: source.status,
      newStatus: restoredStatus,
      previousReplacementId,
      newReplacementId: null,
      reason,
      recordedAt,
      recordedBy: args.recordedBy ?? "curator",
    });

    await ctx.db.patch(args.sourceId, {
      status: restoredStatus,
      supersededBy: undefined,
      supersededAt: undefined,
      supersedeReason: undefined,
    });

    const replacement: any = await ctx.db.get(previousReplacementId);
    if (replacement && String(replacement.replaces) === String(args.sourceId)) {
      await ctx.db.patch(previousReplacementId, { replaces: undefined });
    }

    const counts = await countLiveDataPoints(ctx, args.sourceId);
    if (counts.total > counts.live) {
      warnings.push(
        `${counts.total - counts.live} of this source's ${counts.total} data points are retired or superseded. Restoring the source does not restore them; use cm_restore_data_points_batch if they should come back too.`
      );
    }

    return {
      sourceId: String(args.sourceId),
      outcome: "applied" as const,
      previousStatus: source.status,
      status: restoredStatus,
      restoredFrom: String(previousReplacementId),
      lifecycleEventId: String(lifecycleEventId),
      dataPointCount: counts.total,
      liveDataPointCount: counts.live,
      warnings,
    };
  },
});

// ============================================================
// Lifecycle history for one source, newest last (Decision 44)
// ============================================================
export const getSourceLifecycleHistory = query({
  args: { sourceId: v.id("sources") },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("lifecycleEvents")
      .withIndex("by_target", (q: any) =>
        q.eq("targetType", "source").eq("targetId", args.sourceId)
      )
      .collect();

    return events.map((e: any) => ({
      _id: String(e._id),
      action: e.action,
      previousStatus: e.previousStatus,
      newStatus: e.newStatus,
      previousReplacementId: e.previousReplacementId
        ? String(e.previousReplacementId)
        : null,
      newReplacementId: e.newReplacementId ? String(e.newReplacementId) : null,
      reason: e.reason,
      recordedAt: e.recordedAt,
      recordedBy: e.recordedBy,
    }));
  },
});

// ============================================================
// Save source synthesis (Extract-stage analytical summary)
// ============================================================
export const saveSourceSynthesis = mutation({
  args: {
    sourceId: v.id("sources"),
    sourceSynthesis: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sourceId, {
      sourceSynthesis: args.sourceSynthesis,
    });
  },
});

// ============================================================
// Structural maintenance: repair missing source URLs
// Decision 30 allows controlled plumbing corrections
// ============================================================
export const repairSourceCanonicalUrl = mutation({
  args: {
    sourceId: v.id("sources"),
    canonicalUrl: v.string(),
    repairNote: v.string(),
  },
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.sourceId);
    if (!source) {
      throw new Error("Source not found");
    }

    const trimmedUrl = args.canonicalUrl.trim();
    if (!trimmedUrl) {
      throw new Error("canonicalUrl must not be empty");
    }

    try {
      const parsed = new URL(trimmedUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("canonicalUrl must use http or https");
      }
    } catch {
      throw new Error("canonicalUrl must be a valid URL");
    }

    // Decision 30 structural maintenance: this patches plumbing metadata only.
    await ctx.db.patch(args.sourceId, {
      canonicalUrl: trimmedUrl,
    });

    return {
      sourceId: source._id,
      previousCanonicalUrl: source.canonicalUrl ?? null,
      canonicalUrl: trimmedUrl,
      repairNote: args.repairNote,
    };
  },
});

// ============================================================
// Structural maintenance: update descriptive metadata
// Partial update — only fields explicitly passed (non-undefined) are patched.
// Decision 30 allows controlled plumbing corrections for fields that are not
// part of the append-only research record (data points, position versions).
// Source descriptive metadata is curator-supplied plumbing, not research output,
// so it is safe to repair in place.
// ============================================================
export const updateSourceDescriptiveMetadata = mutation({
  args: {
    sourceId: v.id("sources"),
    authorName: v.optional(v.string()),
    publisherName: v.optional(v.string()),
    publishedDate: v.optional(v.string()),
    canonicalUrl: v.optional(v.string()),
    tier: v.optional(v.union(v.literal(1), v.literal(2), v.literal(3))),
    derivedFrom: v.optional(v.union(v.id("sources"), v.null())),
    derivedFromKind: v.optional(v.union(derivedFromKindValidator, v.null())),
    repairNote: v.string(),
  },
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.sourceId);
    if (!source) {
      throw new Error("Source not found");
    }

    const patch: {
      authorName?: string;
      publisherName?: string;
      publishedDate?: string;
      canonicalUrl?: string;
      tier?: Doc<"sources">["tier"];
      derivedFrom?: Id<"sources"> | undefined;
      derivedFromKind?: Doc<"sources">["derivedFromKind"] | undefined;
    } = {};
    const patchedForReturn: Record<string, string | number | Id<"sources"> | null> = {};

    if (args.authorName !== undefined) {
      const trimmed = args.authorName.trim();
      if (!trimmed) {
        throw new Error("authorName must not be empty when provided");
      }
      patch.authorName = trimmed;
      patchedForReturn.authorName = trimmed;
    }

    if (args.publisherName !== undefined) {
      const trimmed = args.publisherName.trim();
      if (!trimmed) {
        throw new Error("publisherName must not be empty when provided");
      }
      patch.publisherName = trimmed;
      patchedForReturn.publisherName = trimmed;
    }

    if (args.publishedDate !== undefined) {
      const trimmed = args.publishedDate.trim();
      if (!trimmed) {
        throw new Error("publishedDate must not be empty when provided");
      }
      patch.publishedDate = trimmed;
      patchedForReturn.publishedDate = trimmed;
    }

    if (args.canonicalUrl !== undefined) {
      const trimmed = args.canonicalUrl.trim();
      if (!trimmed) {
        throw new Error("canonicalUrl must not be empty when provided");
      }
      try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          throw new Error("canonicalUrl must use http or https");
        }
      } catch {
        throw new Error("canonicalUrl must be a valid URL");
      }
      patch.canonicalUrl = trimmed;
      patchedForReturn.canonicalUrl = trimmed;
    }

    if (args.tier !== undefined) {
      patch.tier = args.tier;
      patchedForReturn.tier = args.tier;
    }

    if (args.derivedFrom === null || args.derivedFromKind === null) {
      if (args.derivedFrom !== null || args.derivedFromKind !== null) {
        throw new Error(
          "derivedFrom and derivedFromKind must both be null to clear the relationship"
        );
      }
      patch.derivedFrom = undefined;
      patch.derivedFromKind = undefined;
      patchedForReturn.derivedFrom = null;
      patchedForReturn.derivedFromKind = null;
    } else if (args.derivedFrom !== undefined || args.derivedFromKind !== undefined) {
      if (args.derivedFrom === undefined) {
        throw new Error("derivedFromKind requires derivedFrom");
      }
      if (args.derivedFromKind === undefined) {
        throw new Error("derivedFrom requires derivedFromKind");
      }
      const parentSource = await ctx.db.get(args.derivedFrom);
      if (!parentSource) {
        throw new Error(`Source not found: ${args.derivedFrom}`);
      }
      if (args.derivedFrom === args.sourceId) {
        throw new Error("derivedFrom cannot reference the source being updated");
      }
      patch.derivedFrom = args.derivedFrom;
      patch.derivedFromKind = args.derivedFromKind;
      patchedForReturn.derivedFrom = args.derivedFrom;
      patchedForReturn.derivedFromKind = args.derivedFromKind;
    }

    if (Object.keys(patchedForReturn).length === 0) {
      throw new Error(
        "At least one of authorName, publisherName, publishedDate, canonicalUrl, tier, derivedFrom, or derivedFromKind must be provided"
      );
    }

    await ctx.db.patch(args.sourceId, patch);

    return {
      sourceId: source._id,
      previous: {
        authorName: source.authorName ?? null,
        publisherName: source.publisherName ?? null,
        publishedDate: source.publishedDate ?? null,
        canonicalUrl: source.canonicalUrl ?? null,
        tier: source.tier,
        derivedFrom: source.derivedFrom ?? null,
        derivedFromKind: source.derivedFromKind ?? null,
      },
      patched: patchedForReturn,
      repairNote: args.repairNote,
    };
  },
});

// ============================================================
// Get a single source by ID (without fullText)
// ============================================================
export const getSource = query({
  args: { sourceId: v.id("sources") },
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.sourceId);
    if (!source) return null;
    return await resolveSourceMeta(ctx, source);
  },
});

// ============================================================
// Get a source with its full text for curator verification
// ============================================================
export const getSourceWithFullText = query({
  args: { sourceId: v.id("sources") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.sourceId);
  },
});

// ============================================================
// Get a source with all its data points
// ============================================================
export const getSourceWithDataPoints = query({
  args: { sourceId: v.id("sources") },
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.sourceId);
    if (!source) return null;

    const dataPoints = await ctx.db
      .query("dataPoints")
      .withIndex("by_sourceId", (q) => q.eq("sourceId", args.sourceId))
      .collect();

    dataPoints.sort((a, b) => a.dpSequenceNumber - b.dpSequenceNumber);

    const dataPointsWithTags = await Promise.all(
      dataPoints.map(async (dp) => {
        const tagLinks = await ctx.db
          .query("dataPointTags")
          .withIndex("by_dataPointId", (q) => q.eq("dataPointId", dp._id))
          .collect();
        const tags = await Promise.all(
          tagLinks.map(async (link) => await ctx.db.get(link.tagId))
        );
        return { ...dp, supersedeState: supersedeStateView(dp), tags: tags.filter(Boolean) };
      })
    );

    const sourceMetadata = await resolveSourceMeta(ctx, source);
    return { source: sourceMetadata, dataPoints: dataPointsWithTags };
  },
});

// ============================================================
// Get source detail for internal source page
// ============================================================
export const getSourceDetail = query({
  args: { sourceId: v.id("sources") },
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.sourceId);
    if (!source) return null;

    const sourceMetadata = await resolveSourceMeta(ctx, source);
    const allDataPoints = await ctx.db
      .query("dataPoints")
      .withIndex("by_sourceId", (q) => q.eq("sourceId", args.sourceId))
      .collect();

    allDataPoints.sort((a, b) => a.dpSequenceNumber - b.dpSequenceNumber);

    // getSourceDetail backs the public source page and the source-scoped ask
    // context, so superseded/retired data points are excluded here (Decision
    // 38). The curator sees the full set, with status, via
    // cm_list_data_points_by_source.
    const dataPoints = allDataPoints.filter((dp) => isLiveDataPoint(dp));
    const supersededDataPointCount = allDataPoints.length - dataPoints.length;

    return {
      source: sourceMetadata,
      dataPoints,
      dataPointCount: dataPoints.length,
      supersededDataPointCount,
      sourceSynthesis: source.sourceSynthesis ?? null,
      urlAccessibility: source.urlAccessibility,
      ingestedDate: source.ingestedDate,
      status: source.status,
      supersededBy: source.supersededBy ? String(source.supersededBy) : null,
      replaces: source.replaces ? String(source.replaces) : null,
      storageId: source.storageId ?? null,
    };
  },
});

// ============================================================
// Find source by content hash (deduplication check)
// ============================================================
export const findByContentHash = query({
  args: { contentHash: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sources")
      .withIndex("by_contentHash", (q) =>
        q.eq("contentHash", args.contentHash)
      )
      .first();
  },
});

// ============================================================
// List sources by status, scoped to a project
// ============================================================
export const listByStatus = query({
  args: {
    projectId: v.id("projects"),
    status: v.union(
      v.literal("indexed"),
      v.literal("extracted"),
      v.literal("failed")
    ),
  },
  handler: async (ctx, args) => {
    const sources = await ctx.db
      .query("sources")
      .withIndex("by_projectId_status", (q) =>
        q.eq("projectId", args.projectId).eq("status", args.status)
      )
      .collect();
    return sources.map(({ fullText, ...metadata }) => ({
      ...metadata,
      derivedFrom: metadata.derivedFrom ?? null,
      derivedFromKind: metadata.derivedFromKind ?? null,
    }));
  },
});

// ============================================================
// List all sources in a project (lightweight, no fullText)
// ============================================================
export const listAll = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const sources = await ctx.db
      .query("sources")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    return sources.map(({ fullText, ...metadata }) => ({
      ...metadata,
      derivedFrom: metadata.derivedFrom ?? null,
      derivedFromKind: metadata.derivedFromKind ?? null,
    }));
  },
});

// ============================================================
// List source IDs referenced by evidence on any position version
// Used by source-link maintenance tooling to keep audits lightweight
// ============================================================
export const listEvidenceLinkedSourceIds = query({
  args: {},
  handler: async (ctx) => {
    const versions = await ctx.db.query("positionVersions").collect();
    const linkedDataPointIds = new Set<string>();

    for (const version of versions) {
      for (const dpId of version.supportingEvidence) {
        linkedDataPointIds.add(dpId.toString());
      }
      for (const dpId of version.counterEvidence ?? []) {
        linkedDataPointIds.add(dpId.toString());
      }
    }

    const linkedSourceIds = new Set<string>();
    for (const dpId of linkedDataPointIds) {
      const dp = await ctx.db.get(dpId as Id<"dataPoints">);
      if (dp) {
        linkedSourceIds.add(dp.sourceId.toString());
      }
    }

    return Array.from(linkedSourceIds);
  },
});
