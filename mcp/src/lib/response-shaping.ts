/**
 * Response shaping helpers for MCP tool handlers.
 *
 * Convex query/action handlers spread entity records into their responses,
 * which can carry 1536-dimension `embedding` arrays. Those vectors are never
 * consumed by MCP clients but blow out token budgets when serialized. Strip
 * them at the MCP boundary; the database still stores them for vector search.
 */

export function stripEmbeddingsDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripEmbeddingsDeep(item)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (key === "embedding") continue;
      out[key] = stripEmbeddingsDeep(val);
    }
    return out as unknown as T;
  }
  return value;
}
