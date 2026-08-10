import { v } from "convex/values";
import { action, query, type ActionCtx } from "./_generated/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { isLiveDataPoint } from "./lib/supersede";
import { mergeRankedIds, shouldWidenRetrieval } from "./lib/projectScope";

declare const process: {
  env: Record<string, string | undefined>;
};

/**
 * Rank ids from a vector index, scoped to one project (Decision 45).
 *
 * Two passes, because the vector filter can only match rows whose denormalized
 * `projectId` is set. The filtered pass is the fast path and the one whose
 * ranking is known to be about this project. If it under-fills, a second
 * unfiltered pass widens the candidate pool and the caller re-filters
 * authoritatively through convex/projectScope.ts, so widening can never leak.
 *
 * Passing no projectId keeps the old unscoped behavior, which is what the
 * embedding backfill jobs and other project-agnostic callers want.
 */
type ScopedVectorTable =
  | "dataPoints"
  | "positionVersions"
  | "curatorObservations"
  | "mentalModels";

export interface RankedIds {
  ids: string[];
  /** Similarity score per id, so hydration can carry _score through. */
  scores: Map<string, number>;
  /**
   * Ids the project-filtered pass returned on its own. Callers compare their
   * final selection against this to tell whether the widened pass actually
   * contributed anything, which is the only reliable signal that a row in this
   * project is missing its denormalized projectId. The bare fact that widening
   * ran is not that signal: a project holding fewer rows than the requested
   * limit under-fills on every query no matter how complete the backfill is.
   */
  filteredIds: string[];
  /** True when the filtered pass under-filled and an unfiltered pass ran. */
  widened: boolean;
}

export async function rankedIdsForProject(
  ctx: ActionCtx,
  table: ScopedVectorTable,
  vector: number[],
  limit: number,
  projectId?: Id<"projects">
): Promise<RankedIds> {
  // The vectorSearch signature is specialized per table name; this helper is
  // deliberately generic over the four tables that carry a projectId filter
  // field, so the table argument is passed through untyped.
  const search = (extra: Record<string, unknown>) =>
    (ctx.vectorSearch as any)(table, "by_embedding", {
      vector,
      limit,
      ...extra,
    }) as Promise<Array<{ _id: unknown; _score: number }>>;

  const scores = new Map<string, number>();
  const collect = (rows: Array<{ _id: unknown; _score: number }>): string[] =>
    rows.map((row) => {
      const id = String(row._id);
      if (!scores.has(id)) scores.set(id, row._score);
      return id;
    });

  if (!projectId) {
    const unscoped = collect(await search({}));
    return { ids: unscoped, scores, filteredIds: unscoped, widened: false };
  }

  const scopedIds = collect(
    await search({ filter: (q: any) => q.eq("projectId", projectId) })
  );

  if (!shouldWidenRetrieval(scopedIds.length, limit)) {
    return { ids: scopedIds, scores, filteredIds: scopedIds, widened: false };
  }

  const merged = mergeRankedIds(scopedIds, collect(await search({})));

  return {
    ids: merged,
    scores,
    filteredIds: scopedIds,
    widened: merged.length > scopedIds.length,
  };
}

type SearchEntityResult = Record<string, unknown> & { _score: number };
type SearchKnowledgeBaseResult = {
  dataPoints: SearchEntityResult[];
  positions: SearchEntityResult[];
  observations: SearchEntityResult[];
  mentalModels: SearchEntityResult[];
};

function isSearchEntityResult(
  value: SearchEntityResult | null
): value is SearchEntityResult {
  return value !== null;
}

