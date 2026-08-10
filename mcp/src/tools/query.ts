/**
 * Query tools for Curate Mind MCP.
 *
 * These tools support the Curator querying the knowledge base
 * through the Stance, Evidence, and Source response bands:
 * - cm_get_themes: Stance overview with position counts
 * - cm_get_positions: Stance summaries within a theme
 * - cm_get_position_detail: Full stance and linked evidence chain
 * - cm_get_data_point: Evidence detail with anchor quote
 * - cm_get_source: Source metadata without full text
 * - cm_get_source_text: Full source text for curator verification
 * - cm_ask: Cite-and-trace query with positions, observations, mental models, and data points
 * - cm_search: Broad exploration across all entity types (signal-finding, not analyst answers)
 * - cm_get_tag_trends: Tag usage counts
 * - cm_get_position_history: Version history
 * - cm_list_sources: List sources by status
 * - cm_list_data_points_by_source: Lean DP list for a single source
 * - cm_get_data_point_usage: Reverse lookup — live references to a data point
 * - cm_get_source_usage: Reverse lookup — a source's data points and blast radius
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

/**
 * Locked rendering contract shipped inside every cm_ask response.
 *
 * These rules mirror buildAnalystLockedRulesBlock in convex/chat.ts. That is the
 * live composer for both surfaces: curatemind.io /ask and this tool both call
 * api.chat.askAnalyst. (buildGroundedAnswerRulesBlock is a different path,
 * askGrounded, whose only caller is the unrouted WorkspacePage.tsx. Do not treat
 * it as the website contract.)
 *
 * The two surfaces share that composer but not the presentation. The website
 * renders the composed answer verbatim and turns [E#] into clickable citation
 * cards, so its rules tell the composer to skip a bibliography. Over MCP a
 * second model reads this response and writes what the curator sees, and it
 * never sees the Convex system prompt, so it used to need the curator to ask for
 * cited output. Carrying the contract in the response makes the answer shape
 * self-describing.
 *
 * One deliberate difference from the website: with no card UI, this contract
 * ends the answer with a source reference list carrying the anchor quotes. That
 * list is curator-facing verification text, not public-facing copy.
 *
 * Keep CM_ASK_RENDER_CONTRACT_VERSION in step with any rule change so a client
 * can tell which contract it received.
 */
const CM_ASK_RENDER_CONTRACT_VERSION = "2";

const CM_ASK_RENDER_CONTRACT_SUMMARY =
  "Present the composed answer in this pack, repaired to these rules. Do not rewrite it: stance " +
  "first, [E#] citations preserved exactly, then a source reference list with anchor quotes at the end.";

