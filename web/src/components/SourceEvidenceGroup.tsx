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
  onClaimClick?: (claimId: string) => void;
};

/**
 * A single source grouped with the claims pulled from it.
 *
 * Header = source title (links to the internal source page for exploration)
 * + a short author · publisher · date line + "Open original" action.
 *
 * Body = divided list of claim sentences. Cited claims carry a subtle
 * left-edge accent and slightly darker text so the reader can still see at
 * a glance which claims the assistant actually used — without resorting to
 * badges. The claim currently highlighted (via a citation chip click) gets
 * a soft brand wash as transient feedback.
 */
export default function SourceEvidenceGroup({
  group,
  highlightedId,
  citedIds,
  onClaimClick,
}: Props) {
  const source = group.source;
  const title = source?.title ?? "Untitled source";
  const metaLine = [
    formatAuthorsShort(source?.authorName ?? null),
    source?.publisherName ?? null,
    source?.publishedDate ? formatDateLabel(source.publishedDate) : null,
  ]
    .filter(Boolean)
    .join(" \u00b7 ");

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
      <header className="flex items-start justify-between gap-3 px-5 py-4">
        <div className="min-w-0 flex-1">
          {internalHref ? (
            <Link
              to={internalHref}
              className="block text-base font-semibold leading-6 text-slate-900 hover:text-utility-brand-700"
            >
              {title}
            </Link>
          ) : (
            <p className="text-base font-semibold leading-6 text-slate-900">{title}</p>
          )}
          {metaLine && (
            <p className="mt-1 text-xs leading-5 text-slate-500">{metaLine}</p>
          )}
        </div>

        {externalHref && (
          <Button
            size="sm"
            color="tertiary"
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

      {/* Claims list */}
      <ul className="divide-y divide-slate-100 border-t border-slate-100">
        {group.claims.map((claim: any) => {
          const isHighlighted = highlightedId === claim._id;
          const isCited = citedSet.has(claim._id);
          return (
            <li
              key={claim._id}
              id={`evidence-card-${claim._id}`}
              onClick={onClaimClick ? () => onClaimClick(claim._id) : undefined}
              className={cn(
                "relative px-5 py-4 transition-colors",
                onClaimClick && "cursor-pointer",
                isHighlighted && "bg-utility-brand-50",
                !isHighlighted && onClaimClick && "hover:bg-slate-50",
              )}
            >
              {isCited && (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-3 left-0 w-0.5 rounded-r bg-utility-brand-500"
                />
              )}
              <p
                className={cn(
                  "text-sm leading-7",
                  isCited ? "text-slate-900" : "text-slate-700",
                )}
              >
                {claim.claimText}
              </p>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
