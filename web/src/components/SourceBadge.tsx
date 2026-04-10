import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "@untitledui/icons";
import { cn } from "@/lib/cn";

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

function formatDate(value?: string | null) {
  if (!value) return null;

  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

function renderLinked({
  href,
  linkKind,
  className,
  children,
}: {
  href: string;
  linkKind: "storage" | "canonical" | "internal";
  className: string;
  children: ReactNode;
}) {
  if (linkKind === "internal") {
    return (
      <Link
        to={href}
        className={className}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </Link>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={className}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </a>
  );
}

export default function SourceBadge({
  source,
  compact = false,
}: {
  source: SourceMeta | null;
  compact?: boolean;
}) {
  if (!source) {
    return <div className="text-sm text-ink-muted">Source unavailable</div>;
  }

  const sourcePagePath = source.sourcePagePath ?? `/sources/${source._id}`;
  const href =
    source.resolvedUrl ?? source.storageUrl ?? source.canonicalUrl ?? sourcePagePath;
  const linkKind =
    source.resolvedLinkKind ??
    (source.storageUrl
      ? "storage"
      : source.canonicalUrl
        ? "canonical"
        : "internal");
  const title = source.title ?? "Untitled source";
  const date = formatDate(source.publishedDate);
  const sourceBits = [source.authorName, source.publisherName, date].filter(Boolean);
  const actionLabel =
    linkKind === "internal" ? "View source" : linkKind === "storage" ? "Open file" : "Open original";

  return (
    <div
      className={cn(
        "rounded-[1.35rem] border browser-card p-4",
        compact ? "space-y-2.5" : "space-y-3",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="meta-kicker">Source</div>
          {renderLinked({
            href,
            linkKind,
            className:
              "text-sm font-semibold leading-6 text-ink hover:text-accent md:text-[0.95rem]",
            children: title,
          })}
        </div>

        {renderLinked({
          href,
          linkKind,
          className:
            "inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-panel px-3 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-ink-soft hover:border-accent/30 hover:text-accent",
          children: (
            <>
              {actionLabel}
              <ArrowUpRight className="size-3.5" />
            </>
          ),
        })}
      </div>

      {sourceBits.length > 0 && (
        <div className="flex flex-wrap gap-x-2 gap-y-1 text-[0.82rem] leading-5 text-ink-muted">
          {sourceBits.map((bit) => (
            <span key={bit}>{bit}</span>
          ))}
        </div>
      )}

      {!compact && (source.sourceType || typeof source.tier === "number") && (
        <div className="flex flex-wrap gap-2">
          {source.sourceType && (
            <span className="count-chip rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em]">
              {source.sourceType}
            </span>
          )}
          {typeof source.tier === "number" && (
            <span className="count-chip rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em]">
              Tier {source.tier}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
