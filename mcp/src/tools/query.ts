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
 * - cm_list_data_points_by_source: Lean DP list for a single source
 *
 * Embedding vectors are stripped from all responses at the MCP boundary; the
 * underlying Convex queries still return them (vector indexes require it) but
 * they are not useful to MCP consumers and blow out token budgets.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { api, asId, convexAction, convexQuery } from "../lib/convex-client.js";
import { stripEmbeddingsDeep } from "../lib/response-shaping.js";

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

function buildDeepLinkUrl(baseUrl: string | null | undefined, anchorQuote?: string | null): string | null {
  if (!baseUrl) return null;
  if (!anchorQuote) return baseUrl;

  const words = anchorQuote.trim().split(/\s+/).slice(0, 10).join(" ");
  const cleaned = words
    .replace(/[\u2018\u2019\u201C\u201D]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned ? `${baseUrl}#:~:text=${encodeURIComponent(cleaned)}` : baseUrl;
}

function formatEvidencePackMarkdown(result: any): string {
  const items = Array.isArray(result.evidencePack) ? result.evidencePack : [];
  const lines: string[] = [
    "# Curate Mind Evidence Pack",
    "",
    `Question: ${result.question}`,
    "",
    "## How To Use",
    "",
    "- Compose the answer yourself from this evidence pack.",
    "- Cite every substantive claim inline with one or more labels, for example [E1].",
    "- Use `Interpretation` as the curated claim, `Why it matters` as the curator's interpretation, and `Anchor quote` as the verification quote.",
    "- If the pack does not support an answer, say the evidence is thin instead of filling gaps.",
    "",
    "## Context",
    "",
    result.context?.summary ?? "No scope summary returned.",
    "",
    "## Evidence Register",
    "",
  ];

  if (items.length === 0) {
    lines.push("No evidence was retrieved for this question.");
  }

  for (const item of items) {
    const source = item.source ?? {};
    const sourceBits = [
      source.title ? String(source.title) : "Unknown source",
      source.authorName ? `by ${source.authorName}` : null,
      source.publisherName ? `(${source.publisherName})` : null,
      source.publishedDate ? String(source.publishedDate) : null,
      source.tier ? `tier ${source.tier}` : null,
    ].filter(Boolean);
    const sourceUrl = buildDeepLinkUrl(
      source.resolvedUrl ?? source.storageUrl ?? source.canonicalUrl,
      item.anchorQuote
    );

    lines.push(
      `### [${item.label}] ${sourceBits.join(" ")}`,
      "",
      `- Data point ID: ${item.dataPointId}`,
      `- Origin: ${item.origin}`,
      `- Evidence type: ${item.evidenceType}${item.confidence ? `; confidence: ${item.confidence}` : ""}`,
      `- Interpretation: ${item.interpretation}`,
      item.whyItMatters ? `- Why it matters: ${item.whyItMatters}` : "- Why it matters: Not provided.",
      `- Anchor quote: "${item.anchorQuote}"`,
      sourceUrl ? `- Original source: ${sourceUrl}` : "- Original source: Not available.",
      ""
    );
  }

  lines.push(
    "## Machine-Readable Evidence",
    "",
    "```json",
    JSON.stringify(stripEmbeddingsDeep(result), null, 2),
    "```"
  );

  return truncateIfNeeded(lines.join("\n"));
}

export function registerQueryTools(server: McpServer): void {
  // ============================================================
  // cm_retrieve_evidence_pack — Retrieval-only Ask experience
  // ============================================================
  server.registerTool(
    "cm_retrieve_evidence_pack",
    {
      title: "Retrieve Evidence Pack",
      description:
        "Retrieve a citation-ready evidence pack for a question without generating " +
        "the final answer. Use this before answering analytical questions when every " +
        "claim needs inline citations. Returns labeled evidence items ([E1], [E2], ...), " +
        "each with interpretation, curator note, anchor quote, and original source link.\n\n" +
        "Args:\n" +
        "  - projectId (string): The project to search\n" +
        "  - question (string): The user's question\n" +
        "  - limit (number, optional): Fresh evidence items to retrieve, 1-20, default 12\n" +
        "  - themeId / positionId / sourceId (string, optional): Scope retrieval\n" +
        "  - carriedDataPointIds (string[], optional): Evidence labels to carry from prior turns\n\n" +
        "Returns: Markdown instructions plus a machine-readable JSON evidence pack. " +
        "The calling model should compose the final answer and cite every substantive claim.",
      inputSchema: {
        projectId: z.string().describe("Project ID to search"),
        question: z.string().min(1).describe("Question to retrieve evidence for"),
        limit: z.number().int().min(1).max(20).optional()
          .describe("Number of fresh evidence items to retrieve (default 12)"),
        themeId: z.string().optional().describe("Optional theme scope"),
        positionId: z.string().optional().describe("Optional position scope"),
        sourceId: z.string().optional().describe("Optional source scope"),
        carriedDataPointIds: z.array(z.string()).optional()
          .describe("Data point IDs to carry forward from earlier turns"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ projectId, question, limit, themeId, positionId, sourceId, carriedDataPointIds }) => {
      try {
        const result = await convexAction(api.chat.retrieveEvidencePack, {
          projectId: asId<"projects">(projectId),
          question,
          limit,
          themeId: themeId ? asId<"researchThemes">(themeId) : undefined,
          positionId: positionId ? asId<"researchPositions">(positionId) : undefined,
          sourceId: sourceId ? asId<"sources">(sourceId) : undefined,
          carriedDataPointIds: carriedDataPointIds?.map((id) => asId<"dataPoints">(id)),
        });

        return {
          content: [
            {
              type: "text" as const,
              text: formatEvidencePackMarkdown(result),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error retrieving evidence pack: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

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

        const text = truncateIfNeeded(
          JSON.stringify(stripEmbeddingsDeep(detail), null, 2)
        );
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
            {
              type: "text" as const,
              text: JSON.stringify(stripEmbeddingsDeep(dp), null, 2),
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
        "Returns: Matching results from all entity types, ranked by relevance. " +
        "Embedding vectors are stripped from the response to keep it within token caps.",
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

        const text = truncateIfNeeded(
          JSON.stringify(stripEmbeddingsDeep(results), null, 2)
        );
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
        "Returns: Tags sorted by data point count (most used first). " +
        "Embedding vectors are stripped from the response to keep it within token caps.",
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
            {
              type: "text" as const,
              text: JSON.stringify(stripEmbeddingsDeep(trends), null, 2),
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

        const text = truncateIfNeeded(
          JSON.stringify(stripEmbeddingsDeep(history), null, 2)
        );
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
        "Returns: The current Research Lens or null if none exists yet. " +
        "Embedding vectors are stripped from the response to keep it within token caps.",
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
            {
              type: "text" as const,
              text: JSON.stringify(stripEmbeddingsDeep(lens), null, 2),
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
          JSON.stringify(stripEmbeddingsDeep(dataPoints), null, 2);

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
          (missing > 0 ? ` (${missing} not found, returned as null)` : "") +
          ".\n\n" +
          JSON.stringify(stripEmbeddingsDeep(results), null, 2);

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

  // ============================================================
  // cm_list_data_points_by_source — Lean DP list scoped to one source
  // ============================================================
  server.registerTool(
    "cm_list_data_points_by_source",
    {
      title: "List Data Points by Source",
      description:
        "Returns all data points extracted from a specific source, ordered by " +
        "sequence number. Lean response: includes claim text, anchor quote, " +
        "evidence type, confidence, sequence number, and extraction metadata, " +
        "but NOT embeddings, tag joins, or source metadata fanout. Use this in " +
        "extraction and processing workflows where you know the source ID and " +
        "want its DPs without paying for embeddings.\n\n" +
        "Args:\n" +
        "  - sourceId (string): The source ID\n\n" +
        "Returns: Array of data points ordered by dpSequenceNumber.",
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
        const dataPoints = await convexQuery(
          api.dataPoints.listDataPointsBySource,
          {
            sourceId: asId<"sources">(sourceId),
          }
        );

        const text =
          `Found ${dataPoints.length} data points for source ${sourceId}.\n\n` +
          JSON.stringify(stripEmbeddingsDeep(dataPoints), null, 2);

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
