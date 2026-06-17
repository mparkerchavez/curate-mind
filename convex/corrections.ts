import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { buildTierCorrection, shouldResetEmbedding } from "./lib/corrections";

const anchorCorrectionType = v.union(
  v.literal("anchor_text"),
  v.literal("anchor_passage"),
  v.literal("anchor_missing"),
  v.literal("anchor_swap")
);

const attributionCorrectionType = v.union(
  v.literal("source_publisher"),
  v.literal("source_author"),
  v.literal("source_url"),
  v.literal("source_published_date"),
  v.literal("source_tier"),
  v.literal("dp_speaker_attribution")
);

const correctedBy = v.union(
  v.literal("curator"),
  v.literal("agent"),
  v.literal("pipeline")
);

function validateReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length < 10) {
    throw new Error("reason is required and must be at least 10 characters");
  }
  return trimmed;
}

function normalizeAnchor(anchor: string, label = "anchor"): string {
  const trimmed = anchor.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }

  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (wordCount < 10 || wordCount > 40) {
    throw new Error(`${label} must be 10 to 40 words; received ${wordCount}`);
  }

  return trimmed;
}

function sourceContainsAnchor(fullText: string, anchor: string): boolean {
  const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
  return normalize(fullText).includes(normalize(anchor));
}

function validateIsoDate(value: string): string {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error("source_published_date must be an ISO date in YYYY-MM-DD format");
  }

  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
    throw new Error("source_published_date must be a valid calendar date");
  }

  return trimmed;
}

function validateHttpUrl(value: string): string {
  const trimmed = value.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("URL must use http or https");
    }
    return parsed.toString();
  } catch {
    throw new Error("source_url must be a valid URL");
  }
}

async function getDataPointWithSource(ctx: any, dataPointId: Id<"dataPoints">) {
  const dp = await ctx.db.get(dataPointId);
  if (!dp) {
    throw new Error(`Data point not found: ${dataPointId}`);
  }

  const source = await ctx.db.get(dp.sourceId);
  if (!source) {
    throw new Error(`Source not found for data point: ${dataPointId}`);
  }

  return { dp, source };
}

async function insertCorrection(
  ctx: any,
  fields: {
    projectId: Id<"projects">;
    targetType: "dataPoint" | "source";
    targetId: Id<"dataPoints"> | Id<"sources">;
    correctionType: Doc<"corrections">["correctionType"];
    previousValue: string | null;
    newValue: string;
    reason: string;
    pairedTargetId?: Id<"dataPoints">;
    correctedBy: "curator" | "agent" | "pipeline";
  }
) {
  return await ctx.db.insert("corrections", {
    ...fields,
    correctedAt: Date.now(),
  });
}

// ============================================================
// Correct a data point anchor while preserving immutable audit history.
// ============================================================
export const correctAnchor = mutation({
  args: {
    dataPointId: v.id("dataPoints"),
    correctionType: anchorCorrectionType,
    newAnchorText: v.optional(v.string()),
    pairedDataPointId: v.optional(v.id("dataPoints")),
    pairedNewAnchorText: v.optional(v.string()),
    reason: v.string(),
    correctedBy: v.optional(correctedBy),
  },
  handler: async (ctx, args) => {
    const reason = validateReason(args.reason);
    const correctedBy = args.correctedBy ?? "curator";
    const { dp, source } = await getDataPointWithSource(ctx, args.dataPointId);

    if (args.correctionType === "anchor_swap") {
      if (!args.pairedDataPointId || !args.newAnchorText || !args.pairedNewAnchorText) {
        throw new Error(
          "anchor_swap requires pairedDataPointId, newAnchorText, and pairedNewAnchorText"
        );
      }

      if (args.pairedDataPointId === args.dataPointId) {
        throw new Error("pairedDataPointId must be different from dataPointId");
      }

      const { dp: pairedDp, source: pairedSource } = await getDataPointWithSource(
        ctx,
        args.pairedDataPointId
      );

      if (pairedSource.projectId !== source.projectId) {
        throw new Error("anchor_swap requires both data points to be in the same project");
      }

      const newAnchor = normalizeAnchor(args.newAnchorText, "newAnchorText");
      const pairedNewAnchor = normalizeAnchor(
        args.pairedNewAnchorText,
        "pairedNewAnchorText"
      );

      const warnings = [
        sourceContainsAnchor(source.fullText, newAnchor)
          ? null
          : "newAnchorText was not found in the first data point source fullText",
        sourceContainsAnchor(pairedSource.fullText, pairedNewAnchor)
          ? null
          : "pairedNewAnchorText was not found in the paired data point source fullText",
      ].filter(Boolean);

      const correctionId = await insertCorrection(ctx, {
        projectId: source.projectId,
        targetType: "dataPoint",
        targetId: args.dataPointId,
        correctionType: "anchor_swap",
        previousValue: dp.anchorQuote ?? null,
        newValue: newAnchor,
        reason,
        pairedTargetId: args.pairedDataPointId,
        correctedBy,
      });

      const pairedCorrectionId = await insertCorrection(ctx, {
        projectId: pairedSource.projectId,
        targetType: "dataPoint",
        targetId: args.pairedDataPointId,
        correctionType: "anchor_swap",
        previousValue: pairedDp.anchorQuote ?? null,
        newValue: pairedNewAnchor,
        reason,
        pairedTargetId: args.dataPointId,
        correctedBy,
      });

      await ctx.db.patch(args.dataPointId, { anchorQuote: newAnchor });
      await ctx.db.patch(args.pairedDataPointId, { anchorQuote: pairedNewAnchor });

      return {
        dataPointId: args.dataPointId,
        pairedDataPointId: args.pairedDataPointId,
        correctionId,
        pairedCorrectionId,
        previousAnchor: dp.anchorQuote ?? null,
        newAnchor,
        pairedPreviousAnchor: pairedDp.anchorQuote ?? null,
        pairedNewAnchor,
        warnings,
      };
    }

    if (!args.newAnchorText) {
      throw new Error(`${args.correctionType} requires newAnchorText`);
    }

    const newAnchor = normalizeAnchor(args.newAnchorText, "newAnchorText");
    const warnings = sourceContainsAnchor(source.fullText, newAnchor)
      ? []
      : ["newAnchorText was not found in the source fullText"];

    const correctionId = await insertCorrection(ctx, {
      projectId: source.projectId,
      targetType: "dataPoint",
      targetId: args.dataPointId,
      correctionType: args.correctionType,
      previousValue: dp.anchorQuote ?? null,
      newValue: newAnchor,
      reason,
      correctedBy,
    });

    await ctx.db.patch(args.dataPointId, { anchorQuote: newAnchor });

    return {
      dataPointId: args.dataPointId,
      correctionId,
      previousAnchor: dp.anchorQuote ?? null,
      newAnchor,
      warnings,
    };
  },
});

