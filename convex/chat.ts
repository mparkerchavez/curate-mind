import { v } from "convex/values";
import { action, query } from "./_generated/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

declare const process: {
  env: Record<string, string | undefined>;
};

// ============================================================
// Grounded chat action
// ------------------------------------------------------------
// Embeds the user's question, runs vector search over data
// points, hydrates source metadata, pulls the current Research
// Lens, builds a system prompt, and asks Claude to respond and
// declare which data point IDs it actually used.
// ============================================================

type Role = "user" | "assistant";

type ConversationTurn = {
  role: Role;
  content: string;
};

type CitedDataPoint = {
  _id: string;
  claimText: string;
  anchorQuote: string;
  evidenceType: string;
  confidence?: string;
  extractionNote?: string;
  sourceId: string;
  source: {
    _id: string;
    title: string;
    authorName?: string;
    publisherName?: string;
    canonicalUrl?: string;
    publishedDate?: string;
    tier: number;
  } | null;
};

export const askGrounded = action({
  args: {
    question: v.string(),
    projectId: v.id("projects"),
    conversationHistory: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
      })
    ),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    answer: string;
    citedDataPointIds: string[];
    retrievedDataPoints: CitedDataPoint[];
  }> => {
    const openaiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!openaiKey) throw new Error("OPENAI_API_KEY is not set in Convex env");
    if (!anthropicKey)
      throw new Error("ANTHROPIC_API_KEY is not set in Convex env");

    // 1. Embed the question
    const embedding = await embedText(args.question, openaiKey);

    // 2. Vector search dataPoints (top 12)
    const results = await ctx.vectorSearch("dataPoints", "by_embedding", {
      vector: embedding,
      limit: 12,
    });

    // 3. Hydrate data points + sources
    const retrieved: CitedDataPoint[] = [];
    for (const result of results) {
      const dp = (await ctx.runQuery(api.dataPoints.getDataPoint, {
        dataPointId: result._id as Id<"dataPoints">,
      })) as any;
      if (!dp) continue;
      retrieved.push({
        _id: String(dp._id),
        claimText: dp.claimText,
        anchorQuote: dp.anchorQuote,
        evidenceType: dp.evidenceType,
        confidence: dp.confidence,
        extractionNote: dp.extractionNote,
        sourceId: String(dp.sourceId),
        source: dp.source
          ? {
              _id: String(dp.source._id),
              title: dp.source.title,
              authorName: dp.source.authorName,
              publisherName: dp.source.publisherName,
              canonicalUrl: dp.source.canonicalUrl,
              publishedDate: dp.source.publishedDate,
              tier: dp.source.tier,
            }
          : null,
      });
    }

    // 4. Pull the current Research Lens for context
    const lens = (await ctx.runQuery(api.researchLens.getCurrentLens, {
      projectId: args.projectId,
    })) as any;

    // 5. Build the system prompt
    const lensBlock = lens
      ? [
          "## Current Research Lens",
          "### Active positions",
          lens.currentPositions,
          "",
          "### Open questions",
          lens.openQuestions,
          "",
          "### Surprise signals",
          lens.surpriseSignals,
        ].join("\n")
      : "## Current Research Lens\n(none yet)";

    const evidenceBlock = retrieved
      .map((dp, i) => {
        const src = dp.source;
        const srcLine = src
          ? `Source: "${src.title}"${
              src.authorName ? ` — ${src.authorName}` : ""
            }${src.publisherName ? ` (${src.publisherName})` : ""}${
              src.publishedDate ? `, ${src.publishedDate}` : ""
            } [tier ${src.tier}]`
          : "Source: unknown";
        return [
          `### Data Point ${i + 1} — id: ${dp._id}`,
          `Type: ${dp.evidenceType}${
            dp.confidence ? ` · confidence: ${dp.confidence}` : ""
          }`,
          `Claim: ${dp.claimText}`,
          `Anchor quote: "${dp.anchorQuote}"`,
          dp.extractionNote ? `Note: ${dp.extractionNote}` : "",
          srcLine,
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n");

    const systemPrompt = [
      "You are the Curate Mind research assistant. You answer questions strictly grounded in the February 2026 AI strategy and adoption research that has been curated into this knowledge base. You do not speculate beyond the provided evidence, and you do not invent sources, statistics, or quotes.",
      "",
      "Style: precise, intellectually honest, never breathless. Write like an analyst, not a marketer. When evidence is thin, say so.",
      "",
      "When you draw on a data point, cite it inline like [DP1], [DP2], where the number matches the data point order below.",
      "",
      "At the very end of your response, on its own line after a blank line, output a single JSON code block listing the IDs (not the DPN labels) of the data points you actually used:",
      "```json",
      '{"cited_dp_ids": ["id1", "id2"]}',
      "```",
      "If you used none of the provided evidence, return an empty array. Never include this JSON anywhere except at the very end.",
      "",
      lensBlock,
      "",
      "## Retrieved Evidence",
      evidenceBlock || "(no evidence retrieved)",
    ].join("\n");

    // 6. Build messages — prior history + new question
    const messages = [
      ...args.conversationHistory.map((t) => ({
        role: t.role,
        content: t.content,
      })),
      { role: "user" as const, content: args.question },
    ];

    // 7. Call Anthropic
    const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system: systemPrompt,
        messages,
      }),
    });

    if (!anthropicResp.ok) {
      const errText = await anthropicResp.text();
      throw new Error(
        `Anthropic API error: ${anthropicResp.status} ${errText}`
      );
    }

    const anthropicData = (await anthropicResp.json()) as {
      content: Array<{ type: string; text?: string }>;
    };

    const rawText = anthropicData.content
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text as string)
      .join("\n");

    // 8. Parse: extract trailing JSON block, return prose before it
    const { answer, citedDataPointIds } = parseCitedJson(rawText);

    return {
      answer,
      citedDataPointIds,
      retrievedDataPoints: retrieved,
    };
  },
});

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

