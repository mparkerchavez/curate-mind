/**
 * Profile and preferences tools for Curate Mind MCP.
 *
 * Customization is split into three layers (see Customization Design Proposal):
 *   - Locked System Behavior lives in code, not data, and is never editable.
 *   - Project Profile lives on the projects table and is edited per project.
 *   - User Style lives in the userPreferences singleton and applies instance-wide.
 *
 * These tools cover the editable layers:
 *   - cm_get_project_profile
 *   - cm_update_project_profile
 *   - cm_get_user_preferences
 *   - cm_update_user_preferences
 *   - cm_preview_prompt_profile
 *   - cm_validate_profile
 *   - cm_reset_profile_to_defaults
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  api,
  asId,
  convexAction,
  convexMutation,
  convexQuery,
} from "../lib/convex-client.js";

type ValidationReport = {
  ok: boolean;
  errors: Array<{ field: string; message: string }>;
  warnings: Array<{ field: string; message: string }>;
};

const VOICE_VALUES = ["analytical", "conversational", "formal"] as const;
const STRUCTURE_VALUES = ["prose", "bullets", "mixed"] as const;
const THIN_POLICY_VALUES = ["say-so", "skip", "ask"] as const;
const HEDGING_VALUES = ["direct", "moderate", "cautious"] as const;

function validateProfileShape(profile: any): ValidationReport {
  const errors: ValidationReport["errors"] = [];
  const warnings: ValidationReport["warnings"] = [];

  if (!profile) {
    errors.push({ field: "project", message: "Project not found." });
    return { ok: false, errors, warnings };
  }

  if (!profile.name || profile.name.trim() === "") {
    errors.push({ field: "name", message: "Project name is required." });
  }
  if (!profile.description || profile.description.trim() === "") {
    warnings.push({
      field: "description",
      message: "Project description is blank.",
    });
  }
  if (!profile.domain || profile.domain.trim() === "") {
    warnings.push({
      field: "domain",
      message: "Project domain is blank; chat prompts will fall back to a generic frame.",
    });
  }
  if (!profile.audience || profile.audience.trim() === "") {
    warnings.push({
      field: "audience",
      message: "Project audience is blank.",
    });
  }

  if (Array.isArray(profile.suggestedPrompts) && profile.suggestedPrompts.length > 6) {
    warnings.push({
      field: "suggestedPrompts",
      message: `suggestedPrompts has ${profile.suggestedPrompts.length} entries; the landing page surfaces at most six.`,
    });
  }

  if (
    profile.secondaryCaptureEnabled === true &&
    (!profile.secondaryCaptureLabel || !profile.secondaryCaptureDescription)
  ) {
    warnings.push({
      field: "secondaryCaptureLabel",
      message:
        "Secondary Capture is enabled but the label or description is blank; the stage will fall back to the mental-model default.",
    });
  }

  if (profile.profileInitialized !== true) {
    warnings.push({
      field: "profileInitialized",
      message:
        "Profile has not been marked initialized. Run the onboarding interview or call cm_update_project_profile with profileInitialized: true.",
    });
  }

  return { ok: errors.length === 0, errors, warnings };
}

function validatePreferencesShape(prefs: any): ValidationReport {
  const errors: ValidationReport["errors"] = [];
  const warnings: ValidationReport["warnings"] = [];

  if (Array.isArray(prefs?.bannedPunctuation)) {
    for (const ch of prefs.bannedPunctuation) {
      if (typeof ch !== "string") continue;
      if (ch.includes("[") || ch.includes("]")) {
        errors.push({
          field: "bannedPunctuation",
          message: `Banning "${ch}" would break citation labels like [E1]. Remove this entry.`,
        });
      }
    }
  }

  if (prefs?.preferencesInitialized !== true) {
    warnings.push({
      field: "preferencesInitialized",
      message:
        "User preferences have not been marked initialized. Run the style edit prompt or call cm_update_user_preferences with preferencesInitialized: true.",
    });
  }

  return { ok: errors.length === 0, errors, warnings };
}

function jsonText(value: unknown): { type: "text"; text: string } {
  return { type: "text" as const, text: JSON.stringify(value, null, 2) };
}

function errorText(error: unknown): { type: "text"; text: string } {
  return {
    type: "text" as const,
    text: `Error: ${error instanceof Error ? error.message : String(error)}`,
  };
}

export function registerProfileTools(server: McpServer): void {
  // ============================================================
  // cm_get_project_profile — Read the full project profile
  // ============================================================
  server.registerTool(
    "cm_get_project_profile",
    {
      title: "Get Project Profile",
      description:
        "Return the full project profile, including all customizable fields and " +
        "the profileInitialized boolean. The onboarding interview keys on " +
        "profileInitialized to decide whether to run.\n\n" +
        "Args:\n" +
        "  - projectId (string): Project to inspect\n\n" +
        "Returns: The complete project record as JSON.",
      inputSchema: {
        projectId: z.string().describe("Project to inspect"),
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
        const profile = await convexQuery(api.projects.getProjectProfile, {
          projectId: asId<"projects">(projectId),
        });
        if (!profile) {
          return { content: [{ type: "text" as const, text: "Project not found." }] };
        }
        return { content: [jsonText(profile)] };
      } catch (error) {
        return { content: [errorText(error)] };
      }
    }
  );

  // ============================================================
  // cm_update_project_profile — Partial profile update
  // ============================================================
  server.registerTool(
    "cm_update_project_profile",
    {
      title: "Update Project Profile",
      description:
        "Partial update of the project profile. Only the supplied fields change. " +
        "Bumps profileVersion on every successful write so the change is auditable.\n\n" +
        "Args (all optional except projectId):\n" +
        "  - projectId (string): Project to update\n" +
        "  - name, description, domain, audience, timeHorizon\n" +
        "  - researchUnitLabel, ideaUnitLabel, assistantRoleName\n" +
        "  - suggestedPrompts (string[])\n" +
        "  - secondaryCaptureEnabled (boolean)\n" +
        "  - secondaryCaptureLabel, secondaryCaptureDescription\n" +
        "  - themeHints, highValueEvidenceNotes\n" +
        "  - confidenceRubricNotes, tagStrategyNotes\n" +
        "  - profileInitialized (boolean): mark setup complete\n\n" +
        "Returns: profileVersion and the list of fields that were updated.",
      inputSchema: {
        projectId: z.string().describe("Project to update"),
        name: z.string().optional(),
        description: z.string().optional(),
        domain: z.string().optional(),
        audience: z.string().optional(),
        timeHorizon: z.string().optional(),
        researchUnitLabel: z.string().optional(),
        ideaUnitLabel: z.string().optional(),
        assistantRoleName: z.string().optional(),
        suggestedPrompts: z.array(z.string()).optional(),
        secondaryCaptureEnabled: z.boolean().optional(),
        secondaryCaptureLabel: z.string().optional(),
        secondaryCaptureDescription: z.string().optional(),
        themeHints: z.string().optional(),
        highValueEvidenceNotes: z.string().optional(),
        confidenceRubricNotes: z.string().optional(),
        tagStrategyNotes: z.string().optional(),
        profileInitialized: z.boolean().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const { projectId, ...rest } = params;
        const result = await convexMutation(
          api.projects.updateProjectProfile,
          {
            projectId: asId<"projects">(projectId),
            ...rest,
          }
        );
        return { content: [jsonText(result)] };
      } catch (error) {
        return { content: [errorText(error)] };
      }
    }
  );

  // ============================================================
  // cm_get_user_preferences — Read the instance-wide style singleton
  // ============================================================
  server.registerTool(
    "cm_get_user_preferences",
    {
      title: "Get User Preferences",
      description:
        "Return the instance-wide user style preferences singleton. If no row " +
        "exists yet, returns a defaulted shape so the onboarding interview can " +
        "show the user what the starting point is.\n\n" +
        "Returns: voice, structurePreference, bannedPunctuation, bannedPhrases, " +
        "alwaysIncludeCounterEvidence, evidenceThinPolicy, hedgingStyle, " +
        "language, customStyleNotes, preferencesInitialized, updatedAt.",
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
        const prefs = await convexQuery(api.userPreferences.getUserPreferences, {});
        return { content: [jsonText(prefs)] };
      } catch (error) {
        return { content: [errorText(error)] };
      }
    }
  );

  // ============================================================
  // cm_update_user_preferences — Partial style update
  // ============================================================
  server.registerTool(
    "cm_update_user_preferences",
    {
      title: "Update User Preferences",
      description:
        "Partial update of the instance-wide user style preferences singleton. " +
        "Only supplied fields change. Always sets updatedAt.\n\n" +
        "Args (all optional):\n" +
        "  - voice: analytical | conversational | formal\n" +
        "  - structurePreference: prose | bullets | mixed\n" +
        "  - bannedPunctuation (string[]): punctuation to avoid in generated text\n" +
        "  - bannedPhrases (string[])\n" +
        "  - alwaysIncludeCounterEvidence (boolean)\n" +
        "  - evidenceThinPolicy: say-so | skip | ask\n" +
        "  - hedgingStyle: direct | moderate | cautious\n" +
        "  - language (string)\n" +
        "  - customStyleNotes (string)\n" +
        "  - preferencesInitialized (boolean): mark setup complete\n\n" +
        "Returns: the row _id, updatedAt, and the list of fields that were updated.",
      inputSchema: {
        voice: z.enum(VOICE_VALUES).optional(),
        structurePreference: z.enum(STRUCTURE_VALUES).optional(),
        bannedPunctuation: z.array(z.string()).optional(),
        bannedPhrases: z.array(z.string()).optional(),
        alwaysIncludeCounterEvidence: z.boolean().optional(),
        evidenceThinPolicy: z.enum(THIN_POLICY_VALUES).optional(),
        hedgingStyle: z.enum(HEDGING_VALUES).optional(),
        language: z.string().optional(),
        customStyleNotes: z.string().optional(),
        preferencesInitialized: z.boolean().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const result = await convexMutation(
          api.userPreferences.updateUserPreferences,
          params
        );
        return { content: [jsonText(result)] };
      } catch (error) {
        return { content: [errorText(error)] };
      }
    }
  );

  // ============================================================
  // cm_preview_prompt_profile — Show assembled system prompt
  // ============================================================
  server.registerTool(
    "cm_preview_prompt_profile",
    {
      title: "Preview Assembled System Prompt",
      description:
        "Return the full system prompt that the chat backend would assemble for " +
        "this project, plus a structured list naming the locked blocks the user " +
        "cannot edit. Builds trust by showing exactly what the project profile " +
        "and user style currently produce, alongside what the method enforces.\n\n" +
        "Args:\n" +
        "  - projectId (string): Project to preview\n" +
        "  - mode: grounded | analyst (default: analyst)\n\n" +
        "Returns: { mode, prompt, lockedBlocks }.",
      inputSchema: {
        projectId: z.string().describe("Project to preview"),
        mode: z.enum(["grounded", "analyst"]).optional()
          .describe("Which chat surface to render (default: analyst)"),
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
        const result = await convexAction(api.chat.previewPromptProfile, {
          projectId: asId<"projects">(projectId),
          mode,
        });
        return { content: [jsonText(result)] };
      } catch (error) {
        return { content: [errorText(error)] };
      }
    }
  );

  // ============================================================
  // cm_validate_profile — Check profile and preferences for issues
  // ============================================================
  server.registerTool(
    "cm_validate_profile",
    {
      title: "Validate Profile and Preferences",
      description:
        "Check the project profile and user preferences for problems. Catches " +
        "blank required fields, suggested-prompt overflow, banned-punctuation " +
        "entries that would break citation labels like [E1], and missing " +
        "initialization markers.\n\n" +
        "Args:\n" +
        "  - projectId (string): Project to validate\n\n" +
        "Returns: { ok, project: { errors, warnings }, preferences: { errors, warnings } }.",
      inputSchema: {
        projectId: z.string().describe("Project to validate"),
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
        const [profile, prefs] = await Promise.all([
          convexQuery(api.projects.getProjectProfile, {
            projectId: asId<"projects">(projectId),
          }),
          convexQuery(api.userPreferences.getUserPreferences, {}),
        ]);
        const projectReport = validateProfileShape(profile);
        const prefsReport = validatePreferencesShape(prefs);
        const ok = projectReport.ok && prefsReport.ok;
        return {
          content: [
            jsonText({
              ok,
              project: projectReport,
              preferences: prefsReport,
            }),
          ],
        };
      } catch (error) {
        return { content: [errorText(error)] };
      }
    }
  );

  // ============================================================
  // cm_reset_profile_to_defaults — Restore starter defaults
  // ============================================================
  server.registerTool(
    "cm_reset_profile_to_defaults",
    {
      title: "Reset Profile to Defaults",
      description:
        "Restore starter defaults for the project profile, the user preferences " +
        "singleton, or both. The locked layer is never affected because it lives " +
        "in code, not data. Existing extracted data (sources, data points, " +
        "positions, observations, mental models) is also untouched.\n\n" +
        "Args:\n" +
        "  - scope: project | user | both\n" +
        "  - projectId (string): required when scope is project or both\n\n" +
        "Returns: a summary of what was cleared.",
      inputSchema: {
        scope: z.enum(["project", "user", "both"]),
        projectId: z.string().optional()
          .describe("Required when scope is project or both"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ scope, projectId }) => {
      try {
        const result: Record<string, unknown> = { scope };
        if (scope === "project" || scope === "both") {
          if (!projectId) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: projectId is required when scope is 'project' or 'both'.",
                },
              ],
            };
          }
          result.project = await convexMutation(
            api.projects.resetProjectProfile,
            { projectId: asId<"projects">(projectId) }
          );
        }
        if (scope === "user" || scope === "both") {
          result.user = await convexMutation(
            api.userPreferences.resetUserPreferences,
            {}
          );
        }
        return { content: [jsonText(result)] };
      } catch (error) {
        return { content: [errorText(error)] };
      }
    }
  );
}
