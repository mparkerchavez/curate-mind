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
        ).filter((position): position is ActivePositionForLens => position !== null);

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
            (p) =>
              `[${p.themeTitle}] ${p.positionTitle} (${p.confidenceLevel}): ${p.currentStance}`
          )
          .join("\n\n");

        const allOpenQuestions = activePositions
          .flatMap((p) => p.openQuestions || [])
          .filter(Boolean);
        const questionsSummary =
          allOpenQuestions.length > 0
            ? allOpenQuestions.map((q) => `- ${q}`).join("\n")
            : "No open questions currently.";

        const surpriseSummary =
          "Evidence that would challenge current positions:\n" +
          activePositions
            .map(
              (p) =>
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
  // cm_generate_embeddings — Batch generate embeddings
  // ============================================================
  server.registerTool(
    "cm_generate_embeddings",
    {
      title: "Generate Embeddings",
      description:
        "Generate OpenAI embeddings for entities that are pending. Processes " +
        "data points, observations, and mental models that need embeddings.\n\n" +
        "Args:\n" +
        "  - limit (number, optional): Max entities to process (default 20)\n\n" +
        "Returns: Number of embeddings generated per entity type.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional()
          .describe("Max entities to process per type (default 20)"),
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

        for (const dp of pendingDPs) {
          try {
            const embedding = await generateEmbedding(dp.claimText);
            await convexMutation(api.dataPoints.setEmbedding, {
              dataPointId: dp._id,
              embedding,
            });
            results.dataPoints++;
          } catch {
            results.errors++;
          }
        }

        // Process observations
        const pendingObs: PendingObservation[] = await convexQuery(
          api.observations.getObservationsNeedingEmbeddings,
          { limit: batchLimit }
        );

        for (const obs of pendingObs) {
          try {
            const embedding = await generateEmbedding(obs.observationText);
            await convexMutation(api.observations.setEmbedding, {
              observationId: obs._id,
              embedding,
            });
            results.observations++;
          } catch {
            results.errors++;
          }
        }

        // Process mental models
        const pendingModels: PendingMentalModel[] = await convexQuery(
          api.mentalModels.getMentalModelsNeedingEmbeddings,
          { limit: batchLimit }
        );

        for (const model of pendingModels) {
          try {
            const embedding = await generateEmbedding(
              `${model.title}: ${model.description}`
            );
            await convexMutation(api.mentalModels.setEmbedding, {
              mentalModelId: model._id,
              embedding,
            });
            results.mentalModels++;
          } catch {
            results.errors++;
          }
        }

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
