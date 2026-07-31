import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { resolveSourceMeta } from "./sources";
import {
  chainReaches,
  isLifecycleNoop,
  normalizeStatus,
  resolveLifecyclePatch,
  supersedeStateView,
} from "./lib/supersede";
import type { LifecycleAction } from "./lib/supersede";

async function resolveProjectTag(ctx: any, projectId: any, slug: string) {
  const tag = await ctx.db
    .query("tags")
    .withIndex("by_projectId_slug", (q: any) =>
      q.eq("projectId", projectId).eq("slug", slug)
    )
    .first();

  if (tag?.retired && tag.redirectedToTagId) {
    const redirectedTag = await ctx.db.get(tag.redirectedToTagId);
    return redirectedTag ?? tag;
  }

  return tag;
}

// Data-point correction types in the canonical `corrections` table.
const ANCHOR_CORRECTION_TYPES = new Set([
  "anchor_text",
  "anchor_passage",
  "anchor_missing",
  "anchor_swap",
]);

// Resolve the effective content for a data point.
//
// The canonical `corrections` table is the single source of truth (Decision
// 32). Anchor, claim, and speaker-attribution corrections are applied in place
// on the data point record by the correction mutations, so the effective values
// already live on `dp`. This resolver reads the corrections log only to report
// correctionStatus, so any correction made through cm_correct_anchor /
// cm_correct_attribution / cm_correct_claim is reflected in both the effective
// values and the status flags.
export async function resolveEffectiveContent(ctx: any, dp: any) {
  const corrections = await ctx.db
    .query("corrections")
    .withIndex("by_target", (q: any) =>
      q.eq("targetType", "dataPoint").eq("targetId", dp._id)
    )
    .collect();

  // by_target orders ascending by correctedAt, so the last row is the newest.
  const latest = corrections.length > 0 ? corrections[corrections.length - 1] : null;

  const anchorCorrected = corrections.some((c: any) =>
    ANCHOR_CORRECTION_TYPES.has(c.correctionType)
  );
  const claimCorrected = corrections.some(
    (c: any) => c.correctionType === "dp_claim_text"
  );
  const attributionCorrected = corrections.some(
    (c: any) => c.correctionType === "dp_speaker_attribution"
  );

  return {
    anchorQuote: dp.anchorQuote,
    claimText: dp.claimText,
    correctionStatus: {
      hasCorrection: corrections.length > 0,
      anchorCorrected,
      claimCorrected,
      attributionCorrected,
      latestCorrectionAt: latest ? latest.correctedAt : null,
      latestReason: latest ? latest.reason : null,
    },
  };
}

// ============================================================
// Insert a single data point (immutable once created)
// ============================================================
export const insertDataPoint = mutation({
  args: {
    sourceId: v.id("sources"),
    dpSequenceNumber: v.number(),
    claimText: v.string(),
    anchorQuote: v.string(),
    evidenceType: v.union(
      v.literal("statistic"),
      v.literal("framework"),
      v.literal("prediction"),
      v.literal("case-study"),
      v.literal("observation"),
      v.literal("recommendation")
    ),
    locationType: v.union(
      v.literal("paragraph"),
      v.literal("page"),
      v.literal("timestamp"),
      v.literal("section")
    ),
    locationStart: v.string(),
    tagSlugs: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const { tagSlugs, ...dpFields } = args;
    const now = new Date().toISOString();
    const source = await ctx.db.get(args.sourceId);
    if (!source) {
      throw new Error(`Source ${args.sourceId} not found`);
    }

    // Insert the data point
    const dpId = await ctx.db.insert("dataPoints", {
      ...dpFields,
      extractionDate: now,
      embeddingStatus: "pending",
    });

    // Link tags via junction table
    for (const slug of tagSlugs) {
      const tag = await resolveProjectTag(ctx, source.projectId, slug);

      if (tag) {
        await ctx.db.insert("dataPointTags", {
          dataPointId: dpId,
          tagId: tag._id,
        });
      }
    }

    return dpId;
  },
});

