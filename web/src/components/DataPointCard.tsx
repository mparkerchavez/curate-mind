import { ChevronDown, ChevronUp } from "@untitledui/icons";
import { useMemo, useState } from "react";
import SourceBadge, { SourceMeta } from "./SourceBadge";
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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const source = useMemo<SourceMeta | null>(
    () =>
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
        : null),
    [dp],
  );

  const isCounter = variant === "counter";

  const resolvedLabel =
    label ?? (typeof index === "number" ? `DP ${String(index + 1).padStart(2, "0")}` : undefined);

  return (
    <article
      id={`evidence-card-${dp._id}`}
      className={cn(
        "group rounded-[1.45rem] border p-4 transition-colors duration-200",
        isCounter
          ? "border-warning/35 bg-warning-soft/72"
          : "evidence-frame",
        isCited && "border-accent/35 shadow-[0_18px_36px_-28px_rgba(49,94,251,0.45)]",
        isHighlighted &&
          "border-accent bg-accent-soft/55 ring-1 ring-accent/28 shadow-[0_20px_40px_-28px_rgba(49,94,251,0.55)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {resolvedLabel && (
              <span className="count-chip rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em]">
                {resolvedLabel}
              </span>
            )}
            <span
              className={cn(
                "rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em]",
                isCounter
                  ? "border-warning/28 bg-warning-soft text-warning"
                  : "border-border/80 bg-panel text-ink-muted",
              )}
            >
              {isCounter ? "Counter evidence" : "Evidence"}
            </span>
            {isCited && (
              <span className="rounded-full border border-accent/25 bg-accent-soft px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-accent">
                Cited
              </span>
            )}
          </div>
          <h3 className="text-[1.08rem] font-semibold leading-8 text-ink">{dp.claimText}</h3>
        </div>

        {onSelect && (
          <button
            type="button"
            onClick={onSelect}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.12em]",
              isHighlighted
                ? "border-accent bg-accent text-white"
                : "border-border bg-panel text-ink-soft hover:border-accent/30 hover:text-accent",
            )}
          >
            {isHighlighted ? "Focused" : "Focus card"}
          </button>
        )}
      </div>

      <div className="mt-4 rounded-[1.2rem] border border-accent/12 quote-block px-4 py-3.5">
        <div className="meta-kicker text-accent">Verbatim text</div>
        <blockquote className="mt-2 text-[0.96rem] leading-7 text-ink-soft">
          "{dp.anchorQuote}"
        </blockquote>
      </div>

      <div className="mt-4">
        <SourceBadge source={source} compact />
      </div>

      {dp.extractionNote && (
        <div className="mt-4 rounded-[1.2rem] border border-border/80 bg-panel-muted/88 px-4 py-3.5">
          <div className="meta-kicker">Curator note</div>
          <p className="mt-2 text-sm leading-7 text-ink-soft">{dp.extractionNote}</p>
        </div>
      )}

      <div className="mt-4 rounded-[1.15rem] border border-border/75 bg-panel/70">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setDetailsOpen((open) => !open);
          }}
          className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-panel-muted/60"
        >
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-ink-muted">
            Secondary metadata
          </span>
          {detailsOpen ? (
            <ChevronUp className="size-4 text-ink-muted" />
          ) : (
            <ChevronDown className="size-4 text-ink-muted" />
          )}
        </button>

        {detailsOpen && (
          <div className="border-t border-border/70 bg-panel-muted/56 px-4 py-3">
            <div className="flex flex-wrap gap-2">
              <SecondaryPill label={dp.evidenceType.replace("-", " ")} />
              {dp.confidence && <SecondaryPill label={`confidence ${dp.confidence}`} />}
              {dp.sourceType && <SecondaryPill label={dp.sourceType} />}
              {typeof source?.tier === "number" && (
                <SecondaryPill label={`tier ${source.tier}`} />
              )}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function SecondaryPill({ label }: { label: string }) {
  return (
    <span className="count-chip rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em]">
      {label}
    </span>
  );
}
