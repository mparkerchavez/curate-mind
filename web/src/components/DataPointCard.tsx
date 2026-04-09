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
      onClick={onSelect}
      onKeyDown={(event) => {
        if (!onSelect) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      className={cn(
        "group rounded-[1.35rem] border bg-panel p-4 shadow-[var(--shadow-float)]",
        isCounter
          ? "border-warning/25 bg-warning-soft/55"
          : "border-border/80 bg-panel/95",
        isCited && "border-accent/35 ring-1 ring-accent/18",
        isHighlighted && "border-accent bg-accent-soft/60 ring-2 ring-accent/24",
        onSelect && "cursor-pointer",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {resolvedLabel && (
              <span className="rounded-full bg-panel px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-ink-muted">
                {resolvedLabel}
              </span>
            )}
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em]",
                isCounter ? "bg-warning/12 text-warning" : "bg-panel-muted text-ink-muted",
              )}
            >
              {isCounter ? "Counter evidence" : "Evidence"}
            </span>
            {isCited && (
              <span className="rounded-full bg-accent px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-white">
                Cited
              </span>
            )}
          </div>
          <h3 className="text-base font-semibold leading-7 text-ink">{dp.claimText}</h3>
        </div>
      </div>

      <div className="mt-4 rounded-[1.15rem] border border-accent/12 quote-block px-4 py-3.5">
        <div className="meta-kicker text-accent">Verbatim text</div>
        <blockquote className="mt-2 text-sm leading-7 text-ink-soft">
          "{dp.anchorQuote}"
        </blockquote>
      </div>

      <div className="mt-4">
        <SourceBadge source={source} compact />
      </div>

      {dp.extractionNote && (
        <div className="mt-4 rounded-[1.15rem] border border-border/70 bg-panel-muted/85 px-4 py-3">
          <div className="meta-kicker">Curator note</div>
          <p className="mt-2 text-sm leading-6 text-ink-soft">{dp.extractionNote}</p>
        </div>
      )}

      <div className="mt-4 rounded-[1.1rem] border border-border/70 bg-panel-muted/60">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setDetailsOpen((open) => !open);
          }}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-ink-muted">
            Secondary metadata
          </span>
          {detailsOpen ? (
            <ChevronUp className="size-4 text-ink-muted" />
          ) : (
            <ChevronDown className="size-4 text-ink-muted" />
          )}
        </button>

        {detailsOpen && (
          <div className="border-t border-border/70 px-4 py-3">
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
    <span className="rounded-full border border-border bg-panel px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-ink-muted">
      {label}
    </span>
  );
}
