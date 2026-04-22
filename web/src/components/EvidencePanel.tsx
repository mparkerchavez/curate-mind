import { useEffect, useMemo } from "react";
import { Badge } from "@/components/base/badges/badges";
import SourceEvidenceGroup from "@/components/SourceEvidenceGroup";
import { LegendPopover } from "@/components/LegendPopover";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { groupDataPointsBySource } from "@/lib/workspace-utils";
import { EVIDENCE_LEGEND_ROWS } from "@/lib/legend-copy";
import { cn } from "@/lib/cn";

type RenderSection = {
  key: string;
  title: string;
  subtitle: string;
  items: any[];
  variant?: "support" | "counter" | "also-attached";
  cited?: boolean;
  labelByDpId?: Record<string, string>;
  dimmed?: boolean;
  emptyMessage?: string;
  alwaysRender?: boolean;
};

/**
 * Persistent right-side evidence panel.
 *
 * Shows contextual evidence based on the current route:
 *   - Position page → three sections: supporting (referenced in stance),
 *     counter (referenced in stance), and a combined "Also attached" for
 *     everything filed to the position but not named inline. The third
 *     section always renders so the three-category taxonomy is legible.
 *   - Source page → linked data points.
 *   - Ask page → cited + retrieved evidence from the latest answer.
 *   - Landing/theme pages → empty (panel hidden by AppShell).
 *
 * Each section gets a sticky header (title + count + subtitle) with a bottom
 * border so it reads as a header whether or not scroll has pinned it. Clicks
 * inside "Also attached" are disabled — those items aren't anchored anywhere
 * in the stance.
 */
export default function EvidencePanel() {
  const { evidenceSections, highlightedEvidenceId, handleCitationClick } = useWorkspace();

  // Scroll to highlighted evidence card when it changes
  useEffect(() => {
    if (!highlightedEvidenceId) return;
    // Small delay to let React render the highlight first
    const timer = setTimeout(() => {
      const el = document.getElementById(`evidence-card-${highlightedEvidenceId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);
    return () => clearTimeout(timer);
  }, [highlightedEvidenceId]);

  const renderSections = useMemo<RenderSection[]>(() => {
    // Position context: any incoming section carries referencedDpIds. Split
    // each into its referenced items and collect unreferenced items into a
    // single combined "Also attached" section that always renders.
    const isPositionContext = evidenceSections.some((s) => s.referencedDpIds);

    if (!isPositionContext) {
      return evidenceSections.map((s) => ({
        key: s.key,
        title: s.title,
        subtitle: s.subtitle,
        items: s.items,
        variant: s.variant,
        cited: s.cited,
        labelByDpId: s.labelByDpId,
      }));
    }

    const result: RenderSection[] = [];
    const alsoAttachedItems: any[] = [];
    const alsoAttachedLabels: Record<string, string> = {};

    for (const s of evidenceSections) {
      const referenced = s.referencedDpIds;
      if (!referenced) {
        result.push({
          key: s.key,
          title: s.title,
          subtitle: s.subtitle,
          items: s.items,
          variant: s.variant,
          labelByDpId: s.labelByDpId,
        });
        continue;
      }
      const refItems = s.items.filter((dp: any) => referenced.has(dp._id));
      const unrefItems = s.items.filter((dp: any) => !referenced.has(dp._id));
      const isCounter = s.variant === "counter";
      result.push({
        key: s.key,
        title: s.title,
        subtitle: s.subtitle,
        items: refItems,
        variant: s.variant,
        labelByDpId: s.labelByDpId,
        emptyMessage: isCounter
          ? "No counter evidence named in the stance."
          : "No supporting evidence named in the stance.",
        alwaysRender: true,
      });
      alsoAttachedItems.push(...unrefItems);
      if (s.labelByDpId) Object.assign(alsoAttachedLabels, s.labelByDpId);
    }

    result.push({
      key: "also-attached",
      title: "Also attached",
      subtitle: "Filed under this position but not named in the stance.",
      items: alsoAttachedItems,
      variant: "also-attached",
      labelByDpId: alsoAttachedLabels,
      dimmed: true,
      emptyMessage: "Everything attached here is named in the stance.",
      alwaysRender: true,
    });

    return result;
  }, [evidenceSections]);

  const visibleSections = renderSections.filter(
    (s) => s.alwaysRender || s.items.length > 0,
  );

  if (visibleSections.length === 0) return null;

  const totalItems = visibleSections.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <div className="flex h-full flex-col">
      {/* Panel header */}
      <div className="shrink-0 border-b border-secondary px-5 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-semibold text-primary">Evidence</h2>
            <LegendPopover
              heading="Citation labels"
              rows={EVIDENCE_LEGEND_ROWS}
              ariaLabel="What do E# and C# citation labels mean?"
              placement="bottom end"
            />
          </div>
          <Badge type="color" size="sm" color="gray">
            {totalItems}
          </Badge>
        </div>
      </div>

      {/* Evidence sections — scroll area has no horizontal padding; each
          section owns its own px-5 so the sticky header can span edge-to-edge
          with a clean bottom border. */}
      <div className="flex-1 overflow-y-auto pb-4">
        {visibleSections.map((section) => {
          const isCounter = section.variant === "counter";
          const groups = groupDataPointsBySource(section.items);
          const citedIds = section.cited ? section.items.map((dp: any) => dp._id) : undefined;
          // Title carries the section color + weight; background stays neutral.
          // Borders on top and bottom of the sticky header frame it as a bar
          // so it reads as a header whether pinned or inline.
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
                <p className="mt-1 text-xs text-tertiary">{section.subtitle}</p>
              </div>
              <div className="px-5 pt-5 pb-7">
                {groups.length > 0 ? (
                  <div className="space-y-7">
                    {groups.map((group) => (
                      <SourceEvidenceGroup
                        key={group.key}
                        group={group}
                        highlightedId={highlightedEvidenceId}
                        citedIds={citedIds}
                        labelByDpId={section.labelByDpId}
                        onClaimClick={section.dimmed ? undefined : handleCitationClick}
                        dimmed={section.dimmed}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm italic text-tertiary">
                    {section.emptyMessage ?? "No items."}
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
