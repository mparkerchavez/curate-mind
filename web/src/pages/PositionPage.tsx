import { useEffect } from "react";
import { Badge } from "@/components/base/badges/badges";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import SourceEvidenceGroup from "@/components/SourceEvidenceGroup";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { formatDateLabel, groupDataPointsBySource } from "@/lib/workspace-utils";

export default function PositionPage() {
  const { positionDetail, highlightedEvidenceId, evidenceSections } = useWorkspace();

  useEffect(() => {
    if (!highlightedEvidenceId) return;
    const el = document.getElementById(`evidence-card-${highlightedEvidenceId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [highlightedEvidenceId]);

  if (!positionDetail) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center">
        <LoadingIndicator type="line-simple" size="lg" label="Loading position" />
      </div>
    );
  }

  const version = positionDetail.currentVersion;
  const evidenceCount =
    (version?.supportingEvidenceDetails?.length ?? 0) +
    (version?.counterEvidenceDetails?.length ?? 0);
  const metaBits = [
    version?.versionDate ? `Updated ${formatDateLabel(version.versionDate)}` : null,
    evidenceCount > 0
      ? `${evidenceCount} data point${evidenceCount === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* Position header — open canvas, no card wrapper */}
      <header>
        <h1 className="text-display-xs font-semibold tracking-[-0.02em] text-slate-950">
          {positionDetail.title}
        </h1>
        {metaBits.length > 0 && (
          <p className="mt-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
            {metaBits.join(" \u00b7 ")}
          </p>
        )}
        <p className="mt-5 text-base leading-8 text-slate-700">
          {version?.currentStance ?? "No stance has been written for this position yet."}
        </p>
      </header>

      {/* Open questions */}
      {version?.openQuestions?.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold text-slate-950">Open questions</h2>
          <ul className="mt-3 space-y-2">
            {version.openQuestions.map((q: string) => (
              <li key={q} className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm leading-7 text-slate-700">
                {q}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Curator observations */}
      {version?.observationDetails?.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold text-slate-950">Curator observations</h2>
          <div className="mt-3 space-y-2">
            {version.observationDetails.map((obs: any) => (
              <div key={obs._id} className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-4 text-sm leading-7 text-slate-700">
                {obs.observationText}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Mental models */}
      {version?.mentalModelDetails?.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold text-slate-950">Mental models</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {version.mentalModelDetails.map((m: any) => (
              <div key={m._id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <Badge type="color" size="sm" color="gray">{m.modelType}</Badge>
                <p className="mt-3 text-base font-semibold text-slate-950">{m.title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{m.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Evidence sections — grouped by source */}
      {evidenceSections.length > 0 && (
        <section className="mt-8">
          {evidenceSections.map((section) => {
            const groups = groupDataPointsBySource(section.items);
            return (
              <div key={section.key} className="mt-6 first:mt-0">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-950">{section.title}</h2>
                  <Badge type="color" size="sm" color="gray">{section.items.length}</Badge>
                </div>
                <p className="mt-1 text-sm text-slate-600">{section.subtitle}</p>
                <div className="mt-4 space-y-3">
                  {groups.map((group) => (
                    <SourceEvidenceGroup
                      key={group.key}
                      group={group}
                      highlightedId={highlightedEvidenceId}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
