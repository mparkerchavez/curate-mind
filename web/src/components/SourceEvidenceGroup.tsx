import { Link } from "react-router-dom";
import { ArrowUpRight } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { cn } from "@/lib/cn";
import {
  formatAuthorsShort,
  formatDateLabel,
  type SourceGroup,
} from "@/lib/workspace-utils";

type Props = {
  group: SourceGroup;
  highlightedId?: string | null;
  citedIds?: string[];
  /** Map from data point id → citation label ("E2", "C1"). When present, used as the list marker instead of the per-source index. */
  labelByDpId?: Record<string, string>;
  /** When provided, clicking a claim row calls this with the data point ID. */
  onClaimClick?: (dpId: string) => void;
};

/**
 * Build a deep-link URL that jumps to the exact spot in the source.
 *
 * For HTML articles: appends a text fragment (#:~:text=...) using the
 * anchor quote, so the browser scrolls to and highlights the passage.
 * For PDFs or when no anchor quote exists: returns the plain URL.
 */
function buildDeepLinkUrl(baseUrl: string, anchorQuote?: string | null): string {
  if (!anchorQuote) return baseUrl;
  // Use the first ~10 words for matching reliability
  const words = anchorQuote.trim().split(/\s+/).slice(0, 10).join(" ");
  // Strip smart quotes and other problematic characters
  const cleaned = words
    .replace(/[\u2018\u2019\u201C\u201D]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return baseUrl;
  return `${baseUrl}#:~:text=${encodeURIComponent(cleaned)}`;
}

export default function SourceEvidenceGroup({
  group,
  highlightedId,
  citedIds,
  labelByDpId,
  onClaimClick,
}: Props) {
  const source = group.source;
  const publisher = source?.publisherName?.trim() || null;
  const documentTitle = source?.title?.trim() || null;

  const primary = publisher ?? documentTitle ?? "Unknown source";
  const secondary = publisher ? documentTitle : null;
  const tertiaryBits = [
    formatAuthorsShort(source?.authorName ?? null),
    source?.publishedDate ? formatDateLabel(source.publishedDate) : null,
  ].filter(Boolean);

  const internalHref = source?.sourcePagePath ?? (source?._id ? `/sources/${source._id}` : null);
  const baseExternalHref =
    source?.resolvedUrl ?? source?.storageUrl ?? source?.canonicalUrl ?? null;
  const externalKind: "storage" | "canonical" | null =
    source?.resolvedLinkKind === "internal"
      ? null
      : (source?.resolvedLinkKind ?? (source?.storageUrl ? "storage" : source?.canonicalUrl ? "canonical" : null));
  const citedSet = new Set(citedIds ?? []);

  // Find the highlighted claim in THIS group (if any)
  const highlightedClaim = highlightedId
    ? group.claims.find((c: any) => c._id === highlightedId)
    : null;

  // Build the "Open original" URL — deep-links to the highlighted claim's
  // anchor quote when one is selected, otherwise opens at the top of the source.
  const externalHref = baseExternalHref
    ? highlightedClaim?.anchorQuote
      ? buildDeepLinkUrl(baseExternalHref, highlightedClaim.anchorQuote)
      : baseExternalHref
    : null;

  // Button label changes when targeting a specific claim
  const externalLabel = highlightedClaim?.anchorQuote
    ? "Open at source"
    : externalKind === "storage"
      ? "Open file"
      : "Open original";

  return (
    <article className="overflow-hidden rounded-2xl border border-secondary bg-primary shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      {/* Source header */}
      <header className="flex items-start justify-between gap-4 px-5 pt-6 pb-5">
        <div className="min-w-0 flex-1">
          <p className="text-xl font-semibold leading-7 tracking-[-0.01em] text-primary">
            {primary}
          </p>
          {secondary && (
            internalHref ? (
              <Link
                to={internalHref}
                className="mt-1.5 block text-base leading-6 text-secondary hover:text-brand-secondary"
              >
                {secondary}
              </Link>
            ) : (
              <p className="mt-1.5 text-base leading-6 text-secondary">{secondary}</p>
            )
          )}
          {tertiaryBits.length > 0 && (
            <p className="mt-2 text-xs leading-5 text-tertiary">
              {tertiaryBits.join(" \u00b7 ")}
            </p>
          )}
        </div>

        {externalHref && (
          <Button
            size="sm"
            color="secondary"
            iconTrailing={ArrowUpRight}
            className="shrink-0"
            href={externalHref}
            target="_blank"
            rel="noreferrer noopener"
          >
            {externalLabel}
          </Button>
        )}
      </header>

      {/* Data points — numbered list, clickable rows */}
      <div className="border-t border-tertiary px-5 pt-4 pb-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-quaternary">
          Data points
        </p>
        <ol className="mt-3 space-y-2">
          {group.claims.map((claim: any, idx: number) => {
            const isHighlighted = highlightedId === claim._id;
            const isCited = citedSet.has(claim._id);
            const isClickable = !!onClaimClick;
            const label = labelByDpId?.[claim._id];
            const isCounter = label?.startsWith("C") ?? false;
            const markerText = label ?? String(idx + 1);
            return (
              <li
                key={claim._id}
                id={`evidence-card-${claim._id}`}
                className={cn(
                  "flex items-baseline gap-4 rounded-lg py-1.5 transition-colors",
                  isHighlighted ? (isCounter ? "-mx-2 bg-warning-primary px-2" : "-mx-2 bg-success-primary px-2") : "",
                  isClickable && !isHighlighted ? "cursor-pointer hover:bg-secondary -mx-2 px-2" : "",
                )}
                onClick={isClickable ? () => onClaimClick(claim._id) : undefined}
              >
                <span
                  className={cn(
                    "shrink-0 text-sm font-semibold tabular-nums tracking-[0.02em]",
                    label ? "w-7" : "w-5",
                    isCounter
                      ? "text-warning-primary"
                      : label
                        ? "text-success-primary"
                        : isCited
                          ? "text-success-primary"
                          : "text-quaternary",
                  )}
                  aria-hidden="true"
                >
                  {markerText}
                </span>
                <p
                  className={cn(
                    "flex-1 text-sm leading-7",
                    isCited ? "text-primary" : "text-secondary",
                  )}
                >
                  {claim.claimText}
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </article>
  );
}
