import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api, Id } from "../api";
import { StatusBadge, ConfidenceBadge } from "./Badges";
import DataPointCard from "./DataPointCard";

export default function LineageView({
  positionId,
}: {
  positionId: Id<"researchPositions">;
}) {
  const data = useQuery(api.positions.getPositionDetail, { positionId });

  if (data === undefined) {
    return (
      <div className="space-y-6">
        <div className="h-32 animate-pulse rounded-sm border border-rule/60 bg-paperDeep/40" />
        <div className="h-72 animate-pulse rounded-sm border border-rule/60 bg-paperDeep/40" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-sm border border-rule/70 p-10 text-center text-inkMute">
        Position not found.
      </div>
    );
  }

  const v = data.currentVersion;
  const supports = (v?.supportingEvidenceDetails ?? []) as any[];
  const counters = (v?.counterEvidenceDetails ?? []) as any[];
  const observations = (v?.observationDetails ?? []) as any[];
  const models = (v?.mentalModelDetails ?? []) as any[];

  return (
    <div className="space-y-12">
      {/* Theme breadcrumb */}
      <div>
        <Link
          to={data.theme ? `/themes/${data.theme._id}` : "/browse"}
          className="label text-inkMute hover:text-ochreDeep"
        >
          ← {data.theme?.title ?? "Browse themes"}
        </Link>
      </div>

      {/* Position header */}
      <header className="rise-in border-l-2 border-ochre/60 pl-6">
        <div className="flex flex-wrap items-center gap-2">
          {v?.status && <StatusBadge status={v.status as any} />}
          {v?.confidenceLevel && (
            <ConfidenceBadge confidence={v.confidenceLevel as any} />
          )}
          {typeof v?.versionNumber === "number" && (
            <span className="label text-inkMute">version {v.versionNumber}</span>
          )}
        </div>
        <h1 className="display-tight mt-4 text-4xl text-ink md:text-5xl">
          {data.title}
        </h1>
        {v?.currentStance && (
          <p className="mt-6 max-w-3xl text-lg leading-relaxed text-inkSoft">
            {v.currentStance}
          </p>
        )}
        {v?.openQuestions && v.openQuestions.length > 0 && (
          <div className="mt-8">
            <div className="label text-inkMute">Open questions</div>
            <ul className="mt-2 space-y-1 text-sm text-inkSoft">
              {v.openQuestions.map((q: string, i: number) => (
                <li key={i} className="flex gap-2">
                  <span className="text-ochre">·</span>
                  <span>{q}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </header>

      {/* Supporting evidence */}
      <section className="lineage-spine pl-6">
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="display text-2xl text-ink">Supporting evidence</h2>
          <div className="label text-inkMute">
            {supports.length} {supports.length === 1 ? "data point" : "data points"}
          </div>
        </div>
        {supports.length === 0 ? (
          <p className="text-sm italic text-inkMute">
            No supporting data points have been linked to this version yet.
          </p>
        ) : (
          <div className="rise-stagger grid gap-5 lg:grid-cols-2">
            {supports.map((dp, i) => (
              <DataPointCard key={dp._id} dp={dp} index={i} />
            ))}
          </div>
        )}
      </section>

      {/* Counter evidence */}
      {counters.length > 0 && (
        <section className="lineage-spine pl-6">
          <div className="mb-6 flex items-baseline justify-between">
            <h2 className="display text-2xl text-ink">Counter-evidence</h2>
            <div className="label text-inkMute">
              {counters.length}{" "}
              {counters.length === 1 ? "data point" : "data points"}
            </div>
          </div>
          <div className="rise-stagger grid gap-5 lg:grid-cols-2">
            {counters.map((dp) => (
              <DataPointCard key={dp._id} dp={dp} variant="counter" />
            ))}
          </div>
        </section>
      )}

      {/* Curator observations */}
      {observations.length > 0 && (
        <section className="lineage-spine pl-6">
          <h2 className="display mb-6 text-2xl text-ink">
            Curator observations
          </h2>
          <div className="space-y-4">
            {observations.map((obs) => (
              <div
                key={obs._id}
                className="rounded-sm border border-rule bg-paper/60 p-5 text-sm leading-relaxed text-inkSoft"
              >
                {obs.observationText}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Mental models */}
      {models.length > 0 && (
        <section className="lineage-spine pl-6">
          <h2 className="display mb-6 text-2xl text-ink">Mental models</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {models.map((m) => (
              <div
                key={m._id}
                className="rounded-sm border border-rule bg-paper/60 p-5"
              >
                <div className="label text-ochreDeep">{m.modelType}</div>
                <div className="display mt-1 text-lg text-ink">{m.title}</div>
                <p className="mt-2 text-sm leading-relaxed text-inkSoft">
                  {m.description}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
