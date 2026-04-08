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
