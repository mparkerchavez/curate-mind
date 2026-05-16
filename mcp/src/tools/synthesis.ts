/**
 * Synthesis tools for Curate Mind MCP.
 *
 * These tools manage the position layer:
 * - cm_create_theme: Create a new Research Theme
 * - cm_create_position: Create a new Research Position with initial version
 * - cm_update_position: Create a new version (append-only)
 * - cm_update_research_lens: Regenerate the Research Lens
 * - cm_create_tag: Create a new tag in the controlled vocabulary
 * - cm_generate_embeddings: Generate embeddings for pending entities
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { api, asId, convexMutation, convexQuery } from "../lib/convex-client.js";
import { generateEmbedding } from "../lib/openai-client.js";

type CreatePositionResult = typeof api.positions.createPosition["_returnType"];
type UpdatePositionResult = typeof api.positions.updatePosition["_returnType"];
type LinkEvidenceBatchResult = typeof api.positions.linkEvidenceBatch["_returnType"];
type CreateTagResult = typeof api.tags.createTag["_returnType"];
type ActivePositionForLens = NonNullable<
  typeof api.researchLens.getActivePositionsForLens["_returnType"][number]
>;
type PendingDataPoint =
  typeof api.dataPoints.getDataPointsNeedingEmbeddings["_returnType"][number];
type PendingObservation =
  typeof api.observations.getObservationsNeedingEmbeddings["_returnType"][number];
type PendingMentalModel =
  typeof api.mentalModels.getMentalModelsNeedingEmbeddings["_returnType"][number];

const EMBEDDING_CONCURRENCY = 5;

async function processWithConcurrency<T>(
  items: T[],
  worker: (item: T) => Promise<void>
): Promise<{ processed: number; errors: number }> {
  let nextIndex = 0;
  let processed = 0;
  let errors = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const item = items[nextIndex++];
      try {
        await worker(item);
        processed++;
      } catch {
        errors++;
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(EMBEDDING_CONCURRENCY, items.length) },
    () => runWorker()
  );
  await Promise.all(workers);

  return { processed, errors };
}

export function registerSynthesisTools(server: McpServer): void {
  // ============================================================
  // cm_list_projects — List all projects
  // ============================================================
  server.registerTool(
    "cm_list_projects",
    {
      title: "List Projects",
      description:
        "List all projects in Curate Mind. Projects are top-level containers " +
        "that scope sources, themes, positions, and tags.\n\n" +
        "Returns: All projects with their names and descriptions.",
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
        const projects = await convexQuery(api.projects.listProjects);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(projects, null, 2) },
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
  // cm_create_project — Create a new project
  // ============================================================
  server.registerTool(
    "cm_create_project",
    {
      title: "Create Project",
      description:
        "Create a new project in Curate Mind. Projects are top-level containers " +
        "that scope all content (sources, themes, positions, tags).\n\n" +
        "Args:\n" +
        "  - name (string): Project name (e.g., 'AI & Emerging Technology')\n" +
        "  - description (string, optional): Brief description of the project's focus\n\n" +
        "Returns: The new project ID.",
      inputSchema: {
        name: z.string().min(1).describe("Project name"),
        description: z.string().optional().describe("Brief description of focus"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ name, description }) => {
      try {
        const projectId = await convexMutation(api.projects.createProject, {
          name,
          description,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Project created.\nID: ${projectId}\nName: ${name}`,
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
  // cm_create_theme — Create a new Research Theme
  // ============================================================
  server.registerTool(
    "cm_create_theme",
    {
      title: "Create Research Theme",
      description:
        "Create a new Research Theme — a macro area that organizes positions.\n\n" +
        "Args:\n" +
        "  - title (string): Theme name (e.g., 'Enterprise AI Adoption Constraints')\n" +
        "  - description (string, optional): Brief description of the theme's scope\n\n" +
        "Returns: The new theme ID.",
      inputSchema: {
        projectId: z.string().describe("Project ID this theme belongs to"),
        title: z.string().min(1).describe("Theme name"),
        description: z.string().optional().describe("Brief description of scope"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ projectId, title, description }) => {
      try {
        const themeId = await convexMutation(api.positions.createTheme, {
          projectId: asId<"projects">(projectId),
          title,
          description,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Research Theme created.\nID: ${themeId}\nTitle: ${title}`,
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
  // cm_create_position — Create a new Research Position
  // ============================================================
  server.registerTool(
    "cm_create_position",
    {
      title: "Create Research Position",
      description:
        "Create a new Research Position under a theme with its initial version.\n\n" +
        "Args:\n" +
        "  - themeId (string): Parent Research Theme ID\n" +
        "  - title (string): Position title\n" +
        "  - currentStance (string): The curator's thesis statement\n" +
        "  - confidenceLevel (string): emerging, active, established\n" +
        "  - status (string): emerging, active, established, evolved, retired\n" +
        "  - supportingEvidence (string[]): Array of Data Point IDs\n" +
        "  - counterEvidence (string[], optional): Array of Data Point IDs\n" +
        "  - curatorObservations (string[], optional): Array of Observation IDs\n" +
        "  - mentalModels (string[], optional): Array of Mental Model IDs\n" +
        "  - openQuestions (string[], optional): What would change this position\n\n" +
        "Returns: Position ID and version ID.",
      inputSchema: {
        themeId: z.string().describe("Parent Research Theme ID"),
        title: z.string().min(1).describe("Position title"),
        currentStance: z.string().min(1).describe("The curator's thesis statement"),
        confidenceLevel: z.enum(["emerging", "active", "established"])
          .describe("How confident the curator is"),
        status: z.enum(["emerging", "active", "established", "evolved", "retired"])
          .describe("Position lifecycle status"),
        supportingEvidence: z.array(z.string())
          .describe("Data Point IDs that support this position"),
        counterEvidence: z.array(z.string()).optional()
          .describe("Data Point IDs that challenge this position"),
        curatorObservations: z.array(z.string()).optional()
          .describe("Curator Observation IDs"),
        mentalModels: z.array(z.string()).optional()
          .describe("Mental Model IDs"),
        openQuestions: z.array(z.string()).optional()
          .describe("What would change this position"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const result: CreatePositionResult = await convexMutation(
          api.positions.createPosition,
          {
          themeId: asId<"researchThemes">(params.themeId),
          title: params.title,
          currentStance: params.currentStance,
          confidenceLevel: params.confidenceLevel,
          status: params.status,
          supportingEvidence: params.supportingEvidence.map((id) =>
            asId<"dataPoints">(id)
          ),
          counterEvidence: params.counterEvidence?.map((id) =>
            asId<"dataPoints">(id)
          ),
          curatorObservations: params.curatorObservations?.map((id) =>
            asId<"curatorObservations">(id)
          ),
          mentalModels: params.mentalModels?.map((id) =>
            asId<"mentalModels">(id)
          ),
          openQuestions: params.openQuestions,
          }
        );

        return {
          content: [
            {
              type: "text" as const,
              text:
                `Research Position created.\n` +
                `Position ID: ${result.positionId}\n` +
                `Version ID: ${result.versionId} (v1)\n` +
                `Title: ${params.title}\n` +
                `Status: ${params.status}\n` +
                `Confidence: ${params.confidenceLevel}`,
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
  // cm_update_position — Append-only: creates new version
  // ============================================================
  server.registerTool(
    "cm_update_position",
    {
      title: "Update Research Position",
      description:
        "Create a new version of a Research Position (append-only). The " +
        "previous version is preserved. Requires a change summary explaining " +
        "what triggered the update.\n\n" +
        "Args:\n" +
        "  - positionId (string): The position to update\n" +
        "  - currentStance (string): Updated thesis statement\n" +
        "  - confidenceLevel (string): emerging, active, established\n" +
        "  - status (string): emerging, active, established, evolved, retired\n" +
        "  - supportingEvidence (string[]): Updated Data Point IDs\n" +
        "  - changeSummary (string): What triggered this version\n" +
        "  - counterEvidence (string[], optional): Updated counter-evidence\n" +
        "  - curatorObservations (string[], optional): Updated observations\n" +
        "  - mentalModels (string[], optional): Updated mental models\n" +
        "  - openQuestions (string[], optional): Updated open questions\n\n" +
        "Returns: New version ID and version number.",
      inputSchema: {
        positionId: z.string().describe("The position to update"),
        currentStance: z.string().min(1).describe("Updated thesis statement"),
        confidenceLevel: z.enum(["emerging", "active", "established"])
          .describe("Updated confidence level"),
        status: z.enum(["emerging", "active", "established", "evolved", "retired"])
          .describe("Updated lifecycle status"),
        supportingEvidence: z.array(z.string())
          .describe("Updated supporting Data Point IDs"),
        changeSummary: z.string().min(1)
          .describe("What triggered this version (which new DPs, what shifted)"),
        counterEvidence: z.array(z.string()).optional()
          .describe("Updated counter-evidence Data Point IDs"),
        curatorObservations: z.array(z.string()).optional()
          .describe("Updated Curator Observation IDs"),
        mentalModels: z.array(z.string()).optional()
          .describe("Updated Mental Model IDs"),
        openQuestions: z.array(z.string()).optional()
          .describe("Updated open questions"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const result: UpdatePositionResult = await convexMutation(
          api.positions.updatePosition,
          {
          positionId: asId<"researchPositions">(params.positionId),
          currentStance: params.currentStance,
          confidenceLevel: params.confidenceLevel,
          status: params.status,
          supportingEvidence: params.supportingEvidence.map((id) =>
            asId<"dataPoints">(id)
          ),
          changeSummary: params.changeSummary,
          counterEvidence: params.counterEvidence?.map((id) =>
            asId<"dataPoints">(id)
          ),
          curatorObservations: params.curatorObservations?.map((id) =>
            asId<"curatorObservations">(id)
          ),
          mentalModels: params.mentalModels?.map((id) =>
            asId<"mentalModels">(id)
          ),
          openQuestions: params.openQuestions,
          }
        );

        return {
          content: [
            {
              type: "text" as const,
              text:
                `Position updated (append-only).\n` +
                `New Version ID: ${result.versionId}\n` +
                `Version Number: ${result.versionNumber}\n` +
                `Previous version preserved.`,
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
  // cm_update_research_lens — Regenerate the Research Lens
  // ============================================================
  server.registerTool(
    "cm_update_research_lens",
    {
      title: "Update Research Lens",
      description:
        "Regenerate the Research Lens from current active and established " +
        "positions. The lens is a compressed snapshot used by Pass 2 enrichment.\n\n" +
        "Args:\n" +
        "  - triggeredBy (string): weekly-synthesis, exception-signal, manual\n\n" +
        "Returns: The new lens ID and summary of what it contains.",
      inputSchema: {
        projectId: z.string().describe("Project ID to generate lens for"),
        triggeredBy: z.enum(["weekly-synthesis", "exception-signal", "manual"])
          .describe("What triggered this lens regeneration"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ projectId, triggeredBy }) => {
      try {
        // Get all active positions to build the lens
        const activePositions = (
          await convexQuery(api.researchLens.getActivePositionsForLens, {
            projectId: asId<"projects">(projectId),
          })
        ).filter((position: unknown): position is ActivePositionForLens => position !== null);

        if (activePositions.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No active or established positions found. " +
                  "Create positions first before generating a Research Lens.",
              },
            ],
          };
        }

        // Compress positions into lens format
        const positionsSummary = activePositions
          .map(
            (p: ActivePositionForLens) =>
              `[${p.themeTitle}] ${p.positionTitle} (${p.confidenceLevel}): ${p.currentStance}`
          )
          .join("\n\n");

        const allOpenQuestions = activePositions
          .flatMap((p: ActivePositionForLens) => p.openQuestions || [])
          .filter(Boolean);
        const questionsSummary =
          allOpenQuestions.length > 0
            ? allOpenQuestions.map((q: string) => `- ${q}`).join("\n")
            : "No open questions currently.";

        const surpriseSummary =
          "Evidence that would challenge current positions:\n" +
          activePositions
            .map(
              (p: ActivePositionForLens) =>
                `- ${p.positionTitle}: findings contradicting "${p.currentStance.slice(0, 80)}..."`
            )
            .join("\n");

        // Save the lens
        const lensId = await convexMutation(api.researchLens.generateLens, {
          projectId: asId<"projects">(projectId),
          currentPositions: positionsSummary,
          openQuestions: questionsSummary,
          surpriseSignals: surpriseSummary,
          triggeredBy,
        });

        return {
          content: [
            {
              type: "text" as const,
              text:
                `Research Lens regenerated.\n` +
                `Lens ID: ${lensId}\n` +
                `Positions included: ${activePositions.length}\n` +
                `Open questions: ${allOpenQuestions.length}\n` +
                `Triggered by: ${triggeredBy}`,
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
  // cm_create_tag — Create a tag in the controlled vocabulary
  // ============================================================
  server.registerTool(
    "cm_create_tag",
    {
      title: "Create Tag",
      description:
        "Create a new tag in the controlled vocabulary. Tags are linked to " +
        "data points and power retrieval and trend detection. If a tag with " +
        "the same slug already exists, returns the existing tag ID.\n\n" +
        "Args:\n" +
        "  - name (string): Display name (e.g., 'Trust Deficit')\n" +
        "  - slug (string): URL-safe identifier (e.g., 'trust-deficit')\n" +
        "  - category (string, optional): Grouping (topic, method, sector, etc.)\n\n" +
        "Returns: Tag ID and whether it was newly created.",
      inputSchema: {
        projectId: z.string().describe("Project ID this tag belongs to"),
        name: z.string().min(1).describe("Display name"),
        slug: z.string().min(1).describe("URL-safe identifier"),
        category: z.string().optional().describe("Optional grouping category"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ projectId, name, slug, category }) => {
      try {
        const result: CreateTagResult = await convexMutation(
          api.tags.createTag,
          {
          projectId: asId<"projects">(projectId),
          name,
          slug,
          category,
          }
        );

        return {
          content: [
            {
              type: "text" as const,
              text: result.created
                ? `Tag created.\nID: ${result.tagId}\nName: ${name}\nSlug: ${slug}`
                : `Tag already exists.\nID: ${result.tagId}\nSlug: ${slug}`,
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
  // cm_get_position_arrays — Current evidence arrays only (no stance, no history)
  // ============================================================
  server.registerTool(
    "cm_get_position_arrays",
    {
      title: "Get Position Arrays",
      description:
        "Return only the current version's evidence arrays for a position — " +
        "no stance text, no version history, no embedding vectors.\n\n" +
        "Use this instead of cm_get_position_history for any operation that " +
        "only needs to know what evidence IDs are currently linked (e.g., " +
        "before calling cm_link_evidence_to_position). ~95% fewer tokens than " +
        "the history endpoint.\n\n" +
        "Args:\n" +
        "  - positionId (string): The position to inspect\n\n" +
        "Returns: supportingEvidence, counterEvidence, curatorObservations, " +
        "mentalModels, openQuestions (all as ID arrays), plus confidenceLevel, " +
        "status, versionNumber, and currentVersionId.",
      inputSchema: {
        positionId: z.string().describe("The position to inspect"),
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
        const result = await convexQuery(api.positions.getPositionArrays, {
          positionId: asId<"researchPositions">(positionId),
        });

        if (!result) {
          return {
            content: [{ type: "text" as const, text: "Position not found." }],
          };
        }

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
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
  // cm_link_evidence_to_position — Additive linkage, copies stance forward
  // ============================================================
  server.registerTool(
    "cm_link_evidence_to_position",
    {
      title: "Link Evidence to Position",
      description:
        "Add evidence IDs to a position without touching the stance text. " +
        "Creates a new version (append-only) that copies the current stance, " +
        "confidenceLevel, status, and openQuestions verbatim and merges the " +
        "new IDs into the existing arrays (deduped).\n\n" +
        "Use this for any update that only adds to evidence arrays. " +
        "Use cm_update_position only when the curator is revising the stance " +
        "text or open questions.\n\n" +
        "Args:\n" +
        "  - positionId (string): The position to update\n" +
        "  - addSupportingEvidence (string[], optional): DP IDs to add\n" +
        "  - addCounterEvidence (string[], optional): DP IDs to add\n" +
        "  - addCuratorObservations (string[], optional): Observation IDs to add\n" +
        "  - addMentalModels (string[], optional): Mental Model IDs to add\n" +
        "  - changeSummary (string): Why this version was created " +
        "(format: '+3S, +1C — [brief description]')\n\n" +
        "Returns: New version ID, version number, and count of IDs added per array. " +
        "Throws if the position is retired.",
      inputSchema: {
        positionId: z.string().describe("The position to update"),
        addSupportingEvidence: z.array(z.string()).optional()
          .describe("Data Point IDs to add as supporting evidence"),
        addCounterEvidence: z.array(z.string()).optional()
          .describe("Data Point IDs to add as counter evidence"),
        addCuratorObservations: z.array(z.string()).optional()
          .describe("Curator Observation IDs to add"),
        addMentalModels: z.array(z.string()).optional()
          .describe("Mental Model IDs to add"),
        changeSummary: z.string().min(1)
          .describe("Why this version was created (e.g. '+3S, +1C — new T2 sources')"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const result = await convexMutation(
          api.positions.linkEvidenceToPosition,
          {
            positionId: asId<"researchPositions">(params.positionId),
            addSupportingEvidence: params.addSupportingEvidence?.map((id) =>
              asId<"dataPoints">(id)
            ),
            addCounterEvidence: params.addCounterEvidence?.map((id) =>
              asId<"dataPoints">(id)
            ),
            addCuratorObservations: params.addCuratorObservations?.map((id) =>
              asId<"curatorObservations">(id)
            ),
            addMentalModels: params.addMentalModels?.map((id) =>
              asId<"mentalModels">(id)
            ),
            changeSummary: params.changeSummary,
          }
        );

        return {
          content: [
            {
              type: "text" as const,
              text:
                `Evidence linked (append-only).\n` +
                `New Version ID: ${result.versionId}\n` +
                `Version Number: ${result.versionNumber}\n` +
                `Added — Supporting: ${result.added.supportingEvidence}, ` +
                `Counter: ${result.added.counterEvidence}, ` +
                `Observations: ${result.added.curatorObservations}, ` +
                `Mental Models: ${result.added.mentalModels}\n` +
                `Stance text copied verbatim from previous version.`,
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
  // cm_update_positions_batch — Batch additive linkage, single transaction
  // ============================================================
  server.registerTool(
    "cm_update_positions_batch",
    {
      title: "Batch Link Evidence to Positions",
      description:
        "Add evidence IDs to multiple positions in a single atomic transaction. " +
        "Same additive-only semantics as cm_link_evidence_to_position: stance is " +
        "copied forward, arrays are merged and deduped, new versions are created.\n\n" +
        "All position IDs are validated before any writes occur. If any ID is " +
        "invalid or retired, the entire batch fails with no changes written.\n\n" +
        "Maximum 20 positions per call.\n\n" +
        "Args:\n" +
        "  - updates (array): Each item has:\n" +
        "      - positionId (string): Position to update\n" +
        "      - addSupportingEvidence (string[], optional)\n" +
        "      - addCounterEvidence (string[], optional)\n" +
        "      - addCuratorObservations (string[], optional)\n" +
        "      - addMentalModels (string[], optional)\n" +
        "      - changeSummary (string, required)\n\n" +
        "Returns: Array of { positionId, newVersionId, versionNumber } for each " +
        "updated position.",
      inputSchema: {
        updates: z.array(
          z.object({
            positionId: z.string().describe("Position to update"),
            addSupportingEvidence: z.array(z.string()).optional()
              .describe("Data Point IDs to add as supporting evidence"),
            addCounterEvidence: z.array(z.string()).optional()
              .describe("Data Point IDs to add as counter evidence"),
            addCuratorObservations: z.array(z.string()).optional()
              .describe("Curator Observation IDs to add"),
            addMentalModels: z.array(z.string()).optional()
              .describe("Mental Model IDs to add"),
            changeSummary: z.string().min(1)
              .describe("Why this version was created"),
          })
        ).max(20).describe("Array of position updates (max 20)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ updates }) => {
      try {
        const results: LinkEvidenceBatchResult = await convexMutation(
          api.positions.linkEvidenceBatch,
          {
            updates: updates.map((u) => ({
              positionId: asId<"researchPositions">(u.positionId),
              addSupportingEvidence: u.addSupportingEvidence?.map((id) =>
                asId<"dataPoints">(id)
              ),
              addCounterEvidence: u.addCounterEvidence?.map((id) =>
                asId<"dataPoints">(id)
              ),
              addCuratorObservations: u.addCuratorObservations?.map((id) =>
                asId<"curatorObservations">(id)
              ),
              addMentalModels: u.addMentalModels?.map((id) =>
                asId<"mentalModels">(id)
              ),
              changeSummary: u.changeSummary,
            })),
          }
        );

        const summary = results
          .map((r: { positionId: string; newVersionId: string; versionNumber: number }) =>
            `  ${r.positionId} → v${r.versionNumber} (${r.newVersionId})`
          )
          .join("\n");

        return {
          content: [
            {
              type: "text" as const,
              text:
                `Batch evidence link complete (${results.length} positions updated).\n\n` +
                `Results:\n${summary}\n\n` +
                `All stances copied verbatim. All arrays merged and deduped.`,
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
  // cm_generate_embeddings - Batch generate embeddings
  // ============================================================
  server.registerTool(
    "cm_generate_embeddings",
    {
      title: "Generate Embeddings",
      description:
        "Generate OpenAI embeddings for entities that are pending. Processes " +
        "data points, observations, and mental models that need embeddings.\n\n" +
        "Args:\n" +
        "  - limit (number, optional): Max entities to process per type, default 20, max 50, 25 recommended\n\n" +
        "Returns: Number of embeddings generated per entity type.",
      inputSchema: {
        limit: z.number().int().min(1).max(50).optional()
          .describe("Max entities to process per type (default 20, max 50, 25 recommended)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ limit }) => {
      const batchLimit = limit ?? 20;
      const results = { dataPoints: 0, observations: 0, mentalModels: 0, errors: 0 };

      try {
        // Process data points
        const pendingDPs: PendingDataPoint[] = await convexQuery(
          api.dataPoints.getDataPointsNeedingEmbeddings,
          { limit: batchLimit }
        );

        const dpResults = await processWithConcurrency(
          pendingDPs,
          async (dp) => {
            const embedding = await generateEmbedding(dp.claimText);
            await convexMutation(api.dataPoints.setEmbedding, {
              dataPointId: dp._id,
              embedding,
            });
          }
        );
        results.dataPoints += dpResults.processed;
        results.errors += dpResults.errors;

        // Process observations
        const pendingObs: PendingObservation[] = await convexQuery(
          api.observations.getObservationsNeedingEmbeddings,
          { limit: batchLimit }
        );

        const obsResults = await processWithConcurrency(
          pendingObs,
          async (obs) => {
            const embedding = await generateEmbedding(obs.observationText);
            await convexMutation(api.observations.setEmbedding, {
              observationId: obs._id,
              embedding,
            });
          }
        );
        results.observations += obsResults.processed;
        results.errors += obsResults.errors;

        // Process mental models
        const pendingModels: PendingMentalModel[] = await convexQuery(
          api.mentalModels.getMentalModelsNeedingEmbeddings,
          { limit: batchLimit }
        );

        const modelResults = await processWithConcurrency(
          pendingModels,
          async (model) => {
            const embedding = await generateEmbedding(
              `${model.title}: ${model.description}`
            );
            await convexMutation(api.mentalModels.setEmbedding, {
              mentalModelId: model._id,
              embedding,
            });
          }
        );
        results.mentalModels += modelResults.processed;
        results.errors += modelResults.errors;

        return {
          content: [
            {
              type: "text" as const,
              text:
                `Embeddings generated:\n` +
                `  Data points: ${results.dataPoints}\n` +
                `  Observations: ${results.observations}\n` +
                `  Mental models: ${results.mentalModels}\n` +
                `  Errors: ${results.errors}`,
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
