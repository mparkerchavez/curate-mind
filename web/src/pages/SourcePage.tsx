// Source detail fallback page for evidence cards without a public destination.
import { useQuery } from "convex/react";
import { Link, useParams } from "react-router-dom";
import { api, Id } from "../api";
import DataPointCard from "../components/DataPointCard";
import SourceBadge from "../components/SourceBadge";

type SourceDetailDataPoint = {
  _id: string;
  claimText: string;
  anchorQuote: string;
  evidenceType: string;
  confidence?: string;
  extractionNote?: string;
};

export default function SourcePage() {
  const { sourceId } = useParams<{ sourceId: string }>();
  const data = useQuery(
    api.sources.getSourceDetail,
    sourceId ? { sourceId: sourceId as Id<"sources"> } : "skip"
  );

  if (!sourceId) return null;

  if (data === undefined) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-16 md:px-10">
        <div className="h-32 animate-pulse rounded-sm border border-rule/60 bg-paperDeep/40" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16 md:px-10">
        <div className="rounded-sm border border-rule/70 p-10 text-center text-inkMute">
          Source not found.
        </div>
      </div>
    );
  }

  const { source, dataPoints } = data;

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 md:px-10">
      <Link to="/browse" className="label text-inkMute hover:text-ochreDeep">
        ← browse corpus
      </Link>

      <header className="mt-6 max-w-4xl border-l-2 border-ochre/60 pl-6">
        <div className="label text-ochreDeep">Source record</div>
        <h1 className="display-tight mt-3 text-4xl text-ink md:text-5xl">
          {source.title}
        </h1>
        <div className="mt-5 max-w-3xl">
          <SourceBadge source={source} />
        </div>
        <div className="mt-6 flex flex-wrap gap-6 text-sm text-inkSoft">
          <span>{data.dataPointCount} linked data points</span>
          <span>Accessibility: {data.urlAccessibility}</span>
          <span>Status: {data.status}</span>
        </div>
        {data.sourceSynthesis && (
          <p className="mt-6 max-w-3xl text-base leading-relaxed text-inkSoft">
            {data.sourceSynthesis}
          </p>
        )}
      </header>

      <section className="mt-12">
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="display text-2xl text-ink">Linked data points</h2>
          <div className="label text-inkMute">
            {dataPoints.length} {dataPoints.length === 1 ? "data point" : "data points"}
          </div>
        </div>
        {dataPoints.length === 0 ? (
          <p className="text-sm italic text-inkMute">
            No data points have been extracted from this source yet.
          </p>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {dataPoints.map((dp: SourceDetailDataPoint, index: number) => (
              <DataPointCard
                key={dp._id}
                index={index}
                dp={{
                  ...dp,
                  source,
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
