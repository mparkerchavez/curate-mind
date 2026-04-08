import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================================
// Create a new Mental Model (immutable once created)
// ============================================================
export const createMentalModel = mutation({
  args: {
    modelType: v.union(
      v.literal("framework"),
      v.literal("analogy"),
      v.literal("term"),
      v.literal("metaphor"),
      v.literal("principle")
    ),
    title: v.string(),
    description: v.string(),
    sourceId: v.id("sources"),
    sourceDataPointId: v.optional(v.id("dataPoints")),
    tagSlugs: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { tagSlugs, ...modelFields } = args;
    const now = new Date().toISOString();

    const modelId = await ctx.db.insert("mentalModels", {
      ...modelFields,
      capturedDate: now,
      embeddingStatus: "pending",
    });

    // Link tags via junction table
    if (tagSlugs) {
      for (const slug of tagSlugs) {
        const tag = await ctx.db
          .query("tags")
          .withIndex("by_slug", (q) => q.eq("slug", slug))
          .first();

        if (tag) {
          await ctx.db.insert("mentalModelTags", {
            mentalModelId: modelId,
            tagId: tag._id,
          });
        }
      }
    }

    return modelId;
  },
});

// ============================================================
// Set embedding on a mental model
// ============================================================
export const setEmbedding = mutation({
  args: {
    mentalModelId: v.id("mentalModels"),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.mentalModelId, {
      embedding: args.embedding,
      embeddingStatus: "complete",
    });
  },
});

// ============================================================
// Get a mental model with source context
// ============================================================
export const getMentalModel = query({
  args: { mentalModelId: v.id("mentalModels") },
  handler: async (ctx, args) => {
    const model = await ctx.db.get(args.mentalModelId);
    if (!model) return null;

    // Get source metadata
    const source = await ctx.db.get(model.sourceId);
    const sourceMetadata = source
      ? {
          _id: source._id,
          title: source.title,
          authorName: source.authorName,
          publisherName: source.publisherName,
          tier: source.tier,
        }
      : null;

    // Get linked data point if exists
    const dataPoint = model.sourceDataPointId
      ? await ctx.db.get(model.sourceDataPointId)
      : null;

    // Get tags
    const tagLinks = await ctx.db
      .query("mentalModelTags")
      .withIndex("by_mentalModelId", (q) =>
        q.eq("mentalModelId", args.mentalModelId)
      )
      .collect();

    const tags = await Promise.all(
      tagLinks.map(async (link) => await ctx.db.get(link.tagId))
    );

    return {
      ...model,
      source: sourceMetadata,
      dataPoint: dataPoint
        ? { _id: dataPoint._id, claimText: dataPoint.claimText }
        : null,
      tags: tags.filter(Boolean),
    };
  },
});

// ============================================================
// List all mental models
// ============================================================
export const listMentalModels = query({
  args: { modelType: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.modelType) {
      return await ctx.db
        .query("mentalModels")
        .withIndex("by_modelType", (q) =>
          q.eq("modelType", args.modelType as any)
        )
        .collect();
    }
    return await ctx.db.query("mentalModels").collect();
  },
});

// ============================================================
// Get mental models needing embeddings
// ============================================================
export const getMentalModelsNeedingEmbeddings = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    return await ctx.db
      .query("mentalModels")
      .withIndex("by_embeddingStatus", (q) =>
        q.eq("embeddingStatus", "pending")
      )
      .take(limit);
  },
});
