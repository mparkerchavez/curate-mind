import { useRef, useState } from "react";
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
  // Ref scopes "scroll the citation into view" to the position column only,
  // so clicking an evidence card doesn't end up scrolling the whole page.
  const positionColRef = useRef<HTMLDivElement>(null);

  if (!positionId) return null;
  if (!detail) return <LoadingSkeleton />;

  const theme = detail.theme;
  const currentVersion = detail.currentVersion;
  const stance: string = currentVersion?.currentStance ?? "";
  const supportingEvidence: any[] = currentVersion?.supportingEvidenceDetails ?? [];
  const counterEvidence: any[] = currentVersion?.counterEvidenceDetails ?? [];
  const totalEvidenceCount = supportingEvidence.length + counterEvidence.length;

  // Build citation label maps expected by renderAnswerBlocks and
  // SourceEvidenceGroup. Supporting evidence uses E1, E2, ...; counter
  // evidence uses C1, C2, ... Both live in the same maps so the stance
  // text's [E1] and [C1] citations can both resolve to their cards.
  const citationMap = new Map<string, string>();
  const labelByDpId: Record<string, string> = {};
  supportingEvidence.forEach((dp: any, i: number) => {
    if (dp?._id) {
      const label = `E${i + 1}`;
      citationMap.set(label, dp._id);
      labelByDpId[dp._id] = label;
    }
  });
  counterEvidence.forEach((dp: any, i: number) => {
    if (dp?._id) {
      const label = `C${i + 1}`;
      citationMap.set(label, dp._id);
      labelByDpId[dp._id] = label;
    }
  });

  // Two sections, matching EvidencePanel's structure on Position pages.
  // Filter drops empty sections so we do not render a header with zero
  // items when a position has no counter evidence (or none at all).
  const evidenceSections = [
    {
      key: "support" as const,
      title: "Supporting evidence",
      subtitle: "Evidence attached to this position version.",
      items: supportingEvidence,
      isCounter: false,
    },
    {
      key: "counter" as const,
      title: "Counter evidence",
      subtitle: "Signals that narrow, qualify, or challenge the current stance.",
      items: counterEvidence,
      isCounter: true,
    },
  ].filter((section) => section.items.length > 0);

  // Citation → card: scroll the evidence card into view within the evidence
  // column. Relies on SourceEvidenceGroup's id={`evidence-card-${dp._id}`}.
  function handleCitationClick(dpId: string) {
    setActiveId(dpId);
    requestAnimationFrame(() => {
      document
        .getElementById(`evidence-card-${dpId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  // Card → citation: scroll the matching claim span into view within the
  // position column. renderInline tags claim spans with data-dp-id={dpId}
  // (see workspace-utils.tsx: flushClaim), so we can query for it directly.
  // Scoping to positionColRef keeps the scroll inside the demo container.
  function handleCardClick(dpId: string) {
    setActiveId(dpId);
    requestAnimationFrame(() => {
      const el = positionColRef.current?.querySelector<HTMLElement>(
        `[data-dp-id="${dpId}"]`,
      );
      el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  return (
    <section aria-label="Live position demo">
      {/* Mini-app container — fixed total height, flex column so the
          footer bar always stays pinned at the bottom. Elevated shadow
          makes the container pop against the tinted section backdrop
          the parent supplies. */}
      <div
        className="flex flex-col overflow-hidden rounded-3xl border border-secondary bg-primary shadow-[0_8px_24px_rgba(16,24,40,0.08)]"
        style={{ height: CONTAINER_HEIGHT }}
      >
        {/* Content area: two independently scrolling columns */}
        <div className="grid min-h-0 flex-1 lg:grid-cols-[3fr_2fr]">
          {/* Position column */}
          <div ref={positionColRef} className="overflow-y-auto px-8 py-7">
            {theme?.title ? (
              <button
                type="button"
                onClick={() => navigate(`/themes/${theme._id}`)}
                className="group inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.14em] text-brand-secondary transition hover:text-brand-primary"
              >
                <span className="text-quaternary group-hover:text-tertiary">
                  Theme
                </span>
                <span aria-hidden="true" className="text-quaternary">
                  &middot;
                </span>
                <span>{theme.title}</span>
                <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
              </button>
            ) : null}

            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.01em] text-primary">
              {detail.title}
            </h2>

            <p className="mt-2 text-sm text-tertiary">
              Last updated {formatDateLabel(currentVersion?.versionDate ?? "")}
              {" · "}
              built from {totalEvidenceCount} data point
              {totalEvidenceCount === 1 ? "" : "s"}
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
            aria-label="Evidence"
            className="flex min-h-0 flex-col border-secondary bg-secondary_subtle lg:border-l"
          >
            {/* Evidence header (sticky-feeling via shrink-0) */}
            <div className="flex shrink-0 items-center justify-between border-b border-secondary bg-primary px-5 py-3">
              <p className="text-sm font-semibold text-primary">Evidence</p>
              <Badge type="color" size="sm" color="gray">
                {totalEvidenceCount}
              </Badge>
            </div>

            {/* Evidence list, scrollable. One block per section
                (supporting / counter), matching EvidencePanel. */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {evidenceSections.length === 0 ? (
                <p className="text-sm text-tertiary">
                  No evidence attached to this position yet.
                </p>
              ) : (
                <div className="space-y-6">
                  {evidenceSections.map((section) => {
                    const groups = groupDataPointsBySource(section.items);
                    return (
                      <div key={section.key}>
                        <div className="flex items-center justify-between">
                          <p
                            className={
                              section.isCounter
                                ? "text-xs font-medium uppercase tracking-[0.14em] text-warning-primary"
                                : "text-xs font-medium uppercase tracking-[0.14em] text-quaternary"
                            }
                          >
                            {section.title}
                          </p>
                          <span
                            className={
                              section.isCounter
                                ? "rounded-full bg-warning-primary px-2 py-0.5 text-xs font-semibold tabular-nums text-warning-primary"
                                : "text-xs tabular-nums text-quaternary"
                            }
                          >
                            {section.items.length}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-tertiary">
                          {section.subtitle}
                        </p>
                        <div className="mt-3 space-y-3">
                          {groups.map((group) => (
                            <SourceEvidenceGroup
                              key={group.key}
                              group={group}
                              highlightedId={activeId}
                              labelByDpId={labelByDpId}
                              onClaimClick={handleCardClick}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        </div>

        {/* Footer bar: pinned, always visible */}
        <div className="flex shrink-0 items-center justify-between border-t border-secondary bg-primary px-6 py-4">
          <p className="text-xs text-tertiary">
            Same interaction you get in answers and full positions.
          </p>
          <Button
            size="sm"
            color="primary"
            iconTrailing={ArrowRight}
            onClick={() => navigate(theme?._id ? `/themes/${theme._id}/positions/${detail._id}` : `/positions/${detail._id}`)}
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
      <div
        className="flex animate-pulse flex-col overflow-hidden rounded-3xl border border-secondary bg-primary shadow-[0_8px_24px_rgba(16,24,40,0.08)]"
        style={{ height: CONTAINER_HEIGHT }}
      >
        <div className="grid min-h-0 flex-1 lg:grid-cols-[3fr_2fr]">
          <div className="space-y-4 px-8 py-7">
            <div className="h-4 w-32 rounded bg-tertiary" />
            <div className="h-8 w-3/4 rounded bg-tertiary" />
            <div className="h-4 w-1/2 rounded bg-tertiary" />
            <div className="mt-4 h-40 rounded-2xl bg-secondary" />
          </div>
          <div className="space-y-3 border-secondary bg-secondary_subtle p-4 lg:border-l">
            <div className="h-8 rounded bg-primary" />
            <div className="h-40 rounded-2xl bg-primary" />
            <div className="h-40 rounded-2xl bg-primary" />
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-between border-t border-secondary bg-primary px-6 py-4">
          <div className="h-3 w-48 rounded bg-tertiary" />
          <div className="h-8 w-36 rounded bg-tertiary" />
        </div>
      </div>
    </section>
  );
}
