import { v } from "convex/values";
import { mutation } from "./_generated/server";

// ============================================================
// Tag Reassignment Migration (Design Decision 30)
//
// Moves all junction-table links from a retired tag to its
// canonical replacement. Works across all three junction tables:
// dataPointTags, curatorObservationTags, mentalModelTags.
//
// For each link on the old tag:
//   1. Check if the canonical tag already has a link to the same entity
//   2. If not, create the new link
//   3. Delete the old link
//
// This is a structural maintenance operation, not data destruction.
// The data points, observations, and mental models are untouched.
// ============================================================
export const reassignTag = mutation({
  args: {
    projectId: v.id("projects"),
    fromSlug: v.string(),  // retired tag slug
    toSlug: v.string(),    // canonical tag slug
  },
  handler: async (ctx, args) => {
    // Look up both tags
    const fromTag = await ctx.db
      .query("tags")
      .withIndex("by_projectId_slug", (q) =>
        q.eq("projectId", args.projectId).eq("slug", args.fromSlug)
      )
      .first();

    const toTag = await ctx.db
      .query("tags")
      .withIndex("by_projectId_slug", (q) =>
        q.eq("projectId", args.projectId).eq("slug", args.toSlug)
      )
      .first();

    if (!fromTag) {
      return { error: `Tag not found: ${args.fromSlug}` };
    }
    if (!toTag) {
      return { error: `Tag not found: ${args.toSlug}` };
    }

    let stats = {
      dataPointTags: { moved: 0, skippedDuplicate: 0 },
      curatorObservationTags: { moved: 0, skippedDuplicate: 0 },
      mentalModelTags: { moved: 0, skippedDuplicate: 0 },
    };

    // --- dataPointTags ---
    const dpLinks = await ctx.db
      .query("dataPointTags")
      .withIndex("by_tagId", (q) => q.eq("tagId", fromTag._id))
      .collect();

    for (const link of dpLinks) {
      // Check if canonical tag already linked to this DP
      const existingLinks = await ctx.db
        .query("dataPointTags")
        .withIndex("by_dataPointId", (q) => q.eq("dataPointId", link.dataPointId))
        .collect();
      const alreadyLinked = existingLinks.some((l) => l.tagId === toTag._id);

      if (!alreadyLinked) {
        await ctx.db.insert("dataPointTags", {
          dataPointId: link.dataPointId,
          tagId: toTag._id,
        });
        stats.dataPointTags.moved++;
      } else {
        stats.dataPointTags.skippedDuplicate++;
      }
      await ctx.db.delete(link._id);
    }

    // --- curatorObservationTags ---
    const coLinks = await ctx.db
      .query("curatorObservationTags")
      .withIndex("by_tagId", (q) => q.eq("tagId", fromTag._id))
      .collect();

    for (const link of coLinks) {
      const existingLinks = await ctx.db
        .query("curatorObservationTags")
        .withIndex("by_curatorObservationId", (q) =>
          q.eq("curatorObservationId", link.curatorObservationId)
        )
        .collect();
      const alreadyLinked = existingLinks.some((l) => l.tagId === toTag._id);

      if (!alreadyLinked) {
        await ctx.db.insert("curatorObservationTags", {
          curatorObservationId: link.curatorObservationId,
          tagId: toTag._id,
        });
        stats.curatorObservationTags.moved++;
      } else {
        stats.curatorObservationTags.skippedDuplicate++;
      }
      await ctx.db.delete(link._id);
    }

    // --- mentalModelTags ---
    const mmLinks = await ctx.db
      .query("mentalModelTags")
      .withIndex("by_tagId", (q) => q.eq("tagId", fromTag._id))
      .collect();

    for (const link of mmLinks) {
      const existingLinks = await ctx.db
        .query("mentalModelTags")
        .withIndex("by_mentalModelId", (q) =>
          q.eq("mentalModelId", link.mentalModelId)
        )
        .collect();
      const alreadyLinked = existingLinks.some((l) => l.tagId === toTag._id);

      if (!alreadyLinked) {
        await ctx.db.insert("mentalModelTags", {
          mentalModelId: link.mentalModelId,
          tagId: toTag._id,
        });
        stats.mentalModelTags.moved++;
      } else {
        stats.mentalModelTags.skippedDuplicate++;
      }
      await ctx.db.delete(link._id);
    }

    return {
      fromSlug: args.fromSlug,
      toSlug: args.toSlug,
      stats,
    };
  },
});
