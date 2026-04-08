/**
 * Convex HTTP client for Curate Mind.
 *
 * Uses ConvexHttpClient with typed function references so MCP tool calls
 * stay aligned with the Convex public API at compile time.
 *
 * Runtime references still come from anyApi so the MCP server does not
 * depend on importing the generated Convex API JavaScript across package
 * module boundaries. The generated API is used for types only.
 */

import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import type { FunctionReference } from "convex/server";

type GeneratedApi = typeof import("../../../convex/_generated/api.js").api;
type ConvexTableName =
  import("../../../convex/_generated/dataModel.js").TableNames;
export type ConvexId<TableName extends ConvexTableName> =
  import("../../../convex/_generated/dataModel.js").Id<TableName>;

export const api = anyApi as unknown as GeneratedApi;

let client: ConvexHttpClient | null = null;

export function getConvexClient(): ConvexHttpClient {
  if (!client) {
    const url = process.env.CONVEX_URL;
    if (!url) {
      throw new Error(
        "CONVEX_URL environment variable is not set. " +
          "Set it in your Claude Desktop MCP config or in .env.local"
      );
    }
    client = new ConvexHttpClient(url);
  }
  return client;
}

export function asId<TableName extends ConvexTableName>(
  value: string
): ConvexId<TableName> {
  return value as ConvexId<TableName>;
}

export async function convexQuery<Query extends FunctionReference<"query">>(
  ref: Query,
  args: Query["_args"] = {} as Query["_args"]
): Promise<Query["_returnType"]> {
  const c = getConvexClient();
  return await c.query(ref, args);
}

export async function convexMutation<
  Mutation extends FunctionReference<"mutation">,
>(
  ref: Mutation,
  args: Mutation["_args"] = {} as Mutation["_args"]
): Promise<Mutation["_returnType"]> {
  const c = getConvexClient();
  return await c.mutation(ref, args);
}

export async function convexAction<Action extends FunctionReference<"action">>(
  ref: Action,
  args: Action["_args"] = {} as Action["_args"]
): Promise<Action["_returnType"]> {
  const c = getConvexClient();
  return await c.action(ref, args);
}