const CM_ASK_RENDER_CONTRACT_RULES: readonly string[] = [
  "Relay, do not rewrite. The Answer section below was already composed by this project's own analyst prompt with the curator's saved style preferences applied. Present that answer as your response. Repair it where it breaks a rule below, but do not restructure it, re-argue it, or substitute your own analysis. The website renders this same composed answer verbatim, so rewriting it here makes one question give two different answers depending on where it was asked.",
  "Preserve every [E#] token exactly as it appears in the composed answer. Those tokens are how cited evidence is tracked from one question to the next, and altering or dropping one silently breaks the thread.",
  "Stance first. The composed answer should already open with what the project currently says, before any evidence detail. If it does not, reorder it so it does. If this pack returned no positions, say so plainly and label the answer exploratory.",
  "Citation labels are fixed by this pack: [E1] is the first evidence item, [E2] the second, and so on. Never invent a label, never renumber, and only cite a label where that data point actually supports the claim.",
  "Curator observations and secondary capture items are background context, not citable evidence. Never cite them as [O#] or [M#]. Position labels such as [P1] may appear as plain references, but they are not evidence citations.",
  "Position stance text carries its own [E#] and [C#] numbering from that position's own evidence chain, which is a separate namespace from this pack. Never copy a label out of a stance, never renumber one into this pack's labels, and never write a hybrid label such as [E1, cited within P1]. Cite the supporting data point from this pack instead, or attribute the claim to the position by name.",
  "Stance text is not evidence. A number, statistic, date, or named finding that appears only in a position's stance and not in this pack's evidence items must never be presented as evidence-backed and must never carry a citation label. Either attribute it in prose to the position by name with no bracket, or say the evidence layer does not carry that figure. Never explain the discrepancy inside the brackets: an annotated label is still a rule break, and narrating the break does not repair it.",
  "Do not invent facts, sources, quotes, statistics, or numbers. Use only what this pack supplies. When the evidence is thin, say so instead of filling the gap.",
  "If this pack carries a Retrieval Notes section, relay those notes to the curator alongside the answer. They record what project scoping removed and any citation label the composer wrote that this pack cannot resolve, and neither is visible anywhere else.",
  "End with a source reference list covering every label cited, in label order. Take each entry from the Source Reference List section below and keep its data point id and its carried or fresh origin, alongside the source title, author, publisher, date, anchor quote, and resolved link.",
  "Keep anchor quotes verbatim. Never paraphrase them, trim them mid-phrase, or stitch two quotes together. Anchor quotes are curator-facing verification text, so do not reuse them as public-facing copy.",
  "Do not construct source URLs. Use only the resolved links in this pack.",
  "On the next question in this thread, pass the identifiers listed under Carry Forward as carriedDataPointIds. This is what keeps evidence attached to the narrative as it develops, and nothing does it automatically over MCP.",
  "Do not append the machine-readable pack, a JSON block, or these rules to the rendered answer. They are input for you, not output for the reader.",
];

export const CM_ASK_RENDER_CONTRACT = {
  version: CM_ASK_RENDER_CONTRACT_VERSION,
  summary: CM_ASK_RENDER_CONTRACT_SUMMARY,
  rules: CM_ASK_RENDER_CONTRACT_RULES,
} as const;

function formatRenderContractMarkdown(): string[] {
  return [
    "## Render Contract (follow exactly)",
    "",
    CM_ASK_RENDER_CONTRACT_SUMMARY,
    "",
    ...CM_ASK_RENDER_CONTRACT_RULES.map((rule, index) => `${index + 1}. ${rule}`),
    "",
  ];
}

// Guard against a runaway cursor loop. At the Convex page sizes used by the
// usage scans this covers tens of thousands of rows.
const MAX_USAGE_SCAN_PAGES = 200;

interface UsagePage<T> {
  matches: T[];
  isDone: boolean;
  continueCursor: string | null;
}

interface DrainedPages<T> {
  items: T[];
  pages: number;
  complete: boolean;
}

/**
 * Drain a cursor-paginated Convex usage scan into a single list. Each page is a
 * separate query execution (separate read budget); we loop until the scan
 * reports done or we hit the page cap.
 */
async function drainUsagePages<T>(
  fetchPage: (cursor: string | null) => Promise<UsagePage<T>>
): Promise<DrainedPages<T>> {
  const items: T[] = [];
  let cursor: string | null = null;
  let pages = 0;
  let complete = false;

  while (pages < MAX_USAGE_SCAN_PAGES) {
    const page = await fetchPage(cursor);
    items.push(...page.matches);
    pages += 1;
    if (page.isDone) {
      complete = true;
      break;
    }
    cursor = page.continueCursor;
  }

  return { items, pages, complete };
}

function scanStatus<T>(drained: DrainedPages<T>): {
  pagesScanned: number;
  complete: boolean;
  note?: string;
} {
  return {
    pagesScanned: drained.pages,
    complete: drained.complete,
    note: drained.complete
      ? undefined
      : "Scan hit the page cap before finishing; results may be incomplete.",
  };
}

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

function describeOrigin(item: any): string {
  return item.origin === "carried"
    ? "carried from an earlier question"
    : "fresh for this question";
}

