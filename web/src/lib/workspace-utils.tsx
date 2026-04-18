import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/* ── Shared types ── */

export type RouteKind = "home" | "theme" | "position" | "source" | "ask";

export type ChatCitation = {
  label: string;
  dataPointId: string;
  order: number;
  isCited: boolean;
};

export type AssistantAnswer = {
  question: string;
  answer: string;
  citations: ChatCitation[];
  citedDataPointIds: string[];
  retrievedDataPoints: any[];
  scopeLabel: string;
};

export type Turn =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; answerState: AssistantAnswer };

export type EvidenceSection = {
  key: string;
  title: string;
  subtitle: string;
  items: any[];
  variant?: "support" | "counter";
  cited?: boolean;
};

export type SourceGroupSource = {
  _id: string;
  title?: string | null;
  authorName?: string | null;
  publisherName?: string | null;
  publishedDate?: string | null;
  sourceType?: string | null;
  canonicalUrl?: string | null;
  storageUrl?: string | null;
  resolvedUrl?: string | null;
  resolvedLinkKind?: "storage" | "canonical" | "internal" | null;
  sourcePagePath?: string | null;
};

export type SourceGroup = {
  key: string;
  source: SourceGroupSource | null;
  claims: any[];
};

export const USER_TURN_LIMIT = 4;

/* ── Pure utilities ── */

export function comparePositionsByFreshness(left: any, right: any) {
  const leftTime = left.currentVersion?.versionDate ? Date.parse(left.currentVersion.versionDate) : 0;
  const rightTime = right.currentVersion?.versionDate ? Date.parse(right.currentVersion.versionDate) : 0;
  if (rightTime !== leftTime) return rightTime - leftTime;
  return String(left.title ?? "").localeCompare(String(right.title ?? ""));
}

export function getThemePosture(themePositions: any[]) {
  const statusCounts = new Map<string, number>();
  const confidenceCounts = new Map<string, number>();
  let latestVersionDate: string | null = null;

  for (const position of themePositions) {
    const status = position.currentVersion?.status;
    if (status) statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    const confidence = position.currentVersion?.confidenceLevel;
    if (confidence) confidenceCounts.set(confidence, (confidenceCounts.get(confidence) ?? 0) + 1);
    const versionDate = position.currentVersion?.versionDate;
    if (versionDate && (!latestVersionDate || Date.parse(versionDate) > Date.parse(latestVersionDate)))
      latestVersionDate = versionDate;
  }

  const statusSummary = summarizeCounts(statusCounts, ["active", "emerging", "established", "evolved", "retired"]) ?? "no status signals yet";
  const confidenceSummary = summarizeCounts(confidenceCounts, ["established", "active", "emerging"]) ?? "not yet classified";

  return {
    statusSummary,
    confidenceSummary,
    latestFreshness: latestVersionDate ? formatDateLabel(latestVersionDate) : "No dated movement yet",
    cards: [
      { label: "Current mix", value: statusSummary, description: "How mature or in-motion the positions inside this theme are." },
      { label: "Confidence", value: confidenceSummary, description: "Whether the theme is still emerging, actively forming, or already established." },
      { label: "Freshest update", value: latestVersionDate ? formatDateLabel(latestVersionDate) : "No version dates yet", description: "Which positions are most likely to reward immediate review." },
    ],
  };
}

function summarizeCounts(counts: Map<string, number>, priorityOrder: string[]) {
  const entries = priorityOrder.map((key) => [key, counts.get(key) ?? 0] as const).filter(([, c]) => c > 0);
  if (!entries.length) return null;
  return entries.map(([label, count]) => `${count} ${label}`).join(" \u00b7 ");
}

export function formatDateLabel(dateString: string) {
  const parsed = Date.parse(dateString);
  if (Number.isNaN(parsed)) return dateString;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(parsed));
}

export function summarizeText(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  const shortened = text.slice(0, maxLength);
  const lastSpace = shortened.lastIndexOf(" ");
  return `${shortened.slice(0, lastSpace > 0 ? lastSpace : maxLength).trimEnd()}...`;
}

/**
 * Shorten an author string for display. Handles comma-separated author
 * lists ("Sam Ransbotham, David Kiron, ...") → "Sam Ransbotham et al."
 * Single authors/organizations pass through unchanged.
 */
