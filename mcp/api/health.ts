/** Vercel serverless entry point for the hosted MCP health check. */

import type { IncomingMessage, ServerResponse } from "node:http";

import { handleRequest } from "../src/http.js";

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  // Normalize the rewritten Vercel function path to the public health route.
  req.url = "/health";
  await handleRequest(req, res);
}
