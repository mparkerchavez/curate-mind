import { v } from "convex/values";
import { action, query, type QueryCtx } from "./_generated/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { resolveEffectiveContent } from "./dataPoints";
import { resolveSourceMeta } from "./sources";

declare const process: {
  env: Record<string, string | undefined>;
};

const DEFAULT_EVIDENCE_LIMIT = 10;
const MAX_EVIDENCE_LIMIT = 20;
const MAX_POSITIONS = 5;

function clampLimit(value: number | undefined): number {
  return Math.max(
    1,
    Math.min(value ?? DEFAULT_EVIDENCE_LIMIT, MAX_EVIDENCE_LIMIT)
  );
}

function buildDeepLinkUrl(
  baseUrl: string | null | undefined,
  anchorQuote?: string | null
): string | null {
  if (!baseUrl) return null;
  if (!anchorQuote) return baseUrl;

  const words = anchorQuote.trim().split(/\s+/).slice(0, 10).join(" ");
  const cleaned = words
    .replace(/[\u2018\u2019\u201C\u201D]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned ? `${baseUrl}#:~:text=${encodeURIComponent(cleaned)}` : baseUrl;
}

function getOriginalSourceUrl(source: any): string | null {
  if (!source) return null;
  if (source.storageUrl) return source.storageUrl;
  if (source.canonicalUrl && source.resolvedLinkKind !== "internal") {
    return source.canonicalUrl;
  }
  return null;
}

function sanitizeSource(source: any, anchorQuote?: string | null) {
  if (!source) return null;
  const originalUrl = getOriginalSourceUrl(source);
  return {
    sourceId: String(source._id),
    title: source.title,
    authorName: source.authorName,
    publisherName: source.publisherName,
    publishedDate: source.publishedDate,
    ingestedDate: source.ingestedDate,
    sourceType: source.sourceType,
    tier: source.tier,
    originalUrl,
    originalLinkKind:
      source.storageUrl
        ? "storage"
        : source.canonicalUrl && source.resolvedLinkKind !== "internal"
          ? "canonical"
          : "unavailable",
    anchorLink: buildDeepLinkUrl(originalUrl, anchorQuote),
  };
}

function rankText(value: string, terms: Set<string>): number {
  const haystack = value.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (haystack.includes(term)) score++;
  }
  return score;
}

function tokenizeForRank(value: string): Set<string> {
  const stopWords = new Set([
    "about",
    "after",
    "does",
    "from",
    "have",
    "into",
    "latest",
    "may",
    "research",
    "show",
    "say",
    "since",
    "that",
    "the",
    "this",
    "what",
    "with",
  ]);

  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length >= 3 && !stopWords.has(term))
  );
}