// ============================================================
// Vector search across data points
// This is an action because it calls the OpenAI API for embedding
// ============================================================
export const searchDataPoints = action({
  args: {
    queryText: v.string(),
    limit: v.optional(v.number()),
    projectId: v.optional(v.id("projects")),
    filterByEvidenceType: v.optional(v.string()),
    filterByConfidence: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<SearchEntityResult[]> => {
    const limit = args.limit ?? 10;

    // Generate embedding for the query
    const embedding = await generateEmbedding(args.queryText);

    const { ids, scores } = await rankedIdsForProject(
      ctx,
      "dataPoints",
      embedding,
      limit,
      args.projectId
    );

    // Enforce the project boundary before hydrating anything (Decision 45).
    const scopedIds = args.projectId
      ? (
          (await ctx.runQuery(api.projectScope.filterDataPointIds, {
            projectId: args.projectId,
            dataPointIds: ids,
          })) as { kept: string[] }
        ).kept
      : ids;

    // Hydrate results with full data. Superseded/retired data points are
    // excluded from exploration results (Decision 38); the vector search
    // over-fetches, so dropping them post-hydration is safe.
    //
    // evidenceType and confidence are applied here rather than as vector index
    // filters. A Convex vector filter supports only eq and or, never and, so
    // two field filters cannot be combined at the index; the project filter is
    // the one that has to be enforced there.
    const hydrated: Array<SearchEntityResult | null> = await Promise.all(
      scopedIds.map(async (id) => {
        const dp = (await ctx.runQuery(api.dataPoints.getDataPoint, {
          dataPointId: id as Id<"dataPoints">,
        })) as Record<string, unknown> | null;
        if (!dp || !isLiveDataPoint(dp)) return null;
        if (
          args.filterByEvidenceType &&
          dp.evidenceType !== args.filterByEvidenceType
        ) {
          return null;
        }
        if (args.filterByConfidence && dp.confidence !== args.filterByConfidence) {
          return null;
        }
        return { ...dp, _score: scores.get(id) ?? 0 };
      })
    );

    return hydrated.filter(isSearchEntityResult);
  },
});

// ============================================================
// Vector search across position versions
// ============================================================
export const searchPositions = action({
  args: {
    queryText: v.string(),
    limit: v.optional(v.number()),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args): Promise<SearchEntityResult[]> => {
    const limit = args.limit ?? 10;
    const embedding = await generateEmbedding(args.queryText);

    const { ids, scores } = await rankedIdsForProject(
      ctx,
      "positionVersions",
      embedding,
      limit,
      args.projectId
    );

    // Hydrate with position context, then enforce the project boundary on the
    // parent position (Decision 45). Filtering after hydration rather than
    // before is what lets one query cover both the denormalized field and the
    // authoritative theme lookup.
    const hydrated: Array<SearchEntityResult | null> = await Promise.all(
      ids.map(async (id) => {
        const version = (await ctx.runQuery(
          api.search.getPositionVersionById,
          { versionId: id as Id<"positionVersions"> }
        )) as Record<string, unknown> | null;
        if (!version) return null;
        return {
          ...version,
          _score: scores.get(id) ?? 0,
        };
      })
    );

    const versions = hydrated.filter(isSearchEntityResult);
    if (!args.projectId) return versions;

    const scoped = (await ctx.runQuery(api.projectScope.filterPositionIds, {
      projectId: args.projectId,
      positionIds: versions.map((version) => String(version.positionId)),
    })) as { kept: string[] };
    const keptPositions = new Set(scoped.kept);

    return versions.filter((version) =>
      keptPositions.has(String(version.positionId))
    );
  },
});

// ============================================================
// Vector search across curator observations
// ============================================================
export const searchObservations = action({
  args: {
    queryText: v.string(),
    limit: v.optional(v.number()),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args): Promise<SearchEntityResult[]> => {
    const limit = args.limit ?? 10;
    const embedding = await generateEmbedding(args.queryText);

    const { ids, scores } = await rankedIdsForProject(
      ctx,
      "curatorObservations",
      embedding,
      limit,
      args.projectId
    );

    // An observation has no parent record, so the boundary check resolves it
    // through its own projectId or its references (Decision 45).
    const scopedIds = args.projectId
      ? (
          (await ctx.runQuery(api.projectScope.filterObservationIds, {
            projectId: args.projectId,
            observationIds: ids,
          })) as { kept: string[] }
        ).kept
      : ids;

    const hydrated: Array<SearchEntityResult | null> = await Promise.all(
      scopedIds.map(async (id) => {
        const obs = (await ctx.runQuery(api.observations.getObservation, {
          observationId: id as Id<"curatorObservations">,
        })) as Record<string, unknown> | null;
        if (!obs) return null;
        return {
          ...obs,
          _score: scores.get(id) ?? 0,
        };
      })
    );

    return hydrated.filter(isSearchEntityResult);
  },
});

// ============================================================
// Vector search across mental models
// ============================================================
export const searchMentalModels = action({
  args: {
    queryText: v.string(),
    limit: v.optional(v.number()),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args): Promise<SearchEntityResult[]> => {
    const limit = args.limit ?? 10;
    const embedding = await generateEmbedding(args.queryText);

    const { ids, scores } = await rankedIdsForProject(
      ctx,
      "mentalModels",
      embedding,
      limit,
      args.projectId
    );

    const scopedIds = args.projectId
      ? (
          (await ctx.runQuery(api.projectScope.filterMentalModelIds, {
            projectId: args.projectId,
            mentalModelIds: ids,
          })) as { kept: string[] }
        ).kept
      : ids;

    const hydrated: Array<SearchEntityResult | null> = await Promise.all(
      scopedIds.map(async (id) => {
        const model = (await ctx.runQuery(api.mentalModels.getMentalModel, {
          mentalModelId: id as Id<"mentalModels">,
        })) as Record<string, unknown> | null;
        if (!model) return null;
        return {
          ...model,
          _score: scores.get(id) ?? 0,
        };
      })
    );

    return hydrated.filter(isSearchEntityResult);
  },
});

// ============================================================
// Unified search across all entity types
// Returns results from data points, positions, observations,
// and mental models, sorted by relevance
// ============================================================
export const searchKnowledgeBase = action({
  args: {
    queryText: v.string(),
    limit: v.optional(v.number()),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args): Promise<SearchKnowledgeBaseResult> => {
    const limitPerType = args.limit ?? 5;

    // Search all entity types in parallel, each scoped to the project when one
    // was supplied (Decision 45). Exploration without a project stays possible
    // and is now an explicit choice rather than the only available behavior.
    const [dataPoints, positions, observations, mentalModels]: [
      SearchEntityResult[],
      SearchEntityResult[],
      SearchEntityResult[],
      SearchEntityResult[],
    ] =
      await Promise.all([
        ctx.runAction(api.search.searchDataPoints, {
          queryText: args.queryText,
          limit: limitPerType,
          projectId: args.projectId,
        }),
        ctx.runAction(api.search.searchPositions, {
          queryText: args.queryText,
          limit: limitPerType,
          projectId: args.projectId,
        }),
        ctx.runAction(api.search.searchObservations, {
          queryText: args.queryText,
          limit: limitPerType,
          projectId: args.projectId,
        }),
        ctx.runAction(api.search.searchMentalModels, {
          queryText: args.queryText,
          limit: limitPerType,
          projectId: args.projectId,
        }),
      ]);

    return {
      dataPoints,
      positions,
      observations,
      mentalModels,
    };
  },
});

// ============================================================
// Helper query: get a position version by ID (for search hydration)
// ============================================================
export const getPositionVersionById = query({
  args: { versionId: v.id("positionVersions") },
  handler: async (ctx, args) => {
    const version = await ctx.db.get(args.versionId);
    if (!version) return null;

    const position = await ctx.db.get(version.positionId);
    const theme = position ? await ctx.db.get(position.themeId) : null;

    return {
      ...version,
      positionId: version.positionId,
      positionTitle: position?.title,
      themeId: position?.themeId,
      themeTitle: theme?.title,
    };
  },
});

// ============================================================
// Helper: Generate embedding via OpenAI API
// ============================================================
async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${error}`);
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>;
  };
  return data.data[0].embedding;
}