// ============================================================
// Correct source metadata or data point speaker attribution.
// ============================================================
export const correctAttribution = mutation({
  args: {
    targetType: v.union(v.literal("source"), v.literal("dataPoint")),
    targetId: v.union(v.id("sources"), v.id("dataPoints")),
    correctionType: attributionCorrectionType,
    newValue: v.string(),
    reason: v.string(),
    correctedBy: v.optional(correctedBy),
  },
  handler: async (ctx, args) => {
    const reason = validateReason(args.reason);
    const correctedBy = args.correctedBy ?? "curator";
    const rawValue = args.newValue.trim();
    if (!rawValue) {
      throw new Error("newValue is required");
    }

    if (args.targetType === "dataPoint") {
      if (args.correctionType !== "dp_speaker_attribution") {
        throw new Error("dataPoint targetType only supports dp_speaker_attribution");
      }

      const { dp, source } = await getDataPointWithSource(
        ctx,
        args.targetId as Id<"dataPoints">
      );
      if (rawValue.length > 200) {
        throw new Error("dp_speaker_attribution must be 200 characters or fewer");
      }

      const correctionId = await insertCorrection(ctx, {
        projectId: source.projectId,
        targetType: "dataPoint",
        targetId: args.targetId,
        correctionType: "dp_speaker_attribution",
        previousValue: dp.speakerAttribution ?? null,
        newValue: rawValue,
        reason,
        correctedBy,
      });

      await ctx.db.patch(args.targetId as Id<"dataPoints">, {
        speakerAttribution: rawValue,
      });

      return {
        targetType: args.targetType,
        targetId: args.targetId,
        correctionId,
        previousValue: dp.speakerAttribution ?? null,
        newValue: rawValue,
        fieldUpdated: "speakerAttribution",
      };
    }

    if (args.correctionType === "dp_speaker_attribution") {
      throw new Error("source targetType does not support dp_speaker_attribution");
    }

    const source = await ctx.db.get(args.targetId as Id<"sources">);
    if (!source) {
      throw new Error(`Source not found: ${args.targetId}`);
    }

    // Re-tier is an append-only correction: write the audit row, then patch the
    // numeric tier (1/2/3). The tier is stored as its string form in the log to
    // match the corrections table's string previousValue/newValue typing.
    if (args.correctionType === "source_tier") {
      const { patchTier, previousValue, newValue } = buildTierCorrection({
        previousTier: source.tier,
        rawNewValue: rawValue,
      });

      const correctionId = await insertCorrection(ctx, {
        projectId: source.projectId,
        targetType: "source",
        targetId: args.targetId,
        correctionType: "source_tier",
        previousValue,
        newValue,
        reason,
        correctedBy,
      });

      await ctx.db.patch(args.targetId as Id<"sources">, { tier: patchTier });

      return {
        targetType: args.targetType,
        targetId: args.targetId,
        correctionId,
        previousValue,
        newValue,
        fieldUpdated: "tier",
      };
    }

    const fieldMap = {
      source_publisher: "publisherName",
      source_author: "authorName",
      source_url: "canonicalUrl",
      source_published_date: "publishedDate",
    } as const;

    const fieldUpdated = fieldMap[args.correctionType];
    let newValue = rawValue;
    if (args.correctionType === "source_url") {
      newValue = validateHttpUrl(rawValue);
    }
    if (args.correctionType === "source_published_date") {
      newValue = validateIsoDate(rawValue);
    }

    const previousValue = source[fieldUpdated] ?? null;

    const correctionId = await insertCorrection(ctx, {
      projectId: source.projectId,
      targetType: "source",
      targetId: args.targetId,
      correctionType: args.correctionType,
      previousValue,
      newValue,
      reason,
      correctedBy,
    });

    await ctx.db.patch(args.targetId as Id<"sources">, {
      [fieldUpdated]: newValue,
    });

    return {
      targetType: args.targetType,
      targetId: args.targetId,
      correctionId,
      previousValue,
      newValue,
      fieldUpdated,
    };
  },
});

