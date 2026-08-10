import { v } from "convex/values";
import { action, mutation } from "./_generated/server";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

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
// Reconstruct lifecycle history for pre-Decision-44 rows
//
// Every non-active data point already carries supersedeReason and
// supersededAt on the row, so its retire/supersede can be reconstructed
// losslessly as a single lifecycleEvents row. Without this, history starts
// empty and the 82 retirements from the 2026-07-30 duplicate cleanup would
// look like they never happened.
//
// recordedBy is "pipeline" so reconstructed history is never mistaken for a
// decision someone actually recorded at the time.
//
// Append-only and idempotent: a target that already has any event is skipped,
// so re-running cannot double-write. Pages like backfillDataPointStatus above,
// because data point rows carry a 1536-dimension embedding and the table
// cannot be collected whole under the 16 MB per-execution read budget:
//   npx convex run migrations:backfillLifecycleEvents '{}'
//   npx convex run migrations:backfillLifecycleEvents '{"cursor":"<continueCursor>"}'
//
// Pass dryRun: true to count what would be written without writing anything.
// ============================================================
const LIFECYCLE_EVENT_PAGE_SIZE = 256;

export const backfillLifecycleEvents = mutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? false;
    const page = await ctx.db.query("dataPoints").paginate({
      numItems: LIFECYCLE_EVENT_PAGE_SIZE,
      cursor: args.cursor ?? null,
    });

    let reconstructed = 0;
    let skippedActive = 0;
    let skippedExisting = 0;
    let skippedNoSource = 0;

    for (const dp of page.page) {
      const status = dp.status;
      if (status !== "superseded" && status !== "retired") {
        skippedActive++;
        continue;
      }

      const existing = await ctx.db
        .query("lifecycleEvents")
        .withIndex("by_target", (q: any) =>
          q.eq("targetType", "dataPoint").eq("targetId", dp._id)
        )
        .first();
      if (existing) {
        skippedExisting++;
        continue;
      }

      const source = await ctx.db.get(dp.sourceId);
      if (!source) {
        skippedNoSource++;
        continue;
      }

      if (!dryRun) {
        await ctx.db.insert("lifecycleEvents", {
          projectId: source.projectId,
          targetType: "dataPoint" as const,
          targetId: dp._id,
          action: status === "superseded" ? "supersede" : "retire",
          previousStatus: "active",
          newStatus: status,
          previousReplacementId: null,
          newReplacementId: dp.supersededBy ?? null,
          reason:
            dp.supersedeReason ??
            "Reconstructed from row state; no reason was recorded at the time.",
          recordedAt: dp.supersededAt ?? dp._creationTime,
          recordedBy: "pipeline" as const,
        });
      }
      reconstructed++;
    }

    return {
      dryRun,
      pageSize: page.page.length,
      reconstructed,
      skippedActive,
      skippedExisting,
      skippedNoSource,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

// ============================================================
// Reconstruct lifecycle history for source lineage set before Decision 44
//
// Every source carrying a supersededBy pointer had that pointer set before
// supersedeSource appended events, so its lineage decision has no recorded
// history at all.
//
// One thing is NOT recoverable and is deliberately not guessed. supersedeSource
// overwrites status to "failed" without recording what it was, so the
// pre-supersede status is simply gone. Writing "failed" would be a guess that
// is wrong for at least one known case (the OpenAI re-ingest, which was almost
// certainly "extracted" beforehand), and writing "extracted" would risk
// promoting a merely-indexed source into the corpus on a later restore.
//
// So previousStatus is recorded as "unknown". resolveRestoredSourceStatus
// already treats any unrecognized value as the safe fallback: restore to
// "indexed" for review, with a warning saying why. Honest gap, correct
// behavior, no invented state.
//
// Append-only and idempotent: a source that already has any lifecycle event is
// skipped. Sources carry fullText, so this pages rather than collecting.
//   npx convex run migrations:backfillSourceLifecycleEvents '{"dryRun":true}'
//   npx convex run migrations:backfillSourceLifecycleEvents '{}'
// ============================================================
const SOURCE_LIFECYCLE_PAGE_SIZE = 64;

export const backfillSourceLifecycleEvents = mutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? false;
    const page = await ctx.db.query("sources").paginate({
      numItems: SOURCE_LIFECYCLE_PAGE_SIZE,
      cursor: args.cursor ?? null,
    });

    let reconstructed = 0;
    let skippedNoLineage = 0;
    let skippedExisting = 0;
    const targets: string[] = [];

    for (const source of page.page) {
      if (!source.supersededBy) {
        skippedNoLineage++;
        continue;
      }

      const existing = await ctx.db
        .query("lifecycleEvents")
        .withIndex("by_target", (q: any) =>
          q.eq("targetType", "source").eq("targetId", source._id)
        )
        .first();
      if (existing) {
        skippedExisting++;
        continue;
      }

      targets.push(String(source._id));
      if (!dryRun) {
        await ctx.db.insert("lifecycleEvents", {
          projectId: source.projectId,
          targetType: "source" as const,
          targetId: source._id,
          action: "supersede" as const,
          previousStatus: "unknown",
          newStatus: source.status,
          previousReplacementId: null,
          newReplacementId: source.supersededBy,
          reason:
            source.supersedeReason ??
            "Reconstructed from row state; no reason was recorded at the time.",
          recordedAt: source.supersededAt ?? source._creationTime,
          recordedBy: "pipeline" as const,
        });
      }
      reconstructed++;
    }

    return {
      dryRun,
      pageSize: page.page.length,
      reconstructed,
      skippedNoLineage,
      skippedExisting,
      targets,
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
// Backfill denormalized project scope (Design Decision 45)
//
// Data points, position versions, secondary items, and curator observations
// now carry the project they belong to, so retrieval can filter by project at
// the vector index instead of after ranking. Rows created before this change
// have the field unset, and a vector filter cannot match an unset field, so
// until this migration runs those rows are invisible to project-filtered
// retrieval. Answers stay correct throughout, because retrieval widens to an
// unfiltered pass when the filtered one under-fills and re-filters through the
// authoritative parent lookup; recall is what degrades, not the boundary.
//
// Project derivation per table, all from an existing parent, never guessed:
//   dataPoints           parent source's projectId
//   mentalModels         parent source's projectId
//   positionVersions     position -> theme -> projectId
//   curatorObservations  first referenced data point or position that resolves
//
// An observation referencing nothing cannot be placed and is left unset. That
// is reported as `unresolvable` rather than assigned to a project, because
// putting it in the wrong project is the failure this whole decision exists to
// prevent. Unplaced observations are excluded from project-scoped retrieval.
//
// Append-only and idempotent: only rows with an unset projectId are touched,
// nothing is deleted, and the field is derived rather than invented. Pages,
// because data point and position version rows carry 1536-dimension embeddings
// and the tables cannot be collected whole under the 16 MB read budget:
//   npx convex run migrations:backfillProjectScope '{"table":"dataPoints","dryRun":true}'
//   npx convex run migrations:backfillProjectScope '{"table":"dataPoints"}'
//   npx convex run migrations:backfillProjectScope '{"table":"dataPoints","cursor":"<continueCursor>"}'
// Repeat for positionVersions, mentalModels, and curatorObservations.
//
// Check readiness at any point with projectScope:getScopeBackfillReadiness.
// ============================================================
const PROJECT_SCOPE_PAGE_SIZE = 256;

export const backfillProjectScope = mutation({
  args: {
    table: v.union(
      v.literal("dataPoints"),
      v.literal("positionVersions"),
      v.literal("curatorObservations"),
      v.literal("mentalModels")
    ),
    cursor: v.optional(v.union(v.string(), v.null())),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? false;
    const page = await ctx.db.query(args.table).paginate({
      numItems: PROJECT_SCOPE_PAGE_SIZE,
      cursor: args.cursor ?? null,
    });

    let scoped = 0;
    let alreadySet = 0;
    let unresolvable = 0;
    const unresolvableIds: string[] = [];

    // Parent lookups repeat heavily within a page (many data points share one
    // source), so they are cached for the life of the call.
    const sourceProjects = new Map<string, Id<"projects"> | null>();
    const themeProjects = new Map<string, Id<"projects"> | null>();

    const projectOfSource = async (
      sourceId: Id<"sources">
    ): Promise<Id<"projects"> | null> => {
      const key = String(sourceId);
      if (sourceProjects.has(key)) return sourceProjects.get(key) ?? null;
      const source = await ctx.db.get(sourceId);
      const projectId = source?.projectId ?? null;
      sourceProjects.set(key, projectId);
      return projectId;
    };

    const projectOfTheme = async (
      themeId: Id<"researchThemes">
    ): Promise<Id<"projects"> | null> => {
      const key = String(themeId);
      if (themeProjects.has(key)) return themeProjects.get(key) ?? null;
      const theme = await ctx.db.get(themeId);
      const projectId = theme?.projectId ?? null;
      themeProjects.set(key, projectId);
      return projectId;
    };

    const projectOfPosition = async (
      positionId: Id<"researchPositions">
    ): Promise<Id<"projects"> | null> => {
      const position = await ctx.db.get(positionId);
      if (!position) return null;
      return await projectOfTheme(position.themeId);
    };

    for (const row of page.page) {
      if ((row as { projectId?: unknown }).projectId) {
        alreadySet++;
        continue;
      }

      let projectId: Id<"projects"> | null = null;

      if (args.table === "dataPoints" || args.table === "mentalModels") {
        projectId = await projectOfSource(
          (row as Doc<"dataPoints"> | Doc<"mentalModels">).sourceId
        );
      } else if (args.table === "positionVersions") {
        projectId = await projectOfPosition(
          (row as Doc<"positionVersions">).positionId
        );
      } else {
        const obs = row as Doc<"curatorObservations">;
        for (const dataPointId of obs.referencedDataPoints ?? []) {
          const dp = await ctx.db.get(dataPointId);
          if (!dp) continue;
          projectId = dp.projectId ?? (await projectOfSource(dp.sourceId));
          if (projectId) break;
        }
        if (!projectId) {
          for (const positionId of obs.referencedPositions ?? []) {
            projectId = await projectOfPosition(positionId);
            if (projectId) break;
          }
        }
      }

      if (!projectId) {
        unresolvable++;
        unresolvableIds.push(String(row._id));
        continue;
      }

      if (!dryRun) {
        await ctx.db.patch(row._id, { projectId });
      }
      scoped++;
    }

    return {
      dryRun,
      table: args.table,
      pageSize: page.page.length,
      scoped,
      alreadySet,
      unresolvable,
      unresolvableIds,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

// ============================================================
// Run the whole project scope backfill in one call (Design Decision 45)
//
// backfillProjectScope above pages, because a mutation is one transaction with
// one read budget and these tables carry 1536-dimension embeddings. Draining it
// by hand means pasting a cursor back in for every page, which is error-prone
// and easy to abandon half done, leaving retrieval permanently in its degraded
// widened-fallback mode.
//
// An action has no such budget, because each ctx.runMutation is its own
// transaction. So this drives the same paginated mutation to completion across
// all four tables:
//   npx convex run migrations:backfillProjectScopeAll '{"dryRun":true}'
//   npx convex run migrations:backfillProjectScopeAll '{}'
//
// Table order matters. Data points are scoped first, because an observation
// with no projectId of its own resolves through a referenced data point, and
// that is the cheap path once the data point carries its own project.
//
// Same guarantees as the single-table mutation: append-only, idempotent, and
// safe to re-run. Re-running a completed backfill reports everything as
// alreadySet and writes nothing.
// ============================================================
const PROJECT_SCOPE_MAX_PAGES = 500;

const PROJECT_SCOPE_TABLES = [
  "dataPoints",
  "positionVersions",
  "mentalModels",
  "curatorObservations",
] as const;

export const backfillProjectScopeAll = action({
  args: {
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? false;
    const tables: Array<Record<string, unknown>> = [];
    let totalScoped = 0;
    let totalUnresolvable = 0;

    for (const table of PROJECT_SCOPE_TABLES) {
      let cursor: string | null = null;
      let pages = 0;
      let scoped = 0;
      let alreadySet = 0;
      let unresolvable = 0;
      let rowsSeen = 0;
      let complete = false;
      const unresolvableIds: string[] = [];

      while (pages < PROJECT_SCOPE_MAX_PAGES) {
        const page: {
          pageSize: number;
          scoped: number;
          alreadySet: number;
          unresolvable: number;
          unresolvableIds: string[];
          isDone: boolean;
          continueCursor: string;
        } = await ctx.runMutation(api.migrations.backfillProjectScope, {
          table,
          cursor,
          dryRun,
        });

        pages += 1;
        rowsSeen += page.pageSize;
        scoped += page.scoped;
        alreadySet += page.alreadySet;
        unresolvable += page.unresolvable;
        unresolvableIds.push(...page.unresolvableIds);

        if (page.isDone) {
          complete = true;
          break;
        }
        cursor = page.continueCursor;
      }

      totalScoped += scoped;
      totalUnresolvable += unresolvable;

      tables.push({
        table,
        pages,
        rowsSeen,
        scoped,
        alreadySet,
        unresolvable,
        // Capped so one badly linked table cannot flood the response. The count
        // above stays exact.
        unresolvableIds: unresolvableIds.slice(0, 25),
        complete,
      });
    }

    return {
      dryRun,
      tables,
      totalScoped,
      totalUnresolvable,
      // The one line worth reading. Retrieval filters by project at the vector
      // index, so anything left unscoped stays reachable only through the
      // widened fallback pass.
      summary: dryRun
        ? `Dry run: ${totalScoped} row(s) would be scoped, ${totalUnresolvable} could not be resolved.`
        : `${totalScoped} row(s) scoped, ${totalUnresolvable} could not be resolved.`,
    };
  },
});

// ============================================================
// Place observations the backfill could not resolve (Design Decision 45)
//
// An observation that references no data point and no position has nothing to
// derive a project from, so backfillProjectScope reports it as unresolvable
// rather than guessing. Guessing is the failure that decision exists to
// prevent. Placing it is a curator judgment, so it needs an explicit call.
//
//   npx convex run migrations:assignObservationProject '{"projectId":"...","observationIds":["..."],"dryRun":true}'
//
// Write-once on purpose, unlike the reversible lifecycle decisions of Decision
// 44. An observation already carrying a projectId is reported as skipped, never
// repointed. Which project an observation belongs to is scope, not
// classification: nothing about six months of use suggests an observation
// changes project, and silently moving evidence between projects is precisely
// the failure being designed against. If one genuinely needs to move, that
// should be a deliberate, separately named operation rather than a side effect
// of a backfill helper.
// ============================================================
export const assignObservationProject = mutation({
  args: {
    projectId: v.id("projects"),
    observationIds: v.array(v.id("curatorObservations")),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? false;

    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error(`Project ${args.projectId} not found`);
    }

    const assigned: string[] = [];
    const skippedAlreadyScoped: Array<{ id: string; projectId: string }> = [];
    const missing: string[] = [];

    for (const observationId of args.observationIds) {
      const obs = await ctx.db.get(observationId);
      if (!obs) {
        missing.push(String(observationId));
        continue;
      }
      if (obs.projectId) {
        skippedAlreadyScoped.push({
          id: String(observationId),
          projectId: String(obs.projectId),
        });
        continue;
      }
      if (!dryRun) {
        await ctx.db.patch(observationId, { projectId: args.projectId });
      }
      assigned.push(String(observationId));
    }

    return {
      dryRun,
      projectId: String(args.projectId),
      projectName: project.name,
      assigned: assigned.length,
      assignedIds: assigned,
      skippedAlreadyScoped,
      missing,
    };
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
