import { TierBadge } from "./Badges";

export type SourceMeta = {
  _id: string;
  title?: string | null;
  authorName?: string | null;
  publisherName?: string | null;
  canonicalUrl?: string | null;
  publishedDate?: string | null;
  tier?: number | null;
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
  const sourceHref = source.canonicalUrl ?? undefined;
  const hasLink = Boolean(sourceHref);

  return (
    <div className="border-t border-rule/70 pt-3 text-xs leading-relaxed text-inkSoft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="display text-sm font-medium text-ink">
          {hasLink ? (
            <a
              href={sourceHref}
              target="_blank"
              rel="noreferrer noopener"
              className="link-underline hover:text-ochreDeep"
            >
              {source.title ?? "Untitled source"}
            </a>
          ) : (
            source.title ?? "Untitled source"
          )}
        </div>
        {hasLink && (
          <a
            href={sourceHref}
            target="_blank"
            rel="noreferrer noopener"
            className="label rounded-full border border-rule px-2.5 py-1 text-inkMute transition-colors hover:border-ochre/60 hover:text-ochreDeep"
          >
            Open source ↗
          </a>
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
