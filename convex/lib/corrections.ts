/**
 * Pure correction logic with no Convex runtime dependency, so it can be unit
 * tested directly with plain fixtures.
 *
 * Two concerns live here:
 *
 * 1. Source re-tiering (Chunk 4, Part B). A source tier (1/2/3) can be changed
 *    after ingest, recorded as an append-only `corrections` row before the
 *    field is patched. `buildTierCorrection` validates the new tier and shapes
 *    the audit values; the mutation only inserts the row and patches `tier`.
 *
 * 2. The re-embed invariant (Chunk 4, Part C). Embeddings are generated from a
 *    data point's claim text, so only a correction that changes the EFFECTIVE
 *    claim should reset `embeddingStatus` to pending. Anchor-only and
 *    attribution corrections must NOT trigger a re-embed. `shouldResetEmbedding`
 *    is the single source of truth for that rule.
 */

export const VALID_TIERS = [1, 2, 3] as const;
export type Tier = (typeof VALID_TIERS)[number];

/**
 * Parse and validate a source tier. Accepts a number or a numeric string
 * (the MCP layer passes newValue as a string). Throws if it is not 1, 2, or 3.
 */
export function parseTier(raw: unknown): Tier {
  const value =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number(raw.trim())
        : NaN;

  if (!Number.isInteger(value) || (value !== 1 && value !== 2 && value !== 3)) {
    throw new Error("source_tier must be 1, 2, or 3");
  }

  return value as Tier;
}

/**
 * Shape an append-only tier correction. Returns the numeric tier to patch onto
 * the source plus the string previous/new values stored in the corrections row
 * (the corrections table types previousValue/newValue as strings). Throws on an
 * invalid tier or a no-op (new tier equals the current tier).
 */
export function buildTierCorrection(input: {
  previousTier: number;
  rawNewValue: unknown;
}): { patchTier: Tier; previousValue: string; newValue: string } {
  const patchTier = parseTier(input.rawNewValue);

  if (patchTier === input.previousTier) {
    throw new Error(
      `No-op: source is already tier ${patchTier}. Re-tier only when the tier actually changes.`
    );
  }

  return {
    patchTier,
    previousValue: String(input.previousTier),
    newValue: String(patchTier),
  };
}

/**
 * Whether a correction of the given type changes the effective claim text and
 * therefore requires the data point's embedding to be regenerated. Only a claim
 * correction (`dp_claim_text`) does; anchor and attribution corrections leave
 * the embedded claim text untouched.
 */
export function shouldResetEmbedding(correctionType: string): boolean {
  return correctionType === "dp_claim_text";
}
