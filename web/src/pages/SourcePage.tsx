import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import SourceBadge from "@/components/SourceBadge";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export default function SourcePage() {
  const { sourceDetail } = useWorkspace();

  if (!sourceDetail) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center">
        <LoadingIndicator type="line-simple" size="lg" label="Loading source" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* Source header */}
      <section className="rounded-3xl border border-slate-200 bg-slate-50/70 p-6">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
          Source record
        </p>
        <div className="mt-4">
          <SourceBadge source={sourceDetail.source} />
        </div>
        {sourceDetail.sourceSynthesis && (
          <p className="mt-4 text-sm leading-7 text-slate-600">{sourceDetail.sourceSynthesis}</p>
        )}
      </section>

      {/* Metrics */}
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Linked data points</p>
          <p className="mt-3 text-2xl font-semibold text-slate-950">{sourceDetail.dataPointCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Accessibility</p>
          <p className="mt-3 text-2xl font-semibold text-slate-950">{sourceDetail.urlAccessibility}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Status</p>
          <p className="mt-3 text-2xl font-semibold text-slate-950">{sourceDetail.status}</p>
        </div>
      </div>

      {/* Evidence renders in the right-side EvidencePanel (AppShell) */}
    </div>
  );
}
