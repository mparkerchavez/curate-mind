import { useState } from "react";
import { useQuery } from "convex/react";
import { ArrowRight } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import DataPointCard from "./DataPointCard";
import { api, type Id } from "@/api";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { formatDateLabel, renderAnswerBlocks } from "@/lib/workspace-utils";

/**
 * LivePositionDemo — a self-contained, interactive showcase of one
 * Research Position and its supporting evidence, rendered on the home page.
 *
 * Purpose: teach the interaction pattern (citation ↔ evidence ↔ source)
 * without requiring the visitor to click through first. Uses real Convex data.
 *
 * Design: reuses the existing DataPointCard so evidence looks identical to
 * how it appears elsewhere in the app. The citation rendering pipeline is
 * shared with PositionPage via renderAnswerBlocks.
 *
 * Scope for v1:
 *  - Citation click highlights and scrolls to the matching evidence card
 *  - Evidence card click highlights the card (no reverse scroll yet, since
 *    citation markers do not currently expose DOM anchors)
 *  - Counter-evidence is not shown inline; link routes to the full Position
 */

const INITIAL_VISIBLE_CARDS = 3;

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
  const [expanded, setExpanded] = useState(false);

  // Don't render anything until we have a position to show.
  if (!positionId) return null;
  if (!detail) return <LoadingSkeleton />;

  const theme = detail.theme;
  const currentVersion = detail.currentVersion;
  const stance: string = currentVersion?.currentStance ?? "";
  const supportingEvidence: any[] = currentVersion?.supportingEvidenceDetails ?? [];

  // Build the citation label map that renderAnswerBlocks expects.
  const citationMap = new Map<string, string>();
  const labelByDpId: Record<string, string> = {};
  supportingEvidence.forEach((dp: any, i: number) => {
    if (dp?._id) {
      const label = `E${i + 1}`;
      citationMap.set(label, dp._id);
      labelByDpId[dp._id] = label;
    }
  });

  const visibleCards = expanded
    ? supportingEvidence
    : supportingEvidence.slice(0, INITIAL_VISIBLE_CARDS);

  function handleCitationClick(dpId: string) {
    setActiveId(dpId);
    // Wait one frame for the card to render its highlighted state
    // before scrolling it into view.
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

      {/* Two-column: position (left) + evidence (right) */}
      <div className="mt-10 grid gap-10 lg:grid-cols-[3fr_2fr]">
        {/* Position column */}
        <div>
          {theme?.title ? (
            <button
              type="button"
              onClick={() => navigate(`/themes/${theme._id}`)}
              className="text-xs font-medium uppercase tracking-[0.14em] text-utility-brand-700 transition hover:text-utility-brand-800"
            >
              {theme.title}
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

          {/* Section footer actions */}
          <div className="mt-8 flex flex-wrap items-center gap-5">
            <Button
              size="sm"
              color="primary"
              iconTrailing={ArrowRight}
              onClick={() => navigate(`/positions/${detail._id}`)}
            >
              Open full position
            </Button>
            <button
              type="button"
              onClick={() => navigate(`/positions/${detail._id}`)}
              className="text-sm text-slate-500 transition hover:text-slate-700"
            >
              See counter-evidence
            </button>
          </div>
        </div>

        {/* Evidence column */}
        <aside aria-label="Supporting evidence">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-600">
            Evidence
          </p>

          <div className="mt-4 space-y-4">
            {visibleCards.map((dp: any) => (
              <div
                key={dp._id}
                role="button"
                tabIndex={0}
                onClick={() => setActiveId(dp._id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActiveId(dp._id);
                  }
                }}
                className="cursor-pointer outline-none"
              >
                <DataPointCard
                  dp={dp}
                  isHighlighted={activeId === dp._id}
                  label={labelByDpId[dp._id]}
                />
              </div>
            ))}
          </div>

          {!expanded && supportingEvidence.length > INITIAL_VISIBLE_CARDS ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-utility-brand-700 transition hover:text-utility-brand-800"
            >
              Show all {supportingEvidence.length} supporting points
              <ArrowRight className="size-4" />
            </button>
          ) : null}

          {supportingEvidence.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              No supporting evidence attached to this position yet.
            </p>
          ) : null}
        </aside>
      </div>
    </section>
  );
}

/* ── Loading skeleton ── */

function LoadingSkeleton() {
  return (
    <section aria-hidden="true" className="animate-pulse">
      <div className="mx-auto h-5 max-w-xl rounded bg-slate-100" />
      <div className="mt-10 grid gap-10 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          <div className="h-4 w-24 rounded bg-slate-100" />
          <div className="h-8 w-3/4 rounded bg-slate-100" />
          <div className="h-4 w-1/2 rounded bg-slate-100" />
          <div className="mt-4 h-40 rounded-2xl bg-slate-50" />
        </div>
        <div className="space-y-4">
          <div className="h-4 w-24 rounded bg-slate-100" />
          <div className="h-36 rounded-3xl bg-slate-50" />
          <div className="h-36 rounded-3xl bg-slate-50" />
        </div>
      </div>
    </section>
  );
}
