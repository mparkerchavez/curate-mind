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
// Enrich a data point (Pass 2 adds confidence, extraction note, related DPs)
// This is NOT an overwrite — these fields start empty and get filled once
// ============================================================
export const enrichDataPoint = mutation({
  args: {
    dataPointId: v.id("dataPoints"),
    confidence: v.union(
      v.literal("strong"),
      v.literal("moderate"),
      v.literal("suggestive")
    ),
    extractionNote: v.string(),
    relatedDataPoints: v.optional(v.array(v.id("dataPoints"))),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.dataPointId, {
      confidence: args.confidence,
      extractionNote: args.extractionNote,
      relatedDataPoints: args.relatedDataPoints,
    });
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
// Update tags on an existing data point (Pass 3 enrichment)
// Adds new tag links without removing existing ones
// ============================================================
export const updateTags = mutation({
  args: {
    dataPointId: v.id("dataPoints"),
    tagSlugs: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    // Get existing tag links for this DP
    const existingLinks = await ctx.db
      .query("dataPointTags")
      .withIndex("by_dataPointId", (q) => q.eq("dataPointId", args.dataPointId))
      .collect();

    const existingTagIds = new Set(existingLinks.map((l) => l.tagId.toString()));

    let added = 0;
    let skipped = 0;

    for (const slug of args.tagSlugs) {
      const tag = await ctx.db
        .query("tags")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .first();

      if (!tag) {
        skipped++;
        continue;
      }

      // Only add if not already linked
      if (!existingTagIds.has(tag._id.toString())) {
        await ctx.db.insert("dataPointTags", {
          dataPointId: args.dataPointId,
          tagId: tag._id,
        });
        added++;
      } else {
        skipped++;
      }
    }

    return { added, skipped };
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
