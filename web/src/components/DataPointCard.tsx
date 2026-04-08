import { ConfidenceBadge, EvidenceBadge } from "./Badges";
import SourceBadge, { SourceMeta } from "./SourceBadge";

export type DataPointForCard = {
  _id: string;
  claimText: string;
  anchorQuote: string;
  evidenceType: string;
  confidence?: string;
  extractionNote?: string;
  source?: SourceMeta | null;
  // Alternate shape from getPositionDetail (denormalized fields):
  sourceTitle?: string;
  sourceTier?: number;
  sourceCanonicalUrl?: string;
  sourceAuthorName?: string;
  sourcePublisherName?: string;
  sourcePublishedDate?: string;
};

export default function DataPointCard({
  dp,
  variant = "support",
  index,
}: {
  dp: DataPointForCard;
  variant?: "support" | "counter";
  index?: number;
}) {
  const isCounter = variant === "counter";
  const source: SourceMeta | null =
    dp.source ??
    (dp.sourceTitle
      ? {
          _id: "unknown",
          title: dp.sourceTitle,
          authorName: dp.sourceAuthorName ?? null,
          publisherName: dp.sourcePublisherName ?? null,
          canonicalUrl: dp.sourceCanonicalUrl ?? null,
          publishedDate: dp.sourcePublishedDate ?? null,
          tier: dp.sourceTier ?? null,
        }
      : null);

  return (
    <article
      className={`relative rounded-sm border bg-paper/60 p-5 transition-shadow hover:shadow-[0_2px_24px_-12px_rgba(26,24,20,0.25)] ${
        isCounter
          ? "border-sage/40 bg-sage/[0.04]"
          : "border-rule"
      }`}
    >
      <header className="mb-3 flex flex-wrap items-center gap-2">
        {typeof index === "number" && (
          <span className="label text-inkMute">DP {index + 1}</span>
        )}
        <EvidenceBadge type={dp.evidenceType} />
        {dp.confidence && (
          <ConfidenceBadge confidence={dp.confidence as any} />
        )}
        {isCounter && (
          <span className="label rounded-sm border border-sage/60 bg-sage/10 px-2 py-0.5 text-sage">
            counter-evidence
          </span>
        )}
      </header>

      <p className="text-[15px] leading-relaxed text-inkSoft">
        {dp.claimText}
      </p>

      <blockquote className="pullquote mt-4">
        {dp.anchorQuote}
      </blockquote>

      {dp.extractionNote && (
        <p className="mt-3 text-xs italic text-inkMute">
          Curator note · {dp.extractionNote}
        </p>
      )}

      <div className="mt-4">
        <SourceBadge source={source} />
      </div>
    </article>
  );
}
