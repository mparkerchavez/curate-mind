import { useState } from "react";
import { useQuery } from "convex/react";
import { ArrowRight } from "@untitledui/icons";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import SourceEvidenceGroup from "./SourceEvidenceGroup";
import { api, type Id } from "@/api";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  formatDateLabel,
  groupDataPointsBySource,
  renderAnswerBlocks,
} from "@/lib/workspace-utils";

/**
 * LivePositionDemo — a self-contained "mini app" on the home page that
 * showcases how claims, evidence, and sources connect in Curate Mind.
 *
 * Reuses the exact same components the rest of the app uses:
 *   - renderAnswerBlocks for stance text + citation pills
 *   - SourceEvidenceGroup for evidence rendered by source
 *   - groupDataPointsBySource for grouping logic
 * So any change to the research "viewer" propagates here automatically.
 *
 * Layout: a bordered card container with a fixed height. The position
 * column and the evidence column scroll independently inside it. A
 * footer bar with "Open full position →" stays pinned and visible.
 *
 * Interactions (same grammar as Position/Ask pages):
 *   - Click a citation pill in the stance: matching claim row in the
 *     evidence column highlights and scrolls into view.
 *   - Click a claim row: the claim highlights; its citation pill in the
 *     stance also visually highlights via the shared activeId.
 */

const CONTAINER_HEIGHT = 640; // px

type LivePositionDemoProps = {
  positionId: Id<"researchPositions"> | string | undefined;
};

export function LivePositionDemo({ positionId }: LivePositionDemoProps) {
  const { navigate } = useWorkspace();
  const detail = useQuery(
    api.positions.getPositionDetail,
    positionId ? { positionId } : "skip",
  );

  const [activeId, setActiveId] = useState<string | null>(null);

  if (!positionId) return null;
  if (!detail) return <LoadingSkeleton />;

  const theme = detail.theme;
  const currentVersion = detail.currentVersion;
  const stance: string = currentVersion?.currentStance ?? "";
  const supportingEvidence: any[] = currentVersion?.supportingEvidenceDetails ?? [];

  // Build citation label maps expected by renderAnswerBlocks and
  // SourceEvidenceGroup (same E1, E2, ... scheme used on Position page).
  const citationMap = new Map<string, string>();
  const labelByDpId: Record<string, string> = {};
  supportingEvidence.forEach((dp: any, i: number) => {
    if (dp?._id) {
      const label = `E${i + 1}`;
      citationMap.set(label, dp._id);
      labelByDpId[dp._id] = label;
    }
  });

  const sourceGroups = groupDataPointsBySource(supportingEvidence);

  function handleCitationClick(dpId: string) {
    setActiveId(dpId);
    requestAnimationFrame(() => {
      document
        .getElementById(`evidence-card-${dpId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  return (
    <section aria-label="Live position demo">
      {/* Section lead-in */}
      <p className="mx-auto max-w-3xl text-center text-base leading-7 text-slate-700">
        Here's how claims, evidence, and sources connect.
        Ask anything, and your answer traces back the same way.
      </p>

      {/* Mini-app container — fixed total height, flex column so the
          footer bar always stays pinned at the bottom. */}
      <div
        className="mt-8 flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
        style={{ height: CONTAINER_HEIGHT }}
      >
        {/* Content area: two independently scrolling columns */}
        <div className="grid min-h-0 flex-1 lg:grid-cols-[3fr_2fr]">
          {/* Position column */}
          <div className="overflow-y-auto px-8 py-7">
            {theme?.title ? (
              <button
                type="button"
                onClick={() => navigate(`/themes/${theme._id}`)}
                className="group inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.14em] text-utility-brand-700 transition hover:text-utility-brand-800"
              >
                <span className="text-slate-400 group-hover:text-slate-500">
                  Theme
                </span>
                <span aria-hidden="true" className="text-slate-300">
                  &middot;
                </span>
                <span>{theme.title}</span>
                <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
              </button>
            ) : null}

            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.01em] text-slate-950">
              {detail.title}
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              Last updated {formatDateLabel(currentVersion?.versionDate ?? "")}
              {" · "}
              built from {supportingEvidence.length} data point
              {supportingEvidence.length === 1 ? "" : "s"}
            </p>

            <div className="mt-6 space-y-4">
              {renderAnswerBlocks(stance, citationMap, handleCitationClick, {
                variant: "pill",
                highlightedDpId: activeId,
              })}
            </div>
          </div>

          {/* Evidence column */}
          <aside
            aria-label="Supporting evidence"
            className="flex min-h-0 flex-col border-slate-200 bg-slate-50/60 lg:border-l"
          >
            {/* Evidence header (sticky-feeling via shrink-0) */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
              <p className="text-sm font-semibold text-slate-950">Evidence</p>
              <Badge type="color" size="sm" color="gray">
                {supportingEvidence.length}
              </Badge>
            </div>

            {/* Evidence list, scrollable */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {sourceGroups.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No supporting evidence attached to this position yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {sourceGroups.map((group) => (
                    <SourceEvidenceGroup
                      key={group.key}
                      group={group}
                      highlightedId={activeId}
                      labelByDpId={labelByDpId}
                      onClaimClick={setActiveId}
                    />
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>

        {/* Footer bar: pinned, always visible */}
        <div className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-6 py-4">
          <p className="text-xs text-slate-500">
            Same interaction you get in answers and full positions.
          </p>
          <Button
            size="sm"
            color="primary"
            iconTrailing={ArrowRight}
            onClick={() => navigate(`/positions/${detail._id}`)}
          >
            Open full position
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ── Loading skeleton ── */

function LoadingSkeleton() {
  return (
    <section aria-hidden="true">
      <div className="mx-auto h-5 max-w-xl animate-pulse rounded bg-slate-100" />
      <div
        className="mt-8 flex animate-pulse flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
        style={{ height: CONTAINER_HEIGHT }}
      >
        <div className="grid min-h-0 flex-1 lg:grid-cols-[3fr_2fr]">
          <div className="space-y-4 px-8 py-7">
            <div className="h-4 w-32 rounded bg-slate-100" />
            <div className="h-8 w-3/4 rounded bg-slate-100" />
            <div className="h-4 w-1/2 rounded bg-slate-100" />
            <div className="mt-4 h-40 rounded-2xl bg-slate-50" />
          </div>
          <div className="space-y-3 border-slate-200 bg-slate-50/60 p-4 lg:border-l">
            <div className="h-8 rounded bg-white" />
            <div className="h-40 rounded-2xl bg-white" />
            <div className="h-40 rounded-2xl bg-white" />
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-6 py-4">
          <div className="h-3 w-48 rounded bg-slate-100" />
          <div className="h-8 w-36 rounded bg-slate-100" />
        </div>
      </div>
    </section>
  );
}
