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
 * - cm_ask: Analyst query with progressive disclosure (positions → observations → mental models → data points)
 * - cm_search: Broad exploration across all entity types (signal-finding, not analyst answers)
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
import {
  clampPagination,
  paginate,
  stripEmbeddingsDeep,
  takeItemsWithinJsonLimit,
} from "../lib/response-shaping.js";

const CHARACTER_LIMIT = 25000;

type SourceListItem = typeof api.sources.listAll["_returnType"][number];
type TagLookupResult = typeof api.tags.getTagBySlug["_returnType"];
type DataPointsByTagResult = typeof api.tags.getDataPointsByTag["_returnType"];
type DataPointBySourceResult =
  typeof api.dataPoints.listDataPointsBySource["_returnType"][number];
type TagTrendItem = {
  name: string;
  category?: string;
  dataPointCount: number;
  [key: string]: unknown;
};

function toLeanDataPoint(dp: DataPointBySourceResult) {
  return {
    _id: dp._id,
    dpSequenceNumber: dp.dpSequenceNumber,
    claimText: dp.claimText,
    anchorQuote: dp.anchorQuote,
    evidenceType: dp.evidenceType,
    confidence: dp.confidence,
    correctionStatus: dp.correctionStatus,
  };
}

function getPositionHeadlines(currentPositions: string): string[] {
  return currentPositions
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("["));
}

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

function resolveSourceLink(
  source: any,
  anchorQuote?: string | null
): { url: string | null; label: string | null } {
  let base: string | null = null;
  let label: string | null = null;

  if (source.storageUrl) {
    base = source.storageUrl;
    label = "Open PDF";
  } else if (source.canonicalUrl && source.resolvedLinkKind !== "internal") {
    base = source.canonicalUrl;
    label = "Open source";
  }

  const url = base ? buildDeepLinkUrl(base, anchorQuote) : null;
  return { url, label };
}

function getEvidenceLabelMap(dataPoints: any[]): Map<string, any> {
  return new Map(
    dataPoints
      .filter((item) => item?.label)
      .map((item) => [String(item.label), item])
  );
}

function getCitationLabels(text: string): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const match of text.matchAll(/\[(E\d+)\]/g)) {
    const label = match[1];
    if (seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
}

function formatSourceLine(source: any): string {
  const bits = [
    source.title ? `Title: ${String(source.title)}` : "Title: Unknown source",
    source.authorName ? `Author: ${String(source.authorName)}` : null,
    source.publisherName ? `Publisher: ${String(source.publisherName)}` : null,
    source.publishedDate ? `Date: ${String(source.publishedDate)}` : null,
    source.tier ? `Tier: ${String(source.tier)}` : null,
  ].filter(Boolean);
  return bits.join(" · ");
}

function formatLocalEvidenceItem(item: any): string[] {
  const source = item.source ?? {};
  const { url: sourceUrl, label: sourceLabel } = resolveSourceLink(source, item.anchorQuote);
  return [
    `- **[${item.label}] ${source.title ? String(source.title) : "Unknown source"}**`,
    `  - ${formatSourceLine(source)}`,
    `  - Interpretation: ${item.interpretation}`,
    item.anchorQuote ? `  - Anchor quote: "${item.anchorQuote}"` : "  - Anchor quote: Not provided.",
    sourceUrl
      ? `  - Original source: [${sourceLabel ?? "Open source"}](${sourceUrl})`
      : "  - Original source: Not available.",
  ];
}

function formatAnswerWithLocalEvidence(answer: string, dataPoints: any[]): string[] {
  const evidenceByLabel = getEvidenceLabelMap(dataPoints);
  const lines: string[] = ["## Answer", ""];
  const blocks = answer
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length === 0) {
    lines.push("No composed answer was returned.", "");
    return lines;
  }

  for (const block of blocks) {
    lines.push(block, "");

    const labels = getCitationLabels(block);
    const evidenceItems = labels
      .map((label) => evidenceByLabel.get(label))
      .filter(Boolean);

    if (evidenceItems.length === 0) continue;

    lines.push("Evidence for this paragraph:", "");
    for (const item of evidenceItems) {
      lines.push(...formatLocalEvidenceItem(item), "");
    }
  }

  return lines;
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
    const { url: sourceUrl } = resolveSourceLink(source, item.anchorQuote);

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

  const enrichedResult = {
    ...result,
    evidencePack: Array.isArray(result.evidencePack)
      ? result.evidencePack.map((item: any) => ({
          ...item,
          resolvedLink: resolveSourceLink(item.source ?? {}, item.anchorQuote),
        }))
      : [],
  };

  lines.push(
    "## Machine-Readable Evidence",
    "",
    "```json",
    JSON.stringify(stripEmbeddingsDeep(enrichedResult), null, 2),
    "```"
  );

  return truncateIfNeeded(lines.join("\n"));
}

