import { Badge } from "@/components/base/badges/badges";
import SourceEvidenceGroup from "@/components/SourceEvidenceGroup";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { groupDataPointsBySource } from "@/lib/workspace-utils";

/**
 * Persistent right-side evidence panel.
 *
 * Shows contextual evidence based on the current route:
 *   - Position page → supporting + counter evidence
 *   - Source page → linked data points
 *   - Ask page → cited + retrieved evidence from the latest answer
 *   - Landing/theme pages → empty (panel hidden by AppShell)
 *
 * Evidence is grouped by source using the same SourceEvidenceGroup
 * component used everywhere else.
 */
export default function EvidencePanel() {
  const { evidenceSections, highlightedEvidenceId } = useWorkspace();

  if (evidenceSections.length === 0) return null;

  const totalItems = evidenceSections.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <div className="flex h-full flex-col">
      {/* Panel header */}
      <div className="shrink-0 border-b border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-950">Evidence</h2>
          <Badge type="color" size="sm" color="gray">
            {totalItems}
          </Badge>
        </div>
      </div>

      {/* Evidence sections */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-6">
          {evidenceSections.map((section) => {
            const groups = groupDataPointsBySource(section.items);
            return (
              <div key={section.key}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                    {section.title}
                  </p>
                  <span className="text-xs tabular-nums text-slate-400">
                    {section.items.length}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{section.subtitle}</p>
                <div className="mt-3 space-y-3">
                  {groups.map((group) => (
                    <SourceEvidenceGroup
                      key={group.key}
                      group={group}
                      highlightedId={highlightedEvidenceId}
                      citedIds={section.cited ? section.items.map((dp: any) => dp._id) : undefined}
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
