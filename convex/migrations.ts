import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

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

// ============================================================
// Backfill corrections from the retired dataPointCorrections table
// (correction-system unification, Design Decision 32)
//
// The system converged on a single `corrections` table as the source of truth.
// This migration carries every row from the retired `dataPointCorrections`
// table into `corrections` and materializes the effective value onto the data
// point, so historical corrections still resolve under the new read layer.
//
// Append-only and idempotent:
//   - No row in either table is deleted.
//   - A `corrections` row is inserted only if an equivalent one is not already
//     present (matched by target, correctedAt, type, and value).
//   - The data point's anchorQuote / claimText is set from the LATEST legacy
//     correction of each type (the effective value the old resolver showed).
//
// Type mapping (legacy -> canonical):
//   "anchor"      -> "anchor_text"      (patches anchorQuote)
//   "attribution" -> "dp_claim_text"    (patches claimText, resets embedding)
//
// Pass { dryRun: true } to report counts without writing anything.
// ============================================================
const CORRECTED_BY_VALUES = new Set(["curator", "agent", "pipeline"]);

function normalizeCorrectedBy(value: unknown): "curator" | "agent" | "pipeline" {
  return typeof value === "string" && CORRECTED_BY_VALUES.has(value)
    ? (value as "curator" | "agent" | "pipeline")
    : "curator";
}

export const backfillCorrections = mutation({
  args: {
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? false;

    const legacyRows = await ctx.db.query("dataPointCorrections").collect();

    const stats = {
      legacyRowsTotal: legacyRows.length,
      anchorRows: 0,
      claimRows: 0,
      correctionsInserted: 0,
      correctionsSkippedExisting: 0,
      dataPointsAnchorMaterialized: 0,
      dataPointsClaimMaterialized: 0,
      missingDataPoints: 0,
    };

    // Group legacy rows by data point so we can materialize from the latest of
    // each type.
    const byDataPoint = new Map<string, typeof legacyRows>();
    for (const row of legacyRows) {
      if (row.correctionType === "anchor") stats.anchorRows++;
      if (row.correctionType === "attribution") stats.claimRows++;
      const key = row.dataPointId as unknown as string;
      const list = byDataPoint.get(key) ?? [];
      list.push(row);
      byDataPoint.set(key, list);
    }

    // Surface which data points carry legacy claim (attribution) rewrites so a
    // dry run can flag them before any claim text is touched.
    const claimDataPointIds = Array.from(byDataPoint.entries())
      .filter(([, rows]) => rows.some((r) => r.correctionType === "attribution"))
      .map(([id]) => id);

    if (dryRun) {
      return { dryRun: true, stats, claimDataPointIds };
    }

    for (const [dataPointKey, rows] of byDataPoint.entries()) {
      const dataPointId = dataPointKey as unknown as Id<"dataPoints">;
      const dp = await ctx.db.get(dataPointId);
      if (!dp) {
        stats.missingDataPoints++;
        continue;
      }
      const source = await ctx.db.get(dp.sourceId);
      if (!source) {
        stats.missingDataPoints++;
        continue;
      }

      const sorted = [...rows].sort((a, b) => a.correctedAt - b.correctedAt);

      // Existing canonical corrections for this data point (idempotency check).
      const existing = await ctx.db
        .query("corrections")
        .withIndex("by_target", (q) =>
          q.eq("targetType", "dataPoint").eq("targetId", dataPointId)
        )
        .collect();

      let latestAnchorValue: string | null = null;
      let latestClaimValue: string | null = null;

      for (const row of sorted) {
        const isAnchor = row.correctionType === "anchor";
        const canonicalType = isAnchor ? "anchor_text" : "dp_claim_text";
        const previousValue = isAnchor
          ? row.priorAnchorQuote ?? null
          : row.priorClaimText ?? null;
        const newValue = isAnchor
          ? row.correctedAnchorQuote
          : row.correctedClaimText;

        if (!newValue) continue; // malformed legacy row, nothing to carry over

        if (isAnchor) latestAnchorValue = newValue;
        else latestClaimValue = newValue;

        const alreadyPresent = existing.some(
          (c) =>
            c.correctionType === canonicalType &&
            c.correctedAt === row.correctedAt &&
            c.newValue === newValue
        );

        if (alreadyPresent) {
          stats.correctionsSkippedExisting++;
          continue;
        }

        await ctx.db.insert("corrections", {
          projectId: source.projectId,
          targetType: "dataPoint",
          targetId: dataPointId,
          correctionType: canonicalType,
          previousValue,
          newValue,
          reason: row.reason,
          correctedAt: row.correctedAt,
          correctedBy: normalizeCorrectedBy(row.correctedBy),
        });
        stats.correctionsInserted++;
      }

      // Materialize the effective value onto the data point (the value the old
      // resolver overlaid). Only patch when it actually differs.
      const patch: Record<string, unknown> = {};
      if (latestAnchorValue !== null && dp.anchorQuote !== latestAnchorValue) {
        patch.anchorQuote = latestAnchorValue;
        stats.dataPointsAnchorMaterialized++;
      }
      if (latestClaimValue !== null && dp.claimText !== latestClaimValue) {
        patch.claimText = latestClaimValue;
        patch.embeddingStatus = "pending";
        stats.dataPointsClaimMaterialized++;
      }
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(dataPointId, patch);
      }
    }

    return { dryRun: false, stats, claimDataPointIds };
  },
});

