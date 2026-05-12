/**
 * Convex HTTP client for Curate Mind.
 *
 * Uses ConvexHttpClient with anyApi so the MCP server does not depend on
 * importing the generated Convex API JavaScript across package module
 * boundaries. Convex validates arguments server-side; runtime behaviour is
 * identical to a fully-typed client.
 *
 * NOTE: The dynamic type imports that previously cascaded through
 * convex/_generated/api.d.ts and dataModel.d.ts into the Convex source files
 * caused tsc (Node16 moduleResolution) to fail on extension-less imports in
 * those files. anyApi is a typed proxy that accepts any function-path access
 * and returns FunctionReference<any>, which satisfies all convexMutation /
 * convexQuery / convexAction call sites.
 */

import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import type { FunctionReference } from "convex/server";
import type { GenericId } from "convex/values";

// Opaque ID type — string at runtime, branded for safety in tool call sites.
export type ConvexId<_TableName extends string = string> = GenericId<string>;

export const api = anyApi;

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

export function asId<TableName extends string = string>(
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
