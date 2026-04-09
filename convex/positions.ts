import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { resolveSourceMeta } from "./sources";

// ============================================================
// RESEARCH THEMES
// ============================================================

// Create a new Research Theme
export const createTheme = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const id = await ctx.db.insert("researchThemes", {
      projectId: args.projectId,
      title: args.title,
      description: args.description,
      createdDate: now,
    });
    return id;
  },
});

// List all themes with position counts
export const getThemes = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const themes = await ctx.db
      .query("researchThemes")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    const themesWithCounts = await Promise.all(
      themes.map(async (theme) => {
        const positions = await ctx.db
          .query("researchPositions")
          .withIndex("by_themeId", (q) => q.eq("themeId", theme._id))
          .collect();

        return {
          ...theme,
          positionCount: positions.length,
        };
      })
    );

    return themesWithCounts;
  },
});

// ============================================================
// RESEARCH POSITIONS
// ============================================================

// Create a new Research Position with its first version
export const createPosition = mutation({
  args: {
    themeId: v.id("researchThemes"),
    title: v.string(),
    currentStance: v.string(),
    confidenceLevel: v.union(
      v.literal("emerging"),
      v.literal("active"),
      v.literal("established")
    ),
    status: v.union(
      v.literal("emerging"),
      v.literal("active"),
      v.literal("established"),
      v.literal("evolved"),
      v.literal("retired")
    ),
    supportingEvidence: v.array(v.id("dataPoints")),
    counterEvidence: v.optional(v.array(v.id("dataPoints"))),
    curatorObservations: v.optional(v.array(v.id("curatorObservations"))),
    mentalModels: v.optional(v.array(v.id("mentalModels"))),
    openQuestions: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    // Create the position identity record (without currentVersionId for now)
    const positionId = await ctx.db.insert("researchPositions", {
      themeId: args.themeId,
      title: args.title,
      createdDate: now,
    });

    // Create the first version
    const versionId = await ctx.db.insert("positionVersions", {
      positionId,
      versionNumber: 1,
      currentStance: args.currentStance,
      confidenceLevel: args.confidenceLevel,
      status: args.status,
      supportingEvidence: args.supportingEvidence,
      counterEvidence: args.counterEvidence,
      curatorObservations: args.curatorObservations,
      mentalModels: args.mentalModels,
      openQuestions: args.openQuestions,
      versionDate: now,
      embeddingStatus: "pending",
    });

    // Point the position to its first version
    await ctx.db.patch(positionId, { currentVersionId: versionId });

    return { positionId, versionId };
  },
});

// ============================================================
// Update a position (append-only: creates new version row)
// ============================================================
export const updatePosition = mutation({
  args: {
    positionId: v.id("researchPositions"),
    currentStance: v.string(),
    confidenceLevel: v.union(
      v.literal("emerging"),
      v.literal("active"),
      v.literal("established")
    ),
    status: v.union(
      v.literal("emerging"),
      v.literal("active"),
      v.literal("established"),
      v.literal("evolved"),
      v.literal("retired")
    ),
    supportingEvidence: v.array(v.id("dataPoints")),
    counterEvidence: v.optional(v.array(v.id("dataPoints"))),
    curatorObservations: v.optional(v.array(v.id("curatorObservations"))),
    mentalModels: v.optional(v.array(v.id("mentalModels"))),
    openQuestions: v.optional(v.array(v.string())),
    changeSummary: v.string(),
  },
  handler: async (ctx, args) => {
    const position = await ctx.db.get(args.positionId);
    if (!position) throw new Error("Position not found");

    // Get the current version to determine the next version number
    const currentVersion = position.currentVersionId
      ? await ctx.db.get(position.currentVersionId)
      : null;

    const nextVersionNumber = currentVersion
      ? currentVersion.versionNumber + 1
      : 1;

    const now = new Date().toISOString();

    // Create the new version (append-only)
    const { positionId, changeSummary, ...versionFields } = args;
    const newVersionId = await ctx.db.insert("positionVersions", {
      positionId: args.positionId,
      versionNumber: nextVersionNumber,
      previousVersionId: position.currentVersionId,
      currentStance: versionFields.currentStance,
      confidenceLevel: versionFields.confidenceLevel,
      status: versionFields.status,
      supportingEvidence: versionFields.supportingEvidence,
      counterEvidence: versionFields.counterEvidence,
      curatorObservations: versionFields.curatorObservations,
      mentalModels: versionFields.mentalModels,
      openQuestions: versionFields.openQuestions,
      changeSummary: args.changeSummary,
      versionDate: now,
      embeddingStatus: "pending",
    });

    // Update the pointer (one of the few in-place updates allowed)
    await ctx.db.patch(args.positionId, { currentVersionId: newVersionId });

    return { versionId: newVersionId, versionNumber: nextVersionNumber };
  },
});

// ============================================================
// Get a position with its current version (Layer 1)
// ============================================================
export const getPosition = query({
  args: { positionId: v.id("researchPositions") },
  handler: async (ctx, args) => {
    const position = await ctx.db.get(args.positionId);
    if (!position) return null;

    const currentVersion = position.currentVersionId
      ? await ctx.db.get(position.currentVersionId)
      : null;

    const theme = await ctx.db.get(position.themeId);

    return {
      ...position,
      currentVersion,
      theme,
    };
  },
});

