import { useEffect } from "react";
import { Badge } from "@/components/base/badges/badges";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { ConfidenceBadge, StatusBadge } from "@/components/Badges";
import DataPointCard from "@/components/DataPointCard";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export default function PositionPage() {
  const { positionDetail, highlightedEvidenceId, handleCitationClick, evidenceSections } =
    useWorkspace();

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

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* Position header */}
      <section className="rounded-3xl border border-utility-brand-200 bg-utility-brand-50/50 p-6">
        <div className="flex flex-wrap items-center gap-2">
          {version?.status && <StatusBadge status={version.status} />}
          {version?.confidenceLevel && <ConfidenceBadge confidence={version.confidenceLevel} />}
          {typeof version?.versionNumber === "number" && (
            <Badge type="color" size="sm" color="gray">
              Version {version.versionNumber}
            </Badge>
          )}
        </div>

        <h1 className="mt-4 text-display-xs font-semibold tracking-[-0.02em] text-slate-950">
          {positionDetail.title}
        </h1>
        <p className="mt-4 text-base leading-8 text-slate-700">
          {version?.currentStance ?? "No stance has been written for this position yet."}
        </p>
      </section>

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

      {/* Evidence sections */}
      {evidenceSections.length > 0 && (
        <section className="mt-8">
          {evidenceSections.map((section) => (
            <div key={section.key} className="mt-6 first:mt-0">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-950">{section.title}</h2>
                <Badge type="color" size="sm" color="gray">{section.items.length}</Badge>
              </div>
              <p className="mt-1 text-sm text-slate-600">{section.subtitle}</p>
              <ol className="mt-4 space-y-3">
                {section.items.map((dp: any, idx: number) => (
                  <li key={dp._id}>
                    <DataPointCard
                      dp={dp}
                      variant={section.variant}
                      isHighlighted={highlightedEvidenceId === dp._id}
                      isCited={section.cited}
                      onSelect={() => handleCitationClick(dp._id)}
                      label={`${section.variant === "counter" ? "CT" : "EV"} ${String(idx + 1).padStart(2, "0")}`}
                    />
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
