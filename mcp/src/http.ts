#!/usr/bin/env node
/**
 * Hosted Curate Mind MCP server.
 *
 * This entrypoint serves the invite-only public beta over Streamable HTTP.
 * It intentionally exposes only read-only public tools.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { config as loadEnv } from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

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

type TransportRecord = {
  transport: StreamableHTTPServerTransport;
  authContext: PublicAuthContext;
};

const transports = new Map<string, TransportRecord>();
let isShuttingDown = false;

function createPublicServer(): McpServer {
  const server = new McpServer({
    name: "curate-mind-public-mcp",
    version: "1.0.0",
  });

  registerPublicTools(server);
  return server;
}

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
      "authorization, content-type, mcp-session-id, last-event-id",
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

async function getRequestAuthContext(
  req: IncomingMessage,
  sessionId?: string
): Promise<PublicAuthContext | null> {
  const token = getBearerToken(req.headers.authorization);
  if (token) return await validateAuthToken(token);

  if (sessionId) {
    return transports.get(sessionId)?.authContext ?? null;
  }

  return null;
}

async function handlePost(
  req: IncomingMessage,
  res: ServerResponse,
  corsHeaders: Record<string, string>
): Promise<void> {
  const body = await parseJsonBody(req);
  const sessionId = getHeader(req, "mcp-session-id");
  const authContext = await getRequestAuthContext(req, sessionId);

  if (!authContext) {
    writeJson(res, 401, jsonRpcError(-32001, "Unauthorized"), corsHeaders);
    return;
  }

  let record: TransportRecord | undefined;
  if (sessionId) {
    record = transports.get(sessionId);
    if (!record) {
      writeJson(
        res,
        400,
        jsonRpcError(-32000, "Bad Request: invalid MCP session ID"),
        corsHeaders
      );
      return;
    }
  } else if (isInitializeRequest(body)) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newSessionId) => {
        transports.set(newSessionId, {
          transport,
          authContext,
        });
        console.error(`Public MCP session initialized: ${newSessionId}`);
      },
    });

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) transports.delete(sid);
    };

    const server = createPublicServer();
    await server.connect(transport);
    record = { transport, authContext };
  } else {
    writeJson(
      res,
      400,
      jsonRpcError(-32000, "Bad Request: missing MCP session ID"),
      corsHeaders
    );
    return;
  }

  await runWithPublicAuthContext(authContext, async () => {
    await record!.transport.handleRequest(req, res, body);
  });
}

async function handleGetOrDelete(
  req: IncomingMessage,
  res: ServerResponse,
  corsHeaders: Record<string, string>
): Promise<void> {
  const sessionId = getHeader(req, "mcp-session-id");
  if (!sessionId) {
    writeText(res, 400, "Missing MCP session ID", corsHeaders);
    return;
  }

  const record = transports.get(sessionId);
  if (!record) {
    writeText(res, 400, "Invalid MCP session ID", corsHeaders);
    return;
  }

  const authContext = await getRequestAuthContext(req, sessionId);
  if (!authContext) {
    writeText(res, 401, "Unauthorized", corsHeaders);
    return;
  }

  await runWithPublicAuthContext(authContext, async () => {
    await record.transport.handleRequest(req, res);
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
      activeSessions: transports.size,
    }, corsHeaders);
    return;
  }

  if (url.pathname !== "/mcp") {
    writeText(res, 404, "Not found", corsHeaders);
    return;
  }

  try {
    if (req.method === "POST") {
      await handlePost(req, res, corsHeaders);
      return;
    }

    if (req.method === "GET" || req.method === "DELETE") {
      await handleGetOrDelete(req, res, corsHeaders);
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

  for (const [sessionId, record] of transports) {
    try {
      await record.transport.close();
    } catch (error) {
      console.error(`Error closing session ${sessionId}:`, error);
    }
    transports.delete(sessionId);
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
