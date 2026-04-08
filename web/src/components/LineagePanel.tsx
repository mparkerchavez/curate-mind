import DataPointCard, { DataPointForCard } from "./DataPointCard";

export type RetrievedDP = DataPointForCard & {
  _id: string;
};

export default function LineagePanel({
  retrieved,
  citedIds,
}: {
  retrieved: RetrievedDP[];
  citedIds: string[];
}) {
  if (!retrieved || retrieved.length === 0) return null;

  const citedSet = new Set(citedIds);
  const cited = retrieved.filter((dp) => citedSet.has(dp._id));
  const others = retrieved.filter((dp) => !citedSet.has(dp._id));

  return (
    <div className="mt-8 border-t border-rule/70 pt-8">
      <div className="mb-5 flex items-baseline justify-between">
        <h3 className="display text-xl text-ink">Lineage</h3>
        <div className="label text-inkMute">
          {cited.length} cited · {others.length} retrieved
        </div>
      </div>

      {cited.length > 0 && (
        <div className="space-y-4">
          <div className="label text-ochreDeep">Cited in this answer</div>
          <div className="grid gap-4 lg:grid-cols-2">
            {cited.map((dp, i) => (
              <DataPointCard key={dp._id} dp={dp} index={i} />
            ))}
          </div>
        </div>
      )}

      {others.length > 0 && (
        <details className="mt-6 rounded-sm border border-rule/60 bg-paperDeep/40 p-4">
          <summary className="label cursor-pointer text-inkMute">
            Other retrieved evidence (not cited)
          </summary>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {others.map((dp) => (
              <DataPointCard key={dp._id} dp={dp} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
