/**
 * Extraction tools for Curate Mind MCP.
 *
 * These tools support the three-pass extraction pipeline:
 * - cm_extract_source: Get source text + metadata for the extraction agent
 * - cm_save_data_points: Persist extracted data points to Convex
 * - cm_enrich_data_points_batch: Add Pass 3 enrichment to a batch of data points
 * - cm_update_data_points_tags_batch: Add tags to a batch of data points (Pass 3)
 * - cm_save_source_synthesis: Persist the Pass 1 analytical summary
 * - cm_save_mental_models: Persist mental models flagged during extraction
 * - cm_update_source_status: Mark a source as extracted or failed
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { api, asId, convexMutation, convexQuery } from "../lib/convex-client.js";

type SourceWithFullText = Exclude<
  typeof api.sources.getSourceWithFullText["_returnType"],
  null
>;

export function registerExtractionTools(server: McpServer): void {
  // ============================================================
  // cm_extract_source — Get source text + metadata for extraction
  // ============================================================
  server.registerTool(
    "cm_extract_source",
    {
      title: "Get Source for Extraction",
      description:
        "Retrieve a source's full text and metadata for the extraction pipeline. " +
        "Returns everything the extraction agent needs for Pass 1.\n\n" +
        "Args:\n" +
        "  - sourceId (string): The source ID to extract\n\n" +
        "Returns: Source metadata and full text content.",
      inputSchema: {
        sourceId: z.string().describe("The source ID to extract"),
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
              { type: "text" as const, text: `Error: Source ${sourceId} not found.` },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  _id: (source as SourceWithFullText)._id,
                  title: (source as SourceWithFullText).title,
                  authorName: (source as SourceWithFullText).authorName,
                  publisherName: (source as SourceWithFullText).publisherName,
                  sourceType: (source as SourceWithFullText).sourceType,
                  tier: (source as SourceWithFullText).tier,
                  intakeNote: (source as SourceWithFullText).intakeNote,
                  wordCount: (source as SourceWithFullText).wordCount,
                  locationGuidance: getLocationGuidance(
                    (source as SourceWithFullText).sourceType
                  ),
                  fullText: (source as SourceWithFullText).fullText,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error retrieving source: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ============================================================
  // cm_save_data_points — Save extracted data points to Convex
  // ============================================================
  server.registerTool(
    "cm_save_data_points",
    {
      title: "Save Extracted Data Points",
      description:
        "Save a batch of data points extracted from a source (Pass 1 output). " +
        "Each data point requires a claim, anchor quote, evidence type, and location. " +
        "For video sources, use locationType='timestamp' with a single paragraph " +
        "start timestamp like 05:23. Do NOT use timestamp ranges like 05:23-06:10. " +
        "Tags are linked by slug (tags must exist first — use cm_create_tag).\n\n" +
        "Args:\n" +
        "  - sourceId (string): The source these data points came from\n" +
        "  - dataPoints (array): Array of extracted data points, each with:\n" +
        "    - dpSequenceNumber (number): Order within the source\n" +
        "    - claimText (string): The synthesized claim\n" +
        "    - anchorQuote (string): Verbatim 5-15 words from source\n" +
        "    - evidenceType (string): statistic, framework, prediction, case-study, observation, recommendation\n" +
        "    - locationType (string): paragraph, page, timestamp, section\n" +
        "    - locationStart (string): Location reference\n" +
        "    - tagSlugs (string[]): Tag slugs to link\n\n" +
        "Returns: Array of created data point IDs.",
      inputSchema: {
        sourceId: z.string().describe("Source ID these data points come from"),
        dataPoints: z.array(
          z.object({
            dpSequenceNumber: z.number().int().describe("Order within the source"),
            claimText: z.string().min(1).describe("The synthesized claim"),
            anchorQuote: z.string().min(1).describe("Verbatim 5-15 words from source"),
            evidenceType: z.enum([
              "statistic", "framework", "prediction",
              "case-study", "observation", "recommendation",
            ]).describe("Type of evidence"),
            locationType: z.enum(["paragraph", "page", "timestamp", "section"])
              .describe("How location is referenced; use 'timestamp' for video sources"),
            locationStart: z.string().describe(
              "Location reference within source. For video sources, use a single start timestamp like 05:23."
            ),
            tagSlugs: z.array(z.string()).describe("Tag slugs to link"),
          })
        ).describe("Array of data points to save"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ sourceId, dataPoints }) => {
      try {
        const source = await convexQuery(api.sources.getSource, {
          sourceId: asId<"sources">(sourceId),
        });

        if (!source) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error saving data points: Source ${sourceId} not found.`,
              },
            ],
          };
        }

        const validationError = validateDataPointLocations(source.sourceType, dataPoints);
        if (validationError) {
          return {
            content: [
              {
                type: "text" as const,
                text: validationError,
              },
            ],
          };
        }

        const ids = await convexMutation(api.dataPoints.insertBatch, {
          sourceId: asId<"sources">(sourceId),
          dataPoints: dataPoints.map((dataPoint) => ({
            ...dataPoint,
            tagSlugs: dataPoint.tagSlugs,
          })),
        }) as string[];

        return {
          content: [
            {
              type: "text" as const,
              text:
                `Saved ${ids.length} data points for source ${sourceId}.\n` +
                `IDs: ${ids.join(", ")}\n` +
                `Embeddings: pending (will be generated when cm_generate_embeddings is run)`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error saving data points: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ============================================================
  // cm_enrich_data_points_batch — Add Pass 3 enrichment to a batch of DPs
  // ============================================================
  server.registerTool(
    "cm_enrich_data_points_batch",
    {
      title: "Enrich Data Points in Batch (Pass 3)",
      description:
        "Add Pass 3 enrichment to a batch of data points: confidence signal, extraction " +
        "note, and related data point links. All DP IDs are validated before any writes — " +
        "if one ID is invalid the entire batch fails and nothing is written. " +
        "Re-enrichment is allowed and will overwrite existing values.\n\n" +
        "Args:\n" +
        "  - enrichments (array): Each item has:\n" +
        "    - dataPointId (string): The data point to enrich\n" +
        "    - confidence (string): strong, moderate, suggestive\n" +
        "    - extractionNote (string): Why this DP matters; connections to positions or open questions\n" +
        "    - relatedDataPoints (string[], optional): Related DP IDs within the same source\n\n" +
        "Returns: Array of {dataPointId, success: true} for each enriched DP.",
      inputSchema: {
        enrichments: z.array(
          z.object({
            dataPointId: z.string().describe("Data point ID to enrich"),
            confidence: z.enum(["strong", "moderate", "suggestive"])
              .describe("Confidence signal"),
            extractionNote: z.string().min(1)
              .describe("Why this DP matters; connections to positions or open questions. Do not use em dashes."),
            relatedDataPoints: z.array(z.string()).optional()
              .describe("Related DP IDs within the same source (argument chains)"),
          })
        ).min(1).describe("Array of enrichment operations to apply"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ enrichments }) => {
      try {
        const result = await convexMutation(api.dataPoints.enrichBatch, {
          enrichments: enrichments.map((e) => ({
            dataPointId: asId<"dataPoints">(e.dataPointId),
            confidence: e.confidence,
            extractionNote: e.extractionNote,
            relatedDataPoints: e.relatedDataPoints?.map((id) =>
              asId<"dataPoints">(id)
            ),
          })),
        });

        return {
          content: [
            {
              type: "text" as const,
              text:
                `Enriched ${result.length} data points.\n` +
                result.map((r: { dataPointId: string }) => `  ${r.dataPointId}: success`).join("\n"),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error enriching data points: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ============================================================
  // cm_update_data_points_tags_batch — Add tags to a batch of DPs (Pass 3)
  // ============================================================
  server.registerTool(
    "cm_update_data_points_tags_batch",
    {
      title: "Update Data Point Tags in Batch (Pass 3)",
      description:
        "Add tags to a batch of data points. Used in Pass 3 enrichment when tags " +
        "are assigned after seeing all DPs from a source holistically. " +
        "All DP IDs are validated before any writes — if one ID is invalid the entire " +
        "batch fails and nothing is written. " +
        "Additive only — does not remove existing tag links. " +
        "Tag slugs not found in the project vocabulary are skipped (counted in tagsSkipped).\n\n" +
        "Args:\n" +
        "  - updates (array): Each item has:\n" +
        "    - dataPointId (string): The data point to tag\n" +
        "    - tagSlugs (string[]): Tag slugs to add\n\n" +
        "Returns: Array of {dataPointId, tagsAdded, tagsSkipped} for each DP.",
      inputSchema: {
        updates: z.array(
          z.object({
            dataPointId: z.string().describe("Data point ID to tag"),
            tagSlugs: z.array(z.string()).min(1)
              .describe("Tag slugs to add to this data point"),
          })
        ).min(1).describe("Array of tag update operations to apply"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ updates }) => {
      try {
        const result = await convexMutation(api.dataPoints.updateTagsBatch, {
          updates: updates.map((u) => ({
            dataPointId: asId<"dataPoints">(u.dataPointId),
            tagSlugs: u.tagSlugs,
          })),
        });

        type TagBatchResult = { dataPointId: string; tagsAdded: number; tagsSkipped: number };
        const totalAdded = result.reduce((sum: number, r: TagBatchResult) => sum + r.tagsAdded, 0);
        const totalSkipped = result.reduce((sum: number, r: TagBatchResult) => sum + r.tagsSkipped, 0);

        return {
          content: [
            {
              type: "text" as const,
              text:
                `Tags updated for ${result.length} data points.\n` +
                `Total added: ${totalAdded}, Total skipped: ${totalSkipped}\n` +
                result
                  .map((r: TagBatchResult) => `  ${r.dataPointId}: +${r.tagsAdded} added, ${r.tagsSkipped} skipped`)
                  .join("\n"),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error updating tags: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ============================================================
  // cm_save_source_synthesis — Save Pass 1 analytical summary
  // ============================================================
  server.registerTool(
    "cm_save_source_synthesis",
    {
      title: "Save Source Synthesis",
      description:
        "Save the source synthesis generated at the end of Pass 1. " +
        "This is a 2-3 paragraph analytical summary of the source's argument, " +
        "key tensions, and strategic implications. It travels with the source " +
        "metadata into later passes to preserve document-level context.\n\n" +
        "Args:\n" +
        "  - sourceId (string): The source to attach the synthesis to\n" +
        "  - sourceSynthesis (string): The analytical summary text\n\n" +
        "Returns: Confirmation.",
      inputSchema: {
        sourceId: z.string().describe("Source ID to attach synthesis to"),
        sourceSynthesis: z.string().min(1)
          .describe("2-3 paragraph analytical summary of the source"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ sourceId, sourceSynthesis }) => {
      try {
        await convexMutation(api.sources.saveSourceSynthesis, {
          sourceId: asId<"sources">(sourceId),
          sourceSynthesis,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Source synthesis saved for ${sourceId} (${sourceSynthesis.length} characters).`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error saving source synthesis: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ============================================================
  // cm_update_source_status — Mark source as extracted or failed
  // ============================================================
  server.registerTool(
    "cm_update_source_status",
    {
      title: "Update Source Status",
      description:
        "Update a source's pipeline status. Use after extraction completes " +
        "or if extraction fails.\n\n" +
        "Args:\n" +
        "  - sourceId (string): The source to update\n" +
        "  - status (string): indexed, extracted, failed\n\n" +
        "Returns: Confirmation.",
      inputSchema: {
        sourceId: z.string().describe("Source ID to update"),
        status: z.enum(["indexed", "extracted", "failed"])
          .describe("New status"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ sourceId, status }) => {
      try {
        await convexMutation(api.sources.updateStatus, {
          sourceId: asId<"sources">(sourceId),
          status,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Source ${sourceId} status updated to: ${status}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error updating status: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}

function getLocationGuidance(sourceType: SourceWithFullText["sourceType"]): string {
  if (sourceType === "video") {
    return (
      "For video sources, cite paragraph start timestamps only. " +
      "Use locationType='timestamp' and locationStart='MM:SS' or 'HH:MM:SS'. " +
      "Do not use ranges like '00:52-02:26'. Use anchorQuote for the precise verifier."
    );
  }

  return (
    "Use the location format that best matches the source: paragraph for text blocks, " +
    "page for paginated documents, timestamp for audiovisual sources, or section for named sections."
  );
}

function validateDataPointLocations(
  sourceType: SourceWithFullText["sourceType"],
  dataPoints: Array<{
    dpSequenceNumber: number;
    locationType: "paragraph" | "page" | "timestamp" | "section";
    locationStart: string;
  }>
): string | null {
  if (sourceType !== "video") {
    return null;
  }

  const invalidTypePoints = dataPoints.filter(
    (dataPoint) => dataPoint.locationType !== "timestamp"
  );
  if (invalidTypePoints.length > 0) {
    const sequences = invalidTypePoints.map((dataPoint) => dataPoint.dpSequenceNumber).join(", ");
    return (
      "Error saving data points: Video sources must use locationType=\"timestamp\" " +
      `for every data point. Invalid dpSequenceNumber values: ${sequences}.`
    );
  }

  const invalidTimestampPoints = dataPoints.filter(
    (dataPoint) => !isSingleTimestampAnchor(dataPoint.locationStart)
  );
  if (invalidTimestampPoints.length > 0) {
    const details = invalidTimestampPoints
      .map(
        (dataPoint) =>
          `${dataPoint.dpSequenceNumber}="${dataPoint.locationStart}"`
      )
      .join(", ");
    return (
      "Error saving data points: Video sources must use a single paragraph start timestamp " +
      `in locationStart (for example 05:23). Do not use ranges. Invalid values: ${details}.`
    );
  }

  return null;
}

function isSingleTimestampAnchor(value: string): boolean {
  const trimmed = value.trim();
  return /^(\d{2}:\d{2}|\d{2}:\d{2}:\d{2}|\d{3,}:\d{2})$/.test(trimmed);
}
