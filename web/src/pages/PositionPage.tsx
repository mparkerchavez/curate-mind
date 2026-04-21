import { useEffect, useMemo, useRef } from "react";
import { Badge } from "@/components/base/badges/badges";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { formatDateLabel, renderAnswerBlocks } from "@/lib/workspace-utils";

export default function PositionPage() {
  const { positionDetail, handleCitationClick, highlightedEvidenceId } = useWorkspace();
  const stanceRef = useRef<HTMLDivElement | null>(null);

  // When the highlighted evidence changes, scroll the matching claim in the body into view.
  useEffect(() => {
    if (!highlightedEvidenceId || !stanceRef.current) return;
    const target = stanceRef.current.querySelector<HTMLElement>(
      `[data-dp-id="${highlightedEvidenceId}"]`,
    );
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightedEvidenceId]);

  // All hooks must be called before any early return (React rules of hooks)
  const version = positionDetail?.currentVersion;

  const citationMap = useMemo(() => {
    const map = new Map<string, string>();
    (version?.supportingEvidenceDetails ?? []).forEach((dp: any, i: number) => {
      map.set(`E${i + 1}`, dp._id);
    });
    (version?.counterEvidenceDetails ?? []).forEach((dp: any, i: number) => {
      map.set(`C${i + 1}`, dp._id);
    });
    return map;
  }, [version]);

  if (!positionDetail) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center">
        <LoadingIndicator type="line-simple" size="lg" label="Loading position" />
      </div>
    );
  }

  const evidenceCount =
    (version?.supportingEvidenceDetails?.length ?? 0) +
    (version?.counterEvidenceDetails?.length ?? 0);
  const metaBits = [
    version?.versionDate ? `Updated ${formatDateLabel(version.versionDate)}` : null,
    evidenceCount > 0
      ? `${evidenceCount} data point${evidenceCount === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);

  const stanceText = version?.currentStance ?? "No stance has been written for this position yet.";

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* Position header — open canvas, no card wrapper */}
      <header>
        <h1 className="text-display-md font-semibold tracking-[-0.02em] text-primary">
          {positionDetail.title}
        </h1>
        {metaBits.length > 0 && (
          <p className="mt-2 text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
            {metaBits.join(" \u00b7 ")}
          </p>
        )}
        <div ref={stanceRef} className="mt-5 space-y-5">
          {renderAnswerBlocks(stanceText, citationMap, handleCitationClick, { highlightedDpId: highlightedEvidenceId })}
        </div>
      </header>

      {/* Open questions */}
      {version?.openQuestions?.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold text-primary">Open questions</h2>
          <ul className="mt-3 space-y-2">
            {version.openQuestions.map((q: string) => (
              <li key={q} className="rounded-xl border border-secondary bg-secondary_subtle px-4 py-3 text-sm leading-7 text-secondary">
                {q}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Curator observations */}
      {version?.observationDetails?.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold text-primary">Curator observations</h2>
          <div className="mt-3 space-y-2">
            {version.observationDetails.map((obs: any) => (
              <div key={obs._id} className="rounded-xl border border-secondary bg-secondary_subtle px-4 py-4 text-sm leading-7 text-secondary">
                {obs.observationText}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Mental models */}
      {version?.mentalModelDetails?.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold text-primary">Mental models</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {version.mentalModelDetails.map((m: any) => (
              <div key={m._id} className="rounded-xl border border-secondary bg-secondary_subtle p-4">
                <Badge type="color" size="sm" color="gray">{m.modelType}</Badge>
                <p className="mt-3 text-base font-semibold text-primary">{m.title}</p>
                <p className="mt-2 text-sm leading-6 text-tertiary">{m.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Evidence renders in the right-side EvidencePanel (AppShell) */}
    </div>
  );
}