function formatAnalystPackMarkdown(result: any): string {
  const positions: any[] = Array.isArray(result.positions) ? result.positions : [];
  const dataPoints: any[] = Array.isArray(result.dataPoints) ? result.dataPoints : [];
  const citedLabels = new Set(
    Array.isArray(result.citations)
      ? result.citations
          .filter((citation: any) => citation?.isCited && citation?.label)
          .map((citation: any) => String(citation.label))
      : []
  );
  const citedDataPoints = dataPoints.filter((item) => citedLabels.has(String(item.label)));
  const additionalDataPoints = dataPoints.filter((item) => !citedLabels.has(String(item.label)));

  const lines: string[] = [
    "# Curate Mind Analyst Answer",
    "",
    `**Question:** ${result.question}`,
    "",
  ];

  lines.push(...formatAnswerWithLocalEvidence(result.answer ?? "", dataPoints));

  // ── Context ──────────────────────────────────────────────────
  if (result.context?.summary) {
    lines.push("## Context", "", result.context.summary, "");
  }

  // ── Layer 1: Positions ────────────────────────────────────────
  lines.push("## Layer 1 — Current Positions", "");
  if (positions.length === 0) {
    lines.push("No positions found for this question. The corpus may not have positions yet — use cm_search for exploration instead.", "");
  } else {
    positions.forEach((p, i) => {
      const label = `P${i + 1}`;
      const themeLine = p.themeTitle ? ` — ${p.themeTitle}` : "";
      const evidenceLine = `${p.supportingEvidenceCount} supporting · ${p.counterEvidenceCount} counter`;
      lines.push(
        `### [${label}] ${p.title}${themeLine}`,
        "",
        `**Stance:** ${p.currentStance || "No stance recorded yet."}`,
        `**Evidence attached:** ${evidenceLine}`,
        `**Position ID:** ${p.positionId}`,
        ""
      );
    });
  }

  // ── Layer 2a: Curator Observations ───────────────────────────
  // Curator observations and mental models may inform the composed answer,
  // but the chat-facing lineage is source-backed data point evidence.
  lines.push("## Retrieved Data Point Evidence", "");
  if (dataPoints.length === 0) {
    lines.push("No data points retrieved.", "");
  } else {
    if (citedDataPoints.length > 0) {
      lines.push("### Cited in the Answer", "");
      for (const item of citedDataPoints) {
        lines.push(...formatLocalEvidenceItem(item), "");
      }
    }

    if (additionalDataPoints.length > 0) {
      lines.push("### Additional Retrieved Context", "");
      for (const item of additionalDataPoints) {
        lines.push(...formatLocalEvidenceItem(item), "");
      }
    }
  }

  // ── Machine-readable JSON ─────────────────────────────────────
  const enrichedResult = {
    ...result,
    dataPoints: dataPoints.map((item: any) => ({
      ...item,
      resolvedLink: resolveSourceLink(item.source ?? {}, item.anchorQuote),
    })),
  };

  lines.push(
    "## Machine-Readable Pack",
    "",
    "```json",
    JSON.stringify(stripEmbeddingsDeep(enrichedResult), null, 2),
    "```"
  );

  return truncateIfNeeded(lines.join("\n"));
}

