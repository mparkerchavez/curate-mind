/**
 * Query tools for Curate Mind MCP.
 *
 * These tools support the Analyst persona for querying the knowledge base
 * with progressive disclosure (Layer 1-4):
 * - cm_get_themes: Layer 1 — themes with position counts
 * - cm_get_positions: Layer 1 — positions within a theme
 * - cm_get_position_detail: Layer 2 — full evidence chain
 * - cm_get_data_point: Layer 3 — includes anchor quote
 * - cm_get_source_text: Layer 4 — full source text
 * - cm_search: Semantic search across all entity types
 * - cm_get_tag_trends: Tag usage counts
 * - cm_get_position_history: Version history
 * - cm_list_sources: List sources by status
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { api, asId, convexAction, convexQuery } from "../lib/convex-client.js";

const CHARACTER_LIMIT = 25000;

type SourceListItem = typeof api.sources.listAll["_returnType"][number];
type TagLookupResult = typeof api.tags.getTagBySlug["_returnType"];
type DataPointsByTagResult = typeof api.tags.getDataPointsByTag["_returnType"];

function truncateIfNeeded(text: string): string {
  if (text.length > CHARACTER_LIMIT) {
    return (
      text.slice(0, CHARACTER_LIMIT) +
      "\n\n[Response truncated. Use more specific queries or filters to see full results.]"
    );
  }
  return text;
}

export function registerQueryTools(server: McpServer): void {
  // ============================================================
  // cm_get_themes — Layer 1
  // ============================================================
  server.registerTool(
    "cm_get_themes",
    {
      title: "Get Research Themes",
      description:
        "List all Research Themes with position counts for a project. This is " +
        "the top level of progressive disclosure (Layer 1).\n\n" +
        "Args:\n" +
        "  - projectId (string): The project to list themes for\n\n" +
        "Returns: All themes with their titles, descriptions, and number of positions.",
      inputSchema: {
        projectId: z.string().describe("Project ID to list themes for"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ projectId }) => {
      try {
        const themes = await convexQuery(api.positions.getThemes, {
          projectId: asId<"projects">(projectId),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(themes, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ============================================================
  // cm_get_positions — Layer 1
  // ============================================================
  server.registerTool(
    "cm_get_positions",
    {
      title: "Get Research Positions",
      description:
        "List positions within a theme, or all positions. Returns current stance, " +
        "confidence, and status for each (Layer 1).\n\n" +
        "Args:\n" +
        "  - themeId (string, optional): Filter to positions in this theme\n\n" +
        "Returns: Positions with current version summary.",
      inputSchema: {
        themeId: z.string().optional()
          .describe("Theme ID to filter by (omit for all positions)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ themeId }) => {
      try {
        let positions;
        if (themeId) {
          positions = await convexQuery(api.positions.getPositionsByTheme, {
            themeId: asId<"researchThemes">(themeId),
          });
        } else {
          positions = await convexQuery(api.positions.listAllPositions);
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(positions, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ============================================================
  // cm_get_position_detail — Layer 2
  // ============================================================
  server.registerTool(
    "cm_get_position_detail",
    {
      title: "Get Position Detail",
      description:
        "Get a Research Position with its full evidence chain (Layer 2): " +
        "supporting evidence, counter evidence, curator observations, mental " +
        "models, and open questions.\n\n" +
        "Args:\n" +
        "  - positionId (string): The position to get detail for\n\n" +
        "Returns: Position with all linked evidence.",
      inputSchema: {
        positionId: z.string().describe("The position ID"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ positionId }) => {
      try {
        const detail = await convexQuery(api.positions.getPositionDetail, {
          positionId: asId<"researchPositions">(positionId),
        });

        if (!detail) {
          return {
            content: [
              { type: "text" as const, text: `Position ${positionId} not found.` },
            ],
          };
        }

        const text = truncateIfNeeded(JSON.stringify(detail, null, 2));
        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ============================================================
  // cm_get_data_point — Layer 3 (includes anchor quote)
  // ============================================================
  server.registerTool(
    "cm_get_data_point",
    {
      title: "Get Data Point Detail",
      description:
        "Get a single data point with full context including the verbatim " +
        "anchor quote (Layer 3 — Analyst only). Includes source metadata and tags.\n\n" +
        "Args:\n" +
        "  - dataPointId (string): The data point ID\n\n" +
        "Returns: Data point with anchor quote, source info, and tags.",
      inputSchema: {
        dataPointId: z.string().describe("The data point ID"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ dataPointId }) => {
      try {
        const dp = await convexQuery(api.dataPoints.getDataPoint, {
          dataPointId: asId<"dataPoints">(dataPointId),
        });

        if (!dp) {
          return {
            content: [
              { type: "text" as const, text: `Data point ${dataPointId} not found.` },
            ],
          };
        }

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(dp, null, 2) },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ============================================================
  // cm_get_source_text — Layer 4 (full source text)
  // ============================================================
  server.registerTool(
    "cm_get_source_text",
    {
      title: "Get Source Full Text",
      description:
        "Get the full text of a source (Layer 4 — Analyst only). Use when " +
        "you need the complete context beyond what was extracted.\n\n" +
        "Args:\n" +
        "  - sourceId (string): The source ID\n\n" +
        "Returns: Full source text and metadata.",
      inputSchema: {
        sourceId: z.string().describe("The source ID"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ sourceId }) => {
      try {
        const source = await convexQuery(api.sources.getSourceWithFullText, {
          sourceId: asId<"sources">(sourceId),
        });

        if (!source) {
          return {
            content: [
              { type: "text" as const, text: `Source ${sourceId} not found.` },
            ],
          };
        }

        const text = truncateIfNeeded(JSON.stringify(source, null, 2));
        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ============================================================
  // cm_search — Semantic search across all entity types
  // ============================================================
  server.registerTool(
    "cm_search",
    {
      title: "Search Knowledge Base",
      description:
        "Semantic vector search across data points, positions, observations, " +
        "and mental models. Uses OpenAI embeddings for similarity matching.\n\n" +
        "Args:\n" +
        "  - queryText (string): What to search for\n" +
        "  - limit (number, optional): Max results per entity type (default 5)\n\n" +
        "Returns: Matching results from all entity types, ranked by relevance.",
      inputSchema: {
        queryText: z.string().min(1).describe("What to search for"),
        limit: z.number().int().min(1).max(20).optional()
          .describe("Max results per entity type (default 5)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ queryText, limit }) => {
      try {
        const results = await convexAction(api.search.searchKnowledgeBase, {
          queryText,
          limit: limit ?? 5,
        });

        const text = truncateIfNeeded(JSON.stringify(results, null, 2));
        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error searching: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ============================================================
  // cm_get_tag_trends — Tag usage counts
  // ============================================================
  server.registerTool(
    "cm_get_tag_trends",
    {
      title: "Get Tag Trends",
      description:
        "Get tag usage counts across all data points. Shows which topics " +
        "have the most evidence, useful for spotting emerging trends.\n\n" +
        "Returns: Tags sorted by data point count (most used first).",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const trends = await convexQuery(api.tags.getTagUsageCounts);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(trends, null, 2) },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ============================================================
  // cm_get_position_history — Version history
  // ============================================================
  server.registerTool(
    "cm_get_position_history",
    {
      title: "Get Position History",
      description:
        "Get the full version history of a Research Position. Shows how the " +
        "position has evolved over time, including change summaries.\n\n" +
        "Args:\n" +
        "  - positionId (string): The position ID\n\n" +
        "Returns: All versions with diffs and change summaries.",
      inputSchema: {
        positionId: z.string().describe("The position ID"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ positionId }) => {
      try {
        const history = await convexQuery(api.positions.getPositionHistory, {
          positionId: asId<"researchPositions">(positionId),
        });

        if (!history) {
          return {
            content: [
              { type: "text" as const, text: `Position ${positionId} not found.` },
            ],
          };
        }

        const text = truncateIfNeeded(JSON.stringify(history, null, 2));
        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ============================================================
  // cm_list_sources — List sources by status
  // ============================================================
  server.registerTool(
    "cm_list_sources",
    {
      title: "List Sources",
      description:
        "List sources, optionally filtered by pipeline status.\n\n" +
        "Args:\n" +
        "  - status (string, optional): Filter by status (indexed, extracted, failed). Omit for all.\n\n" +
        "Returns: Source metadata (without full text).",
      inputSchema: {
        projectId: z.string().describe("Project ID to list sources for"),
        status: z.enum(["indexed", "extracted", "failed"]).optional()
          .describe("Filter by pipeline status (omit for all)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ projectId, status }) => {
      try {
        let sources: SourceListItem[];
        if (status) {
          sources = await convexQuery(api.sources.listByStatus, {
            projectId: asId<"projects">(projectId),
            status,
          });
        } else {
          sources = await convexQuery(api.sources.listAll, {
            projectId: asId<"projects">(projectId),
          });
        }

        // Return compact format to avoid truncation: one line per source
        const lines = sources.map(
          (source) =>
            `${source._id} | ${source.title} | ${source.wordCount || "?"} words | ${source.publisherName || "?"} | tier ${source.tier || "?"}`
        );
        const text = `Found ${sources.length} sources:\n` + lines.join("\n");
        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ============================================================
  // cm_get_research_lens — Get the current Research Lens
  // ============================================================
  server.registerTool(
    "cm_get_research_lens",
    {
      title: "Get Current Research Lens",
      description:
        "Get the most recent Research Lens for a project — a compressed snapshot " +
        "of current positions, open questions, and surprise signals. Used by " +
        "Pass 2 enrichment as context.\n\n" +
        "Args:\n" +
        "  - projectId (string): The project to get the lens for\n\n" +
        "Returns: The current Research Lens or null if none exists yet.",
      inputSchema: {
        projectId: z.string().describe("Project ID"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ projectId }) => {
      try {
        const lens = await convexQuery(api.researchLens.getCurrentLens, {
          projectId: asId<"projects">(projectId),
        });

        if (!lens) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No Research Lens has been generated yet. " +
                  "Use cm_update_research_lens to generate one after creating positions.",
              },
            ],
          };
        }

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(lens, null, 2) },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ============================================================
  // cm_get_data_points_by_tag — Retrieve DPs by tag slug
  // ============================================================
  server.registerTool(
    "cm_get_data_points_by_tag",
    {
      title: "Get Data Points by Tag",
      description:
        "Retrieve all data points linked to a specific tag. Returns clean data " +
        "(ID, claim text, evidence type, confidence, source title, source tier) " +
        "without embeddings. Useful for building evidence pools for position linking.\n\n" +
        "Args:\n" +
        "  - projectId (string): The project ID\n" +
        "  - tagSlug (string): The tag slug to filter by (e.g., 'specification-bottleneck')\n\n" +
        "Returns: Array of data points with source metadata.",
      inputSchema: {
        projectId: z.string().describe("Project ID"),
        tagSlug: z.string().describe("Tag slug to filter by (e.g., 'governance', 'specification-bottleneck')"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ projectId, tagSlug }: { projectId: string; tagSlug: string }) => {
      try {
        // First, look up the tag by slug
        const tag: TagLookupResult = await convexQuery(api.tags.getTagBySlug, {
          projectId: asId<"projects">(projectId),
          slug: tagSlug,
        });
        if (!tag) {
          return {
            content: [
              { type: "text" as const, text: `No tag found with slug: ${tagSlug}` },
            ],
          };
        }

        // Then get all data points linked to this tag
        const dataPoints: DataPointsByTagResult = await convexQuery(
          api.tags.getDataPointsByTag,
          {
            tagId: tag._id,
          }
        );

        const summary = `Found ${dataPoints.length} data points for tag "${tag.name}" (${tagSlug}):\n\n` +
          JSON.stringify(dataPoints, null, 2);

        return {
          content: [
            { type: "text" as const, text: truncateIfNeeded(summary) },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ============================================================
  // cm_get_data_points_batch — Fetch multiple DPs in one call
  // ============================================================
  server.registerTool(
    "cm_get_data_points_batch",
    {
      title: "Get Data Points in Batch",
      description:
        "Fetch multiple data points by ID in a single call (Layer 3 — Analyst only). " +
        "Returns the same shape as cm_get_data_point for each ID: full context including " +
        "verbatim anchor quote, source metadata, and tags. " +
        "Use this instead of calling cm_get_data_point in a loop — one call replaces N calls. " +
        "Missing IDs return null in the result array (position is preserved).\n\n" +
        "Args:\n" +
        "  - dataPointIds (string[]): The data point IDs to fetch\n\n" +
        "Returns: Array of data point records (null for any ID not found).",
      inputSchema: {
        dataPointIds: z.array(z.string()).min(1)
          .describe("Array of data point IDs to fetch"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ dataPointIds }) => {
      try {
        const results = await convexQuery(api.dataPoints.getDataPointsBatch, {
          dataPointIds: dataPointIds.map((id) => asId<"dataPoints">(id)),
        });

        const found = results.filter(Boolean).length;
        const missing = results.length - found;

        const text =
          `Fetched ${found} of ${dataPointIds.length} data points` +
          (missing > 0 ? ` (${missing} not found — returned as null)` : "") +
          ".\n\n" +
          JSON.stringify(results, null, 2);

        return {
          content: [{ type: "text" as const, text: truncateIfNeeded(text) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
