import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

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
// Save source synthesis (Pass 1 output — analytical summary)
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
// Get a single source by ID (without fullText)
// ============================================================
export const getSource = query({
  args: { sourceId: v.id("sources") },
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.sourceId);
    if (!source) return null;
    const { fullText, ...metadata } = source;
    return metadata;
  },
});

// ============================================================
// Get a source with its full text (Layer 4 — Analyst only)
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
        return { ...dp, tags: tags.filter(Boolean) };
      })
    );

    const { fullText, ...sourceMetadata } = source;
    return { source: sourceMetadata, dataPoints: dataPointsWithTags };
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
    return sources.map(({ fullText, ...metadata }) => metadata);
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
    return sources.map(({ fullText, ...metadata }) => metadata);
  },
});