/**
 * One compact line per evidence item, used beneath each paragraph so the reader
 * can gauge the quality of what the narrative rests on without re-reading the
 * full item. The full detail lives once, in the source reference list.
 */
function formatEvidencePointer(item: any, options: { withId?: boolean } = {}): string {
  const source = item.source ?? {};
  const provenance = [
    source.publisherName ? String(source.publisherName) : null,
    source.publishedDate ? String(source.publishedDate) : null,
  ].filter(Boolean);
  const quality = [
    item.evidenceType ? String(item.evidenceType) : null,
    item.confidence ? String(item.confidence) : null,
    source.tier ? `tier ${String(source.tier)}` : null,
  ].filter(Boolean);

  const parts = [
    `- [${item.label}] ${source.title ? String(source.title) : "Unknown source"}`,
    provenance.length > 0 ? ` (${provenance.join(", ")})` : "",
    quality.length > 0 ? ` · ${quality.join(" · ")}` : "",
    options.withId && item.dataPointId ? ` · id \`${String(item.dataPointId)}\`` : "",
  ];
  return parts.join("");
}

/**
 * The full entry for a cited data point. This is the single complete copy in the
 * response, and it is what the client turns into the trailing reference list.
 *
 * The data point id and the carried/fresh origin travel here rather than only in
 * the machine-readable pack at the bottom, because that pack is the first thing
 * truncation removes and these two fields are what let a follow-up question
 * carry the evidence forward.
 */
function formatReferenceEntry(item: any): string[] {
  const source = item.source ?? {};
  const { url: sourceUrl, label: sourceLabel } = resolveSourceLink(source, item.anchorQuote);
  return [
    `- **[${item.label}] ${source.title ? String(source.title) : "Unknown source"}**`,
    `  - ${formatSourceLine(source)}`,
    `  - Claim: ${item.interpretation}`,
    item.anchorQuote ? `  - Anchor quote: "${item.anchorQuote}"` : "  - Anchor quote: Not provided.",
    sourceUrl
      ? `  - Original source: [${sourceLabel ?? "Open source"}](${sourceUrl})`
      : "  - Original source: Not available.",
    `  - Data point id: \`${item.dataPointId ?? "unknown"}\` · ${describeOrigin(item)}`,
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

    lines.push("Evidence cited here:", "");
    for (const item of evidenceItems) {
      lines.push(formatEvidencePointer(item));
    }
    lines.push("");
  }

  return lines;
}