// ============================================================
// Get position with full evidence chain (Layer 2)
// Includes all linked data points, observations, mental models
// ============================================================
export const getPositionDetail = query({
  args: { positionId: v.id("researchPositions") },
  handler: async (ctx, args) => {
    const position = await ctx.db.get(args.positionId);
    if (!position) return null;

    const currentVersion = position.currentVersionId
      ? await ctx.db.get(position.currentVersionId)
      : null;

    if (!currentVersion) return { ...position, currentVersion: null };

    // Resolve supporting evidence
    const supportingEvidence = await Promise.all(
      currentVersion.supportingEvidence.map(async (dpId) => {
        const dp = await ctx.db.get(dpId);
        if (!dp) return null;
        const source = await ctx.db.get(dp.sourceId);
        const resolvedSource = source ? await resolveSourceMeta(ctx, source) : null;
        return {
          ...dp,
          source: resolvedSource,
          sourceTitle: source?.title,
          sourceTier: source?.tier,
        };
      })
    );

    // Resolve counter evidence
    const counterEvidence = currentVersion.counterEvidence
      ? await Promise.all(
          currentVersion.counterEvidence.map(async (dpId) => {
            const dp = await ctx.db.get(dpId);
            if (!dp) return null;
            const source = await ctx.db.get(dp.sourceId);
            const resolvedSource = source
              ? await resolveSourceMeta(ctx, source)
              : null;
            return {
              ...dp,
              source: resolvedSource,
              sourceTitle: source?.title,
              sourceTier: source?.tier,
            };
          })
        )
      : [];

    // Resolve curator observations
    const observations = currentVersion.curatorObservations
      ? await Promise.all(
          currentVersion.curatorObservations.map(
            async (obsId) => await ctx.db.get(obsId)
          )
        )
      : [];

    // Resolve mental models
    const models = currentVersion.mentalModels
      ? await Promise.all(
          currentVersion.mentalModels.map(
            async (modelId) => await ctx.db.get(modelId)
          )
        )
      : [];

    const theme = await ctx.db.get(position.themeId);

    return {
      ...position,
      theme,
      currentVersion: {
        ...currentVersion,
        supportingEvidenceDetails: supportingEvidence.filter(Boolean),
        counterEvidenceDetails: counterEvidence.filter(Boolean),
        observationDetails: observations.filter(Boolean),
        mentalModelDetails: models.filter(Boolean),
      },
    };
  },
});

// ============================================================
// Get full version history for a position
// ============================================================
export const getPositionHistory = query({
  args: { positionId: v.id("researchPositions") },
  handler: async (ctx, args) => {
    const position = await ctx.db.get(args.positionId);
    if (!position) return null;

    const versions = await ctx.db
      .query("positionVersions")
      .withIndex("by_positionId", (q) => q.eq("positionId", args.positionId))
      .collect();

    // Sort by version number ascending
    versions.sort((a, b) => a.versionNumber - b.versionNumber);

    return {
      ...position,
      versions,
    };
  },
});

// ============================================================
// Get all positions within a theme (Layer 1)
// ============================================================
export const getPositionsByTheme = query({
  args: { themeId: v.id("researchThemes") },
  handler: async (ctx, args) => {
    const positions = await ctx.db
      .query("researchPositions")
      .withIndex("by_themeId", (q) => q.eq("themeId", args.themeId))
      .collect();

    // Attach current version to each position
    const positionsWithVersions = await Promise.all(
      positions.map(async (pos) => {
        const currentVersion = pos.currentVersionId
          ? await ctx.db.get(pos.currentVersionId)
          : null;

        return {
          ...pos,
          currentVersion: currentVersion
            ? {
                currentStance: currentVersion.currentStance,
                confidenceLevel: currentVersion.confidenceLevel,
                status: currentVersion.status,
                versionNumber: currentVersion.versionNumber,
                versionDate: currentVersion.versionDate,
              }
            : null,
        };
      })
    );

    return positionsWithVersions;
  },
});

export const getThemeEvidenceScope = query({
  args: { themeId: v.id("researchThemes") },
  handler: async (ctx, args) => {
    const theme = await ctx.db.get(args.themeId);
    if (!theme) return null;

    const positions = await ctx.db
      .query("researchPositions")
      .withIndex("by_themeId", (q) => q.eq("themeId", args.themeId))
      .collect();

    const dataPointIds = new Set<string>();
    for (const position of positions) {
      const currentVersion = position.currentVersionId
        ? await ctx.db.get(position.currentVersionId)
        : null;

      for (const dpId of currentVersion?.supportingEvidence ?? []) {
        dataPointIds.add(String(dpId));
      }

      for (const dpId of currentVersion?.counterEvidence ?? []) {
        dataPointIds.add(String(dpId));
      }
    }

    return {
      theme,
      dataPointIds: Array.from(dataPointIds),
      positionCount: positions.length,
    };
  },
});

// ============================================================
// List all positions across all themes (Layer 1 summary)
// ============================================================
export const listAllPositions = query({
  args: {},
  handler: async (ctx) => {
    const positions = await ctx.db.query("researchPositions").collect();

    const positionsWithContext = await Promise.all(
      positions.map(async (pos) => {
        const theme = await ctx.db.get(pos.themeId);
        const currentVersion = pos.currentVersionId
          ? await ctx.db.get(pos.currentVersionId)
          : null;

        return {
          _id: pos._id,
          title: pos.title,
          themeTitle: theme?.title,
          currentStance: currentVersion?.currentStance,
          confidenceLevel: currentVersion?.confidenceLevel,
          status: currentVersion?.status,
          versionNumber: currentVersion?.versionNumber,
          versionDate: currentVersion?.versionDate,
        };
      })
    );

    return positionsWithContext;
  },
});