async function embedText(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set in Convex env");

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
    throw new Error(`OpenAI embeddings error: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
  return data.data[0].embedding;
}

async function getDataPointIdsForPosition(ctx: QueryCtx, positionId: Id<"researchPositions">) {
  const position = await ctx.db.get(positionId);
  if (!position?.currentVersionId) return [];
  const version = await ctx.db.get(position.currentVersionId);
  if (!version) return [];
  return [
    ...version.supportingEvidence,
    ...(version.counterEvidence ?? []),
  ].map(String);
}

export const getPublicScope = query({
  args: {
    projectId: v.id("projects"),
    themeId: v.optional(v.id("researchThemes")),
    positionId: v.optional(v.id("researchPositions")),
    sourceId: v.optional(v.id("sources")),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return { ok: false as const, reason: "project_not_found" };

    if (args.sourceId) {
      const source = await ctx.db.get(args.sourceId);
      if (!source || String(source.projectId) !== String(args.projectId)) {
        return { ok: false as const, reason: "source_not_found" };
      }

      const dataPoints = await ctx.db
        .query("dataPoints")
        .withIndex("by_sourceId", (q) => q.eq("sourceId", args.sourceId!))
        .collect();

      return {
        ok: true as const,
        project: {
          projectId: String(project._id),
          name: project.name,
          description: project.description,
          domain: project.domain,
          audience: project.audience,
          timeHorizon: project.timeHorizon,
        },
        context: {
          scopeType: "source",
          sourceId: String(source._id),
          summary: `Source: ${source.title}`,
        },
        allowedDataPointIds: dataPoints.map((dp) => String(dp._id)),
      };
    }

    if (args.positionId) {
      const position = await ctx.db.get(args.positionId);
      const theme = position ? await ctx.db.get(position.themeId) : null;
      if (!position || !theme || String(theme.projectId) !== String(args.projectId)) {
        return { ok: false as const, reason: "position_not_found" };
      }

      const currentVersion = position.currentVersionId
        ? await ctx.db.get(position.currentVersionId)
        : null;

      return {
        ok: true as const,
        project: {
          projectId: String(project._id),
          name: project.name,
          description: project.description,
          domain: project.domain,
          audience: project.audience,
          timeHorizon: project.timeHorizon,
        },
        context: {
          scopeType: "position",
          themeId: String(theme._id),
          positionId: String(position._id),
          summary: `Position: ${position.title}`,
        },
        allowedDataPointIds: currentVersion
          ? [
              ...currentVersion.supportingEvidence,
              ...(currentVersion.counterEvidence ?? []),
            ].map(String)
          : [],
      };
    }

    if (args.themeId) {
      const theme = await ctx.db.get(args.themeId);
      if (!theme || String(theme.projectId) !== String(args.projectId)) {
        return { ok: false as const, reason: "theme_not_found" };
      }

      const positions = await ctx.db
        .query("researchPositions")
        .withIndex("by_themeId", (q) => q.eq("themeId", args.themeId!))
        .collect();

      const dataPointIds = new Set<string>();
      for (const position of positions) {
        for (const id of await getDataPointIdsForPosition(ctx, position._id)) {
          dataPointIds.add(id);
        }
      }

      return {
        ok: true as const,
        project: {
          projectId: String(project._id),
          name: project.name,
          description: project.description,
          domain: project.domain,
          audience: project.audience,
          timeHorizon: project.timeHorizon,
        },
        context: {
          scopeType: "theme",
          themeId: String(theme._id),
          summary: `Theme: ${theme.title}`,
        },
        allowedDataPointIds: Array.from(dataPointIds),
      };
    }

    return {
      ok: true as const,
      project: {
        projectId: String(project._id),
        name: project.name,
        description: project.description,
        domain: project.domain,
        audience: project.audience,
        timeHorizon: project.timeHorizon,
      },
      context: {
        scopeType: "project",
        summary: "Full project corpus",
      },
      allowedDataPointIds: null,
    };
  },
});

export const hydratePublicDataPoints = query({
  args: {
    projectId: v.id("projects"),
    dataPointIds: v.array(v.id("dataPoints")),
  },
  handler: async (ctx, args) => {
    const items = [];

    for (const dataPointId of args.dataPointIds) {
      const dp = await ctx.db.get(dataPointId);
      if (!dp) continue;

      const source = await ctx.db.get(dp.sourceId);
      if (!source || String(source.projectId) !== String(args.projectId)) continue;

      const sourceMeta = await resolveSourceMeta(ctx, source);
      const tagLinks = await ctx.db
        .query("dataPointTags")
        .withIndex("by_dataPointId", (q) => q.eq("dataPointId", dataPointId))
        .collect();
      const tags = await Promise.all(
        tagLinks.map(async (link) => await ctx.db.get(link.tagId))
      );
      const effectiveContent = await resolveEffectiveContent(ctx, dp);

      items.push({
        dataPointId: String(dp._id),
        sourceId: String(dp.sourceId),
        dpSequenceNumber: dp.dpSequenceNumber,
        claimText: effectiveContent.claimText,
        anchorQuote: effectiveContent.anchorQuote,
        evidenceType: dp.evidenceType,
        confidence: dp.confidence,
        extractionNote: dp.extractionNote,
        source: sanitizeSource(sourceMeta, effectiveContent.anchorQuote),
        tags: tags
          .filter(Boolean)
          .map((tag: any) => ({
            tagId: String(tag._id),
            name: tag.name,
            slug: tag.slug,
            category: tag.category,
          })),
      });
    }

    return items;
  },
});

export const hydratePublicPositionsFromVersions = query({
  args: {
    projectId: v.id("projects"),
    versionIds: v.array(v.id("positionVersions")),
  },
  handler: async (ctx, args) => {
    const positions = [];
    const seen = new Set<string>();

    for (const versionId of args.versionIds) {
      const version = await ctx.db.get(versionId);
      if (!version) continue;

      const position = await ctx.db.get(version.positionId);
      const theme = position ? await ctx.db.get(position.themeId) : null;
      if (!position || !theme || String(theme.projectId) !== String(args.projectId)) {
        continue;
      }
      if (seen.has(String(position._id))) continue;
      seen.add(String(position._id));

      const currentVersion = position.currentVersionId
        ? await ctx.db.get(position.currentVersionId)
        : null;

      positions.push({
        positionId: String(position._id),
        themeId: String(theme._id),
        title: position.title,
        themeTitle: theme.title,
        currentStance: currentVersion?.currentStance ?? version.currentStance,
        confidenceLevel: currentVersion?.confidenceLevel ?? version.confidenceLevel,
        status: currentVersion?.status ?? version.status,
        supportingEvidenceCount: currentVersion?.supportingEvidence.length ?? 0,
        counterEvidenceCount: currentVersion?.counterEvidence?.length ?? 0,
      });

      if (positions.length >= MAX_POSITIONS) break;
    }

    return positions;
  },
});

export const hydratePublicPositionsByIds = query({
  args: {
    projectId: v.id("projects"),
    positionIds: v.array(v.id("researchPositions")),
  },
  handler: async (ctx, args) => {
    const positions = [];

    for (const positionId of args.positionIds) {
      const position = await ctx.db.get(positionId);
      const theme = position ? await ctx.db.get(position.themeId) : null;
      if (!position || !theme || String(theme.projectId) !== String(args.projectId)) {
        continue;
      }

      const currentVersion = position.currentVersionId
        ? await ctx.db.get(position.currentVersionId)
        : null;

      positions.push({
        positionId: String(position._id),
        themeId: String(theme._id),
        title: position.title,
        themeTitle: theme.title,
        currentStance: currentVersion?.currentStance ?? "",
        confidenceLevel: currentVersion?.confidenceLevel,
        status: currentVersion?.status,
        supportingEvidenceCount: currentVersion?.supportingEvidence.length ?? 0,
        counterEvidenceCount: currentVersion?.counterEvidence?.length ?? 0,
      });
    }

    return positions;
  },
});

export const listPublicPositions = query({
  args: {
    projectId: v.id("projects"),
    themeId: v.optional(v.id("researchThemes")),
  },
  handler: async (ctx, args) => {
    const themes = args.themeId
      ? [await ctx.db.get(args.themeId)]
      : await ctx.db
          .query("researchThemes")
          .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
          .collect();

    const rows = [];
    for (const theme of themes.filter(Boolean) as any[]) {
      if (String(theme.projectId) !== String(args.projectId)) continue;
      const positions = await ctx.db
        .query("researchPositions")
        .withIndex("by_themeId", (q) => q.eq("themeId", theme._id))
        .collect();

      for (const position of positions) {
        const currentVersion = position.currentVersionId
          ? await ctx.db.get(position.currentVersionId)
          : null;
        rows.push({
          positionId: String(position._id),
          themeId: String(theme._id),
          title: position.title,
          themeTitle: theme.title,
          currentStance: currentVersion?.currentStance ?? "",
          confidenceLevel: currentVersion?.confidenceLevel,
          status: currentVersion?.status,
          supportingEvidenceCount: currentVersion?.supportingEvidence.length ?? 0,
          counterEvidenceCount: currentVersion?.counterEvidence?.length ?? 0,
        });
      }
    }

    return rows;
  },
});

export const getResearchPack = action({
  args: {
    projectId: v.id("projects"),
    question: v.string(),
    limit: v.optional(v.number()),
    themeId: v.optional(v.id("researchThemes")),
    positionId: v.optional(v.id("researchPositions")),
    sourceId: v.optional(v.id("sources")),
  },
  handler: async (ctx, args) => {
    const evidenceLimit = clampLimit(args.limit);
    const scope = (await ctx.runQuery(api.publicResearch.getPublicScope, {
      projectId: args.projectId,
      themeId: args.themeId,
      positionId: args.positionId,
      sourceId: args.sourceId,
    })) as any;

    if (!scope.ok) {
      throw new Error(`Public research scope unavailable: ${scope.reason}`);
    }

    const embedding = await embedText(args.question);
    const [dataPointResults, positionVersionResults] = await Promise.all([
      ctx.vectorSearch("dataPoints", "by_embedding", {
        vector: embedding,
        limit: scope.allowedDataPointIds
          ? Math.max(60, evidenceLimit * 5)
          : evidenceLimit * 3,
      }),
      ctx.vectorSearch("positionVersions", "by_embedding", {
        vector: embedding,
        limit: 15,
      }),
    ]);

    const allowedIds = scope.allowedDataPointIds
      ? new Set<string>(scope.allowedDataPointIds)
      : null;
    const rankedDataPointIds = dataPointResults.map((result) => String(result._id));
    const scopedRankedIds = allowedIds
      ? rankedDataPointIds.filter((id) => allowedIds.has(id))
      : rankedDataPointIds;
    const fallbackIds =
      allowedIds && scopedRankedIds.length === 0
        ? Array.from(allowedIds).slice(0, evidenceLimit)
        : [];
    const selectedDataPointIds = [...scopedRankedIds, ...fallbackIds]
      .filter((id, index, arr) => arr.indexOf(id) === index)
      .slice(0, evidenceLimit);

    const evidence = (await ctx.runQuery(api.publicResearch.hydratePublicDataPoints, {
      projectId: args.projectId,
      dataPointIds: selectedDataPointIds as Id<"dataPoints">[],
    })) as any[];

    let positions: any[] = [];
    if (args.positionId) {
      positions = (await ctx.runQuery(api.publicResearch.hydratePublicPositionsByIds, {
        projectId: args.projectId,
        positionIds: [args.positionId],
      })) as any[];
    } else {
      positions = (await ctx.runQuery(
        api.publicResearch.hydratePublicPositionsFromVersions,
        {
          projectId: args.projectId,
          versionIds: positionVersionResults.map(
            (result) => result._id
          ) as Id<"positionVersions">[],
        }
      )) as any[];
    }

    if (positions.length === 0) {
      const fallbackPositions = (await ctx.runQuery(
        api.publicResearch.listPublicPositions,
        {
          projectId: args.projectId,
          themeId: args.themeId,
        }
      )) as any[];
      const terms = tokenizeForRank(args.question);
      positions = fallbackPositions
        .map((position) => ({
          position,
          score: rankText(
            `${position.title} ${position.themeTitle} ${position.currentStance}`,
            terms
          ),
        }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_POSITIONS)
        .map(({ position }) => position);
    }

    const labeledPositions = positions.slice(0, MAX_POSITIONS).map((position, index) => ({
      label: `P${index + 1}`,
      ...position,
    }));
    const labeledEvidence = evidence.map((item, index) => ({
      label: `E${index + 1}`,
      ...item,
    }));

    return {
      question: args.question,
      generatedAt: new Date().toISOString(),
      project: scope.project,
      context: scope.context,
      usageGuidance: [
        "Use this pack as source-grounded context for the user's answer.",
        "Start from the returned positions when they are relevant.",
        "Cite evidence labels like [E1] for source-backed claims.",
        "Use source.anchorLink or source.originalUrl when the user needs to verify a claim.",
        "Do not imply this pack contains full source text; it contains short anchor quotes and source links only.",
        "If the evidence is thin, mixed, or indirect, say so explicitly.",
      ],
      positions: labeledPositions,
      evidence: labeledEvidence,
      retrieval: {
        evidenceLimit,
        returnedEvidenceCount: labeledEvidence.length,
        returnedPositionCount: labeledPositions.length,
        scoped: scope.context.scopeType !== "project",
      },
    };
  },
});

