import { v } from "convex/values";
import { action, query } from "./_generated/server";
import { api } from "./_generated/api";

declare const process: {
  env: Record<string, string | undefined>;
};

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
    filterByEvidenceType: v.optional(v.string()),
    filterByConfidence: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<SearchEntityResult[]> => {
    const limit = args.limit ?? 10;

    // Generate embedding for the query
    const embedding = await generateEmbedding(args.queryText);

    // Build filter if provided
    const filter: Record<string, any> = {};
    if (args.filterByEvidenceType) {
      filter.evidenceType = args.filterByEvidenceType;
    }
    if (args.filterByConfidence) {
      filter.confidence = args.filterByConfidence;
    }

    // Vector search
    const results = await ctx.vectorSearch("dataPoints", "by_embedding", {
      vector: embedding,
      limit,
      filter:
        Object.keys(filter).length > 0
          ? (Object.entries(filter).map(([field, value]) => ({
              path: field,
              operator: "eq" as const,
              value,
            })) as any)
          : undefined,
    });

    // Hydrate results with full data
    const hydrated: Array<SearchEntityResult | null> = await Promise.all(
      results.map(async (result) => {
        const dp = (await ctx.runQuery(api.dataPoints.getDataPoint, {
          dataPointId: result._id,
        })) as Record<string, unknown> | null;
        return {
          ...dp,
          _score: result._score,
        };
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
  },
  handler: async (ctx, args): Promise<SearchEntityResult[]> => {
    const limit = args.limit ?? 10;
    const embedding = await generateEmbedding(args.queryText);

    const results = await ctx.vectorSearch(
      "positionVersions",
      "by_embedding",
      {
        vector: embedding,
        limit,
      }
    );

    // Hydrate with position context
    const hydrated: Array<SearchEntityResult | null> = await Promise.all(
      results.map(async (result) => {
        const version = (await ctx.runQuery(
          api.search.getPositionVersionById,
          { versionId: result._id }
        )) as Record<string, unknown> | null;
        return {
          ...version,
          _score: result._score,
        };
      })
    );

    return hydrated.filter(isSearchEntityResult);
  },
});

// ============================================================
// Vector search across curator observations
// ============================================================
export const searchObservations = action({
  args: {
    queryText: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<SearchEntityResult[]> => {
    const limit = args.limit ?? 10;
    const embedding = await generateEmbedding(args.queryText);

    const results = await ctx.vectorSearch(
      "curatorObservations",
      "by_embedding",
      {
        vector: embedding,
        limit,
      }
    );

    const hydrated: Array<SearchEntityResult | null> = await Promise.all(
      results.map(async (result) => {
        const obs = (await ctx.runQuery(api.observations.getObservation, {
          observationId: result._id,
        })) as Record<string, unknown> | null;
        return {
          ...obs,
          _score: result._score,
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
  },
  handler: async (ctx, args): Promise<SearchEntityResult[]> => {
    const limit = args.limit ?? 10;
    const embedding = await generateEmbedding(args.queryText);

    const results = await ctx.vectorSearch("mentalModels", "by_embedding", {
      vector: embedding,
      limit,
    });

    const hydrated: Array<SearchEntityResult | null> = await Promise.all(
      results.map(async (result) => {
        const model = (await ctx.runQuery(api.mentalModels.getMentalModel, {
          mentalModelId: result._id,
        })) as Record<string, unknown> | null;
        return {
          ...model,
          _score: result._score,
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
  },
  handler: async (ctx, args): Promise<SearchKnowledgeBaseResult> => {
    const limitPerType = args.limit ?? 5;

    // Search all entity types in parallel
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
        }),
        ctx.runAction(api.search.searchPositions, {
          queryText: args.queryText,
          limit: limitPerType,
        }),
        ctx.runAction(api.search.searchObservations, {
          queryText: args.queryText,
          limit: limitPerType,
        }),
        ctx.runAction(api.search.searchMentalModels, {
          queryText: args.queryText,
          limit: limitPerType,
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
      positionTitle: position?.title,
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
