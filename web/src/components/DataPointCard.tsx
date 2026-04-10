import { ChevronDown } from "@untitledui/icons";
import { useEffect, useMemo, useState } from "react";
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
  defaultOpen = false,
}: {
  dp: DataPointForCard;
  variant?: "support" | "counter";
  isHighlighted?: boolean;
  isCited?: boolean;
  label?: string;
  index?: number;
  onSelect?: () => void;
  defaultOpen?: boolean;
}) {
  const [detailsOpen, setDetailsOpen] = useState(defaultOpen || isHighlighted);
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
  const sourceTitle = source?.title ?? dp.sourceTitle ?? "Source unavailable";

  useEffect(() => {
    if (isHighlighted) {
      setDetailsOpen(true);
    }
  }, [isHighlighted]);

  return (
    <article
      id={`evidence-card-${dp._id}`}
      className={cn(
        "trace-item",
        isCounter
          ? "border-warning/35 bg-warning-soft/65"
          : "",
        isCited && "is-cited",
        isHighlighted && "is-highlighted",
        detailsOpen && "is-open",
      )}
    >
      <details
        className="trace-details"
        open={detailsOpen}
        onToggle={(event) => setDetailsOpen((event.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className="trace-summary">
          <span className="trace-summary-source">{sourceTitle}</span>
          <span className="trace-toggle" aria-hidden="true">
            <ChevronDown className="size-4" />
          </span>
          <p className="trace-summary-text">{dp.claimText}</p>
          <span className="trace-summary-meta">
            {resolvedLabel && <span className="trace-chip">{resolvedLabel}</span>}
            <span className={cn("trace-chip", isCounter && "is-warning")}>
              {isCounter ? "Counter" : "Evidence"}
            </span>
            {isCited && <span className="trace-chip is-accent">Cited</span>}
            {dp.confidence && <span className="trace-chip">Conf {dp.confidence}</span>}
          </span>
        </summary>

        <div className="trace-body">
          <article className="trace-node">
            <div className="trace-node-header">
              <span className="trace-node-id">{resolvedLabel ?? "DP"}</span>
            </div>
            <p className="trace-node-claim">{dp.claimText}</p>
            <p className="trace-node-anchor">Anchor: "{dp.anchorQuote}"</p>
          </article>

          <SourceBadge source={source} compact />

          {dp.extractionNote && (
            <article className="trace-node trace-note-card">
              <div className="trace-node-header">
                <span className="trace-node-id">Curator note</span>
              </div>
              <p className="trace-note">{dp.extractionNote}</p>
            </article>
          )}

          <article className="trace-node">
            <div className="trace-node-header">
              <span className="trace-node-id">Secondary metadata</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <SecondaryPill label={dp.evidenceType.replace("-", " ")} />
              {dp.sourceType && <SecondaryPill label={dp.sourceType} />}
              {typeof source?.tier === "number" && (
                <SecondaryPill label={`tier ${source.tier}`} />
              )}
            </div>
          </article>

          {onSelect && (
            <div className="trace-actions">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect();
                }}
                className={cn(
                  "trace-action-button",
                  isHighlighted && "border-accent/30 text-accent",
                )}
              >
                {isHighlighted ? "Focused" : "Focus card"}
              </button>
            </div>
          )}
        </div>
      </details>
    </article>
  );
}

function SecondaryPill({ label }: { label: string }) {
  return (
    <span className="trace-chip">
      {label}
    </span>
  );
}