export function formatAnalystPackMarkdown(result: any): string {
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

  const warnings: string[] = Array.isArray(result.warnings)
    ? result.warnings.map(String)
    : [];

  const lines: string[] = [
    "# Curate Mind Analyst Answer",
    "",
    `**Question:** ${result.question}`,
    "",
  ];

  if (result.context?.projectName || result.context?.projectId) {
    const name = result.context.projectName
      ? String(result.context.projectName)
      : "Unnamed project";
    lines.push(
      `**Project scope:** ${name} (\`${String(result.context.projectId ?? "unknown")}\`). ` +
        "Every position and evidence item below belongs to this project.",
      ""
    );
  }

  // Retrieval notes sit above the contract because they change how the answer
  // should be read. A dropped item means another project's evidence outranked
  // this project's; a malformed label means a citation silently failed to
  // register. Neither is visible anywhere else in the response.
  if (warnings.length > 0) {
    lines.push("## Retrieval Notes", "");
    for (const warning of warnings) {
      lines.push(`- ${warning}`);
    }
    lines.push("");
  }

  // The contract comes before any content so a client model reading top-down
  // knows the required answer shape before it starts composing.
  lines.push(...formatRenderContractMarkdown());

  lines.push(...formatAnswerWithLocalEvidence(result.answer ?? "", dataPoints));

  // ── Context ──────────────────────────────────────────────────
  if (result.context?.summary) {
    lines.push("## Context", "", result.context.summary, "");
  }

  // ── Stance: Positions ─────────────────────────────────────────
  lines.push("## Stance — Current Positions", "");
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

  // ── Source Reference List ─────────────────────────────────────
  // Cited evidence is written out in full exactly once, here. Curator
  // observations and mental models informed the composed answer upstream but
  // are not cited, so they are summarized by count rather than reprinted.
  lines.push("## Source Reference List", "");
  if (citedDataPoints.length === 0) {
    lines.push("No data point was cited in the composed answer.", "");
  } else {
    for (const item of citedDataPoints) {
      lines.push(...formatReferenceEntry(item), "");
    }
  }

  if (additionalDataPoints.length > 0) {
    lines.push(
      "## Additional Retrieved Context",
      "",
      "Retrieved but not cited. Fetch full detail with cm_get_data_points_batch if you need it.",
      ""
    );
    for (const item of additionalDataPoints) {
      lines.push(formatEvidencePointer(item, { withId: true }));
    }
    lines.push("");
  }

  // ── Carry forward ─────────────────────────────────────────────
  // Mirrors what the website does automatically in getPriorCitedDataPointIds:
  // accumulate every data point cited so far in the thread. Stated as a plain
  // line because nothing else instructs an MCP client to thread a follow-up.
  const citedIds: string[] = Array.isArray(result.citedDataPointIds)
    ? result.citedDataPointIds.map(String)
    : [];
  const carriedIds: string[] = Array.isArray(result.carriedDataPointIds)
    ? result.carriedDataPointIds.map(String)
    : [];
  const carryForwardIds = [...new Set([...carriedIds, ...citedIds])];

  lines.push("## Carry Forward", "");
  if (carryForwardIds.length === 0) {
    lines.push("Nothing cited yet, so there is nothing to carry into a follow-up question.", "");
  } else {
    lines.push(
      "On the next question in this thread, pass these data point identifiers as `carriedDataPointIds`:",
      "",
      carryForwardIds.map((id) => `\`${id}\``).join(", "),
      ""
    );
  }

  const observationCount = Array.isArray(result.observations) ? result.observations.length : 0;
  const mentalModelCount = Array.isArray(result.mentalModels) ? result.mentalModels.length : 0;
  if (observationCount > 0 || mentalModelCount > 0) {
    lines.push(
      `Background: ${observationCount} curator observation(s) and ${mentalModelCount} secondary capture item(s) informed the composed answer. They are not citable evidence.`,
      ""
    );
  }

  // ── Machine-readable pack ─────────────────────────────────────
  // Deliberately lean. Everything the prose already states is omitted; what
  // remains is what a programmatic client cannot reconstruct from the prose:
  // identifiers, resolved links, and the threading arrays. renderContract leads
  // the key order so it is the last thing lost if this section is truncated.
  const machinePack = {
    renderContract: CM_ASK_RENDER_CONTRACT,
    question: result.question,
    context: result.context,
    warnings,
    carryForwardDataPointIds: carryForwardIds,
    citedDataPointIds: citedIds,
    carriedDataPointIds: carriedIds,
    freshDataPointIds: Array.isArray(result.freshDataPointIds)
      ? result.freshDataPointIds.map(String)
      : [],
    positions: positions.map((p: any) => ({
      positionId: p.positionId,
      themeId: p.themeId,
      title: p.title,
      themeTitle: p.themeTitle,
    })),
    evidence: dataPoints.map((item: any) => ({
      label: item.label,
      dataPointId: item.dataPointId,
      origin: item.origin,
      isCited: citedLabels.has(String(item.label)),
      resolvedLink: resolveSourceLink(item.source ?? {}, item.anchorQuote),
    })),
  };

  // Append the pack only if it fits whole. Letting truncateIfNeeded cut through
  // it would emit half a JSON object, which is worse than no object at all for a
  // programmatic reader. Everything operationally required (the contract, the
  // reference list, the carry-forward identifiers) is already above this point.
  const prose = lines.join("\n");
  const packBlock = [
    "## Machine-Readable Pack",
    "",
    "```json",
    JSON.stringify(stripEmbeddingsDeep(machinePack), null, 2),
    "```",
  ].join("\n");

  if (prose.length + packBlock.length + 1 <= CHARACTER_LIMIT) {
    return `${prose}\n${packBlock}`;
  }

  return truncateIfNeeded(
    [
      prose,
      "## Machine-Readable Pack",
      "",
      "Omitted: this pack was too large to include without truncating it into invalid JSON. " +
        "Every identifier you need is in the Source Reference List and Carry Forward sections above. " +
        "Narrow the question or lower `limit` if you need the structured pack.",
    ].join("\n")
  );
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
        "Render contract (locked, no need for the curator to ask): every response opens with a " +
        "Render Contract block, and the machine-readable pack carries the same rules as its " +
        "renderContract field when the pack is not truncated. Follow it exactly:\n" +
        "  - Relay, do not rewrite. The pack already contains an answer composed by the project's " +
        "own analyst prompt with the curator's style preferences applied. Present it, repair rule " +
        "breaks in it, and preserve every [E#] token exactly. The website renders the same composed " +
        "answer verbatim, so rewriting forks the two surfaces.\n" +
        "  - Stance first: what the project currently says, before any evidence detail. If no " +
        "positions came back, say so and label the answer exploratory.\n" +
        "  - [E1], [E2] are fixed by the pack's evidence order. Never invent or renumber a label. " +
        "Do not cite observations or secondary capture items as [O#] or [M#]; they are background. " +
        "[P#] may appear as a plain reference.\n" +
        "  - End with a source reference list in label order, each entry carrying the anchor quote " +
        "verbatim, the resolved source link, the data point id, and its carried or fresh origin. " +
        "Do not construct URLs.\n" +
        "  - On a follow-up in the same thread, pass the identifiers under Carry Forward as " +
        "carriedDataPointIds. Nothing does this automatically over MCP.\n" +
        "  - Do not invent facts, quotes, or numbers, and do not echo the machine-readable pack.\n\n" +
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
  // cm_get_themes — Stance overview
  // ============================================================
  server.registerTool(
    "cm_get_themes",
    {
      title: "Get Research Themes",
      description:
        "List all Research Themes with position counts for a project. This is " +
        "the top-level Stance overview.\n\n" +
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
  // cm_get_positions — Stance summaries
  // ============================================================
  server.registerTool(
    "cm_get_positions",
    {
      title: "Get Research Positions",
      description:
        "List positions within a theme, or all positions. Returns current stance, " +
        "confidence, and status for each.\n\n" +
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
  // cm_get_position_detail — Stance with linked evidence
  // ============================================================
  server.registerTool(
    "cm_get_position_detail",
    {
      title: "Get Position Detail",
      description:
        "Get a Research Position with its full evidence chain: " +
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
  // cm_get_data_point — Evidence detail with anchor quote
  // ============================================================
  server.registerTool(
    "cm_get_data_point",
    {
      title: "Get Data Point Detail",
      description:
        "Get a single data point with full Evidence context including the verbatim " +
        "anchor quote. Returned claimText and anchorQuote " +
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
        "Return the append-only correction history for a data point. Use this when " +
        "an analyst or curator needs to audit original anchor or attribution values " +
        "and every correction applied over time.\n\n" +
        "Args:\n" +
        "  - dataPointId (string): The data point ID\n\n" +
        "Returns: Array of corrections rows with _id, projectId, targetType, targetId, " +
        "correctionType, previousValue, newValue, reason, correctedAt, correctedBy, " +
        "and pairedTargetId when relevant.",
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
        const corrections = await convexQuery(api.corrections.getForDataPoint, {
          dataPointId: asId<"dataPoints">(dataPointId),
        });

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
  // cm_get_source_corrections - Audit correction history for a source
  // ============================================================
  server.registerTool(
    "cm_get_source_corrections",
    {
      title: "Get Source Corrections",
      description:
        "Return the append-only correction history for a source. Use this when " +
        "a curator needs to audit original metadata and every correction applied " +
        "over time, including publisher, author, URL, published date, and tier " +
        "(source_tier) changes.\n\n" +
        "Args:\n" +
        "  - sourceId (string): The source ID\n\n" +
        "Returns: Array of corrections rows with _id, projectId, targetType, targetId, " +
        "correctionType, previousValue, newValue, reason, correctedAt, and correctedBy.",
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
        const corrections = await convexQuery(api.corrections.getForSource, {
          sourceId: asId<"sources">(sourceId),
        });

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
  // cm_get_source - Source metadata without full text
  // ============================================================
  server.registerTool(
    "cm_get_source",
    {
      title: "Get Source Metadata",
      description:
        "Get metadata for one source without full text. Includes derivative " +
        "source fields derivedFrom and derivedFromKind when present.\n\n" +
        "Args:\n" +
        "  - sourceId (string): The source ID\n\n" +
        "Returns: Source metadata without full text.",
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
        const source = await convexQuery(api.sources.getSource, {
          sourceId: asId<"sources">(sourceId),
        });

        if (!source) {
          return {
            content: [
              { type: "text" as const, text: `Source ${sourceId} not found.` },
            ],
          };
        }

        const text = truncateIfNeeded(
          JSON.stringify(stripEmbeddingsDeep(source), null, 2)
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
  // cm_get_source_text — Full source text for curator verification
  // ============================================================
  server.registerTool(
    "cm_get_source_text",
    {
      title: "Get Source Full Text",
      description:
        "Get the full text of a source for curator verification. Use when " +
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
        "  - projectId (string, optional): Scope the search to one project. Pass this " +
        "whenever you are exploring a specific project. Omitting it searches every " +
        "project in the deployment, which is almost never what you want when the " +
        "curator is working inside one.\n" +
        "  - limit (number, optional): Max results per entity type (default 5)\n\n" +
        "Returns: Matching results from all entity types, ranked by relevance. " +
        "Embedding vectors are stripped from the response to keep it within token caps.",
      inputSchema: {
        queryText: z.string().min(1).describe("What to search for"),
        projectId: z.string().optional()
          .describe("Project ID to scope the search to (omit to search all projects)"),
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
    async ({ queryText, projectId, limit }) => {
      try {
        const results = await convexAction(api.search.searchKnowledgeBase, {
          queryText,
          limit: limit ?? 5,
          projectId: projectId ? asId<"projects">(projectId) : undefined,
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
        "Get paginated tag usage counts for one project. Shows which " +
        "topics have the most evidence, useful for spotting emerging trends.\n\n" +
        "Args:\n" +
        "  - projectId (string): Project ID to scope tag counts\n" +
        "  - limit (number, optional): Page size, default 50, max 200\n" +
        "  - offset (number, optional): Zero-based page offset, default 0\n" +
        "  - category (string, optional): Filter tags by category\n\n" +
        "Returns: Page object with items sorted by dataPointCount descending, " +
        "plus total, offset, limit, and hasMore.",
      inputSchema: {
        projectId: z.string().describe("Project ID to scope tag counts"),
        limit: z.number().int().min(1).max(200).optional()
          .describe("Page size (default 50, max 200)"),
        offset: z.number().int().min(0).optional()
          .describe("Zero-based page offset (default 0)"),
        category: z.string().optional()
          .describe("Optional tag category filter"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ projectId, limit, offset, category }) => {
      try {
        const trends = await convexQuery(api.tags.getTagUsageCounts, {
          projectId: asId<"projects">(projectId),
        }) as TagTrendItem[];
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
        "List sources, optionally filtered by pipeline status. Includes " +
        "derivedFrom and derivedFromKind compactly when a source is derivative.\n\n" +
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
          (source) => {
            const derived = source.derivedFrom
              ? ` | derivedFrom ${source.derivedFrom} (${source.derivedFromKind ?? "unknown"})`
              : "";
            return `${source._id} | ${source.title} | ${source.wordCount || "?"} words | ${source.publisherName || "?"} | tier ${source.tier || "?"}${derived}`;
          }
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
        "the Enrich stage as context.\n\n" +
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
        "confidence, supersedeState, source title, source tier) without embeddings. Effective means " +
        "corrected where an append-only correction exists, otherwise original extraction values. " +
        "Useful for building evidence pools for position linking.\n\n" +
        "Superseded and retired data points are excluded by default (this is the evidence-linking " +
        "pool). Pass includeSuperseded: true to include them; each item's supersedeState shows its " +
        "lifecycle status either way.\n\n" +
        "Args:\n" +
        "  - projectId (string): The project ID\n" +
        "  - tagSlug (string): The tag slug to filter by (e.g., 'specification-bottleneck')\n" +
        "  - includeSuperseded (boolean, optional): Include superseded/retired data points, default false\n" +
        "  - limit (number, optional): Page size, default 100, max 200\n" +
        "  - offset (number, optional): Zero-based page offset, default 0\n\n" +
        "Returns: Page object with items, total, offset, limit, and hasMore.",
      inputSchema: {
        projectId: z.string().describe("Project ID"),
        tagSlug: z.string().describe("Tag slug to filter by (e.g., 'governance', 'specification-bottleneck')"),
        includeSuperseded: z.boolean().optional()
          .describe("Include superseded/retired data points (default false)"),
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
      includeSuperseded,
      limit,
      offset,
    }: {
      projectId: string;
      tagSlug: string;
      includeSuperseded?: boolean;
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
            includeSuperseded,
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
              redirectedFrom: "redirectedFrom" in tag ? tag.redirectedFrom : undefined,
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
            redirectedFrom: "redirectedFrom" in tag ? tag.redirectedFrom : undefined,
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
        "Fetch multiple data points by ID in a single call for Evidence review. " +
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

  // ============================================================
  // cm_get_data_point_usage — Reverse lookup for a data point
  // ============================================================
  server.registerTool(
    "cm_get_data_point_usage",
    {
      title: "Get Data Point Usage",
      description:
        "Show every LIVE reference to a data point before you correct, retire, or " +
        "replace it. Read-only. Live means the CURRENT version of each position only.\n\n" +
        "Returns:\n" +
        "  - livePositions: current position versions citing it, each with title, theme, " +
        "currentVersionId, and evidenceRole (supporting | counter | both)\n" +
        "  - observations: curator observations that reference it (id + short label)\n" +
        "  - relatedFrom: other data points that list it in relatedDataPoints (id + source)\n" +
        "  - summary: counts per category and the data point's own source status\n\n" +
        "Only live references are reported; references that exist only in older " +
        "(superseded) position versions are not scanned.\n\n" +
        "Args:\n" +
        "  - dataPointId (string): The data point ID",
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
        const usage = await convexQuery(api.usage.getDataPointUsage, {
          dataPointId: asId<"dataPoints">(dataPointId),
        });

        if (!usage) {
          return {
            content: [
              { type: "text" as const, text: `Data point ${dataPointId} not found.` },
            ],
          };
        }

        // Observations and related data points are scanned page-by-page (no
        // reverse index) so each query execution stays within the read budget.
        const relatedFrom = await drainUsagePages((cursor) =>
          convexQuery(api.usage.getDataPointRelatedFromPage, {
            dataPointId: asId<"dataPoints">(dataPointId),
            cursor,
          })
        );
        const observations = await drainUsagePages((cursor) =>
          convexQuery(api.usage.getObservationsPage, {
            dataPointIds: [asId<"dataPoints">(dataPointId)],
            cursor,
          })
        );

        const payload = {
          dataPoint: usage.dataPoint,
          livePositions: usage.livePositions,
          observations: observations.items,
          relatedFrom: relatedFrom.items,
          summary: {
            ...usage.summaryCore,
            observationCount: observations.items.length,
            relatedFromCount: relatedFrom.items.length,
          },
          scans: {
            observations: scanStatus(observations),
            relatedFrom: scanStatus(relatedFrom),
          },
        };

        const text = truncateIfNeeded(
          JSON.stringify(stripEmbeddingsDeep(payload), null, 2)
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
  // cm_get_source_usage — Reverse lookup and blast radius for a source
  // ============================================================
  server.registerTool(
    "cm_get_source_usage",
    {
      title: "Get Source Usage",
      description:
        "Show the blast radius of a source before you retire or replace it. Read-only. " +
        "Live references mean the CURRENT version of each position only.\n\n" +
        "Returns:\n" +
        "  - dataPoints: a paginated page of the source's data points (id, sequence, status)\n" +
        "  - derivativeSources: sources whose derivedFrom points at this source\n" +
        "  - positions: deduped current position versions referencing ANY of this source's " +
        "data points (positionId, title, theme, currentVersionId)\n" +
        "  - observations: deduped curator observations referencing ANY of this source's " +
        "data points (id + short label)\n" +
        "  - summary: counts per category and source status\n\n" +
        "Only live references are reported; references that exist only in older " +
        "(superseded) position versions are not scanned. The positions, observations, and " +
        "summary cover the full data point set regardless of the dataPoints page window.\n\n" +
        "Args:\n" +
        "  - sourceId (string): The source ID\n" +
        "  - limit (number, optional): data point page size, default 100, max 200\n" +
        "  - offset (number, optional): zero-based data point page offset, default 0",
      inputSchema: {
        sourceId: z.string().describe("The source ID"),
        limit: z.number().int().min(1).max(200).optional()
          .describe("Data point page size (default 100, max 200)"),
        offset: z.number().int().min(0).optional()
          .describe("Zero-based data point page offset (default 0)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ sourceId, limit, offset }) => {
      try {
        const usage = await convexQuery(api.usage.getSourceUsage, {
          sourceId: asId<"sources">(sourceId),
        });

        if (!usage) {
          return {
            content: [
              { type: "text" as const, text: `Source ${sourceId} not found.` },
            ],
          };
        }

        // Derivative sources and observations are scanned page-by-page (no
        // reverse index) so each query execution stays within the read budget.
        const derivativeSources = await drainUsagePages((cursor) =>
          convexQuery(api.usage.getSourceDerivativesPage, {
            projectId: asId<"projects">(usage.projectId),
            sourceId: asId<"sources">(sourceId),
            cursor,
          })
        );
        const dataPointIds: string[] = Array.isArray(usage.dataPointIds)
          ? usage.dataPointIds
          : [];
        const observations = await drainUsagePages((cursor) =>
          convexQuery(api.usage.getObservationsPage, {
            dataPointIds: dataPointIds.map((id) => asId<"dataPoints">(id)),
            cursor,
          })
        );

        const allDataPoints = Array.isArray(usage.dataPoints)
          ? usage.dataPoints
          : [];
        const pagination = clampPagination(limit, offset, 100, 200);
        const requestedPage = paginate(
          allDataPoints,
          pagination.limit,
          pagination.offset
        );
        const bounded = takeItemsWithinJsonLimit(
          requestedPage.items,
          (items) => ({ items })
        );
        const returnedLimit = bounded.truncatedBySize
          ? bounded.items.length
          : requestedPage.limit;

        const payload = {
          source: usage.source,
          summary: {
            ...usage.summaryCore,
            derivativeSourceCount: derivativeSources.items.length,
            observationCount: observations.items.length,
          },
          derivativeSources: derivativeSources.items,
          positions: usage.positions,
          observations: observations.items,
          dataPoints: {
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
          },
          scans: {
            derivativeSources: scanStatus(derivativeSources),
            observations: scanStatus(observations),
          },
        };

        const text = truncateIfNeeded(
          JSON.stringify(stripEmbeddingsDeep(payload), null, 2)
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
}