export function formatAuthorsShort(authorName?: string | null): string | null {
  if (!authorName) return null;
  const trimmed = authorName.trim();
  if (!trimmed) return null;
  const parts = trimmed
    .split(/,\s*|\s*&\s*|\s+and\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length <= 1) return trimmed;
  return `${parts[0]} et al.`;
}

/**
 * Normalize the flattened source-* fields on a data point back into a
 * SourceGroupSource, falling back to `dp.source` when present.
 */
function resolveSourceFromDp(dp: any): SourceGroupSource | null {
  if (dp.source) return dp.source as SourceGroupSource;
  if (!dp.sourceTitle) return null;
  return {
    _id: dp.sourceId ?? dp.source?._id ?? "unknown",
    title: dp.sourceTitle ?? null,
    authorName: dp.sourceAuthorName ?? null,
    publisherName: dp.sourcePublisherName ?? null,
    publishedDate: dp.sourcePublishedDate ?? null,
    sourceType: dp.sourceType ?? null,
    canonicalUrl: dp.sourceCanonicalUrl ?? null,
    storageUrl: dp.sourceStorageUrl ?? null,
    resolvedUrl: dp.sourceResolvedUrl ?? null,
    resolvedLinkKind: dp.sourceResolvedLinkKind ?? null,
    sourcePagePath: dp.sourcePagePath ?? null,
  };
}

/**
 * Group data points by their underlying source, preserving the original
 * order of first appearance. Lets UI show "source → list of claims"
 * instead of repeating the source metadata on every claim card.
 */
export function groupDataPointsBySource(dataPoints: any[]): SourceGroup[] {
  const groups = new Map<string, SourceGroup>();
  for (const dp of dataPoints) {
    const source = resolveSourceFromDp(dp);
    const key =
      source && source._id && source._id !== "unknown"
        ? source._id
        : (source?.title ?? `orphan-${dp._id}`);
    if (!groups.has(key)) {
      groups.set(key, { key, source, claims: [] });
    }
    groups.get(key)!.claims.push(dp);
  }
  return Array.from(groups.values());
}

export function getRouteKind(pathname: string): RouteKind {
  if (pathname.startsWith("/themes/")) return "theme";
  if (pathname.startsWith("/positions/")) return "position";
  if (pathname.startsWith("/sources/")) return "source";
  if (pathname === "/ask") return "ask";
  return "home";
}

export function getScopeLabel({ activeTheme, positionDetail, sourceDetail }: { activeTheme: any; positionDetail: any; sourceDetail: any }) {
  if (sourceDetail) return `Source \u00b7 ${sourceDetail.source.title}`;
  if (positionDetail) return `Position \u00b7 ${positionDetail.title}`;
  if (activeTheme) return `Theme \u00b7 ${activeTheme.title}`;
  return "Full corpus";
}

export function getSuggestions(routeKind: RouteKind) {
  if (routeKind === "source") return ["What are the highest-signal claims in this source?", "Where is this source most cautious or uncertain?", "How does this source change the larger research position?"];
  if (routeKind === "position") return ["What is the strongest supporting evidence for this position?", "What counter-evidence weakens this stance?", "What would change confidence in this position?"];
  if (routeKind === "theme") return ["What are the main tensions inside this theme?", "Which positions here are most evidence-rich?", "What questions remain unresolved in this theme?"];
  return ["What patterns predict successful enterprise AI adoption?", "Where does the corpus disagree most strongly?", "What is emerging about agentic workflows?", "How does the specification bottleneck constrain AI value capture?"];
}

/* ── Rich text rendering (JSX) ── */

