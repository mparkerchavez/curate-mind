/**
 * Pure project-scoping logic for retrieval, with no Convex runtime dependency
 * so it can be unit tested directly with plain fixtures.
 *
 * Decision 45: every retrieval path is scoped to exactly one project.
 *
 * The bug this exists to prevent: `askAnalyst` accepted a `projectId`, used it
 * only to build the prompt preamble, and then ran an unfiltered vector search
 * over every data point in the deployment. With no theme, position, or source
 * narrowing, `resolveScopeContext` returned a null allow-list, which the
 * retrieval path reads as "no filter", so a question scoped to one project was
 * answered with another project's evidence and no indication it had happened.
 *
 * Three ideas carry the fix, and they are separated here because each is worth
 * testing on its own:
 *
 *   1. Ranked-id merging. A project-filtered vector search can under-fill when
 *      the denormalized `projectId` has not been backfilled onto every row yet.
 *      Rather than silently answering from a thin pack, retrieval widens to an
 *      unfiltered search and re-filters authoritatively. Merging has to keep
 *      the filtered results ahead of the widened ones so ranking is preserved.
 *
 *   2. Enforcement reporting. Dropping a row is the correct behavior, but a
 *      silent drop is how the original bug stayed invisible for months. Every
 *      drop is counted and surfaced.
 *
 *   3. Citation label validation. The composer is told never to copy a label
 *      out of a position's stance text, because stance `[E#]` and `[C#]`
 *      numbering is a separate namespace from the evidence pack's. When it
 *      breaks that rule, the malformed token matches neither the renderer nor
 *      the extractor, so the cited data point silently drops out of the thread
 *      (Decision 40). Detecting it is what turns a silent break into a warning.
 */

/** A citation label the pack can actually resolve: a bare [E followed by digits]. */
const WELL_FORMED_EVIDENCE_LABEL = /^\[E\d+\]$/;

/** Any bracketed token, used to sweep a composed answer for label breaks. */
const BRACKETED_TOKEN = /\[[^\]\n]*\]/g;

/** An evidence-label-shaped fragment: the letter E immediately followed by a digit. */
const EVIDENCE_LABEL_FRAGMENT = /E\d/;

/** A bare stance-namespace counter-evidence label, e.g. [C3]. */
const STANCE_COUNTER_LABEL = /^\[C\d+\]$/;

/**
 * Merge a project-filtered ranked list with a widened one, preserving order and
 * dropping duplicates. Filtered results always keep their position ahead of
 * anything the widened pass contributed, because the filtered pass is the one
 * whose ranking is known to be about this project.
 */
export function mergeRankedIds(
  primary: readonly string[],
  secondary: readonly string[]
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const id of [...primary, ...secondary]) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }

  return merged;
}

/**
 * True when a project-filtered vector search came back short and retrieval
 * should widen to an unfiltered pass.
 *
 * Under-fill has two causes and widening is right for both. Either the
 * denormalized `projectId` is not on every row yet (the backfill window), or
 * the project genuinely holds fewer matching rows than requested. The second
 * case costs one wasted search on a small project; the first case is the
 * difference between a real answer and an empty one.
 */
export function shouldWidenRetrieval(
  scopedCount: number,
  desiredCount: number
): boolean {
  return scopedCount < desiredCount;
}

export interface ScopeEnforcement {
  /** Ids that resolved to the queried project. */
  kept: string[];
  /** Ids belonging to a different project. */
  dropped: string[];
  /** Ids whose project could not be resolved at all. */
  unresolved: string[];
}

export function emptyEnforcement(): ScopeEnforcement {
  return { kept: [], dropped: [], unresolved: [] };
}

/**
 * Fold several enforcement results (data points, positions, observations,
 * secondary items) into one set of counts for reporting.
 */
export function totalEnforced(
  results: readonly ScopeEnforcement[]
): { kept: number; dropped: number; unresolved: number } {
  return results.reduce(
    (totals, result) => ({
      kept: totals.kept + result.kept.length,
      dropped: totals.dropped + result.dropped.length,
      unresolved: totals.unresolved + result.unresolved.length,
    }),
    { kept: 0, dropped: 0, unresolved: 0 }
  );
}

