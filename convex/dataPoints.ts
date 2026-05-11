import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { resolveSourceMeta } from "./sources";

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

    // Insert the data point
    const dpId = await ctx.db.insert("dataPoints", {
      ...dpFields,
      extractionDate: now,
      embeddingStatus: "pending",
    });

    // Link tags via junction table
    for (const slug of tagSlugs) {
      const tag = await ctx.db
        .query("tags")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .first();

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
// More efficient for Pass 1 output
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
        const tag = await ctx.db
          .query("tags")
          .withIndex("by_slug", (q) => q.eq("slug", slug))
          .first();

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
// Enrich a batch of data points (Pass 3 adds confidence, extraction note, related DPs)
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

    return dps;
  },
});

// ============================================================
// Get a single data point with full context
// Includes source metadata, tags, and anchor quote (Layer 3)
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

    return {
      ...dp,
      source: sourceMetadata,
      tags: tags.filter(Boolean),
    };
  },
});

// ============================================================
// Update tags on a batch of data points (Pass 3 enrichment)
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
      const existingLinks = await ctx.db
        .query("dataPointTags")
        .withIndex("by_dataPointId", (q) => q.eq("dataPointId", update.dataPointId))
        .collect();

      const existingTagIds = new Set(existingLinks.map((l) => l.tagId.toString()));

      let added = 0;
      let skipped = 0;

      for (const slug of update.tagSlugs) {
        const tag = await ctx.db
          .query("tags")
          .withIndex("by_slug", (q) => q.eq("slug", slug))
          .first();

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
    return dps;
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

      results.push({
        ...dp,
        source: sourceMetadata,
        tags: tags.filter(Boolean),
      });
    }

    return results;
  },
});
