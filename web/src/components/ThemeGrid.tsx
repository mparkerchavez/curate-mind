import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api, Id } from "../api";

export default function ThemeGrid({ projectId }: { projectId: Id<"projects"> }) {
  const themes = useQuery(api.positions.getThemes, { projectId });

  if (themes === undefined) {
    return (
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-44 animate-pulse rounded-sm border border-rule/60 bg-paperDeep/40"
          />
        ))}
      </div>
    );
  }

  if (themes.length === 0) {
    return (
      <div className="rounded-sm border border-rule/70 p-10 text-center text-inkMute">
        No research themes yet.
      </div>
    );
  }

  // Sort by position count desc for visual hierarchy
  const sorted = [...themes].sort(
    (a, b) => (b.positionCount ?? 0) - (a.positionCount ?? 0)
  );

  return (
    <div className="rise-stagger grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {sorted.map((t, i) => (
        <Link
          to={`/themes/${t._id}`}
          key={t._id}
          className="group relative flex h-full flex-col justify-between rounded-sm border border-rule bg-paper/60 p-6 transition-all hover:-translate-y-0.5 hover:border-ochre/60 hover:shadow-[0_2px_30px_-14px_rgba(168,84,28,0.4)]"
        >
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="label text-inkMute">
                Theme · {String(i + 1).padStart(2, "0")}
              </div>
              <div className="label rounded-full border border-rule px-2 py-0.5 text-inkSoft">
                {t.positionCount} {t.positionCount === 1 ? "position" : "positions"}
              </div>
            </div>
            <h3 className="display mt-3 text-2xl leading-snug text-ink">
              {t.title}
            </h3>
            {t.description && (
              <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-inkSoft">
                {t.description}
              </p>
            )}
          </div>
          <div className="mt-5 flex items-center gap-2 text-ochreDeep">
            <span className="label">Open theme</span>
            <span className="transition-transform group-hover:translate-x-1">
              →
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
