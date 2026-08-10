#!/usr/bin/env node
/**
 * Curate Mind MCP Server
 *
 * Connects MCP hosts to the Curate Mind research curation system.
 * Uses stdio transport for local MCP host integration.
 *
 * Required environment variables:
 *   CONVEX_URL          Convex deployment URL
 *   OPENAI_API_KEY      OpenAI API key (for embeddings)
 *   SUPADATA_API_KEY    Supadata API key (for scraping/transcripts)
 *   CURATE_MIND_PATH    Path to the curate-mind folder on your machine
 */
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { McpServer } from "@modelcontextprotocol/server";

import { registerIntakeTools } from "./tools/intake.js";
import { registerExtractionTools } from "./tools/extraction.js";
import { registerQueryTools } from "./tools/query.js";
import { registerReviewTools } from "./tools/review.js";
import { registerSynthesisTools } from "./tools/synthesis.js";
import { registerProfileTools } from "./tools/profile.js";
import { installToolsetFilter } from "./toolsets.js";

type StdioHandle = ReturnType<typeof serveStdio>;

let activeHandle: StdioHandle | null = null;
let isShuttingDown = false;
let hasReportedToolset = false;

/**
 * Build one server instance. serveStdio calls this per connection, and once
 * more for a protocol probe that is discarded if the client turns out to speak
 * the older protocol, so the toolset line is reported only the first time.
 */
function buildServer(): McpServer {
  const server = new McpServer(
    {
      name: "curate-mind-mcp-server",
      version: "1.0.0",
    },
    {
      // Only emitted on the 2026-07-28 protocol; older clients see no change.
      // The tool list is fixed at startup, so it is cacheable for the life of
      // the process. It stays private because the toolset is per-curator.
      cacheHints: {
        "tools/list": { ttlMs: 60 * 60 * 1000, cacheScope: "private" },
        "server/discover": { ttlMs: 60 * 60 * 1000, cacheScope: "private" },
      },
    }
  );

  const finalizeTools = installToolsetFilter(server);

  registerIntakeTools(server);
  registerExtractionTools(server);
  registerQueryTools(server);
  registerReviewTools(server);
  registerSynthesisTools(server);
  registerProfileTools(server);

  // This call performs the deferred, name-sorted registration. It must run.
  const summary = finalizeTools();
  if (!hasReportedToolset) {
    hasReportedToolset = true;
    console.error(summary);
  }

  return server;
}

async function main(): Promise<void> {
  // Validate required environment variables
  const required = ["CONVEX_URL"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(
      `ERROR: Missing required environment variables: ${missing.join(", ")}\n` +
        "Set these in your MCP host configuration or in .env.local."
    );
    process.exit(1);
  }

  // Optional but recommended
  const optional = [
    "OPENAI_API_KEY",
    "SUPADATA_API_KEY",
    "CURATE_MIND_PATH",
  ];
  const missingOptional = optional.filter((key) => !process.env[key]);
  if (missingOptional.length > 0) {
    console.error(
      `Warning: Optional environment variables not set: ${missingOptional.join(", ")}\n` +
        "Some tools may not work without these."
    );
  }

  // Serve over stdio for local MCP hosts. No `legacy` option is passed, so the
  // SDK default applies and clients speaking the older protocol (which is what
  // Claude speaks today) are served exactly as before.
  activeHandle = serveStdio(() => buildServer());

  console.error("Curate Mind MCP server running via stdio");
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.error(`Received ${signal}. Shutting down Curate Mind MCP server...`);

  try {
    if (activeHandle) {
      await activeHandle.close();
    }
  } catch (error) {
    console.error(
      `Error during shutdown: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  } finally {
    activeHandle = null;
    process.exit();
  }
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
