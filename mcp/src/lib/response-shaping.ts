/**
 * Response shaping helpers for MCP tool handlers.
 *
 * Convex query/action handlers spread entity records into their responses,
 * which can carry 1536-dimension `embedding` arrays. Those vectors are never
 * consumed by MCP clients but blow out token budgets when serialized. Strip
 * them at the MCP boundary; the database still stores them for vector search.
 */

export const SAFE_RESPONSE_CHARS = 18000;

export interface Page<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export function clampPagination(
  limit: number | undefined,
  offset: number | undefined,
  defaultLimit: number,
  maxLimit: number
): { limit: number; offset: number } {
  return {
    limit: Math.min(Math.max(limit ?? defaultLimit, 1), maxLimit),
    offset: Math.max(offset ?? 0, 0),
  };
}

export function paginate<T>(all: T[], limit: number, offset: number): Page<T> {
  const items = all.slice(offset, offset + limit);
  return {
    items,
    total: all.length,
    offset,
    limit,
    hasMore: offset + items.length < all.length,
  };
}

export function takeItemsWithinJsonLimit<T>(
  items: T[],
  buildPayload: (items: T[]) => unknown,
  charLimit = SAFE_RESPONSE_CHARS
): { items: T[]; truncatedBySize: boolean } {
  const kept: T[] = [];

  for (const item of items) {
    const candidate = [...kept, item];
    if (JSON.stringify(buildPayload(candidate), null, 2).length > charLimit) {
      if (kept.length === 0) {
        return { items: candidate, truncatedBySize: true };
      }
      return { items: kept, truncatedBySize: true };
    }
    kept.push(item);
  }

  return { items: kept, truncatedBySize: false };
}

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
