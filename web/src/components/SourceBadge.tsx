import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { TierBadge } from "./Badges";

export type SourceMeta = {
  _id: string;
  title?: string | null;
  authorName?: string | null;
  publisherName?: string | null;
  canonicalUrl?: string | null;
  publishedDate?: string | null;
  sourceType?: string | null;
  tier?: number | null;
  storageUrl?: string | null;
  resolvedUrl?: string | null;
  resolvedLinkKind?: "storage" | "canonical" | "internal" | null;
  sourcePagePath?: string | null;
};

function fmtDate(d?: string | null) {
  if (!d) return null;
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return d;
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return d;
  }
}

export default function SourceBadge({ source }: { source: SourceMeta | null }) {
  if (!source) {
    return <div className="text-xs italic text-inkMute">Source unavailable</div>;
  }
  const date = fmtDate(source.publishedDate);
  const sourcePagePath = source.sourcePagePath ?? `/sources/${source._id}`;
  const sourceHref =
    source.resolvedUrl ?? source.storageUrl ?? source.canonicalUrl ?? sourcePagePath;
  const linkKind = source.resolvedLinkKind ?? (source.canonicalUrl ? "canonical" : "internal");
  const actionLabel =
    linkKind === "storage"
      ? "Open source file ↗"
      : linkKind === "canonical"
        ? "Open original source ↗"
        : "View source record →";
  const hasLink = Boolean(sourceHref);

  const title = source.title ?? "Untitled source";

  function renderLink(content: ReactNode, className: string) {
    if (!hasLink) {
      return <span className={className}>{content}</span>;
    }

    if (linkKind === "internal") {
      return (
        <Link to={sourceHref} className={className}>
          {content}
        </Link>
      );
    }

    return (
      <a
        href={sourceHref}
        target="_blank"
        rel="noreferrer noopener"
        className={className}
      >
        {content}
      </a>
    );
  }

  return (
    <div className="border-t border-rule/70 pt-3 text-xs leading-relaxed text-inkSoft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="display text-sm font-medium text-ink">
          {renderLink(title, "link-underline hover:text-ochreDeep")}
        </div>
        {hasLink && (
          renderLink(
            actionLabel,
            "label rounded-full border border-rule px-2.5 py-1 text-inkMute transition-colors hover:border-ochre/60 hover:text-ochreDeep"
          )
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-inkMute">
        {source.authorName && <span>{source.authorName}</span>}
        {source.authorName && source.publisherName && <span>·</span>}
        {source.publisherName && <span>{source.publisherName}</span>}
        {date && (
          <>
            <span>·</span>
            <span>{date}</span>
          </>
        )}
        {source.sourceType && (
          <>
            <span>·</span>
            <span className="uppercase tracking-[0.24em]">{source.sourceType}</span>
          </>
        )}
        {typeof source.tier === "number" && (
          <>
            <span>·</span>
            <TierBadge tier={source.tier} />
          </>
        )}
      </div>
    </div>
  );
}