export function registerQueryTools(server: McpServer): void {
  // ============================================================
  // cm_ask — Progressive disclosure analyst query (Mode 2)
  // ============================================================
  server.registerTool(
    "cm_ask",
    {
      title: "Analyst Ask",
      description:
        "Full progressive-disclosure analyst query. Use this for any question that needs " +
        "a rigorous cited answer traceable to original sources.\n\n" +
        "Returns a composed answer first, with paragraph-local evidence directly beneath " +
        "the paragraphs that cite it. Each evidence item includes source title, author, " +
        "date, interpretation, anchor quote, and original source link. Also includes " +
        "current positions [P#], cited evidence, and additional retrieved data point context.\n\n" +
        "Args:\n" +
        "  - projectId (string): The project to search\n" +
        "  - question (string): The analyst's question\n" +
        "  - limit (number, optional): Data points to retrieve, 1-20, default 12\n" +
        "  - themeId / positionId / sourceId (string, optional): Scope to a narrower context\n" +
        "  - carriedDataPointIds (string[], optional): Data point IDs to carry from prior turns\n\n" +
        "Use the composed answer as the primary response. Do not use cm_search for this — " +
        "cm_search is for exploration only.",
      inputSchema: {
        projectId: z.string().describe("Project ID to search"),
        question: z.string().min(1).describe("The analyst question to answer"),
        limit: z.number().int().min(1).max(20).optional()
          .describe("Data points to retrieve (default 12)"),
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
        const result = await convexAction(api.chat.askAnalyst, {
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
              text: formatAnalystPackMarkdown(result),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error running analyst query: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

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
        "anchor quote (Layer 3, Analyst only). Returned claimText and anchorQuote " +
        "are effective values: corrected where an append-only correction exists, " +
        "otherwise original extraction values. Includes source metadata, tags, " +
        "and correctionStatus.\n\n" +
        "Args:\n" +
        "  - dataPointId (string): The data point ID\n\n" +
        "Returns: Data point with effective claim text, effective anchor quote, " +
        "source info, tags, and correctionStatus.",
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
  // cm_get_data_point_corrections - Audit correction history
  // ============================================================
  server.registerTool(
    "cm_get_data_point_corrections",
    {
      title: "Get Data Point Corrections",
      description:
        "Return the append-only correction history for a data point, sorted by " +
        "correctedAt ascending. Use this when an analyst or curator needs to audit " +
        "original anchor or claim values and every correction applied over time.\n\n" +
        "Args:\n" +
        "  - dataPointId (string): The data point ID\n\n" +
        "Returns: Array of correction rows with _id, correctionType, prior values, " +
        "corrected values, reason, correctedAt, correctedBy, and previousCorrectionId.",
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
        const corrections = await convexQuery(
          api.dataPoints.getDataPointCorrections,
          {
            dataPointId: asId<"dataPoints">(dataPointId),
          }
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(corrections, null, 2),
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
        "Broad exploration search across all entity types (data points, positions, " +
        "observations, mental models). Use this for Mode 1 tasks: scanning new sources " +
        "for signals, finding emerging narratives, pressure-testing a brief or idea, " +
        "or early corpus work before positions exist.\n\n" +
        "Do NOT use this for analyst questions that need cited, verifiable answers — " +
        "use cm_ask instead. cm_search returns raw JSON without citation structure or " +
        "resolved source links.\n\n" +
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
  // cm_get_tag_trends - Tag usage counts
  // ============================================================
  server.registerTool(
    "cm_get_tag_trends",
    {
      title: "Get Tag Trends",
      description:
        "Get paginated tag usage counts across all data points. Shows which " +
        "topics have the most evidence, useful for spotting emerging trends.\n\n" +
        "Args:\n" +
        "  - limit (number, optional): Page size, default 50, max 200\n" +
        "  - offset (number, optional): Zero-based page offset, default 0\n" +
        "  - category (string, optional): Filter tags by category\n" +
        "  - projectId (string, optional): Accepted for caller compatibility. Tag usage counts are currently global.\n\n" +
        "Returns: Page object with items sorted by dataPointCount descending, " +
        "plus total, offset, limit, and hasMore.",
      inputSchema: {
        limit: z.number().int().min(1).max(200).optional()
          .describe("Page size (default 50, max 200)"),
        offset: z.number().int().min(0).optional()
          .describe("Zero-based page offset (default 0)"),
        category: z.string().optional()
          .describe("Optional tag category filter"),
        projectId: z.string().optional()
          .describe("Optional project ID for compatibility. Tag counts are currently global."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ limit, offset, category }) => {
      try {
        const trends = await convexQuery(api.tags.getTagUsageCounts) as TagTrendItem[];
        const filtered = category
          ? trends.filter((tag) => tag.category === category)
          : trends;
        filtered.sort((a, b) => {
          const countDelta = b.dataPointCount - a.dataPointCount;
          if (countDelta !== 0) return countDelta;
          return a.name.localeCompare(b.name);
        });
        const pagination = clampPagination(limit, offset, 50, 200);
        const page = paginate(filtered, pagination.limit, pagination.offset);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(stripEmbeddingsDeep(page), null, 2),
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
  // cm_get_research_lens - Get the current Research Lens
  // ============================================================
  server.registerTool(
    "cm_get_research_lens",
    {
      title: "Get Current Research Lens",
      description:
        "Get the most recent Research Lens for a project: a compressed snapshot " +
        "of current positions, open questions, and surprise signals. Used by " +
        "Pass 2 enrichment as context.\n\n" +
        "Args:\n" +
        "  - projectId (string): The project to get the lens for\n\n" +
        "  - mode (\"summary\" | \"full\", optional): Summary is default and returns " +
        "metadata, openQuestions, surpriseSignals, and positionHeadlines. Full " +
        "returns the complete lens including currentPositions.\n\n" +
        "Returns: The current Research Lens or null if none exists yet.",
      inputSchema: {
        projectId: z.string().describe("Project ID"),
        mode: z.enum(["summary", "full"]).optional()
          .describe("Response mode. Default summary keeps payloads small; full returns complete position bodies."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ projectId, mode }) => {
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

        const payload = mode === "full"
          ? lens
          : {
              _id: lens._id,
              _creationTime: lens._creationTime,
              projectId: lens.projectId,
              generatedDate: lens.generatedDate,
              triggeredBy: lens.triggeredBy,
              openQuestions: lens.openQuestions,
              surpriseSignals: lens.surpriseSignals,
              positionHeadlines: getPositionHeadlines(lens.currentPositions),
            };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(stripEmbeddingsDeep(payload), null, 2),
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
  // cm_get_data_points_by_tag - Retrieve DPs by tag slug
  // ============================================================
  server.registerTool(
    "cm_get_data_points_by_tag",
    {
      title: "Get Data Points by Tag",
      description:
        "Retrieve a paginated page of data points linked to a specific tag. Returns clean data " +
        "(ID, effective claim text, effective anchor quote, correctionStatus, evidence type, " +
        "confidence, source title, source tier) without embeddings. Effective means corrected " +
        "where an append-only correction exists, otherwise original extraction values. Useful " +
        "for building evidence pools for position linking.\n\n" +
        "Args:\n" +
        "  - projectId (string): The project ID\n" +
        "  - tagSlug (string): The tag slug to filter by (e.g., 'specification-bottleneck')\n" +
        "  - limit (number, optional): Page size, default 100, max 200\n" +
        "  - offset (number, optional): Zero-based page offset, default 0\n\n" +
        "Returns: Page object with items, total, offset, limit, and hasMore.",
      inputSchema: {
        projectId: z.string().describe("Project ID"),
        tagSlug: z.string().describe("Tag slug to filter by (e.g., 'governance', 'specification-bottleneck')"),
        limit: z.number().int().min(1).max(200).optional()
          .describe("Page size (default 100, max 200)"),
        offset: z.number().int().min(0).optional()
          .describe("Zero-based page offset (default 0)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({
      projectId,
      tagSlug,
      limit,
      offset,
    }: {
      projectId: string;
      tagSlug: string;
      limit?: number;
      offset?: number;
    }) => {
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

        const pagination = clampPagination(limit, offset, 100, 200);
        const requestedPage = paginate(
          dataPoints,
          pagination.limit,
          pagination.offset
        );
        const bounded = takeItemsWithinJsonLimit(
          stripEmbeddingsDeep(requestedPage.items),
          (items) => ({
            tag: {
              _id: tag._id,
              name: tag.name,
              slug: tag.slug,
              category: tag.category,
            },
            items,
            total: requestedPage.total,
            offset: requestedPage.offset,
            limit: items.length,
            hasMore: requestedPage.offset + items.length < requestedPage.total,
          })
        );
        const returnedLimit = bounded.truncatedBySize
          ? bounded.items.length
          : requestedPage.limit;
        const payload = {
          tag: {
            _id: tag._id,
            name: tag.name,
            slug: tag.slug,
            category: tag.category,
          },
          items: bounded.items,
          total: requestedPage.total,
          offset: requestedPage.offset,
          limit: returnedLimit,
          requestedLimit: requestedPage.limit,
          hasMore: requestedPage.offset + returnedLimit < requestedPage.total,
          nextOffset: requestedPage.offset + returnedLimit,
          note: bounded.truncatedBySize
            ? "Returned fewer records than requested to stay under the safe response size. Continue with nextOffset."
            : undefined,
        };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(stripEmbeddingsDeep(payload), null, 2),
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
  // cm_get_data_points_batch - Fetch multiple DPs in one call
  // ============================================================
  server.registerTool(
    "cm_get_data_points_batch",
    {
      title: "Get Data Points in Batch",
      description:
        "Fetch multiple data points by ID in a single call (Layer 3, Analyst only). " +
        "Returns the same shape as cm_get_data_point for each ID: full context including " +
        "effective claim text, effective verbatim anchor quote, correctionStatus, source metadata, and tags. " +
        "Effective means corrected where an append-only correction exists, otherwise original extraction values. " +
        "Use this instead of calling cm_get_data_point in a loop. One call replaces N calls. " +
        "Missing IDs return null in the result array (position is preserved). " +
        "The input ID array is paginated so large batches stay below host token caps.\n\n" +
        "Args:\n" +
        "  - dataPointIds (string[]): The data point IDs to fetch\n" +
        "  - limit (number, optional): Page size over the input IDs, default 25, max 50\n" +
        "  - offset (number, optional): Zero-based offset over the input IDs, default 0\n\n" +
        "Returns: Page object with items, total, offset, limit, hasMore, found, and missing. " +
        "If a page would exceed the safe response size, fewer items are returned with a note.",
      inputSchema: {
        dataPointIds: z.array(z.string()).min(1)
          .describe("Array of data point IDs to fetch"),
        limit: z.number().int().min(1).max(50).optional()
          .describe("Page size over input IDs (default 25, max 50)"),
        offset: z.number().int().min(0).optional()
          .describe("Zero-based offset over input IDs (default 0)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ dataPointIds, limit, offset }) => {
      try {
        const pagination = clampPagination(limit, offset, 25, 50);
        const pageIds = dataPointIds.slice(
          pagination.offset,
          pagination.offset + pagination.limit
        );
        const results = await convexQuery(api.dataPoints.getDataPointsBatch, {
          dataPointIds: pageIds.map((id) => asId<"dataPoints">(id)),
        });

        const strippedResults = stripEmbeddingsDeep(results);
        const bounded = takeItemsWithinJsonLimit(strippedResults, (items) => ({
          items,
          total: dataPointIds.length,
          offset: pagination.offset,
          limit: items.length,
          hasMore: pagination.offset + items.length < dataPointIds.length,
        }));
        const returnedLimit = bounded.truncatedBySize
          ? bounded.items.length
          : pagination.limit;
        const found = bounded.items.filter(Boolean).length;
        const missing = bounded.items.length - found;

        const payload = {
          items: bounded.items,
          total: dataPointIds.length,
          offset: pagination.offset,
          limit: returnedLimit,
          requestedLimit: pagination.limit,
          hasMore: pagination.offset + returnedLimit < dataPointIds.length,
          nextOffset: pagination.offset + returnedLimit,
          found,
          missing,
          note: bounded.truncatedBySize
            ? "Returned fewer records than requested to stay under the safe response size. Continue with nextOffset."
            : undefined,
        };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(payload, null, 2),
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
  // cm_list_data_points_by_source - Lean DP list scoped to one source
  // ============================================================
  server.registerTool(
    "cm_list_data_points_by_source",
    {
      title: "List Data Points by Source",
      description:
        "Returns a paginated page of data points extracted from a specific source, ordered by " +
        "sequence number. Lean mode includes ID, sequence number, effective claim text, " +
        "effective anchor quote, evidence type, confidence, and correctionStatus. Full mode " +
        "includes the full source-scoped data point records without embeddings. Effective " +
        "means corrected where an append-only correction exists, otherwise original extraction values. Use this in " +
        "extraction and processing workflows where you know the source ID and " +
        "want its DPs without paying for embeddings.\n\n" +
        "Args:\n" +
        "  - sourceId (string): The source ID\n" +
        "  - limit (number, optional): Page size, default 100, max 200\n" +
        "  - offset (number, optional): Zero-based page offset, default 0\n" +
        "  - fields (\"lean\" | \"full\", optional): Lean is default and safest for large sources\n\n" +
        "Returns: Page object with items, total, offset, limit, hasMore, and fields.",
      inputSchema: {
        sourceId: z.string().describe("The source ID"),
        limit: z.number().int().min(1).max(200).optional()
          .describe("Page size (default 100, max 200)"),
        offset: z.number().int().min(0).optional()
          .describe("Zero-based page offset (default 0)"),
        fields: z.enum(["lean", "full"]).optional()
          .describe("Response fields. Lean is default; full includes anchor and extraction metadata."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ sourceId, limit, offset, fields }) => {
      try {
        const dataPoints = await convexQuery(
          api.dataPoints.listDataPointsBySource,
          {
            sourceId: asId<"sources">(sourceId),
          }
        );

        const fieldMode = fields ?? "lean";
        const shaped = fieldMode === "lean"
          ? dataPoints.map(toLeanDataPoint)
          : stripEmbeddingsDeep(dataPoints);
        const pagination = clampPagination(limit, offset, 100, 200);
        const requestedPage = paginate(
          shaped,
          pagination.limit,
          pagination.offset
        );
        const bounded = takeItemsWithinJsonLimit(
          requestedPage.items,
          (items) => ({
            items,
            total: requestedPage.total,
            offset: requestedPage.offset,
            limit: items.length,
            hasMore: requestedPage.offset + items.length < requestedPage.total,
            fields: fieldMode,
          })
        );
        const returnedLimit = bounded.truncatedBySize
          ? bounded.items.length
          : requestedPage.limit;
        const payload = {
          items: bounded.items,
          total: requestedPage.total,
          offset: requestedPage.offset,
          limit: returnedLimit,
          requestedLimit: requestedPage.limit,
          hasMore: requestedPage.offset + returnedLimit < requestedPage.total,
          nextOffset: requestedPage.offset + returnedLimit,
          fields: fieldMode,
          note: bounded.truncatedBySize
            ? "Returned fewer records than requested to stay under the safe response size. Continue with nextOffset."
            : undefined,
        };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(payload, null, 2),
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
}
