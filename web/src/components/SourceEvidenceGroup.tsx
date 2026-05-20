import { Link } from "react-router-dom";
import { ArrowUpRight } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { cn } from "@/lib/cn";
import { getEvidenceCardId } from "@/lib/linked-evidence";
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
  /** Optional allow-list for rows that have a matching inline claim on the left. */
  clickableIds?: Set<string>;
  /**
   * When true, rows render in a subdued "Also attached" style: no click-to-scroll
   * affordance, muted claim text, smaller marker. Used for evidence that is
   * attached to the position but not referenced inline in the stance.
   */
  dimmed?: boolean;
};

/**
 * Build a text-fragment URL that jumps to the quoted passage when the
 * browser and source page support it.
 */
function buildTextFragmentUrl(baseUrl: string, anchorQuote?: string | null): string {
  if (!anchorQuote) return baseUrl;
  const cleaned = anchorQuote
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return baseUrl;

  try {
    const url = new URL(baseUrl);
    const currentHash = url.hash.replace(/^#/, "");
    const [elementFragment] = currentHash.split(":~:");
    const textDirective = `:~:text=${encodeURIComponent(cleaned)}`;
    url.hash = elementFragment ? `${elementFragment}${textDirective}` : textDirective;
    return url.toString();
  } catch {
    const [urlWithoutHash, hash = ""] = baseUrl.split("#");
    const [elementFragment] = hash.split(":~:");
    const fragment = elementFragment
      ? `${elementFragment}:~:text=${encodeURIComponent(cleaned)}`
      : `:~:text=${encodeURIComponent(cleaned)}`;
    return `${urlWithoutHash}#${fragment}`;
  }
}

function looksLikePdfUrl(url?: string | null): boolean {
  if (!url) return false;
  try {
    return new URL(url).pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return url.split(/[?#]/)[0]?.toLowerCase().endsWith(".pdf") ?? false;
  }
}

export default function SourceEvidenceGroup({
  group,
  highlightedId,
  citedIds,
  labelByDpId,
  onClaimClick,
  clickableIds,
  dimmed = false,
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
  const citedSet = new Set(citedIds ?? []);

  // Find the highlighted claim in THIS group (if any)
  const highlightedClaim = highlightedId
    ? group.claims.find((c: any) => c._id === highlightedId)
    : null;
  const highlightedAnchor = highlightedClaim?.anchorQuote?.trim() || null;
  const canonicalHref = source?.canonicalUrl ?? null;
  const storedHref = source?.storageUrl ?? null;
  const resolvedExternalHref =
    source?.resolvedLinkKind === "internal" ? null : (source?.resolvedUrl ?? null);
  const canTextFragmentCanonical = Boolean(
    highlightedAnchor && canonicalHref && !looksLikePdfUrl(canonicalHref),
  );

  // Build the "Open original" URL — deep-links to the highlighted claim's
  // anchor quote when one is selected. Prefer the canonical page for text
  // fragments because Convex storage links often point to uploaded files,
  // where browser text fragments usually cannot scroll to a passage.
  const externalHref = canTextFragmentCanonical
    ? buildTextFragmentUrl(canonicalHref, highlightedAnchor)
    : (resolvedExternalHref ?? storedHref ?? canonicalHref);
  const externalKind: "storage" | "canonical" | null =
    externalHref && externalHref === storedHref
      ? "storage"
      : externalHref && externalHref === canonicalHref
        ? "canonical"
        : source?.resolvedLinkKind === "storage" || source?.resolvedLinkKind === "canonical"
          ? source.resolvedLinkKind
          : null;

  // Button label changes when targeting a specific claim
  const externalLabel = canTextFragmentCanonical
    ? "Open at source"
    : externalKind === "storage"
      ? "Open file"
      : "Open original";

  return (
    <section className="border-t border-secondary pt-7 first:border-t-0 first:pt-0">
      {/* Source header — no card wrapper, flows with the panel's padding.
          Title + author get full column width; "Open original" sits on its
          own line below so the name isn't squeezed by a side-by-side button. */}
      <header>
        <p className="text-lg font-semibold leading-6 tracking-[-0.01em] text-primary">
          {primary}
        </p>
        {secondary && (
          internalHref ? (
            <Link
              to={internalHref}
              className="mt-1.5 block text-sm leading-5 text-secondary hover:text-primary"
            >
              {secondary}
            </Link>
          ) : (
            <p className="mt-1.5 text-sm leading-5 text-secondary">{secondary}</p>
          )
        )}
        {tertiaryBits.length > 0 && (
          <p className="mt-1.5 text-xs leading-5 text-tertiary">
            {tertiaryBits.join(" \u00b7 ")}
          </p>
        )}

        {externalHref && (
          <div className="mt-3">
            <Button
              size="sm"
              color="link-color"
              iconTrailing={ArrowUpRight}
              href={externalHref}
              target="_blank"
              rel="noreferrer noopener"
            >
              {externalLabel}
            </Button>
          </div>
        )}
      </header>

      {/* Data points — numbered list, clickable rows */}
      <div className="mt-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-quaternary">
          Data points
        </p>
        <ol className="mt-3 space-y-2">
          {group.claims.map((claim: any, idx: number) => {
            const isHighlighted = highlightedId === claim._id;
            const isCited = citedSet.has(claim._id);
            const isClickable =
              !!onClaimClick &&
              !dimmed &&
              (!clickableIds || clickableIds.has(claim._id));
            const label = labelByDpId?.[claim._id];
            const isCounter = label?.startsWith("C") ?? false;
            const markerText = label ?? String(idx + 1);
            return (
              <li
                key={claim._id}
                id={getEvidenceCardId(claim._id)}
                className={cn(
                  "flex items-baseline gap-4 rounded-lg py-1.5 transition-colors",
                  isHighlighted ? (isCounter ? "-mx-2 bg-warning-primary px-2" : "-mx-2 bg-success-primary px-2") : "",
                  isClickable && !isHighlighted
                    ? cn(
                        "cursor-pointer -mx-2 px-2",
                        isCounter ? "hover:bg-warning-primary_hover" : "hover:bg-success-primary_hover",
                      )
                    : "",
                )}
                onClick={isClickable ? () => onClaimClick(claim._id) : undefined}
              >
                <span
                  className={cn(
                    "shrink-0 text-sm font-semibold tabular-nums tracking-[0.02em]",
                    label ? "w-7" : "w-5",
                    dimmed
                      ? "text-quaternary"
                      : isCounter
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
                    dimmed ? "text-tertiary" : isCited ? "text-primary" : "text-secondary",
                  )}
                >
                  {claim.claimText}
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
