import { useQuery } from "convex/react";
import { api, Id } from "../api";
import PositionCard from "./PositionCard";

export default function PositionList({
  themeId,
}: {
  themeId: Id<"researchThemes">;
}) {
  const positions = useQuery(api.positions.getPositionsByTheme, { themeId });

  if (positions === undefined) {
    return (
      <div className="grid gap-5 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-44 animate-pulse rounded-sm border border-rule/60 bg-paperDeep/40"
          />
        ))}
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="rounded-sm border border-rule/70 p-10 text-center text-inkMute">
        No positions yet within this theme.
      </div>
    );
  }

  // Order: established → active → emerging → evolved → retired
  const order: Record<string, number> = {
    established: 0,
    active: 1,
    emerging: 2,
    evolved: 3,
    retired: 4,
  };
  const sorted = [...positions].sort((a, b) => {
    const sa = a.currentVersion?.status ?? "active";
    const sb = b.currentVersion?.status ?? "active";
    return (order[sa] ?? 9) - (order[sb] ?? 9);
  });

  return (
    <div className="rise-stagger grid gap-5 md:grid-cols-2">
      {sorted.map((p) => (
        <PositionCard key={p._id} position={p as any} />
      ))}
    </div>
  );
}