export interface RetrievalScopeReport {
  projectId: string;
  projectName?: string;
  /**
   * True when the answer used evidence the project-filtered search could not
   * have found on its own, which means a row in this project is still missing
   * its denormalized projectId. Deliberately not "a widened pass ran": a
   * project holding fewer rows than the requested limit under-fills on every
   * query however complete the backfill is, so that signal would fire forever
   * on small projects and mean nothing.
   */
  widened: boolean;
  droppedForProject: number;
  unresolvedProject: number;
}

/**
 * Plain-language warnings describing what project scoping did to this answer.
 *
 * These are reported rather than swallowed on purpose. A dropped row means the
 * ranking put another project's evidence in front of this project's, which is
 * worth seeing even though the drop itself is correct. An unresolved row means
 * a record carries no path back to any project, which is a data gap the curator
 * should know about rather than a retrieval event.
 */
export function describeRetrievalScope(
  report: RetrievalScopeReport
): string[] {
  const warnings: string[] = [];

  if (report.droppedForProject > 0) {
    warnings.push(
      `Project scope held: ${report.droppedForProject} retrieved item(s) belonged to a different ` +
        `project and were excluded before the answer was composed.`
    );
  }

  if (report.unresolvedProject > 0) {
    warnings.push(
      `${report.unresolvedProject} retrieved item(s) carry no resolvable project and were ` +
        `excluded. Curator observations created without a project reference are the usual cause.`
    );
  }

  if (report.widened) {
    warnings.push(
      "Some evidence in this answer belongs to the project but is not indexed under it yet, so it " +
        "was recovered by a widened pass rather than found directly. The project boundary still " +
        "held. Run migrations:backfillProjectScope to restore full ranking quality."
    );
  }

  return warnings;
}

export interface MalformedLabel {
  token: string;
  reason: string;
}

/**
 * Find citation labels in a composed answer that the pack cannot resolve.
 *
 * Two shapes are caught:
 *
 *   - A token carrying an evidence label but not written as a bare one, such as
 *     `[E1, cited within P1]` or `[E4 context, but the figure is from P4]`.
 *     These match neither the web renderer nor `collectCitedIdsFromInlineLabels`,
 *     so the data point drops out of the thread without any error.
 *
 *   - A bare `[C#]`. Counter-evidence numbering exists only inside a position's
 *     own evidence chain, so its appearance in a composed answer means stance
 *     text was copied into the answer's namespace.
 *
 * Markdown links are skipped: `[label](url)` is ordinary formatting, not a
 * citation, and flagging it would make the check noise.
 */
export function findMalformedCitationLabels(answer: string): MalformedLabel[] {
  const found: MalformedLabel[] = [];
  const seen = new Set<string>();

  for (const match of answer.matchAll(BRACKETED_TOKEN)) {
    const token = match[0];
    const followedByLink = answer[match.index + token.length] === "(";
    if (followedByLink) continue;

    if (STANCE_COUNTER_LABEL.test(token)) {
      if (seen.has(token)) continue;
      seen.add(token);
      found.push({
        token,
        reason:
          "Counter-evidence labels belong to a position's own evidence chain, not to this " +
          "answer's evidence pack. Cite the supporting data point from the pack instead.",
      });
      continue;
    }

    if (!EVIDENCE_LABEL_FRAGMENT.test(token)) continue;
    if (WELL_FORMED_EVIDENCE_LABEL.test(token)) continue;
    if (seen.has(token)) continue;

    seen.add(token);
    found.push({
      token,
      reason:
        "Citation labels must be written as a bare [E followed by digits]. This token matches " +
        "neither the citation renderer nor the extractor that records which evidence was cited, " +
        "so the data point silently drops out of the thread.",
    });
  }

  return found;
}

/** One warning line per malformed label, ready to travel with the answer. */
export function describeMalformedLabels(
  labels: readonly MalformedLabel[]
): string[] {
  return labels.map(
    (label) => `Malformed citation label ${label.token}. ${label.reason}`
  );
}
