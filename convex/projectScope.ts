import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

/**
 * Project boundary enforcement for retrieval (Decision 45).
 *
 * Every project-scoped read path funnels its candidate ids through this module
 * before anything is hydrated, composed, or cited. Retrieval filters by project
 * at the vector index for speed; these queries are what make the boundary
 * actually true, because a vector filter can only be trusted once the
 * denormalized `projectId` is on every row.
 *
 * Resolution order per entity, cheapest first:
 *
 *   data point      row projectId, else the parent source's projectId
 *   secondary item  row projectId, else the parent source's projectId
 *   position        the position's theme's projectId (themes are small; no
 *                   denormalization needed on the position identity row)
 *   observation     row projectId, else a referenced data point's project,
 *                   else a referenced position's project
 *
 * The denormalized field is preferred over the parent lookup rather than
 * verified against it. It is derived from the parent at insert and can never
 * drift: a data point cannot change source and a source cannot change project.
 * Preferring it means a fully backfilled deployment pays zero source reads on
 * the hot path, which matters because source rows carry full text.
 *
 * An id whose project cannot be resolved is reported as unresolved and
 * excluded. Excluding is the safe direction: including an unplaceable record
 * is exactly the failure this module exists to prevent.
 */

/**
 * Ceiling on ids accepted per call, so one oversized retrieval cannot blow the
 * 16 MB per-query read budget. Retrieval over-fetches at most a few hundred
 * candidates, well inside this.
 */
const MAX_IDS_PER_CALL = 256;

/**
 * Ceiling on distinct parent-source reads per call. Only reached before the
 * backfill has run, since a backfilled row needs no source lookup at all.
 * Source rows carry `fullText`, so this is the one read that can be large.
 */
const MAX_SOURCE_LOOKUPS_PER_CALL = 64;

export interface ScopeFilterResult {
  kept: string[];
  dropped: string[];
  unresolved: string[];
  /** True when the source-lookup ceiling stopped resolution short. */
  truncated: boolean;
}

function emptyResult(): ScopeFilterResult {
  return { kept: [], dropped: [], unresolved: [], truncated: false };
}

/**
 * Resolves parent projects with a per-call cache, so a batch of data points
 * extracted from the same source costs one source read rather than one each.
 */
class ProjectResolver {
  private readonly sources = new Map<string, Id<"projects"> | null>();
  private readonly themes = new Map<string, Id<"projects"> | null>();
  private sourceLookups = 0;
  truncated = false;

  constructor(private readonly ctx: QueryCtx) {}

  async projectForSource(
    sourceId: Id<"sources">
  ): Promise<Id<"projects"> | null> {
    const key = String(sourceId);
    const cached = this.sources.get(key);
    if (cached !== undefined) return cached;

    if (this.sourceLookups >= MAX_SOURCE_LOOKUPS_PER_CALL) {
      this.truncated = true;
      return null;
    }

    this.sourceLookups += 1;
    const source = await this.ctx.db.get(sourceId);
    const projectId = source?.projectId ?? null;
    this.sources.set(key, projectId);
    return projectId;
  }

  async projectForTheme(
    themeId: Id<"researchThemes">
  ): Promise<Id<"projects"> | null> {
    const key = String(themeId);
    const cached = this.themes.get(key);
    if (cached !== undefined) return cached;

    const theme = await this.ctx.db.get(themeId);
    const projectId = theme?.projectId ?? null;
    this.themes.set(key, projectId);
    return projectId;
  }

  async projectForDataPoint(
    dp: Doc<"dataPoints">
  ): Promise<Id<"projects"> | null> {
    return dp.projectId ?? (await this.projectForSource(dp.sourceId));
  }

  async projectForPosition(
    position: Doc<"researchPositions">
  ): Promise<Id<"projects"> | null> {
    return await this.projectForTheme(position.themeId);
  }

  async projectForMentalModel(
    model: Doc<"mentalModels">
  ): Promise<Id<"projects"> | null> {
    return model.projectId ?? (await this.projectForSource(model.sourceId));
  }

  /**
   * An observation has no parent record, so its project comes from the field
   * when set and otherwise from the first reference that resolves. Referenced
   * data points are tried before positions because they are the cheaper lookup
   * once the data point carries its own projectId.
   */
  async projectForObservation(
    obs: Doc<"curatorObservations">
  ): Promise<Id<"projects"> | null> {
    if (obs.projectId) return obs.projectId;

    for (const dataPointId of obs.referencedDataPoints ?? []) {
      const dp = await this.ctx.db.get(dataPointId);
      if (!dp) continue;
      const projectId = await this.projectForDataPoint(dp);
      if (projectId) return projectId;
    }

    for (const positionId of obs.referencedPositions ?? []) {
      const position = await this.ctx.db.get(positionId);
      if (!position) continue;
      const projectId = await this.projectForPosition(position);
      if (projectId) return projectId;
    }

    return null;
  }
}

/**
 * Shared partition step. A missing row is reported as unresolved rather than
 * dropped, because "this id does not exist" and "this id belongs to someone
 * else" are different problems and only the second one is a boundary event.
 */