export function renderAnswerBlocks(text: string, citationMap: Map<string, string>, onCitationClick: (dpId: string) => void): ReactNode[] {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const cur = lines[i].trim();
    if (!cur) { i++; continue; }

    if (/^(-{3,}|\*{3,})$/.test(cur)) { blocks.push(<hr key={`r-${i}`} className="border-t border-slate-200" />); i++; continue; }

    const hm = cur.match(/^(#{1,3})\s+(.*)$/);
    if (hm) {
      const content = renderInline(hm[2], citationMap, onCitationClick);
      if (hm[1].length === 1) blocks.push(<h1 key={`h-${i}`} className="text-display-xs font-semibold tracking-[-0.02em] text-slate-950">{content}</h1>);
      else if (hm[1].length === 2) blocks.push(<h2 key={`h-${i}`} className="text-2xl font-semibold tracking-[-0.02em] text-slate-950">{content}</h2>);
      else blocks.push(<h3 key={`h-${i}`} className="text-xl font-semibold text-slate-950">{content}</h3>);
      i++; continue;
    }

    if (cur.startsWith("> ")) {
      const ql: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("> ")) { ql.push(lines[i].trim().replace(/^>\s?/, "")); i++; }
      blocks.push(<blockquote key={`q-${i}`} className="rounded-2xl border border-utility-brand-200 bg-utility-brand-50 px-4 py-3 text-sm leading-7 text-slate-700">{renderInline(ql.join(" "), citationMap, onCitationClick)}</blockquote>);
      continue;
    }

    if (/^[-*]\s+/.test(cur)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^[-*]\s+/, "")); i++; }
      blocks.push(<ul key={`ul-${i}`} className="space-y-3">{items.map((it, j) => <li key={j} className="flex items-start gap-3"><span className="mt-3 size-1.5 rounded-full bg-utility-brand-500" /><span>{renderInline(it, citationMap, onCitationClick)}</span></li>)}</ul>);
      continue;
    }

    if (/^\d+\.\s+/.test(cur)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^\d+\.\s+/, "")); i++; }
      blocks.push(<ol key={`ol-${i}`} className="list-decimal space-y-3 pl-5">{items.map((it, j) => <li key={j}>{renderInline(it, citationMap, onCitationClick)}</li>)}</ol>);
      continue;
    }

    const pl: string[] = [];
    while (i < lines.length) {
      const c = lines[i].trim();
      if (!c || /^(-{3,}|\*{3,})$/.test(c) || /^#{1,3}\s/.test(c) || /^>\s/.test(c) || /^[-*]\s+/.test(c) || /^\d+\.\s+/.test(c)) break;
      pl.push(c); i++;
    }
    blocks.push(<p key={`p-${i}`} className="text-base leading-8 text-slate-700">{renderInline(pl.join(" "), citationMap, onCitationClick)}</p>);
  }
  return blocks;
}

export type CitationVariant = "pill" | "superscript";

export function renderInline(
  text: string,
  citationMap: Map<string, string>,
  onCitationClick: (dpId: string) => void,
  options?: { variant?: CitationVariant },
): ReactNode {
  const variant = options?.variant ?? "pill";
  return <>{text.split(/(\[E\d+\]|\[C\d+\]|\*\*[^*]+\*\*|`[^`]+`)/g).map((part, idx) => {
    if (!part) return null;

    // Citation token — [E1], [C1], etc.
    const citationMatch = part.match(/^\[(E|C)(\d+)\]$/);
    if (citationMatch) {
      const label = part.replace(/[\[\]]/g, ""); // "E1", "C2", etc.
      const dpId = citationMap.get(label);
      const number = citationMatch[2];
      const isCounter = citationMatch[1] === "C";

      if (!dpId) {
        // Broken marker — token exists but no matching evidence
        return variant === "superscript"
          ? <sup key={`c-${idx}`} className="ml-0.5 text-[0.65em] italic text-slate-400">{number}</sup>
          : <span key={`c-${idx}`} className="text-slate-400">{part}</span>;
      }

      if (variant === "superscript") {
        return (
          <sup key={`c-${idx}`} className="ml-0.5">
            <button
              type="button"
              onClick={() => onCitationClick(dpId)}
              className={cn(
                "inline-flex min-w-[1.25rem] items-center justify-center rounded px-1 text-[0.65em] font-semibold tabular-nums transition hover:underline",
                isCounter
                  ? "text-amber-600 hover:text-amber-800"
                  : "text-utility-brand-600 hover:text-utility-brand-800",
              )}
            >
              {number}
            </button>
          </sup>
        );
      }

      // Pill variant (chat answers)
      return (
        <button
          key={`c-${idx}`}
          type="button"
          className={cn(
            "mx-1 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold transition",
            isCounter
              ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
              : "border-utility-brand-200 bg-utility-brand-50 text-utility-brand-700 hover:bg-utility-brand-100",
          )}
          onClick={() => onCitationClick(dpId)}
        >
          {part}
        </button>
      );
    }

    if (part.startsWith("**") && part.endsWith("**")) return <strong key={`b-${idx}`} className="font-semibold text-slate-950">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={`cd-${idx}`} className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[0.95em] text-slate-900">{part.slice(1, -1)}</code>;
    return <span key={`t-${idx}`}>{part}</span>;
  })}</>;
}
