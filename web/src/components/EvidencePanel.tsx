import { useEffect } from "react";
import { Badge } from "@/components/base/badges/badges";
import SourceEvidenceGroup from "@/components/SourceEvidenceGroup";
import { LegendPopover } from "@/components/LegendPopover";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { groupDataPointsBySource } from "@/lib/workspace-utils";
import { EVIDENCE_LEGEND_ROWS } from "@/lib/legend-copy";

/**
 * Persistent right-side evidence panel.
 *
 * Shows contextual evidence based on the current route:
 *   - Position page → supporting + counter evidence
 *   - Source page → linked data points
 *   - Ask page → cited + retrieved evidence from the latest answer
 *   - Landing/theme pages → empty (panel hidden by AppShell)
 *
 * When a citation marker is clicked (on the stance or in a chat answer),
 * the panel scrolls to and highlights the matching data point.
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

  if (evidenceSections.length === 0) return null;

  const totalItems = evidenceSections.reduce((sum, s) => sum + s.items.length, 0);

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

      {/* Evidence sections */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="space-y-7">
          {evidenceSections.map((section) => {
            const groups = groupDataPointsBySource(section.items);
            const isCounter = section.variant === "counter";
            return (
              <div key={section.key}>
                <div className="flex items-center justify-between">
                  <p
                    className={
                      isCounter
                        ? "text-xs font-medium uppercase tracking-[0.14em] text-warning-primary"
                        : "text-xs font-medium uppercase tracking-[0.14em] text-quaternary"
                    }
                  >
                    {section.title}
                  </p>
                  <span
                    className={
                      isCounter
                        ? "rounded-full bg-warning-primary px-2 py-0.5 text-xs font-semibold tabular-nums text-warning-primary"
                        : "text-xs tabular-nums text-quaternary"
                    }
                  >
                    {section.items.length}
                  </span>
                </div>
                <p className="mt-1 text-xs text-tertiary">{section.subtitle}</p>
                <div className="mt-5 space-y-7">
                  {groups.map((group) => (
                    <SourceEvidenceGroup
                      key={group.key}
                      group={group}
                      highlightedId={highlightedEvidenceId}
                      citedIds={section.cited ? section.items.map((dp: any) => dp._id) : undefined}
                      labelByDpId={section.labelByDpId}
                      onClaimClick={handleCitationClick}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
