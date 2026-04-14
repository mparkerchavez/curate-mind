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
};

/**
 * A single source paired with the claims pulled from it.
 *
 * Header hierarchy (top to bottom):
 *   1. Publisher / creator        — primary, largest. WHO says this.
 *   2. Document title              — secondary, linked to the internal source page.
 *   3. Author · date               — tertiary meta line.
 *   +  "Open original" button     — bordered secondary button, anchored top-right.
 *
 * Body = a numbered "Data points" list. Plain text. Claims are not clickable
 * by design — the reader reads, and clicks "Open original" if they want to
 * verify. Cited claims (when the answer referenced them) get a brand-colored
 * number and slightly darker text as a quiet signal, no badges.
 *
 * The bg-utility-brand-50 wash is still triggered externally by citation-chip
 * clicks in the assistant answer (via highlightedId) — transient feedback,
 * not a persistent interaction.
 */
export default function SourceEvidenceGroup({
  group,
  highlightedId,
  citedIds,
}: Props) {
  const source = group.source;
  const publisher = source?.publisherName?.trim() || null;
  const documentTitle = source?.title?.trim() || null;

  // Publisher is primary. If we don't have one, fall back to the document title
  // so we never show an empty header.
  const primary = publisher ?? documentTitle ?? "Unknown source";
  const secondary = publisher ? documentTitle : null;
  const tertiaryBits = [
    formatAuthorsShort(source?.authorName ?? null),
    source?.publishedDate ? formatDateLabel(source.publishedDate) : null,
  ].filter(Boolean);

  const internalHref = source?.sourcePagePath ?? (source?._id ? `/sources/${source._id}` : null);
  const externalHref =
    source?.resolvedUrl ?? source?.storageUrl ?? source?.canonicalUrl ?? null;
  const externalKind: "storage" | "canonical" | null =
    source?.resolvedLinkKind === "internal"
      ? null
      : (source?.resolvedLinkKind ?? (source?.storageUrl ? "storage" : source?.canonicalUrl ? "canonical" : null));
  const externalLabel = externalKind === "storage" ? "Open file" : "Open original";
  const citedSet = new Set(citedIds ?? []);

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      {/* Source header */}
      <header className="flex items-start justify-between gap-4 px-5 pt-5 pb-4">
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold leading-6 text-slate-900">{primary}</p>
          {secondary && (
            internalHref ? (
              <Link
                to={internalHref}
                className="mt-1 block text-sm leading-6 text-slate-600 hover:text-utility-brand-700"
              >
                {secondary}
              </Link>
            ) : (
              <p className="mt-1 text-sm leading-6 text-slate-600">{secondary}</p>
            )
          )}
          {tertiaryBits.length > 0 && (
            <p className="mt-1 text-xs leading-5 text-slate-500">
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

      {/* Data points list */}
      <div className="border-t border-slate-100 px-5 pt-4 pb-5">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
          Data points
        </p>
        <ol className="mt-3 space-y-2">
          {group.claims.map((claim: any, idx: number) => {
            const isHighlighted = highlightedId === claim._id;
            const isCited = citedSet.has(claim._id);
            return (
              <li
                key={claim._id}
                id={`evidence-card-${claim._id}`}
                className={cn(
                  "flex items-start gap-3 rounded-lg py-1.5 transition-colors",
                  isHighlighted ? "-mx-2 bg-utility-brand-50 px-2" : "",
                )}
              >
                <span
                  className={cn(
                    "w-5 shrink-0 pt-0.5 text-xs font-semibold leading-7 tabular-nums",
                    isCited ? "text-utility-brand-600" : "text-slate-400",
                  )}
                  aria-hidden="true"
                >
                  {idx + 1}
                </span>
                <p
                  className={cn(
                    "flex-1 text-sm leading-7",
                    isCited ? "text-slate-900" : "text-slate-700",
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