// ============================================================
// Initialize data point lifecycle status (Design Decision 38)
//
// Sets status="active" on every data point that predates the supersede fields.
// Append-only and idempotent: only rows with an unset status are touched, and
// nothing is ever deleted.
//
// Data point rows carry a 1536-dimension embedding, so the table cannot be
// collected whole under Convex's 16 MB per-execution read budget. This mutation
// processes one page (~256 rows) and returns a cursor; run it repeatedly until
// isDone is true:
//   npx convex run migrations:backfillDataPointStatus '{}'
//   npx convex run migrations:backfillDataPointStatus '{"cursor":"<continueCursor>"}'
// ============================================================
const DATA_POINT_STATUS_PAGE_SIZE = 256;

export const backfillDataPointStatus = mutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("dataPoints").paginate({
      numItems: DATA_POINT_STATUS_PAGE_SIZE,
      cursor: args.cursor ?? null,
    });

    let initialized = 0;
    let alreadySet = 0;
    for (const dp of page.page) {
      if (dp.status === undefined) {
        await ctx.db.patch(dp._id, { status: "active" });
        initialized++;
      } else {
        alreadySet++;
      }
    }

    return {
      pageSize: page.page.length,
      initialized,
      alreadySet,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

// ============================================================
// Backfill known source replacement lineage (Design Decision 38)
//
// Records the OpenAI re-ingestion that previously only lived in handoff docs:
//   old kd7014cf47f5rcxrw4rpftzqh588p3q6  superseded by
//   new kd74gc0sek7tj6kmchgbw5gndh88vtgw
// Sets old.supersededBy + status="failed" and new.replaces. Append-only and
// idempotent: pointers are set only when currently unset. Other historical
// failed-source lineage is not recoverable and is left null.
//
// Pass { dryRun: true } to report what would change without writing.
// ============================================================
const OPENAI_OLD_SOURCE_ID = "kd7014cf47f5rcxrw4rpftzqh588p3q6";
const OPENAI_NEW_SOURCE_ID = "kd74gc0sek7tj6kmchgbw5gndh88vtgw";

export const backfillSourceLineage = mutation({
  args: {
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? false;
    const oldId = OPENAI_OLD_SOURCE_ID as unknown as Id<"sources">;
    const newId = OPENAI_NEW_SOURCE_ID as unknown as Id<"sources">;

    const oldSource = await ctx.db.get(oldId);
    const newSource = await ctx.db.get(newId);

    const result = {
      dryRun,
      oldSourceFound: Boolean(oldSource),
      newSourceFound: Boolean(newSource),
      setSupersededBy: false,
      setOldStatusFailed: false,
      setReplaces: false,
      alreadyLinked: false,
    };

    if (!oldSource || !newSource) {
      return result;
    }

    if (oldSource.supersededBy && newSource.replaces) {
      result.alreadyLinked = true;
      return result;
    }

    const now = Date.now();
    const reason =
      "OpenAI source re-ingested as a corrected version; lineage backfilled (Decision 38).";

    if (!oldSource.supersededBy) {
      result.setSupersededBy = true;
      if (oldSource.status !== "failed") result.setOldStatusFailed = true;
      if (!dryRun) {
        await ctx.db.patch(oldId, {
          supersededBy: newId,
          supersededAt: now,
          supersedeReason: reason,
          status: "failed",
        });
      }
    }

    if (!newSource.replaces) {
      result.setReplaces = true;
      if (!dryRun) {
        await ctx.db.patch(newId, { replaces: oldId });
      }
    }

    return result;
  },
});

// ============================================================
// Note on the retired currentCorrectionId pointer (Design Decision 37)
//
// dataPoints.currentCorrectionId pointed into the retired dataPointCorrections
// table. Because the system is append-only and that table had no rows, no data
// point ever carried a pointer (verified by scanning every data point), so the
// field was removed from the schema directly with no clearing pass required.
// If a future deployment is ever found to still carry the pointer, re-add it to
// the schema as optional, unset it on the affected data points with a paginated
// mutation (one paginated query per call; ~256 docs per page to stay under the
// 16MB read limit), then remove the field again.
// ============================================================
