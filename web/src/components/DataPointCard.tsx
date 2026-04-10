import SourceBadge, { type SourceMeta } from "./SourceBadge";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { ConfidenceBadge, EvidenceBadge, TierBadge } from "./Badges";
import { cn } from "@/lib/cn";

export type DataPointForCard = {
  _id: string;
  claimText: string;
  anchorQuote: string;
  evidenceType: string;
  confidence?: string;
  extractionNote?: string;
  source?: SourceMeta | null;
  sourceTitle?: string;
  sourceTier?: number;
  sourceCanonicalUrl?: string;
  sourceAuthorName?: string;
  sourcePublisherName?: string;
  sourcePublishedDate?: string;
  sourceResolvedUrl?: string;
  sourceResolvedLinkKind?: "storage" | "canonical" | "internal";
  sourcePagePath?: string;
  sourceStorageUrl?: string | null;
  sourceType?: string;
};

export default function DataPointCard({
  dp,
  variant = "support",
  isHighlighted = false,
  isCited = false,
  label,
  index,
  onSelect,
}: {
  dp: DataPointForCard;
  variant?: "support" | "counter";
  isHighlighted?: boolean;
  isCited?: boolean;
  label?: string;
  index?: number;
  onSelect?: () => void;
}) {
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
          sourceType: dp.sourceType ?? null,
          storageUrl: dp.sourceStorageUrl ?? null,
          resolvedUrl: dp.sourceResolvedUrl ?? null,
          resolvedLinkKind: dp.sourceResolvedLinkKind ?? null,
          sourcePagePath: dp.sourcePagePath ?? null,
          tier: dp.sourceTier ?? null,
        }
      : null);

  const resolvedLabel =
    label ?? (typeof index === "number" ? `DP ${String(index + 1).padStart(2, "0")}` : "DP");

  return (
    <article
      id={`evidence-card-${dp._id}`}
      className={cn(
        "rounded-3xl border bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all",
        variant === "counter" ? "border-utility-yellow-200 bg-utility-yellow-50/40" : "border-slate-200",
        isHighlighted && "border-utility-brand-200 ring-2 ring-utility-brand-100",
        isCited && "border-utility-brand-200 bg-utility-brand-50/50",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge type="color" size="sm" color="gray">
          {resolvedLabel}
        </Badge>
        <EvidenceBadge type={dp.evidenceType} />
        {variant === "counter" ? (
          <Badge type="color" size="sm" color="warning">
            Counter evidence
          </Badge>
        ) : null}
        {isCited ? (
          <Badge type="color" size="sm" color="brand">
            Cited in answer
          </Badge>
        ) : null}
        <ConfidenceBadge confidence={dp.confidence as any} />
        {typeof source?.tier === "number" ? <TierBadge tier={source.tier} /> : null}
      </div>

      <div className="mt-4">
        <h3 className="text-base font-semibold leading-7 text-slate-900">{dp.claimText}</h3>
        <blockquote className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-700">
          “{dp.anchorQuote}”
        </blockquote>
      </div>

      {dp.extractionNote ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
            Curator note
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-700">{dp.extractionNote}</p>
        </div>
      ) : null}

      <div className="mt-4">
        <SourceBadge source={source} compact />
      </div>

      {onSelect ? (
        <div className="mt-4 flex justify-end">
          <Button size="xs" color={isHighlighted ? "primary" : "secondary"} onClick={onSelect}>
            {isHighlighted ? "Focused" : "Focus card"}
          </Button>
        </div>
      ) : null}
    </article>
  );
}
