import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================================
// Create a new project
// ============================================================
export const createProject = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const id = await ctx.db.insert("projects", {
      name: args.name,
      description: args.description,
      createdDate: now,
    });
    return id;
  },
});

// ============================================================
// List all projects
// ============================================================
export const listProjects = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("projects").collect();
  },
});

// ============================================================
// Get a single project by ID
// ============================================================
export const getProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.projectId);
  },
});

// ============================================================
// Project profile — extended fields used by chat prompts and the
// onboarding interview. Reads return the full record; updates are
// partial (only the supplied fields change) and bump profileVersion.
// ============================================================

const PROFILE_FIELDS = [
  "domain",
  "audience",
  "timeHorizon",
  "researchUnitLabel",
  "ideaUnitLabel",
  "assistantRoleName",
  "suggestedPrompts",
  "secondaryCaptureEnabled",
  "secondaryCaptureLabel",
  "secondaryCaptureDescription",
  "themeHints",
  "highValueEvidenceNotes",
  "confidenceRubricNotes",
  "tagStrategyNotes",
] as const;

export const getProjectProfile = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;
    return project;
  },
});

export const updateProjectProfile = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    domain: v.optional(v.string()),
    audience: v.optional(v.string()),
    timeHorizon: v.optional(v.string()),
    researchUnitLabel: v.optional(v.string()),
    ideaUnitLabel: v.optional(v.string()),
    assistantRoleName: v.optional(v.string()),
    suggestedPrompts: v.optional(v.array(v.string())),
    secondaryCaptureEnabled: v.optional(v.boolean()),
    secondaryCaptureLabel: v.optional(v.string()),
    secondaryCaptureDescription: v.optional(v.string()),
    themeHints: v.optional(v.string()),
    highValueEvidenceNotes: v.optional(v.string()),
    confidenceRubricNotes: v.optional(v.string()),
    tagStrategyNotes: v.optional(v.string()),
    profileInitialized: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { projectId, ...patch } = args;
    const existing = await ctx.db.get(projectId);
    if (!existing) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const filteredPatch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) filteredPatch[key] = value;
    }

    const nextVersion = (existing.profileVersion ?? 0) + 1;
    await ctx.db.patch(projectId, {
      ...filteredPatch,
      profileVersion: nextVersion,
    });

    return { projectId, profileVersion: nextVersion, updatedFields: Object.keys(filteredPatch) };
  },
});

export const resetProjectProfile = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.projectId);
    if (!existing) {
      throw new Error(`Project not found: ${args.projectId}`);
    }
    const cleared: Record<string, undefined> = {};
    for (const field of PROFILE_FIELDS) cleared[field] = undefined;
    const nextVersion = (existing.profileVersion ?? 0) + 1;
    await ctx.db.patch(args.projectId, {
      ...cleared,
      profileInitialized: false,
      profileVersion: nextVersion,
    } as any);
    return { projectId: args.projectId, profileVersion: nextVersion };
  },
});