// ============================================================
// Correct a data point claim text (logged, append-only audit).
//
// Decision 32 (amended): claims are immutable EXCEPT through a logged
// correction. The previous claim is preserved in the corrections row, the
// claim is patched in place, and embeddingStatus is reset so semantic search
// reindexes from the corrected wording. A 0.5x-2x length guard keeps this a
// correction rather than a substantive rewrite.
// ============================================================
export const correctClaim = mutation({
  args: {
    dataPointId: v.id("dataPoints"),
    correctedClaimText: v.string(),
    reason: v.string(),
    correctedBy: v.optional(correctedBy),
  },
  handler: async (ctx, args) => {
    const reason = validateReason(args.reason);
    const correctedByValue = args.correctedBy ?? "curator";

    const correctedClaimText = args.correctedClaimText.trim().replace(/\s+/g, " ");
    if (!correctedClaimText) {
      throw new Error("correctedClaimText is required");
    }

    const { dp, source } = await getDataPointWithSource(ctx, args.dataPointId);

    const currentClaimText = dp.claimText;
    if (correctedClaimText === currentClaimText) {
      throw new Error("No-op: corrected claim text matches current claim text");
    }

    const currentLength = Math.max(currentClaimText.length, 1);
    const ratio = correctedClaimText.length / currentLength;
    if (ratio < 0.5 || ratio > 2) {
      throw new Error(
        "Corrected claim text length is outside the allowed 0.5x to 2x correction range. " +
          "This guard keeps claim corrections from becoming substantive rewrites; loosen it " +
          "only deliberately."
      );
    }

    const correctionId = await insertCorrection(ctx, {
      projectId: source.projectId,
      targetType: "dataPoint",
      targetId: args.dataPointId,
      correctionType: "dp_claim_text",
      previousValue: currentClaimText,
      newValue: correctedClaimText,
      reason,
      correctedBy: correctedByValue,
    });

    // A claim correction changes the effective claim text, and embeddings are
    // generated from claim text, so the embedding must be regenerated.
    // shouldResetEmbedding is the single source of truth for this rule
    // (anchor-only and attribution corrections do NOT reset it).
    const patch: Record<string, unknown> = { claimText: correctedClaimText };
    if (shouldResetEmbedding("dp_claim_text")) {
      patch.embeddingStatus = "pending";
    }
    await ctx.db.patch(args.dataPointId, patch);

    return {
      dataPointId: args.dataPointId,
      correctionId,
      previousValue: currentClaimText,
      newValue: correctedClaimText,
      fieldUpdated: "claimText",
      embeddingStatus: "pending",
      note: "embeddingStatus is now pending so cm_generate_embeddings can regenerate from the corrected claim text.",
    };
  },
});

export const getForTarget = query({
  args: {
    projectId: v.id("projects"),
    targetType: v.union(v.literal("dataPoint"), v.literal("source")),
    targetId: v.union(v.id("dataPoints"), v.id("sources")),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("corrections")
      .withIndex("by_project_target", (q) =>
        q
          .eq("projectId", args.projectId)
          .eq("targetType", args.targetType)
          .eq("targetId", args.targetId)
      )
      .collect();
  },
});

export const getForDataPoint = query({
  args: { dataPointId: v.id("dataPoints") },
  handler: async (ctx, args) => {
    const { source } = await getDataPointWithSource(ctx, args.dataPointId);
    return await ctx.db
      .query("corrections")
      .withIndex("by_project_target", (q) =>
        q
          .eq("projectId", source.projectId)
          .eq("targetType", "dataPoint")
          .eq("targetId", args.dataPointId)
      )
      .collect();
  },
});

export const getForSource = query({
  args: { sourceId: v.id("sources") },
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.sourceId);
    if (!source) {
      throw new Error(`Source not found: ${args.sourceId}`);
    }
    return await ctx.db
      .query("corrections")
      .withIndex("by_project_target", (q) =>
        q
          .eq("projectId", source.projectId)
          .eq("targetType", "source")
          .eq("targetId", args.sourceId)
      )
      .collect();
  },
});
