/**
 * Public hosted MCP tools.
 *
 * These tools are intentionally read-only and shaped for external beta users.
 * They return research context for the user's own Claude/Codex session to
 * synthesize, so Curate Mind does not pay for answer-generation model calls.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { api, asId, convexAction, convexMutation } from "../lib/convex-client.js";
import { getPublicAuthContext } from "../lib/public-auth-context.js";
import { stripEmbeddingsDeep } from "../lib/response-shaping.js";

function formatLimitReason(reason: string): string {
  const messages: Record<string, string> = {
    invalid_token: "The beta token is invalid.",
    account_disabled: "This beta account is disabled.",
    project_not_configured: "This beta account is not attached to a project yet.",
    active_limit_exceeded:
      "This account already has an active request. Wait for it to finish before trying again.",
    hourly_limit_exceeded:
      "This account reached the beta limit of 5 research-pack calls per hour.",
    daily_limit_exceeded:
      "This account reached the beta limit of 20 research-pack calls per day.",
    global_daily_limit_exceeded:
      "The hosted beta reached the global daily cap of 200 research-pack calls.",
  };

  return messages[reason] ?? `The request was rejected: ${reason}`;
}

export function registerPublicTools(server: McpServer): void {
  server.registerTool(
    "cm_get_research_pack",
    {
      title: "Get Curate Mind Research Pack",
      description:
        "Retrieve a source-grounded Curate Mind research pack for a question. " +
        "Use this before answering questions about the Curate Mind corpus. " +
        "The pack includes relevant positions, data points, short anchor quotes, " +
        "source metadata, and original source links. It does not generate the final answer, " +
        "does not expose full source text, and does not mutate the corpus.\n\n" +
        "After calling this tool, synthesize the answer in your own session. Cite evidence " +
        "labels like [E1] for source-backed claims and include original source links when " +
        "verification matters. If the returned evidence is thin or mixed, say so.",
      inputSchema: {
        question: z.string().min(1).describe("The user's research question."),
        limit: z.number().int().min(1).max(20).optional()
          .describe("Maximum evidence items to return. Default 10, max 20."),
        themeId: z.string().optional()
          .describe("Optional Curate Mind theme ID to scope retrieval."),
        positionId: z.string().optional()
          .describe("Optional Curate Mind position ID to scope retrieval."),
        sourceId: z.string().optional()
          .describe("Optional Curate Mind source ID to scope retrieval."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ question, limit, themeId, positionId, sourceId }) => {
      const auth = getPublicAuthContext();
      if (!auth) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                "Error: missing hosted MCP auth context. Reconnect with an Authorization bearer token.",
            },
          ],
        };
      }

      const projectId = process.env.CURATE_MIND_PUBLIC_PROJECT_ID;
      const start = await convexMutation(api.betaAccess.authenticateAndStartRequest, {
        tokenHash: auth.tokenHash,
        tokenPrefix: auth.tokenPrefix,
        toolName: "cm_get_research_pack",
        requestId: auth.requestId,
        projectId: projectId ? asId<"projects">(projectId) : undefined,
        questionPreview: question,
      });

      if (!start.allowed) {
        return {
          content: [
            {
              type: "text" as const,
              text: formatLimitReason(start.reason),
            },
          ],
        };
      }

      try {
        const result = await convexAction(api.publicResearch.getResearchPack, {
          projectId: start.projectId,
          question,
          limit,
          themeId: themeId ? asId<"researchThemes">(themeId) : undefined,
          positionId: positionId ? asId<"researchPositions">(positionId) : undefined,
          sourceId: sourceId ? asId<"sources">(sourceId) : undefined,
        });

        const text = JSON.stringify(stripEmbeddingsDeep(result), null, 2);
        await convexMutation(api.betaAccess.finishRequest, {
          usageEventId: start.usageEventId,
          status: "completed",
          responseChars: text.length,
        });

        return {
          content: [
            {
              type: "text" as const,
              text,
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await convexMutation(api.betaAccess.finishRequest, {
          usageEventId: start.usageEventId,
          status: "failed",
          errorMessage: message,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Error retrieving Curate Mind research pack: ${message}`,
            },
          ],
        };
      }
    }
  );
}

