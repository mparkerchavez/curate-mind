import { useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { ArrowRight } from "@untitledui/icons";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import SourceEvidenceGroup from "./SourceEvidenceGroup";
import { api, type Id } from "@/api";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { cn } from "@/lib/cn";
import {
  computeStanceReferencedDpIds,
  formatDateLabel,
  groupDataPointsBySource,
  renderAnswerBlocks,
} from "@/lib/workspace-utils";

/**
 * LivePositionDemo — a self-contained "mini app" on the home page that
 * showcases how claims, evidence, and sources connect in Curate Mind.
 *
 * Reuses the same grammar as the main EvidencePanel on the Position page:
 *   - Three sticky sections (Supporting / Counter / Also attached) with
 *     bold section-colored titles and border-y framing.
 *   - Evidence whose DP id is referenced in the stance text (via [E#]/[C#]
 *     tokens) stays in its primary section. Everything else collapses into
 *     Also attached with a grey marker but consistent claim text.
 *   - Counter and Also attached always render so the taxonomy stays legible.
 */

const CONTAINER_HEIGHT = 640; // px

type LivePositionDemoProps = {
  positionId: Id<"researchPositions"> | string | undefined;
};

type DemoSection = {
  key: string;
  title: string;
  subtitle: string;
  items: any[];
  variant: "support" | "counter" | "also-attached";
  dimmed?: boolean;
  emptyMessage?: string;
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

  const currentVersion = detail?.currentVersion;
  const supportingEvidence: any[] = currentVersion?.supportingEvidenceDetails ?? [];
  const counterEvidence: any[] = currentVersion?.counterEvidenceDetails ?? [];
  const stance: string = currentVersion?.currentStance ?? "";

  // Build citation label maps expected by renderAnswerBlocks and
  // SourceEvidenceGroup. Supporting evidence uses E1, E2, ...; counter
  // evidence uses C1, C2, ... Both live in the same maps so the stance
  // text's [E1] and [C1] citations can both resolve to their cards.
  const { citationMap, labelByDpId } = useMemo(() => {
    const cm = new Map<string, string>();
    const labels: Record<string, string> = {};
    supportingEvidence.forEach((dp: any, i: number) => {
      if (dp?._id) {
        const label = `E${i + 1}`;
        cm.set(label, dp._id);
        labels[dp._id] = label;
      }
    });
    counterEvidence.forEach((dp: any, i: number) => {
      if (dp?._id) {
        const label = `C${i + 1}`;
        cm.set(label, dp._id);
        labels[dp._id] = label;
      }
    });
    return { citationMap: cm, labelByDpId: labels };
  }, [supportingEvidence, counterEvidence]);

  // Three-section split. DPs referenced inline in the stance stay in their
  // primary section; everything else becomes Also attached.
  const sections = useMemo<DemoSection[]>(() => {
    const referenced = computeStanceReferencedDpIds(
      stance,
      supportingEvidence,
      counterEvidence,
    );
    const supportReferenced = supportingEvidence.filter((dp: any) =>
      referenced.has(dp._id),
    );
    const counterReferenced = counterEvidence.filter((dp: any) =>
      referenced.has(dp._id),
    );
    const alsoAttached = [
      ...supportingEvidence.filter((dp: any) => !referenced.has(dp._id)),
      ...counterEvidence.filter((dp: any) => !referenced.has(dp._id)),
    ];
    return [
      {
        key: "support",
        title: "Supporting evidence",
        subtitle: "Evidence attached to this position version.",
        items: supportReferenced,
        variant: "support",
        emptyMessage: "No supporting evidence named in the stance.",
      },
      {
        key: "counter",
        title: "Counter evidence",
        subtitle: "Signals that narrow, qualify, or challenge the current stance.",
        items: counterReferenced,
        variant: "counter",
        emptyMessage: "No counter evidence named in the stance.",
      },
      {
        key: "also-attached",
        title: "Also attached",
        subtitle: "Filed under this position but not named in the stance.",
        items: alsoAttached,
        variant: "also-attached",
        dimmed: true,
        emptyMessage: "Everything attached here is named in the stance.",
      },
    ];
  }, [stance, supportingEvidence, counterEvidence]);

  if (!positionId) return null;
  if (!detail) return <LoadingSkeleton />;

  const theme = detail.theme;
  const totalEvidenceCount = supportingEvidence.length + counterEvidence.length;

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
            {/* Evidence panel header */}
            <div className="flex shrink-0 items-center justify-between border-b border-secondary bg-primary px-5 py-3">
              <p className="text-sm font-semibold text-primary">Evidence</p>
              <Badge type="color" size="sm" color="gray">
                {totalEvidenceCount}
              </Badge>
            </div>

            {/* Scroll area — no horizontal padding; each section owns its
                own px-5 so sticky headers can span edge-to-edge with a
                clean top + bottom border. */}
            <div className="flex-1 overflow-y-auto pb-4">
              {sections.map((section) => {
                const isCounter = section.variant === "counter";
                const groups = groupDataPointsBySource(section.items);
                const titleColorClass = isCounter
                  ? "text-warning-primary"
                  : section.variant === "support"
                    ? "text-success-primary"
                    : "text-quaternary";
                return (
                  <section key={section.key}>
                    <div className="sticky top-0 z-10 border-y border-secondary bg-primary px-5 py-3">
                      <div className="flex items-center justify-between">
                        <p
                          className={cn(
                            "text-xs font-semibold uppercase tracking-[0.14em]",
                            titleColorClass,
                          )}
                        >
                          {section.title}
                        </p>
                        <span
                          className={cn(
                            "text-xs font-semibold tabular-nums",
                            titleColorClass,
                          )}
                        >
                          {section.items.length}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-tertiary">
                        {section.subtitle}
                      </p>
                    </div>
                    <div className="px-5 pt-5 pb-7">
                      {groups.length > 0 ? (
                        <div className="space-y-7">
                          {groups.map((group) => (
                            <SourceEvidenceGroup
                              key={group.key}
                              group={group}
                              highlightedId={activeId}
                              labelByDpId={labelByDpId}
                              onClaimClick={section.dimmed ? undefined : handleCardClick}
                              dimmed={section.dimmed}
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm italic text-tertiary">
                          {section.emptyMessage}
                        </p>
                      )}
                    </div>
                  </section>
                );
              })}
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
