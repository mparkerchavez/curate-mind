#!/usr/bin/env node
/**
 * Hosted Curate Mind MCP server.
 *
 * This entrypoint serves the invite-only public beta over Streamable HTTP.
 * It intentionally exposes only read-only public tools.
 *
 * Serving is stateless: there is no session map. Every request carries its own
 * bearer token, the token is validated against Convex on every request, and a
 * fresh server instance is built per request by the handler factory. Old
 * protocol clients stay supported through the SDK default (`legacy:
 * "stateless"`), which is why no `legacy` option is passed below.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { config as loadEnv } from "dotenv";
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";

import { api, convexQuery } from "./lib/convex-client.js";
import {
  buildPublicAuthContext,
  getBearerToken,
  runWithPublicAuthContext,
  type PublicAuthContext,
} from "./lib/public-auth-context.js";
import { registerPublicTools } from "./tools/public.js";

loadEnv({ path: "../.env.local" });
loadEnv({ path: ".env.local" });

let isShuttingDown = false;

function createPublicServer(): McpServer {
  const server = new McpServer(
    {
      name: "curate-mind-public-mcp",
      version: "1.0.0",
    },
    {
      // Cache hints are only emitted on the 2026-07-28 revision. Old protocol
      // responses are untouched. The tool list is stable for the life of a
      // deployment, so a shared five-minute cache is safe.
      cacheHints: {
        "tools/list": { ttlMs: 5 * 60 * 1000, cacheScope: "public" },
        "server/discover": { ttlMs: 5 * 60 * 1000, cacheScope: "public" },
      },
    }
  );

  registerPublicTools(server);
  return server;
}

const mcpHandler = createMcpHandler(() => createPublicServer(), {
  onerror: (error) => console.error("Hosted MCP handler error:", error),
});

const handleMcpNodeRequest = toNodeHandler(mcpHandler, {
  onerror: (error) => console.error("Hosted MCP node adapter error:", error),
});

function getHeader(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function writeJson(
  res: ServerResponse,
  statusCode: number,
  payload: unknown,
  extraHeaders: Record<string, string> = {}
): void {
  if (res.headersSent) return;
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function writeText(
  res: ServerResponse,
  statusCode: number,
  text: string,
  extraHeaders: Record<string, string> = {}
): void {
  if (res.headersSent) return;
  res.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    ...extraHeaders,
  });
  res.end(text);
}

function jsonRpcError(code: number, message: string) {
  return {
    jsonrpc: "2.0",
    error: { code, message },
    id: null,
  };
}

function getAllowedOrigins(): Set<string> | null {
  const raw = process.env.CURATE_MIND_ALLOWED_ORIGINS?.trim();
  if (!raw) return null;
  return new Set(
    raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function corsHeadersFor(req: IncomingMessage): Record<string, string> {
  const origin = getHeader(req, "origin");
  const allowedOrigins = getAllowedOrigins();
  if (!origin) return {};
  if (allowedOrigins && !allowedOrigins.has(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers":
      "authorization, content-type, mcp-session-id, mcp-protocol-version, last-event-id",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  };
}

function validateOrigin(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = getHeader(req, "origin");
  const allowedOrigins = getAllowedOrigins();
  if (!origin || !allowedOrigins || allowedOrigins.has(origin)) return true;
  writeText(res, 403, "Forbidden origin");
  return false;
}

async function parseJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  const maxBytes = 1024 * 1024;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) {
      throw new Error("Request body exceeds 1 MB");
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) return undefined;
  const body = Buffer.concat(chunks).toString("utf8");
  if (!body.trim()) return undefined;
  return JSON.parse(body);
}

async function validateAuthToken(token: string): Promise<PublicAuthContext | null> {
  const authContext = buildPublicAuthContext(token);
  const result = await convexQuery(api.betaAccess.validateBetaToken, {
    tokenHash: authContext.tokenHash,
  });
  return result.valid ? authContext : null;
}

/**
 * Resolve the caller from the Authorization header alone. Stateless serving
 * means there is nothing else to fall back on: a request without a valid
 * bearer token is unauthenticated, whatever it carried before.
 */
async function getRequestAuthContext(
  req: IncomingMessage
): Promise<PublicAuthContext | null> {
  const token = getBearerToken(req.headers.authorization);
  if (!token) return null;
  return await validateAuthToken(token);
}

async function handleMcp(
  req: IncomingMessage,
  res: ServerResponse,
  corsHeaders: Record<string, string>
): Promise<void> {
  const authContext = await getRequestAuthContext(req);
  if (!authContext) {
    writeJson(res, 401, jsonRpcError(-32001, "Unauthorized"), corsHeaders);
    return;
  }

  // The body is read here rather than by the adapter so the 1 MB limit still
  // applies, then handed to the adapter as a pre-parsed body.
  const parsedBody = req.method === "POST" ? await parseJsonBody(req) : undefined;

  for (const [key, value] of Object.entries(corsHeaders)) {
    res.setHeader(key, value);
  }

  await runWithPublicAuthContext(authContext, async () => {
    await handleMcpNodeRequest(req, res, parsedBody);
  });
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const corsHeaders = corsHeadersFor(req);

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  if (!validateOrigin(req, res)) return;

  if (url.pathname === "/health") {
    writeJson(res, 200, {
      ok: true,
      server: "curate-mind-public-mcp",
      stateless: true,
    }, corsHeaders);
    return;
  }

  if (url.pathname !== "/mcp") {
    writeText(res, 404, "Not found", corsHeaders);
    return;
  }

  try {
    if (req.method === "POST" || req.method === "GET" || req.method === "DELETE") {
      await handleMcp(req, res, corsHeaders);
      return;
    }

    writeText(res, 405, "Method not allowed", corsHeaders);
  } catch (error) {
    console.error("Hosted MCP request failed:", error);
    const message = error instanceof Error ? error.message : String(error);
    if (!res.headersSent) {
      writeJson(res, 500, jsonRpcError(-32603, message), corsHeaders);
    }
  }
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.error(`Received ${signal}. Shutting down hosted Curate Mind MCP server...`);

  try {
    await mcpHandler.close();
  } catch (error) {
    console.error("Error closing hosted MCP handler:", error);
  }

  process.exit(0);
}

async function main(): Promise<void> {
  const required = ["CONVEX_URL"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`ERROR: Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }

  if (!process.env.CURATE_MIND_PUBLIC_PROJECT_ID) {
    console.error(
      "Warning: CURATE_MIND_PUBLIC_PROJECT_ID is not set. " +
        "Each beta account must have projectId configured in Convex."
    );
  }

  const port = Number(process.env.PORT ?? process.env.MCP_PORT ?? 3000);
  const server = createServer((req, res) => {
    void handleRequest(req, res);
  });

  server.listen(port, "0.0.0.0", () => {
    console.error(`Curate Mind hosted MCP server listening on port ${port}`);
  });

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("Fatal hosted MCP error:", error);
  process.exit(1);
});
