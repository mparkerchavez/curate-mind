import { Link } from "react-router-dom";
import { StatusBadge, ConfidenceBadge } from "./Badges";

export type PositionCardData = {
  _id: string;
  title: string;
  currentVersion?: {
    currentStance?: string;
    confidenceLevel?: "emerging" | "active" | "established";
    status?: "emerging" | "active" | "established" | "evolved" | "retired";
    versionNumber?: number;
  } | null;
};

function abbreviate(text: string | undefined, max = 220) {
  if (!text) return "";
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return cut.slice(0, lastSpace > 0 ? lastSpace : max).trimEnd() + "…";
}

export default function PositionCard({ position }: { position: PositionCardData }) {
  const v = position.currentVersion;
  return (
    <Link
      to={`/positions/${position._id}`}
      className="group block rounded-sm border border-rule bg-paper/60 p-6 transition-all hover:-translate-y-0.5 hover:border-ochre/60 hover:shadow-[0_2px_30px_-14px_rgba(168,84,28,0.35)]"
    >
      <div className="flex flex-wrap items-center gap-2">
        {v?.status && <StatusBadge status={v.status} />}
        {v?.confidenceLevel && (
          <ConfidenceBadge confidence={v.confidenceLevel} />
        )}
        {typeof v?.versionNumber === "number" && (
          <span className="label text-inkMute">v{v.versionNumber}</span>
        )}
      </div>
      <h3 className="display mt-3 text-xl leading-snug text-ink">
        {position.title}
      </h3>
      {v?.currentStance && (
        <p className="mt-3 text-sm leading-relaxed text-inkSoft">
          {abbreviate(v.currentStance)}
        </p>
      )}
      <div className="mt-5 flex items-center gap-2 text-ochreDeep">
        <span className="label">Trace lineage</span>
        <span className="transition-transform group-hover:translate-x-1">→</span>
      </div>
    </Link>
  );
}
