/** Vercel serverless entry point for the hosted Streamable HTTP MCP route. */

import type { IncomingMessage, ServerResponse } from "node:http";

import { handleRequest } from "../src/http.js";

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  // Normalize the rewritten Vercel function path to the public MCP route.
  req.url = "/mcp";
  await handleRequest(req, res);
}
