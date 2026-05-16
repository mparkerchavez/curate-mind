import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { resolveEffectiveContent } from "./dataPoints";

// ============================================================
// Create a new tag (slug-based deduplication)
// ============================================================
export const createTag = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    slug: v.string(),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check for existing tag with same slug within this project
    const existing = await ctx.db
      .query("tags")
      .withIndex("by_projectId_slug", (q) =>
        q.eq("projectId", args.projectId).eq("slug", args.slug)
      )
      .first();

    if (existing) {
      return { created: false, tagId: existing._id };
    }

    const tagId = await ctx.db.insert("tags", {
      projectId: args.projectId,
      name: args.name,
      slug: args.slug,
      category: args.category,
    });

    return { created: true, tagId };
  },
});

// ============================================================
// Create or get a tag (convenience for extraction pipeline)
// Returns tag ID regardless of whether it already existed
// ============================================================
export const getOrCreateTag = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    slug: v.string(),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("tags")
      .withIndex("by_projectId_slug", (q) =>
        q.eq("projectId", args.projectId).eq("slug", args.slug)
      )
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert("tags", {
      projectId: args.projectId,
      name: args.name,
      slug: args.slug,
      category: args.category,
    });
  },
});

// ============================================================
// List all tags
// ============================================================
export const listTags = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tags")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

// ============================================================
// Get a tag by slug
// ============================================================
export const getTagBySlug = query({
  args: { projectId: v.id("projects"), slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tags")
      .withIndex("by_projectId_slug", (q) =>
        q.eq("projectId", args.projectId).eq("slug", args.slug)
      )
      .first();
  },
});

// ============================================================
// List tags by category
// ============================================================
export const listByCategory = query({
  args: { category: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tags")
      .withIndex("by_category", (q) => q.eq("category", args.category))
      .collect();
  },
});

// ============================================================
// Get tag usage counts (how many data points use each tag)
// Powers trend detection
// ============================================================
export const getTagUsageCounts = query({
  args: {},
  handler: async (ctx) => {
    const tags = await ctx.db.query("tags").collect();

    const tagCounts = await Promise.all(
      tags.map(async (tag) => {
        const links = await ctx.db
          .query("dataPointTags")
          .withIndex("by_tagId", (q) => q.eq("tagId", tag._id))
          .collect();

        return {
          ...tag,
          dataPointCount: links.length,
        };
      })
    );

    // Sort by usage count descending
    tagCounts.sort((a, b) => b.dataPointCount - a.dataPointCount);
    return tagCounts;
  },
});

// ============================================================
// Get all data points for a specific tag
// ============================================================
export const getDataPointsByTag = query({
  args: { tagId: v.id("tags") },
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query("dataPointTags")
      .withIndex("by_tagId", (q) => q.eq("tagId", args.tagId))
      .collect();

    const dataPoints = await Promise.all(
      links.map(async (link) => {
        const dp = await ctx.db.get(link.dataPointId);
        if (!dp) return null;

        const source = await ctx.db.get(dp.sourceId);
        const effectiveContent = await resolveEffectiveContent(ctx, dp);
        return {
          _id: dp._id,
          claimText: effectiveContent.claimText,
          anchorQuote: effectiveContent.anchorQuote,
          evidenceType: dp.evidenceType,
          confidence: dp.confidence,
          extractionDate: dp.extractionDate,
          correctionStatus: effectiveContent.correctionStatus,
          sourceTitle: source?.title,
          sourceTier: source?.tier,
        };
      })
    );

    return dataPoints.filter(Boolean);
  },
});
