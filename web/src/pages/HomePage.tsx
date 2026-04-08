import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../api";
import { useProject } from "../ProjectContext";

export default function HomePage() {
  const { projectId, projectName } = useProject();
  const themes = useQuery(
    api.positions.getThemes,
    projectId ? { projectId } : "skip"
  );
  const positions = useQuery(api.positions.listAllPositions, {});

  const themeCount = themes?.length ?? 0;
  const positionCount = positions?.length ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 md:px-10 md:py-24">
      <section className="rise-in grid gap-12 md:grid-cols-12">
        <div className="md:col-span-8">
          <div className="label text-ochreDeep">February 2026 · AI research corpus</div>
          <h1 className="display-tight mt-4 text-5xl text-ink md:text-7xl">
            Positions, traced
            <br />
            <span className="italic text-ochreDeep">to the source.</span>
          </h1>
          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-inkSoft">
            Curate Mind is a personal research curation system. One month of
            articles, reports, and video transcripts on AI strategy, adoption,
            and enterprise transformation — pulled apart into atomic claims,
            stitched into versioned positions, and made traceable down to the
            verbatim quote that earned each claim its place.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              to="/browse"
              className="group inline-flex items-center gap-3 rounded-sm bg-ink px-6 py-4 text-paper transition-colors hover:bg-ochreDeep"
            >
              <span className="label">Browse research</span>
              <span className="transition-transform group-hover:translate-x-1">
                →
              </span>
            </Link>
            <Link
              to="/ask"
              className="group inline-flex items-center gap-3 rounded-sm border border-ink px-6 py-4 text-ink transition-colors hover:border-ochreDeep hover:text-ochreDeep"
            >
              <span className="label">Ask a question</span>
              <span className="transition-transform group-hover:translate-x-1">
                →
              </span>
            </Link>
          </div>
        </div>
        <div className="md:col-span-4 md:pl-8 md:border-l md:border-rule">
          <dl className="space-y-8">
            <Stat label="Themes" value={themeCount} />
            <Stat label="Positions" value={positionCount} />
            <Stat label="Sources curated" value="~134" />
            <Stat label="Window" value="Feb 2026" />
          </dl>
          {projectName && (
            <div className="mt-8 text-xs font-mono text-inkMute">
              project · {projectName}
            </div>
          )}
        </div>
      </section>

      <section className="mt-28 grid gap-10 border-t border-rule/70 pt-16 md:grid-cols-3">
        <Pillar
          n="01"
          title="Atomic claims"
          body="Every assertion is extracted from a source with a 10–40 word verbatim anchor quote. No claim survives without the evidence underneath it."
        />
        <Pillar
          n="02"
          title="Versioned positions"
          body="Positions are theses, not summaries. They are ranked by confidence, carry counter-evidence, and grow new versions as the corpus evolves."
        />
        <Pillar
          n="03"
          title="Traceable lineage"
          body="The hero move: click any position, see the supporting data points, then the exact quotes, then the source. No black box."
        />
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="label text-inkMute">{label}</div>
      <div className="display mt-1 text-4xl text-ink">{value}</div>
    </div>
  );
}

function Pillar({
  n,
  title,
  body,
}: {
  n: string;
  title: string;
  body: string;
}) {
  return (
    <div>
      <div className="label text-ochreDeep">{n}</div>
      <h3 className="display mt-2 text-2xl text-ink">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-inkSoft">{body}</p>
    </div>
  );
}