// ============================================================
// Insert a batch of data points from extraction
// More efficient for Extract output
// ============================================================
export const insertBatch = mutation({
  args: {
    sourceId: v.id("sources"),
    dataPoints: v.array(
      v.object({
        dpSequenceNumber: v.number(),
        claimText: v.string(),
        anchorQuote: v.string(),
        evidenceType: v.union(
          v.literal("statistic"),
          v.literal("framework"),
          v.literal("prediction"),
          v.literal("case-study"),
          v.literal("observation"),
          v.literal("recommendation")
        ),
        locationType: v.union(
          v.literal("paragraph"),
          v.literal("page"),
          v.literal("timestamp"),
          v.literal("section")
        ),
        locationStart: v.string(),
        tagSlugs: v.array(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const insertedIds: string[] = [];
    const source = await ctx.db.get(args.sourceId);
    if (!source) {
      throw new Error(`Source ${args.sourceId} not found`);
    }

    for (const dp of args.dataPoints) {
      const { tagSlugs, ...dpFields } = dp;

      const dpId = await ctx.db.insert("dataPoints", {
        sourceId: args.sourceId,
        ...dpFields,
        extractionDate: now,
        embeddingStatus: "pending",
      });

      // Link tags
      for (const slug of tagSlugs) {
        const tag = await resolveProjectTag(ctx, source.projectId, slug);

        if (tag) {
          await ctx.db.insert("dataPointTags", {
            dataPointId: dpId,
            tagId: tag._id,
          });
        }
      }

      insertedIds.push(dpId);
    }

    return insertedIds;
  },
});

// ============================================================
// Enrich a batch of data points with confidence, extraction note, and related DPs
// Validates all DP IDs before writing any — fails the entire batch on first missing ID.
// Re-enrichment is allowed (overwrites existing values).
// ============================================================
export const enrichBatch = mutation({
  args: {
    enrichments: v.array(
      v.object({
        dataPointId: v.id("dataPoints"),
        confidence: v.union(
          v.literal("strong"),
          v.literal("moderate"),
          v.literal("suggestive")
        ),
        extractionNote: v.string(),
        relatedDataPoints: v.optional(v.array(v.id("dataPoints"))),
      })
    ),
  },
  handler: async (ctx, args) => {
    for (const item of args.enrichments) {
      const dp = await ctx.db.get(item.dataPointId);
      if (!dp) {
        throw new Error(`Data point ${item.dataPointId} not found`);
      }
    }
    for (const item of args.enrichments) {
      await ctx.db.patch(item.dataPointId, {
        confidence: item.confidence,
        extractionNote: item.extractionNote,
        relatedDataPoints: item.relatedDataPoints,
      });
    }
    return args.enrichments.map((e) => ({
      dataPointId: e.dataPointId as string,
      success: true as const,
    }));
  },
});

// ============================================================
// Set embedding on a data point
// ============================================================
export const setEmbedding = mutation({
  args: {
    dataPointId: v.id("dataPoints"),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.dataPointId, {
      embedding: args.embedding,
      embeddingStatus: "complete",
    });
  },
});

// ============================================================
// Get data points that need embeddings generated
// ============================================================
export const getDataPointsNeedingEmbeddings = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    const dps = await ctx.db
      .query("dataPoints")
      .withIndex("by_embeddingStatus", (q) =>
        q.eq("embeddingStatus", "pending")
      )
      .take(limit);

    return await Promise.all(
      dps.map(async (dp) => ({
        ...dp,
        ...(await resolveEffectiveContent(ctx, dp)),
      }))
    );
  },
});

// ============================================================
// Get a single data point with full context
// Includes source metadata, tags, and anchor quote for Evidence review
// ============================================================
export const getDataPoint = query({
  args: { dataPointId: v.id("dataPoints") },
  handler: async (ctx, args) => {
    const dp = await ctx.db.get(args.dataPointId);
    if (!dp) return null;

    // Get source metadata (without fullText)
    const source = await ctx.db.get(dp.sourceId);
    const sourceMetadata = source ? await resolveSourceMeta(ctx, source) : null;

    // Get tags
    const tagLinks = await ctx.db
      .query("dataPointTags")
      .withIndex("by_dataPointId", (q) => q.eq("dataPointId", args.dataPointId))
      .collect();

    const tags = await Promise.all(
      tagLinks.map(async (link) => await ctx.db.get(link.tagId))
    );

    const effectiveContent = await resolveEffectiveContent(ctx, dp);

    return {
      ...dp,
      ...effectiveContent,
      supersedeState: supersedeStateView(dp),
      source: sourceMetadata,
      tags: tags.filter(Boolean),
    };
  },
});

