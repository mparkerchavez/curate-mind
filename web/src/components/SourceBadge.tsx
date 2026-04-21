import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Badge } from "@/components/base/badges/badges";
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
  className?: string;
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
    return <p className="text-sm text-quaternary">Source unavailable</p>;
  }

  const sourcePagePath = source.sourcePagePath ?? `/sources/${source._id}`;
  const href =
    source.resolvedUrl ?? source.storageUrl ?? source.canonicalUrl ?? sourcePagePath;
  const linkKind =
    source.resolvedLinkKind ??
    (source.storageUrl ? "storage" : source.canonicalUrl ? "canonical" : "internal");
  const title = source.title ?? "Untitled source";
  const date = formatDate(source.publishedDate);
  const sourceBits = [source.authorName, source.publisherName, date].filter(Boolean);
  const actionLabel =
    linkKind === "internal"
      ? "View source"
      : linkKind === "storage"
        ? "Open file"
        : "Open original";

  if (compact) {
    return (
      <div className="rounded-2xl border border-secondary bg-secondary_subtle p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
              Source
            </p>
            {renderLinked({
              href,
              linkKind,
              className:
                "mt-1 block text-sm font-semibold leading-6 text-primary hover:text-brand-secondary",
              children: title,
            })}
          </div>

          <Button
            size="xs"
            color="secondary"
            iconTrailing={ArrowUpRight}
            className="shrink-0"
            {...(linkKind === "internal"
              ? {}
              : {
                  href,
                  target: "_blank",
                  rel: "noreferrer noopener",
                })}
          >
            {actionLabel}
          </Button>
        </div>

        {sourceBits.length > 0 && (
          <p className="mt-2 text-sm leading-6 text-tertiary">{sourceBits.join(" · ")}</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-secondary bg-primary p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
            Source
          </p>
          {renderLinked({
            href,
            linkKind,
            className:
              "mt-1 block text-base font-semibold leading-7 text-primary hover:text-brand-secondary",
            children: title,
          })}

          {sourceBits.length > 0 && (
            <p className="mt-2 text-sm leading-6 text-tertiary">
              {sourceBits.join(" · ")}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {source.sourceType ? (
            <Badge type="color" size="sm" color="gray">
              {source.sourceType}
            </Badge>
          ) : null}
          {typeof source.tier === "number" ? (
            <Badge type="color" size="sm" color="gray">
              Tier {source.tier}
            </Badge>
          ) : null}

          {linkKind === "internal" ? (
            <Link to={href} className="inline-flex">
              <Button size="sm" color="secondary" iconTrailing={ArrowUpRight}>
                {actionLabel}
              </Button>
            </Link>
          ) : (
            <Button
              size="sm"
              color="secondary"
              iconTrailing={ArrowUpRight}
              href={href}
              target="_blank"
              rel="noreferrer noopener"
            >
              {actionLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
