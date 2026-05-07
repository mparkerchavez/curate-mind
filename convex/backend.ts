import { v } from "convex/values";
import { query } from "./_generated/server";

const tableValidator = v.union(
  v.literal("projects"),
  v.literal("sources"),
  v.literal("researchThemes"),
  v.literal("researchPositions"),
  v.literal("positionVersions"),
  v.literal("dataPoints"),
  v.literal("tags"),
  v.literal("curatorObservations"),
  v.literal("mentalModels"),
  v.literal("researchLens"),
  v.literal("dataPointTags"),
  v.literal("curatorObservationTags"),
  v.literal("mentalModelTags"),
);

export const exportEntityPage = query({
  args: {
    table: tableValidator,
    projectId: v.optional(v.id("projects")),
    cursor: v.union(v.string(), v.null()),
    numItems: v.number(),
  },
  handler: async (ctx, args) => {
    const paginationOpts = { cursor: args.cursor, numItems: args.numItems };

    if (args.table === "projects") {
      const page = await ctx.db.query("projects").paginate(paginationOpts);
      return sanitizePage(page, sanitizeProject);
    }

    if (args.table === "sources") {
      const projectId = args.projectId;
      const queryBuilder = projectId
        ? ctx.db
            .query("sources")
            .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
        : ctx.db.query("sources");
      const page = await queryBuilder.paginate(paginationOpts);
      return sanitizePage(page, sanitizeSource);
    }

    if (args.table === "researchThemes") {
      const projectId = args.projectId;
      const queryBuilder = projectId
        ? ctx.db
            .query("researchThemes")
            .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
        : ctx.db.query("researchThemes");
      const page = await queryBuilder.paginate(paginationOpts);
      return sanitizePage(page, sanitizeTheme);
    }

    if (args.table === "researchPositions") {
      const page = await ctx.db.query("researchPositions").paginate(paginationOpts);
      return sanitizePage(page, sanitizePosition);
    }

    if (args.table === "positionVersions") {
      const page = await ctx.db.query("positionVersions").paginate(paginationOpts);
      return sanitizePage(page, sanitizePositionVersion);
    }

    if (args.table === "dataPoints") {
      const page = await ctx.db.query("dataPoints").paginate(paginationOpts);
      return sanitizePage(page, sanitizeDataPoint);
    }

    if (args.table === "tags") {
      const projectId = args.projectId;
      const queryBuilder = projectId
        ? ctx.db
            .query("tags")
            .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
        : ctx.db.query("tags");
      const page = await queryBuilder.paginate(paginationOpts);
      return sanitizePage(page, sanitizeTag);
    }

    if (args.table === "curatorObservations") {
      const page = await ctx.db.query("curatorObservations").paginate(paginationOpts);
      return sanitizePage(page, sanitizeObservation);
    }

    if (args.table === "mentalModels") {
      const page = await ctx.db.query("mentalModels").paginate(paginationOpts);
      return sanitizePage(page, sanitizeMentalModel);
    }

    if (args.table === "researchLens") {
      const projectId = args.projectId;
      const queryBuilder = projectId
        ? ctx.db
            .query("researchLens")
            .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
        : ctx.db.query("researchLens");
      const page = await queryBuilder.paginate(paginationOpts);
      return sanitizePage(page, sanitizeResearchLens);
    }

    if (args.table === "dataPointTags") {
      const page = await ctx.db.query("dataPointTags").paginate(paginationOpts);
      return sanitizePage(page, (row) => ({
        _id: row._id,
        dataPointId: row.dataPointId,
        tagId: row.tagId,
      }));
    }

    if (args.table === "curatorObservationTags") {
      const page = await ctx.db.query("curatorObservationTags").paginate(paginationOpts);
      return sanitizePage(page, (row) => ({
        _id: row._id,
        curatorObservationId: row.curatorObservationId,
        tagId: row.tagId,
      }));
    }

    const page = await ctx.db.query("mentalModelTags").paginate(paginationOpts);
    return sanitizePage(page, (row) => ({
      _id: row._id,
      mentalModelId: row.mentalModelId,
      tagId: row.tagId,
    }));
  },
});

function sanitizePage<TDoc, TRecord>(
  page: { page: TDoc[]; continueCursor: string; isDone: boolean },
  sanitize: (doc: TDoc) => TRecord,
) {
  return {
    page: page.page.map(sanitize),
    continueCursor: page.continueCursor,
    isDone: page.isDone,
  };
}

