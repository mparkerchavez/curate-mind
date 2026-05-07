import { query } from "./_generated/server";

// ============================================================
// Backend transparency page: entity counts and sample records.
// Field visibility rules:
//   - Never expose fullText or storageId from sources
//   - Never expose anchorQuote from dataPoints
//   - Never expose embedding arrays from any entity
// ============================================================
export const getBackendSummary = query({
  args: {},
  handler: async (ctx) => {
    // ── Projects ──────────────────────────────────────────────
    const allProjects = await ctx.db.query("projects").collect();
    const projectSample = allProjects.slice(0, 3).map((p) => ({
      _id: p._id,
      name: p.name,
      description: p.description ?? null,
      createdDate: p.createdDate,
    }));

    // ── Sources (no fullText, no storageId) ───────────────────
    const allSources = await ctx.db.query("sources").collect();
    const sourceSample = allSources.slice(0, 3).map((s) => ({
      _id: s._id,
      title: s.title,
      sourceType: s.sourceType,
      tier: s.tier,
      status: s.status,
      wordCount: s.wordCount,
      publishedDate: s.publishedDate ?? null,
      authorName: s.authorName ?? null,
      publisherName: s.publisherName ?? null,
      urlAccessibility: s.urlAccessibility,
      ingestedDate: s.ingestedDate,
    }));

    // ── Data Points (no anchorQuote, no embedding) ────────────
    const allDataPoints = await ctx.db.query("dataPoints").collect();
    const dataPointSample = allDataPoints.slice(0, 3).map((dp) => ({
      _id: dp._id,
      claimText: dp.claimText,
      evidenceType: dp.evidenceType,
      confidence: dp.confidence ?? null,
      extractionNote: dp.extractionNote ?? null,
      extractionDate: dp.extractionDate,
    }));

    // ── Tags (with data point usage count) ────────────────────
    const allTags = await ctx.db.query("tags").collect();
    const tagSample = await Promise.all(
      allTags.slice(0, 3).map(async (tag) => {
        const links = await ctx.db
          .query("dataPointTags")
          .withIndex("by_tagId", (q) => q.eq("tagId", tag._id))
          .collect();
        return {
          _id: tag._id,
          slug: tag.slug,
          name: tag.name,
          category: tag.category ?? null,
          dataPointCount: links.length,
        };
      })
    );

    // ── Research Positions (with theme name and current stance) ─
    const allPositions = await ctx.db.query("researchPositions").collect();
    const positionSample = await Promise.all(
      allPositions.slice(0, 3).map(async (pos) => {
        const theme = await ctx.db.get(pos.themeId);
        const version = pos.currentVersionId
          ? await ctx.db.get(pos.currentVersionId)
          : null;
        return {
          _id: pos._id,
          title: pos.title,
          themeName: theme?.title ?? null,
          currentStance: version?.currentStance ?? null,
          confidenceLevel: version?.confidenceLevel ?? null,
        };
      })
    );

    // ── Curator Observations ──────────────────────────────────
    const allObservations = await ctx.db
      .query("curatorObservations")
      .collect();
    const observationSample = allObservations.slice(0, 3).map((obs) => ({
      _id: obs._id,
      observationText: obs.observationText,
      linkedDpCount: obs.referencedDataPoints?.length ?? 0,
      capturedDate: obs.capturedDate,
    }));

    // ── Mental Models ─────────────────────────────────────────
    const allMentalModels = await ctx.db.query("mentalModels").collect();
    const mentalModelSample = allMentalModels.slice(0, 3).map((mm) => ({
      _id: mm._id,
      title: mm.title,
      modelType: mm.modelType,
      description: mm.description,
      capturedDate: mm.capturedDate,
    }));

    return {
      projects: { count: allProjects.length, sample: projectSample },
      sources: { count: allSources.length, sample: sourceSample },
      dataPoints: { count: allDataPoints.length, sample: dataPointSample },
      tags: { count: allTags.length, sample: tagSample },
      researchPositions: {
        count: allPositions.length,
        sample: positionSample,
      },
      curatorObservations: {
        count: allObservations.length,
        sample: observationSample,
      },
      mentalModels: {
        count: allMentalModels.length,
        sample: mentalModelSample,
      },
    };
  },
});
