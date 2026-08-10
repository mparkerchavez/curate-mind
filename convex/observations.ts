import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * Work out which project an observation belongs to (Decision 45).
 *
 * An explicit projectId always wins. Otherwise the project is inferred from the
 * first reference that resolves, which is what makes existing observations
 * placeable without the curator restating something already implied by what
 * they linked. An observation that references nothing and is given no project
 * stays unplaced, and unplaced observations are excluded from project-scoped
 * retrieval rather than shown to every project.
 */
async function resolveObservationProjectId(
  ctx: any,
  args: {
    projectId?: Id<"projects">;
    referencedDataPoints?: Id<"dataPoints">[];
    referencedPositions?: Id<"researchPositions">[];
  }
): Promise<Id<"projects"> | undefined> {
  if (args.projectId) return args.projectId;

  for (const dataPointId of args.referencedDataPoints ?? []) {
    const dp = await ctx.db.get(dataPointId);
    if (!dp) continue;
    if (dp.projectId) return dp.projectId;
    const source = await ctx.db.get(dp.sourceId);
    if (source?.projectId) return source.projectId;
  }

  for (const positionId of args.referencedPositions ?? []) {
    const position = await ctx.db.get(positionId);
    if (!position) continue;
    const theme = await ctx.db.get(position.themeId);
    if (theme?.projectId) return theme.projectId;
  }

  return undefined;
}

// ============================================================
// Create a new Curator Observation (immutable once created)
// ============================================================
export const createObservation = mutation({
  args: {
    observationText: v.string(),
    projectId: v.optional(v.id("projects")),
    referencedDataPoints: v.optional(v.array(v.id("dataPoints"))),
    referencedPositions: v.optional(v.array(v.id("researchPositions"))),
    tagSlugs: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { tagSlugs, projectId, ...obsFields } = args;
    const now = new Date().toISOString();

    const resolvedProjectId = await resolveObservationProjectId(ctx, args);

    const obsId = await ctx.db.insert("curatorObservations", {
      ...obsFields,
      projectId: resolvedProjectId,
      capturedDate: now,
      embeddingStatus: "pending",
    });

    // Link tags via junction table. Tags are project-scoped, so the slug is
    // resolved inside the resolved project. A bare slug lookup would take
    // whichever project's tag happened to be created first.
    if (tagSlugs) {
      for (const slug of tagSlugs) {
        const tag = resolvedProjectId
          ? await ctx.db
              .query("tags")
              .withIndex("by_projectId_slug", (q) =>
                q.eq("projectId", resolvedProjectId).eq("slug", slug)
              )
              .first()
          : null;

        if (tag) {
          await ctx.db.insert("curatorObservationTags", {
            curatorObservationId: obsId,
            tagId: tag._id,
          });
        }
      }
    }

    return obsId;
  },
});

// ============================================================
// Set embedding on an observation
// ============================================================
export const setEmbedding = mutation({
  args: {
    observationId: v.id("curatorObservations"),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.observationId, {
      embedding: args.embedding,
      embeddingStatus: "complete",
    });
  },
});

// ============================================================
// Get an observation with linked data points and positions
// ============================================================
export const getObservation = query({
  args: { observationId: v.id("curatorObservations") },
  handler: async (ctx, args) => {
    const obs = await ctx.db.get(args.observationId);
    if (!obs) return null;

    // Resolve referenced data points
    const dataPoints = obs.referencedDataPoints
      ? await Promise.all(
          obs.referencedDataPoints.map(async (dpId) => {
            const dp = await ctx.db.get(dpId);
            if (!dp) return null;
            const source = await ctx.db.get(dp.sourceId);
            return {
              _id: dp._id,
              claimText: dp.claimText,
              evidenceType: dp.evidenceType,
              confidence: dp.confidence,
              sourceTitle: source?.title,
            };
          })
        )
      : [];

    // Resolve referenced positions
    const positions = obs.referencedPositions
      ? await Promise.all(
          obs.referencedPositions.map(async (posId) => {
            const pos = await ctx.db.get(posId);
            if (!pos) return null;
            const version = pos.currentVersionId
              ? await ctx.db.get(pos.currentVersionId)
              : null;
            return {
              _id: pos._id,
              title: pos.title,
              currentStance: version?.currentStance,
            };
          })
        )
      : [];

    // Get tags
    const tagLinks = await ctx.db
      .query("curatorObservationTags")
      .withIndex("by_curatorObservationId", (q) =>
        q.eq("curatorObservationId", args.observationId)
      )
      .collect();

    const tags = await Promise.all(
      tagLinks.map(async (link) => await ctx.db.get(link.tagId))
    );

    return {
      ...obs,
      dataPointDetails: dataPoints.filter(Boolean),
      positionDetails: positions.filter(Boolean),
      tags: tags.filter(Boolean),
    };
  },
});

// ============================================================
// List all observations (most recent first)
// ============================================================
export const listObservations = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const observations = await ctx.db
      .query("curatorObservations")
      .order("desc")
      .take(limit);

    return observations;
  },
});

// ============================================================
// Get observations needing embeddings
// ============================================================
export const getObservationsNeedingEmbeddings = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    return await ctx.db
      .query("curatorObservations")
      .withIndex("by_embeddingStatus", (q) =>
        q.eq("embeddingStatus", "pending")
      )
      .take(limit);
  },
});