function sanitizeProject(project: any) {
  return {
    _id: project._id,
    _creationTime: project._creationTime,
    name: project.name,
    description: project.description ?? null,
    createdDate: project.createdDate,
  };
}

function sanitizeSource(source: any) {
  return {
    _id: source._id,
    _creationTime: source._creationTime,
    projectId: source.projectId,
    title: source.title,
    authorName: source.authorName ?? null,
    publisherName: source.publisherName ?? null,
    canonicalUrl: source.canonicalUrl ?? null,
    publishedDate: source.publishedDate ?? null,
    sourceType: source.sourceType,
    tier: source.tier,
    intakeNote: source.intakeNote ?? null,
    urlAccessibility: source.urlAccessibility,
    wordCount: source.wordCount,
    sourceRelationships: source.sourceRelationships ?? [],
    sourceSynthesis: source.sourceSynthesis ?? null,
    ingestedDate: source.ingestedDate,
    status: source.status,
  };
}

function sanitizeTheme(theme: any) {
  return {
    _id: theme._id,
    _creationTime: theme._creationTime,
    projectId: theme.projectId,
    title: theme.title,
    description: theme.description ?? null,
    createdDate: theme.createdDate,
  };
}

function sanitizePosition(position: any) {
  return {
    _id: position._id,
    _creationTime: position._creationTime,
    themeId: position.themeId,
    title: position.title,
    currentVersionId: position.currentVersionId ?? null,
    createdDate: position.createdDate,
  };
}

function sanitizePositionVersion(version: any) {
  return {
    _id: version._id,
    _creationTime: version._creationTime,
    positionId: version.positionId,
    versionNumber: version.versionNumber,
    previousVersionId: version.previousVersionId ?? null,
    currentStance: version.currentStance,
    confidenceLevel: version.confidenceLevel,
    status: version.status,
    supportingEvidence: version.supportingEvidence ?? [],
    counterEvidence: version.counterEvidence ?? [],
    curatorObservations: version.curatorObservations ?? [],
    mentalModels: version.mentalModels ?? [],
    openQuestions: version.openQuestions ?? [],
    changeSummary: version.changeSummary ?? null,
    versionDate: version.versionDate,
  };
}

function sanitizeDataPoint(dataPoint: any) {
  return {
    _id: dataPoint._id,
    _creationTime: dataPoint._creationTime,
    sourceId: dataPoint.sourceId,
    dpSequenceNumber: dataPoint.dpSequenceNumber,
    claimText: dataPoint.claimText,
    extractionNote: dataPoint.extractionNote ?? null,
    evidenceType: dataPoint.evidenceType,
    confidence: dataPoint.confidence ?? null,
    locationType: dataPoint.locationType,
    locationStart: dataPoint.locationStart,
    relatedDataPoints: dataPoint.relatedDataPoints ?? [],
    extractionDate: dataPoint.extractionDate,
  };
}

function sanitizeTag(tag: any) {
  return {
    _id: tag._id,
    _creationTime: tag._creationTime,
    projectId: tag.projectId,
    name: tag.name,
    slug: tag.slug,
    category: tag.category ?? null,
  };
}

function sanitizeObservation(observation: any) {
  return {
    _id: observation._id,
    _creationTime: observation._creationTime,
    observationText: observation.observationText,
    referencedDataPoints: observation.referencedDataPoints ?? [],
    referencedPositions: observation.referencedPositions ?? [],
    capturedDate: observation.capturedDate,
  };
}

function sanitizeMentalModel(model: any) {
  return {
    _id: model._id,
    _creationTime: model._creationTime,
    modelType: model.modelType,
    title: model.title,
    description: model.description,
    sourceId: model.sourceId,
    sourceDataPointId: model.sourceDataPointId ?? null,
    capturedDate: model.capturedDate,
  };
}

function sanitizeResearchLens(lens: any) {
  return {
    _id: lens._id,
    _creationTime: lens._creationTime,
    projectId: lens.projectId,
    currentPositions: lens.currentPositions,
    openQuestions: lens.openQuestions,
    surpriseSignals: lens.surpriseSignals,
    generatedDate: lens.generatedDate,
    triggeredBy: lens.triggeredBy,
  };
}