// ============================================================
// Update tags on a batch of data points during Enrich
// Validates all DP IDs before writing any — fails the entire batch on first missing ID.
// Additive only — does not remove existing tag links.
// Tag slugs not found in the project vocabulary are silently skipped (counted in tagsSkipped).
// ============================================================
export const updateTagsBatch = mutation({
  args: {
    updates: v.array(
      v.object({
        dataPointId: v.id("dataPoints"),
        tagSlugs: v.array(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    for (const update of args.updates) {
      const dp = await ctx.db.get(update.dataPointId);
      if (!dp) {
        throw new Error(`Data point ${update.dataPointId} not found`);
      }
    }

    const results: { dataPointId: string; tagsAdded: number; tagsSkipped: number }[] = [];

    for (const update of args.updates) {
      const dp = await ctx.db.get(update.dataPointId);
      if (!dp) {
        throw new Error(`Data point ${update.dataPointId} not found`);
      }

      const source = await ctx.db.get(dp.sourceId);
      if (!source) {
        throw new Error(`Source ${dp.sourceId} not found for data point ${update.dataPointId}`);
      }

      const existingLinks = await ctx.db
        .query("dataPointTags")
        .withIndex("by_dataPointId", (q) => q.eq("dataPointId", update.dataPointId))
        .collect();

      const existingTagIds = new Set(existingLinks.map((l) => l.tagId.toString()));

      let added = 0;
      let skipped = 0;

      for (const slug of update.tagSlugs) {
        const tag = await resolveProjectTag(ctx, source.projectId, slug);

        if (!tag) {
          skipped++;
          continue;
        }

        if (!existingTagIds.has(tag._id.toString())) {
          await ctx.db.insert("dataPointTags", {
            dataPointId: update.dataPointId,
            tagId: tag._id,
          });
          added++;
        } else {
          skipped++;
        }
      }

      results.push({
        dataPointId: update.dataPointId as string,
        tagsAdded: added,
        tagsSkipped: skipped,
      });
    }

    return results;
  },
});

// ============================================================
// Remove one tag from a batch of data points (curator maintenance)
// Validates all DP IDs and project-scoped tag vocabulary before writing any.
// Only dataPointTags join rows are deleted; data point records stay append-only.
// ============================================================
export const removeTagBatch = mutation({
  args: {
    dataPointIds: v.array(v.id("dataPoints")),
    tagSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const tagByProjectId = new Map<string, { _id: any }>();
    const validatedDataPoints: {
      dataPointId: typeof args.dataPointIds[number];
      tagId: any;
    }[] = [];

    for (const dataPointId of args.dataPointIds) {
      const dp = await ctx.db.get(dataPointId);
      if (!dp) {
        throw new Error(`Data point ${dataPointId} not found`);
      }

      const source = await ctx.db.get(dp.sourceId);
      if (!source) {
        throw new Error(`Source ${dp.sourceId} not found for data point ${dataPointId}`);
      }

      const projectId = source.projectId.toString();
      let tag = tagByProjectId.get(projectId);

      if (!tag) {
        const projectTag = await ctx.db
          .query("tags")
          .withIndex("by_projectId_slug", (q) =>
            q.eq("projectId", source.projectId).eq("slug", args.tagSlug)
          )
          .first();

        if (!projectTag) {
          throw new Error(`Tag ${args.tagSlug} not found in project ${source.projectId}`);
        }

        tag = projectTag;
        tagByProjectId.set(projectId, tag);
      }

      validatedDataPoints.push({ dataPointId, tagId: tag._id });
    }

    const results: { dataPointId: string; tagsRemoved: number; tagsSkipped: number }[] = [];

    for (const item of validatedDataPoints) {
      const existingLinks = await ctx.db
        .query("dataPointTags")
        .withIndex("by_dataPointId", (q) => q.eq("dataPointId", item.dataPointId))
        .collect();

      const linksToRemove = existingLinks.filter((link) => link.tagId === item.tagId);

      for (const link of linksToRemove) {
        await ctx.db.delete(link._id);
      }

      results.push({
        dataPointId: item.dataPointId as string,
        tagsRemoved: linksToRemove.length,
        tagsSkipped: linksToRemove.length > 0 ? 0 : 1,
      });
    }

    return results;
  },
});

// ============================================================
// Get all data points for a source (ordered by sequence number)
// ============================================================
export const getBySource = query({
  args: { sourceId: v.id("sources") },
  handler: async (ctx, args) => {
    const dps = await ctx.db
      .query("dataPoints")
      .withIndex("by_sourceId", (q) => q.eq("sourceId", args.sourceId))
      .collect();

    dps.sort((a, b) => a.dpSequenceNumber - b.dpSequenceNumber);
    return await Promise.all(
      dps.map(async (dp) => ({
        ...dp,
        ...(await resolveEffectiveContent(ctx, dp)),
        supersedeState: supersedeStateView(dp),
      }))
    );
  },
});

// ============================================================
// List data points for a source — lean shape for processing workflows
// No tag joins, no source metadata, embeddings stripped.
// ============================================================
export const listDataPointsBySource = query({
  args: { sourceId: v.id("sources") },
  handler: async (ctx, args) => {
    const dps = await ctx.db
      .query("dataPoints")
      .withIndex("by_sourceId", (q) => q.eq("sourceId", args.sourceId))
      .collect();

    dps.sort((a, b) => a.dpSequenceNumber - b.dpSequenceNumber);
    return await Promise.all(
      dps.map(async ({ embedding, ...rest }) => ({
        ...rest,
        ...(await resolveEffectiveContent(ctx, rest)),
        supersedeState: supersedeStateView(rest),
      }))
    );
  },
});

// ============================================================
// Get a batch of data points by ID in a single call
// Returns the same shape as getDataPoint (with source metadata and tags).
// Missing IDs return null in the result array — position is preserved.
// ============================================================
export const getDataPointsBatch = query({
  args: { dataPointIds: v.array(v.id("dataPoints")) },
  handler: async (ctx, args) => {
    const results = [];

    for (const id of args.dataPointIds) {
      const dp = await ctx.db.get(id);
      if (!dp) {
        results.push(null);
        continue;
      }

      const source = await ctx.db.get(dp.sourceId);
      const sourceMetadata = source ? await resolveSourceMeta(ctx, source) : null;

      const tagLinks = await ctx.db
        .query("dataPointTags")
        .withIndex("by_dataPointId", (q) => q.eq("dataPointId", id))
        .collect();

      const tags = await Promise.all(
        tagLinks.map(async (link) => await ctx.db.get(link.tagId))
      );

      const effectiveContent = await resolveEffectiveContent(ctx, dp);

      results.push({
        ...dp,
        ...effectiveContent,
        supersedeState: supersedeStateView(dp),
        source: sourceMetadata,
        tags: tags.filter(Boolean),
      });
    }

    return results;
  },
});

// ============================================================
// Data point lifecycle: retire, supersede, restore (Decision 44)
//
// Every change appends an immutable row to `lifecycleEvents` and materializes
// the new state on the data point row, exactly as `correctClaim` appends to
// `corrections` and patches `claimText`. The immutable claim and anchor are
// never touched.
//
// This replaces the pre-Decision-44 write-once rule: a lifecycle decision is a
// curator judgment and can be revised, with every step preserved. A no-op
// writes no event and returns outcome "noop" rather than throwing, because
// retiring an already-retired point is expected in batch work.
// ============================================================

/**
 * Resolve the next link in a supersede chain.
 *
 * `pending` lets a batch see its own not-yet-written re-points, so a cycle the
 * batch itself would create is caught. Single-item callers pass an empty map
 * and get plain stored-state resolution. One resolver, one walk
 * (`chainReaches`), so the cycle guard cannot drift between call sites.
 */
function supersedeResolver(
  ctx: any,
  pending: Map<string, Id<"dataPoints"> | null> = new Map()
) {
  return async (id: string): Promise<string | null> => {
    if (pending.has(id)) {
      const next = pending.get(id) ?? null;
      return next ? String(next) : null;
    }
    const row: any = await ctx.db.get(id as Id<"dataPoints">);
    return row?.supersededBy ? String(row.supersededBy) : null;
  };
}

async function applyLifecycle(
  ctx: any,
  args: {
    dataPointId: Id<"dataPoints">;
    action: LifecycleAction;
    replacementDataPointId?: Id<"dataPoints">;
    reason: string;
    recordedBy?: "curator" | "agent" | "pipeline";
  }
) {
  const dp = await ctx.db.get(args.dataPointId);
  if (!dp) {
    throw new Error(`Data point not found: ${args.dataPointId}`);
  }
  const source = await ctx.db.get(dp.sourceId);
  if (!source) {
    throw new Error(`Source not found for data point: ${args.dataPointId}`);
  }

  const warnings: string[] = [];
  const previousStatus = normalizeStatus(dp.status);
  const previousReplacementId = dp.supersededBy ?? null;

  if (args.replacementDataPointId !== undefined) {
    if (args.replacementDataPointId === args.dataPointId) {
      throw new Error("replacementDataPointId must be different from dataPointId");
    }
    const replacement = await ctx.db.get(args.replacementDataPointId);
    if (!replacement) {
      throw new Error(`Replacement data point not found: ${args.replacementDataPointId}`);
    }
    const replacementSource = await ctx.db.get(replacement.sourceId);
    if (!replacementSource || replacementSource.projectId !== source.projectId) {
      throw new Error("Replacement data point must be in the same project");
    }
    if (normalizeStatus(replacement.status) !== "active") {
      warnings.push(
        `Replacement data point ${args.replacementDataPointId} is itself ${normalizeStatus(replacement.status)}`
      );
    }
    // Cycle guard (Decision 44). Re-pointing is now allowed, so a loop is
    // reachable and would hang anything that walks the chain.
    if (
      await chainReaches(
        String(args.replacementDataPointId),
        String(args.dataPointId),
        supersedeResolver(ctx)
      )
    ) {
      throw new Error(
        `Refusing to create a supersede cycle: ${args.dataPointId} is already reachable from ${args.replacementDataPointId}`
      );
    }
  }

  // No-op short-circuit: no event, no patch, explicit outcome.
  if (
    isLifecycleNoop({
      currentStatus: previousStatus,
      currentReplacementId: previousReplacementId
        ? String(previousReplacementId)
        : null,
      action: args.action,
      replacementId: args.replacementDataPointId
        ? String(args.replacementDataPointId)
        : null,
    })
  ) {
    return {
      dataPointId: String(args.dataPointId),
      outcome: "noop" as const,
      previousStatus,
      status: previousStatus,
      supersededBy: previousReplacementId ? String(previousReplacementId) : null,
      supersededAt: dp.supersededAt ?? null,
      reason: dp.supersedeReason ?? null,
      lifecycleEventId: null,
      warnings,
    };
  }

  const patch = resolveLifecyclePatch({
    currentStatus: previousStatus,
    action: args.action,
    replacementId: args.replacementDataPointId
      ? String(args.replacementDataPointId)
      : null,
    reason: args.reason,
  });

  if (args.action === "restore") {
    if (previousStatus === "superseded" && previousReplacementId) {
      warnings.push(
        `This data point was superseded by ${previousReplacementId}; restoring it puts both back in live evidence.`
      );
    }
    if (source.status === "failed") {
      warnings.push(
        `Parent source ${dp.sourceId} is status "failed"; restoring makes live evidence hang off a retired source.`
      );
    }
  }

  const recordedAt = Date.now();
  const lifecycleEventId = await ctx.db.insert("lifecycleEvents", {
    projectId: source.projectId,
    targetType: "dataPoint" as const,
    targetId: args.dataPointId,
    action: args.action,
    previousStatus,
    newStatus: patch.status,
    previousReplacementId: previousReplacementId ?? null,
    newReplacementId: args.replacementDataPointId ?? null,
    reason: patch.supersedeReason,
    recordedAt,
    recordedBy: args.recordedBy ?? "curator",
  });

  await ctx.db.patch(args.dataPointId, {
    status: patch.status,
    supersededBy: args.replacementDataPointId,
    supersededAt: recordedAt,
    supersedeReason: patch.supersedeReason,
  });

  return {
    dataPointId: String(args.dataPointId),
    outcome: "applied" as const,
    previousStatus,
    status: patch.status,
    supersededBy: patch.supersededBy,
    supersededAt: recordedAt,
    reason: patch.supersedeReason,
    lifecycleEventId: String(lifecycleEventId),
    warnings,
  };
}

export const supersedeDataPoint = mutation({
  args: {
    dataPointId: v.id("dataPoints"),
    replacementDataPointId: v.optional(v.id("dataPoints")),
    reason: v.string(),
    recordedBy: v.optional(
      v.union(v.literal("curator"), v.literal("agent"), v.literal("pipeline"))
    ),
  },
  handler: async (ctx, args) => {
    return await applyLifecycle(ctx, {
      dataPointId: args.dataPointId,
      action: args.replacementDataPointId ? "supersede" : "retire",
      replacementDataPointId: args.replacementDataPointId,
      reason: args.reason,
      recordedBy: args.recordedBy,
    });
  },
});

// ============================================================
// Restore a retired or superseded data point to active (Decision 44)
//
// Curator-only: exposed through the admin toolset so extraction sub-agents
// running the pipeline toolset cannot reverse a curator's judgment.
// ============================================================
export const restoreDataPoint = mutation({
  args: {
    dataPointId: v.id("dataPoints"),
    reason: v.string(),
    recordedBy: v.optional(
      v.union(v.literal("curator"), v.literal("agent"), v.literal("pipeline"))
    ),
  },
  handler: async (ctx, args) => {
    return await applyLifecycle(ctx, {
      dataPointId: args.dataPointId,
      action: "restore",
      reason: args.reason,
      recordedBy: args.recordedBy,
    });
  },
});

// ============================================================
// Batch lifecycle (Decision 44)
//
// Retiring a source's duplicate evidence was one call per data point, which
// made an 82-item cleanup feel heavy enough to defer. These apply the same
// per-item semantics in one call.
//
// Follows the enrichBatch convention: validate everything before writing
// anything, so a batch never lands half-applied. It differs on one point,
// deliberately: enrichBatch throws on the FIRST bad id, which means diagnosing
// a long list one item per round trip. These collect every problem and report
// them together.
//
// Per-item outcomes are still "applied" or "noop", so re-running a partially
// completed cleanup is free rather than an error.
// ============================================================
const LIFECYCLE_BATCH_MAX = 200;

async function applyLifecycleBatch(
  ctx: any,
  items: Array<{
    dataPointId: Id<"dataPoints">;
    action: LifecycleAction;
    replacementDataPointId?: Id<"dataPoints">;
    reason: string;
  }>,
  recordedBy?: "curator" | "agent" | "pipeline"
) {
  if (items.length === 0) {
    throw new Error("items must not be empty");
  }
  if (items.length > LIFECYCLE_BATCH_MAX) {
    throw new Error(
      `Batch of ${items.length} exceeds the ${LIFECYCLE_BATCH_MAX} item limit; split it into smaller calls`
    );
  }

  const seenIds = new Set<string>();
  const problems: string[] = [];
  const pending = new Map<string, Id<"dataPoints"> | null>();

  // Pass 1: per-item validation that does not depend on other items.
  for (const item of items) {
    const key = String(item.dataPointId);
    if (seenIds.has(key)) {
      problems.push(`${key}: listed more than once in the same batch`);
      continue;
    }
    seenIds.add(key);

    const dp = await ctx.db.get(item.dataPointId);
    if (!dp) {
      problems.push(`${key}: data point not found`);
      continue;
    }
    const source = await ctx.db.get(dp.sourceId);
    if (!source) {
      problems.push(`${key}: source ${dp.sourceId} not found`);
      continue;
    }

    if (item.reason.trim().length < 10) {
      problems.push(`${key}: reason must be at least 10 characters`);
    }
    if (item.action === "supersede" && !item.replacementDataPointId) {
      problems.push(`${key}: supersede requires a replacementDataPointId`);
    }
    if (item.action !== "supersede" && item.replacementDataPointId) {
      problems.push(
        `${key}: ${item.action} must not carry a replacementDataPointId`
      );
    }

    if (item.replacementDataPointId) {
      if (String(item.replacementDataPointId) === key) {
        problems.push(`${key}: replacement must differ from the data point`);
      } else {
        const replacement = await ctx.db.get(item.replacementDataPointId);
        if (!replacement) {
          problems.push(
            `${key}: replacement ${item.replacementDataPointId} not found`
          );
        } else {
          const rSource = await ctx.db.get(replacement.sourceId);
          if (!rSource || rSource.projectId !== source.projectId) {
            problems.push(
              `${key}: replacement ${item.replacementDataPointId} is in a different project`
            );
          }
        }
      }
    }

    pending.set(
      key,
      item.action === "supersede" ? item.replacementDataPointId ?? null : null
    );
  }

  // Pass 2: cycle detection across stored state AND this batch's own changes.
  if (problems.length === 0) {
    for (const item of items) {
      if (item.action !== "supersede" || !item.replacementDataPointId) continue;
      if (
        await chainReaches(
          String(item.replacementDataPointId),
          String(item.dataPointId),
          supersedeResolver(ctx, pending)
        )
      ) {
        problems.push(
          `${item.dataPointId}: would create a supersede cycle via ${item.replacementDataPointId}`
        );
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Batch rejected, nothing was written. ${problems.length} problem(s):\n- ${problems.join("\n- ")}`
    );
  }

  // Pass 3: apply. Every item is already known good, so no partial landing.
  const results = [];
  for (const item of items) {
    results.push(
      await applyLifecycle(ctx, {
        dataPointId: item.dataPointId,
        action: item.action,
        replacementDataPointId: item.replacementDataPointId,
        reason: item.reason,
        recordedBy,
      })
    );
  }

  return {
    total: results.length,
    applied: results.filter((r) => r.outcome === "applied").length,
    noop: results.filter((r) => r.outcome === "noop").length,
    warnings: results.flatMap((r) =>
      r.warnings.map((w: string) => `${r.dataPointId}: ${w}`)
    ),
    results,
  };
}

export const supersedeDataPointsBatch = mutation({
  args: {
    items: v.array(
      v.object({
        dataPointId: v.id("dataPoints"),
        replacementDataPointId: v.optional(v.id("dataPoints")),
        reason: v.optional(v.string()),
      })
    ),
    reason: v.optional(v.string()),
    recordedBy: v.optional(
      v.union(v.literal("curator"), v.literal("agent"), v.literal("pipeline"))
    ),
  },
  handler: async (ctx, args) => {
    return await applyLifecycleBatch(
      ctx,
      args.items.map((i) => ({
        dataPointId: i.dataPointId,
        action: (i.replacementDataPointId
          ? "supersede"
          : "retire") as LifecycleAction,
        replacementDataPointId: i.replacementDataPointId,
        reason: i.reason ?? args.reason ?? "",
      })),
      args.recordedBy
    );
  },
});

export const restoreDataPointsBatch = mutation({
  args: {
    items: v.array(
      v.object({
        dataPointId: v.id("dataPoints"),
        reason: v.optional(v.string()),
      })
    ),
    reason: v.optional(v.string()),
    recordedBy: v.optional(
      v.union(v.literal("curator"), v.literal("agent"), v.literal("pipeline"))
    ),
  },
  handler: async (ctx, args) => {
    return await applyLifecycleBatch(
      ctx,
      args.items.map((i) => ({
        dataPointId: i.dataPointId,
        action: "restore" as LifecycleAction,
        reason: i.reason ?? args.reason ?? "",
      })),
      args.recordedBy
    );
  },
});

// ============================================================
// Lifecycle history for one data point, newest last (Decision 44)
// ============================================================
export const getLifecycleHistory = query({
  args: { dataPointId: v.id("dataPoints") },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("lifecycleEvents")
      .withIndex("by_target", (q: any) =>
        q.eq("targetType", "dataPoint").eq("targetId", args.dataPointId)
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
// Data point corrections (anchor, claim text, speaker attribution) live in the
// canonical `corrections` table and are written by convex/corrections.ts:
// correctAnchor, correctClaim, and correctAttribution. The audit trail is read
// via api.corrections.getForDataPoint. The previous orphaned write path here
// (which wrote the retired dataPointCorrections table and was never called by
// the MCP tools) was removed when the system converged on a single corrections
// table; see Design Decision 32.
// ============================================================
