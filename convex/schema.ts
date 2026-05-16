import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ============================================================
  // 0. PROJECTS — Top-level containers that scope all content
  // ============================================================
  projects: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    createdDate: v.string(),
  }).index("by_createdDate", ["createdDate"]),

  // ============================================================
  // 1. SOURCES — Provenance records for every piece of external content
  // ============================================================
  sources: defineTable({
    projectId: v.id("projects"),
    title: v.string(),
    authorName: v.optional(v.string()),
    publisherName: v.optional(v.string()),
    canonicalUrl: v.optional(v.string()),
    publishedDate: v.optional(v.string()),
    sourceType: v.union(
      v.literal("article"),
      v.literal("report"),
      v.literal("podcast"),
      v.literal("video"),
      v.literal("whitepaper"),
      v.literal("book"),
      v.literal("newsletter"),
      v.literal("social"),
      v.literal("other")
    ),
    tier: v.union(v.literal(1), v.literal(2), v.literal(3)),
    intakeNote: v.optional(v.string()),
    urlAccessibility: v.union(
      v.literal("public"),
      v.literal("paywalled"),
      v.literal("private")
    ),
    fullText: v.string(),
    contentHash: v.string(),
    storageId: v.optional(v.id("_storage")),
    wordCount: v.number(),
    derivedFrom: v.optional(v.id("sources")),
    derivedFromKind: v.optional(
      v.union(
        v.literal("commentary"),
        v.literal("summary"),
        v.literal("presentation"),
        v.literal("translation")
      )
    ),
    sourceRelationships: v.optional(
      v.array(
        v.object({
          sourceId: v.id("sources"),
          relationship: v.union(
            v.literal("derivative"),
            v.literal("responds-to"),
            v.literal("updates"),
            v.literal("related")
          ),
        })
      )
    ),
    sourceSynthesis: v.optional(v.string()),
    ingestedDate: v.string(),
    status: v.union(
      v.literal("indexed"),
      v.literal("extracted"),
      v.literal("failed")
    ),
  })
    .index("by_projectId", ["projectId"])
    .index("by_projectId_status", ["projectId", "status"])
    .index("by_status", ["status"])
    .index("by_contentHash", ["contentHash"])
    .index("by_tier", ["tier"])
    .index("by_ingestedDate", ["ingestedDate"])
    .index("by_sourceType", ["sourceType"]),

  // ============================================================
  // 2. DATA POINTS — Atomic claims extracted from sources
  // ============================================================
  dataPoints: defineTable({
    sourceId: v.id("sources"),
    dpSequenceNumber: v.number(),
    claimText: v.string(),
    anchorQuote: v.string(),
    extractionNote: v.optional(v.string()),
    evidenceType: v.union(
      v.literal("statistic"),
      v.literal("framework"),
      v.literal("prediction"),
      v.literal("case-study"),
      v.literal("observation"),
      v.literal("recommendation")
    ),
    confidence: v.optional(
      v.union(
        v.literal("strong"),
        v.literal("moderate"),
        v.literal("suggestive")
      )
    ),
    locationType: v.union(
      v.literal("paragraph"),
      v.literal("page"),
      v.literal("timestamp"),
      v.literal("section")
    ),
    locationStart: v.string(),
    relatedDataPoints: v.optional(v.array(v.id("dataPoints"))),
    extractionDate: v.string(),
    speakerAttribution: v.optional(v.union(v.string(), v.null())),
    embedding: v.optional(v.array(v.float64())),
    embeddingStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("complete"),
        v.literal("failed")
      )
    ),
    currentCorrectionId: v.optional(v.id("dataPointCorrections")),
  })
    .index("by_sourceId", ["sourceId"])
    .index("by_extractionDate", ["extractionDate"])
    .index("by_embeddingStatus", ["embeddingStatus"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["sourceId", "evidenceType", "confidence"],
    }),

  // ============================================================
  // 3. DATA POINT CORRECTIONS - Append-only anchor and attribution fixes
  // ============================================================
  dataPointCorrections: defineTable({
    dataPointId: v.id("dataPoints"),
    correctionType: v.union(
      v.literal("anchor"),
      v.literal("attribution")
    ),
    priorAnchorQuote: v.optional(v.string()),
    priorClaimText: v.optional(v.string()),
    correctedAnchorQuote: v.optional(v.string()),
    correctedClaimText: v.optional(v.string()),
    reason: v.string(),
    correctedAt: v.number(),
    correctedBy: v.optional(v.string()),
    previousCorrectionId: v.optional(v.id("dataPointCorrections")),
  }).index("by_dataPoint", ["dataPointId", "correctedAt"]),

  // ============================================================
  // 4. CORRECTIONS - Append-only audit log for field corrections
  // ============================================================
  corrections: defineTable({
    projectId: v.id("projects"),
    targetType: v.union(v.literal("dataPoint"), v.literal("source")),
    targetId: v.union(v.id("dataPoints"), v.id("sources")),
    correctionType: v.union(
      v.literal("anchor_text"),
      v.literal("anchor_passage"),
      v.literal("anchor_missing"),
      v.literal("anchor_swap"),
      v.literal("source_publisher"),
      v.literal("source_author"),
      v.literal("source_url"),
      v.literal("source_published_date"),
      v.literal("dp_speaker_attribution")
    ),
    previousValue: v.union(v.string(), v.null()),
    newValue: v.string(),
    reason: v.string(),
    pairedTargetId: v.optional(v.id("dataPoints")),
    correctedAt: v.number(),
    correctedBy: v.union(
      v.literal("curator"),
      v.literal("agent"),
      v.literal("pipeline")
    ),
  }).index("by_project_target", ["projectId", "targetType", "targetId"]),

  // ============================================================
  // 5. CURATOR OBSERVATIONS - The curator's connective insights
  // ============================================================
  curatorObservations: defineTable({
    observationText: v.string(),
    referencedDataPoints: v.optional(v.array(v.id("dataPoints"))),
    referencedPositions: v.optional(v.array(v.id("researchPositions"))),
    capturedDate: v.string(),
    embedding: v.optional(v.array(v.float64())),
    embeddingStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("complete"),
        v.literal("failed")
      )
    ),
  })
    .index("by_capturedDate", ["capturedDate"])
    .index("by_embeddingStatus", ["embeddingStatus"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
    }),

  // ============================================================
  // 4. MENTAL MODELS — Frameworks, analogies, memorable terms
  // ============================================================
  mentalModels: defineTable({
    modelType: v.union(
      v.literal("framework"),
      v.literal("analogy"),
      v.literal("term"),
      v.literal("metaphor"),
      v.literal("principle")
    ),
    title: v.string(),
    description: v.string(),
    sourceId: v.id("sources"),
    sourceDataPointId: v.optional(v.id("dataPoints")),
    capturedDate: v.string(),
    embedding: v.optional(v.array(v.float64())),
    embeddingStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("complete"),
        v.literal("failed")
      )
    ),
  })
    .index("by_sourceId", ["sourceId"])
    .index("by_modelType", ["modelType"])
    .index("by_capturedDate", ["capturedDate"])
    .index("by_embeddingStatus", ["embeddingStatus"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
    }),

  // ============================================================
  // 5. RESEARCH THEMES — Macro areas that organize positions
  // ============================================================
  researchThemes: defineTable({
    projectId: v.id("projects"),
    title: v.string(),
    description: v.optional(v.string()),
    createdDate: v.string(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_createdDate", ["createdDate"]),

  // ============================================================
  // 6. RESEARCH POSITIONS — Identity records (versioned theses)
  // ============================================================
  researchPositions: defineTable({
    themeId: v.id("researchThemes"),
    title: v.string(),
    currentVersionId: v.optional(v.id("positionVersions")),
    createdDate: v.string(),
  })
    .index("by_themeId", ["themeId"])
    .index("by_createdDate", ["createdDate"]),

  // ============================================================
  // 7. POSITION VERSIONS — Append-only version history
  // ============================================================
  positionVersions: defineTable({
    positionId: v.id("researchPositions"),
    versionNumber: v.number(),
    previousVersionId: v.optional(v.id("positionVersions")),
    currentStance: v.string(),
    confidenceLevel: v.union(
      v.literal("emerging"),
      v.literal("active"),
      v.literal("established")
    ),
    status: v.union(
      v.literal("emerging"),
      v.literal("active"),
      v.literal("established"),
      v.literal("evolved"),
      v.literal("retired")
    ),
    supportingEvidence: v.array(v.id("dataPoints")),
    counterEvidence: v.optional(v.array(v.id("dataPoints"))),
    curatorObservations: v.optional(v.array(v.id("curatorObservations"))),
    mentalModels: v.optional(v.array(v.id("mentalModels"))),
    openQuestions: v.optional(v.array(v.string())),
    changeSummary: v.optional(v.string()),
    versionDate: v.string(),
    embedding: v.optional(v.array(v.float64())),
    embeddingStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("complete"),
        v.literal("failed")
      )
    ),
  })
    .index("by_positionId", ["positionId"])
    .index("by_positionId_versionNumber", ["positionId", "versionNumber"])
    .index("by_versionDate", ["versionDate"])
    .index("by_embeddingStatus", ["embeddingStatus"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["positionId", "status"],
    }),

  // ============================================================
  // 8. TAGS — Flat controlled vocabulary
  // ============================================================
  tags: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    slug: v.string(),
    category: v.optional(v.string()),
    retired: v.optional(v.boolean()),
    retiredAt: v.optional(v.string()),
    redirectedToTagId: v.optional(v.id("tags")),
    retirementReason: v.optional(v.string()),
  })
    .index("by_projectId", ["projectId"])
    .index("by_projectId_slug", ["projectId", "slug"])
    .index("by_slug", ["slug"])
    .index("by_category", ["category"]),

  // ============================================================
  // 9-11. JUNCTION TABLES — Tag links
  // ============================================================
  dataPointTags: defineTable({
    dataPointId: v.id("dataPoints"),
    tagId: v.id("tags"),
  })
    .index("by_dataPointId", ["dataPointId"])
    .index("by_tagId", ["tagId"]),

  curatorObservationTags: defineTable({
    curatorObservationId: v.id("curatorObservations"),
    tagId: v.id("tags"),
  })
    .index("by_curatorObservationId", ["curatorObservationId"])
    .index("by_tagId", ["tagId"]),

  mentalModelTags: defineTable({
    mentalModelId: v.id("mentalModels"),
    tagId: v.id("tags"),
  })
    .index("by_mentalModelId", ["mentalModelId"])
    .index("by_tagId", ["tagId"]),

  // ============================================================
  // 12. RESEARCH LENS — Auto-generated system artifact
  // ============================================================
  researchLens: defineTable({
    projectId: v.id("projects"),
    currentPositions: v.string(),
    openQuestions: v.string(),
    surpriseSignals: v.string(),
    generatedDate: v.string(),
    triggeredBy: v.union(
      v.literal("weekly-synthesis"),
      v.literal("exception-signal"),
      v.literal("manual")
    ),
  })
    .index("by_projectId", ["projectId"])
    .index("by_generatedDate", ["generatedDate"]),
});