async function partition<T extends { _id: unknown }>(
  ids: readonly string[],
  projectId: Id<"projects">,
  resolver: ProjectResolver,
  load: (id: string) => Promise<T | null>,
  projectOf: (row: T) => Promise<Id<"projects"> | null>
): Promise<ScopeFilterResult> {
  const result = emptyResult();

  for (const id of ids.slice(0, MAX_IDS_PER_CALL)) {
    const row = await load(id);
    if (!row) {
      result.unresolved.push(id);
      continue;
    }

    const owner = await projectOf(row);
    if (!owner) {
      result.unresolved.push(id);
      continue;
    }

    if (String(owner) === String(projectId)) {
      result.kept.push(id);
    } else {
      result.dropped.push(id);
    }
  }

  if (ids.length > MAX_IDS_PER_CALL) result.truncated = true;
  result.truncated = result.truncated || resolver.truncated;
  return result;
}

/**
 * Load a row by raw id string. An id that does not parse for this table is
 * reported as unresolved rather than thrown, so one malformed id in a batch
 * cannot fail the whole retrieval.
 */
function loader<T extends "dataPoints" | "researchPositions" | "curatorObservations" | "mentalModels">(
  ctx: QueryCtx,
  table: T
) {
  return async (id: string) => {
    const normalized = ctx.db.normalizeId(table, id);
    return normalized ? await ctx.db.get(normalized) : null;
  };
}

export const filterDataPointIds = query({
  args: {
    projectId: v.id("projects"),
    dataPointIds: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<ScopeFilterResult> => {
    const resolver = new ProjectResolver(ctx);
    return await partition(
      args.dataPointIds,
      args.projectId,
      resolver,
      loader(ctx, "dataPoints"),
      (dp) => resolver.projectForDataPoint(dp)
    );
  },
});

export const filterPositionIds = query({
  args: {
    projectId: v.id("projects"),
    positionIds: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<ScopeFilterResult> => {
    const resolver = new ProjectResolver(ctx);
    return await partition(
      args.positionIds,
      args.projectId,
      resolver,
      loader(ctx, "researchPositions"),
      (position) => resolver.projectForPosition(position)
    );
  },
});

export const filterObservationIds = query({
  args: {
    projectId: v.id("projects"),
    observationIds: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<ScopeFilterResult> => {
    const resolver = new ProjectResolver(ctx);
    return await partition(
      args.observationIds,
      args.projectId,
      resolver,
      loader(ctx, "curatorObservations"),
      (obs) => resolver.projectForObservation(obs)
    );
  },
});

export const filterMentalModelIds = query({
  args: {
    projectId: v.id("projects"),
    mentalModelIds: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<ScopeFilterResult> => {
    const resolver = new ProjectResolver(ctx);
    return await partition(
      args.mentalModelIds,
      args.projectId,
      resolver,
      loader(ctx, "mentalModels"),
      (model) => resolver.projectForMentalModel(model)
    );
  },
});

/**
 * Check that a narrower scope argument belongs to the project being queried.
 *
 * Without this, passing a theme, position, or source id from another project
 * builds an allow-list of that project's evidence, which the hydration filter
 * then empties out. The answer comes back with no evidence and no explanation.
 * Reporting the mismatch turns a confusing empty answer into a stated one.
 */
export const checkScopeOwnership = query({
  args: {
    projectId: v.id("projects"),
    themeId: v.optional(v.id("researchThemes")),
    positionId: v.optional(v.id("researchPositions")),
    sourceId: v.optional(v.id("sources")),
  },
  handler: async (ctx, args) => {
    const resolver = new ProjectResolver(ctx);
    const belongs = (owner: Id<"projects"> | null | undefined) =>
      Boolean(owner) && String(owner) === String(args.projectId);

    const theme = args.themeId ? await ctx.db.get(args.themeId) : null;
    const position = args.positionId ? await ctx.db.get(args.positionId) : null;
    const source = args.sourceId ? await ctx.db.get(args.sourceId) : null;

    return {
      themeInProject: args.themeId ? belongs(theme?.projectId) : true,
      positionInProject: args.positionId
        ? belongs(position ? await resolver.projectForPosition(position) : null)
        : true,
      sourceInProject: args.sourceId ? belongs(source?.projectId) : true,
    };
  },
});

/**
 * Readiness report for the denormalized `projectId` fields.
 *
 * Retrieval filters at the vector index, and a vector filter cannot match a row
 * where the field is unset, so this is how the curator checks whether
 * `migrations:backfillProjectScope` still has work left before trusting recall.
 * Pages like the migrations themselves, since data point and position version
 * rows carry 1536-dimension embeddings.
 */
const READINESS_PAGE_SIZE = 256;

export const getScopeBackfillReadiness = query({
  args: {
    table: v.union(
      v.literal("dataPoints"),
      v.literal("positionVersions"),
      v.literal("curatorObservations"),
      v.literal("mentalModels")
    ),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db.query(args.table).paginate({
      numItems: READINESS_PAGE_SIZE,
      cursor: args.cursor ?? null,
    });

    let scoped = 0;
    let missingProjectId = 0;
    for (const row of page.page) {
      if ((row as { projectId?: unknown }).projectId) scoped++;
      else missingProjectId++;
    }

    return {
      table: args.table,
      pageSize: page.page.length,
      scoped,
      missingProjectId,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});