async function embedText(text: string, apiKey: string): Promise<number[]> {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
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
  if (!r.ok) {
    throw new Error(`OpenAI embeddings error: ${r.status} ${await r.text()}`);
  }
  const data = (await r.json()) as { data: Array<{ embedding: number[] }> };
  return data.data[0].embedding;
}

function parseCitedJson(raw: string): {
  answer: string;
  citedDataPointIds: string[];
} {
  // Look for the LAST ```json ... ``` block
  const fenceRe = /```json\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  let last: { start: number; end: number; body: string } | null = null;
  while ((match = fenceRe.exec(raw)) !== null) {
    last = {
      start: match.index,
      end: match.index + match[0].length,
      body: match[1],
    };
  }

  if (last) {
    try {
      const parsed = JSON.parse(last.body);
      const ids = Array.isArray(parsed?.cited_dp_ids)
        ? parsed.cited_dp_ids.filter((x: unknown) => typeof x === "string")
        : [];
      const answer = raw.slice(0, last.start).trim();
      return { answer, citedDataPointIds: ids };
    } catch {
      // fall through
    }
  }

  // Fallback: try a bare JSON object at the very end
  const bareRe = /\{[^{}]*"cited_dp_ids"[^{}]*\}\s*$/;
  const bareMatch = raw.match(bareRe);
  if (bareMatch && bareMatch.index !== undefined) {
    try {
      const parsed = JSON.parse(bareMatch[0]);
      const ids = Array.isArray(parsed?.cited_dp_ids)
        ? parsed.cited_dp_ids.filter((x: unknown) => typeof x === "string")
        : [];
      return {
        answer: raw.slice(0, bareMatch.index).trim(),
        citedDataPointIds: ids,
      };
    } catch {
      // fall through
    }
  }

  return { answer: raw.trim(), citedDataPointIds: [] };
}
