import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================================
// Generate and store a new Research Lens from current positions
// The lens is a compressed snapshot — not a maintained document
// ============================================================
export const generateLens = mutation({
  args: {
    projectId: v.id("projects"),
    currentPositions: v.string(),
    openQuestions: v.string(),
    surpriseSignals: v.string(),
    triggeredBy: v.union(
      v.literal("weekly-synthesis"),
      v.literal("exception-signal"),
      v.literal("manual")
    ),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    const lensId = await ctx.db.insert("researchLens", {
      projectId: args.projectId,
      currentPositions: args.currentPositions,
      openQuestions: args.openQuestions,
      surpriseSignals: args.surpriseSignals,
      generatedDate: now,
      triggeredBy: args.triggeredBy,
    });

    return lensId;
  },
});

// ============================================================
// Get the most recent Research Lens
// This is what Pass 2 enrichment uses as context
// ============================================================
export const getCurrentLens = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const lenses = await ctx.db
      .query("researchLens")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(1);

    return lenses[0] ?? null;
  },
});

// ============================================================
// Get lens history (see how focus has shifted over time)
// ============================================================
export const getLensHistory = query({
  args: { projectId: v.id("projects"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;
    return await ctx.db
      .query("researchLens")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(limit);
  },
});

// ============================================================
// Helper: Get all active positions for lens generation
// The MCP or skill calls this, then formats the compressed text,
// then calls generateLens with the result
// ============================================================
export const getActivePositionsForLens = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    // Get themes for this project, then positions under those themes
    const themes = await ctx.db
      .query("researchThemes")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    const themeIds = new Set(themes.map((t) => t._id));

    const allPositions = await ctx.db.query("researchPositions").collect();
    const positions = allPositions.filter((p) => themeIds.has(p.themeId));

    const activePositions = await Promise.all(
      positions.map(async (pos) => {
        if (!pos.currentVersionId) return null;

        const version = await ctx.db.get(pos.currentVersionId);
        if (!version) return null;

        // Include active, established, AND emerging positions in the lens
        // Emerging positions are labeled separately in the lens output
        if (version.status !== "active" && version.status !== "established" && version.status !== "emerging") {
          return null;
        }

        const theme = await ctx.db.get(pos.themeId);

        return {
          positionTitle: pos.title,
          themeTitle: theme?.title,
          currentStance: version.currentStance,
          confidenceLevel: version.confidenceLevel,
          status: version.status,
          openQuestions: version.openQuestions ?? [],
        };
      })
    );

    return activePositions.filter(Boolean);
  },
});
