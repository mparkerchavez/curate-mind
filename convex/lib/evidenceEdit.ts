/**
 * Pure array logic for editing a position version's data-point evidence, with
 * no Convex runtime dependency so it can be unit tested directly with plain
 * fixtures (mirrors convex/lib/supersede.ts).
 *
 * Chunk 3 correction tooling: unlink a data point from a position's evidence,
 * or replace one evidence data point with another. The mutations that call
 * these helpers stay append-only: they build the new arrays here, then append
 * a new position version and advance currentVersionId. These functions never
 * mutate their inputs.
 *
 * Scope: data-point evidence only (supportingEvidence + counterEvidence).
 * Observations and mental models are intentionally out of scope for this chunk.
 */

export type EvidenceArray = "supporting" | "counter";

const toKeySet = (ids: readonly unknown[]): Set<string> =>
  new Set(ids.map((id) => String(id)));

/**
 * Remove the given ids from whichever evidence array(s) they appear in.
 * Ids present in neither array are reported in `notFound`. Inputs are not
 * mutated; new arrays are returned. Order of the surviving ids is preserved.
 */
export function computeUnlink<T>(
  supporting: readonly T[],
  counter: readonly T[],
  removeIds: readonly T[]
): {
  supporting: T[];
  counter: T[];
  removed: string[];
  notFound: string[];
} {
  const supportingKeys = toKeySet(supporting);
  const counterKeys = toKeySet(counter);

  const removed: string[] = [];
  const notFound: string[] = [];
  const removeKeys = new Set<string>();

  for (const id of removeIds) {
    const key = String(id);
    if (removeKeys.has(key)) continue; // dedupe the request itself
    removeKeys.add(key);
    if (supportingKeys.has(key) || counterKeys.has(key)) {
      removed.push(key);
    } else {
      notFound.push(key);
    }
  }

  return {
    supporting: supporting.filter((id) => !removeKeys.has(String(id))),
    counter: counter.filter((id) => !removeKeys.has(String(id))),
    removed,
    notFound,
  };
}

/**
 * Replace oldId with newId, preserving which array (supporting/counter) the old
 * id was in. If newId is already present in that array, the old id is removed
 * and no duplicate is added (`newAlreadyPresent`). When oldId is in neither
 * array, `array` is null and the arrays are returned unchanged. Inputs are not
 * mutated.
 */
export function computeReplace<T>(
  supporting: readonly T[],
  counter: readonly T[],
  oldId: T,
  newId: T
): {
  supporting: T[];
  counter: T[];
  array: EvidenceArray | null;
  oldFound: boolean;
  newAlreadyPresent: boolean;
} {
  const oldKey = String(oldId);
  const inSupporting = supporting.some((id) => String(id) === oldKey);
  const inCounter = counter.some((id) => String(id) === oldKey);

  if (!inSupporting && !inCounter) {
    return {
      supporting: [...supporting],
      counter: [...counter],
      array: null,
      oldFound: false,
      newAlreadyPresent: false,
    };
  }

  // If the old id somehow sits in both arrays, prefer supporting as the home
  // for the replacement and drop it from counter as well.
  const targetArray: EvidenceArray = inSupporting ? "supporting" : "counter";
  const newKey = String(newId);

  const swap = (arr: readonly T[], isTarget: boolean): { next: T[]; already: boolean } => {
    const withoutOld = arr.filter((id) => String(id) !== oldKey);
    if (!isTarget) return { next: withoutOld, already: false };
    const already = withoutOld.some((id) => String(id) === newKey);
    return {
      next: already ? withoutOld : [...withoutOld, newId],
      already,
    };
  };

  const sup = swap(supporting, targetArray === "supporting");
  const cnt = swap(counter, targetArray === "counter");

  return {
    supporting: sup.next,
    counter: cnt.next,
    array: targetArray,
    oldFound: true,
    newAlreadyPresent: targetArray === "supporting" ? sup.already : cnt.already,
  };
}

/**
 * Strip em and en dashes from generated changeSummary text (project rule: use
 * commas, periods, parentheses, or semicolons instead). Applied to the whole
 * composed summary so a curator-supplied reason containing a dash is sanitized
 * too. Collapses any surrounding whitespace into a single "; " separator.
 */
export function sanitizeChangeSummary(text: string): string {
  return text.replace(/\s*[—–]\s*/g, "; ");
}
