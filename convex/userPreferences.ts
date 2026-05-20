import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================================
// User Preferences — instance-wide writing style singleton.
// One row only. If somehow more than one exists, callers receive
// the most recently updated row (defensive).
// ============================================================

const DEFAULT_PREFERENCES = {
  voice: "analytical" as const,
  structurePreference: "mixed" as const,
  bannedPunctuation: ["—"],
  bannedPhrases: [] as string[],
  alwaysIncludeCounterEvidence: false,
  evidenceThinPolicy: "say-so" as const,
  hedgingStyle: "moderate" as const,
  language: "en",
  customStyleNotes: "",
  preferencesInitialized: false,
};

async function loadSingleton(ctx: any) {
  const rows = await ctx.db.query("userPreferences").collect();
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0];
  return rows
    .slice()
    .sort((a: any, b: any) =>
      (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")
    )[0];
}

export const getUserPreferences = query({
  args: {},
  handler: async (ctx) => {
    const row = await loadSingleton(ctx);
    if (!row) {
      return { ...DEFAULT_PREFERENCES, _id: null };
    }
    return row;
  },
});

export const updateUserPreferences = mutation({
  args: {
    voice: v.optional(
      v.union(
        v.literal("analytical"),
        v.literal("conversational"),
        v.literal("formal")
      )
    ),
    structurePreference: v.optional(
      v.union(
        v.literal("prose"),
        v.literal("bullets"),
        v.literal("mixed")
      )
    ),
    bannedPunctuation: v.optional(v.array(v.string())),
    bannedPhrases: v.optional(v.array(v.string())),
    alwaysIncludeCounterEvidence: v.optional(v.boolean()),
    evidenceThinPolicy: v.optional(
      v.union(
        v.literal("say-so"),
        v.literal("skip"),
        v.literal("ask")
      )
    ),
    hedgingStyle: v.optional(
      v.union(
        v.literal("direct"),
        v.literal("moderate"),
        v.literal("cautious")
      )
    ),
    language: v.optional(v.string()),
    customStyleNotes: v.optional(v.string()),
    preferencesInitialized: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { updatedAt: now };
    for (const [key, value] of Object.entries(args)) {
      if (value !== undefined) patch[key] = value;
    }

    const existing = await loadSingleton(ctx);
    if (existing) {
      await ctx.db.patch(existing._id, patch as any);
      return { _id: existing._id, updatedAt: now, updatedFields: Object.keys(patch) };
    }

    const id = await ctx.db.insert("userPreferences", patch as any);
    return { _id: id, updatedAt: now, updatedFields: Object.keys(patch) };
  },
});

export const resetUserPreferences = mutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("userPreferences").collect();
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
    return { cleared: rows.length };
  },
});
