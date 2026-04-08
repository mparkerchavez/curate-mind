#!/usr/bin/env node
/**
 * Curate Mind MCP Server
 *
 * Connects Claude to the Curate Mind research curation system.
 * Uses stdio transport for local Claude Desktop integration.
 *
 * Required environment variables:
 *   CONVEX_URL          — Convex deployment URL
 *   OPENAI_API_KEY      — OpenAI API key (for embeddings)
 *   JINA_API_KEY        — Jina API key (for URL fetching)
 *   SUPADATA_API_KEY    — Supadata API key (for scraping/transcripts)
 *   CURATE_MIND_PATH    — Path to the curate-mind folder on your machine
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerIntakeTools } from "./tools/intake.js";
import { registerExtractionTools } from "./tools/extraction.js";
import { registerQueryTools } from "./tools/query.js";
import { registerReviewTools } from "./tools/review.js";
import { registerSynthesisTools } from "./tools/synthesis.js";

let activeServer: McpServer | null = null;
let activeTransport: StdioServerTransport | null = null;
let isShuttingDown = false;

async function main(): Promise<void> {
  // Validate required environment variables
  const required = ["CONVEX_URL"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(
      `ERROR: Missing required environment variables: ${missing.join(", ")}\n` +
        "Set these in your Claude Desktop MCP configuration."
    );
    process.exit(1);
  }

  // Optional but recommended
  const optional = [
    "OPENAI_API_KEY",
    "JINA_API_KEY",
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

  // Create the MCP server
  const server = new McpServer({
    name: "curate-mind-mcp-server",
    version: "1.0.0",
  });
  activeServer = server;

  // Register all tools
  registerIntakeTools(server);
  registerExtractionTools(server);
  registerQueryTools(server);
  registerReviewTools(server);
  registerSynthesisTools(server);

  // Connect via stdio transport (for Claude Desktop)
  const transport = new StdioServerTransport();
  activeTransport = transport;
  await server.connect(transport);

  console.error("Curate Mind MCP server running via stdio");
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.error(`Received ${signal}. Shutting down Curate Mind MCP server...`);

  try {
    if (activeServer) {
      await activeServer.close();
    } else if (activeTransport) {
      await activeTransport.close();
    }
  } catch (error) {
    console.error(
      `Error during shutdown: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  } finally {
    activeServer = null;
    activeTransport = null;
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
