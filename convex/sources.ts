import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

export type ResolvedLinkKind = "storage" | "canonical" | "internal";

export type ResolvedSourceMeta = {
  _id: Id<"sources">;
  title: string;
  authorName?: string;
  publisherName?: string;
  canonicalUrl?: string;
  publishedDate?: string;
  sourceType: Doc<"sources">["sourceType"];
  tier: Doc<"sources">["tier"];
  storageUrl: string | null;
  resolvedUrl: string;
  resolvedLinkKind: ResolvedLinkKind;
  sourcePagePath: string;
};

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
    sourceType: source.sourceType,
    tier: source.tier,
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
    } = {};

    if (args.authorName !== undefined) {
      const trimmed = args.authorName.trim();
      if (!trimmed) {
        throw new Error("authorName must not be empty when provided");
      }
      patch.authorName = trimmed;
    }

    if (args.publisherName !== undefined) {
      const trimmed = args.publisherName.trim();
      if (!trimmed) {
        throw new Error("publisherName must not be empty when provided");
      }
      patch.publisherName = trimmed;
    }

    if (args.publishedDate !== undefined) {
      const trimmed = args.publishedDate.trim();
      if (!trimmed) {
        throw new Error("publishedDate must not be empty when provided");
      }
      patch.publishedDate = trimmed;
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
    }

    if (Object.keys(patch).length === 0) {
      throw new Error(
        "At least one of authorName, publisherName, publishedDate, or canonicalUrl must be provided"
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
      },
      patched: patch,
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
    const dataPoints = await ctx.db
      .query("dataPoints")
      .withIndex("by_sourceId", (q) => q.eq("sourceId", args.sourceId))
      .collect();

    dataPoints.sort((a, b) => a.dpSequenceNumber - b.dpSequenceNumber);

    return {
      source: sourceMetadata,
      dataPoints,
      dataPointCount: dataPoints.length,
      sourceSynthesis: source.sourceSynthesis ?? null,
      urlAccessibility: source.urlAccessibility,
      ingestedDate: source.ingestedDate,
      status: source.status,
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
