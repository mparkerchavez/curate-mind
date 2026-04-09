/**
 * Shared source metadata parsing and URL normalization helpers.
 *
 * Intake and repair tooling both rely on these utilities so new ingestion
 * and historical backfills interpret source headers the same way.
 */

export type SourceType =
  | "article"
  | "report"
  | "podcast"
  | "video"
  | "whitepaper"
  | "book"
  | "newsletter"
  | "social"
  | "other";

export type ParsedSourceMetadata = {
  title?: string;
  authorName?: string;
  publisherName?: string;
  canonicalUrl?: string;
  publishedDate?: string;
  sourceType?: SourceType;
};

const METADATA_HEADER_LINE_LIMIT = 20;

export function parseSourceMetadataHeader(content: string): ParsedSourceMetadata {
  const lines = content.split("\n").slice(0, METADATA_HEADER_LINE_LIMIT);
  const metadataLineIndex = lines.findIndex((line) =>
    /^##\s+Metadata\s*$/i.test(line.trim())
  );
  if (metadataLineIndex === -1) {
    return {};
  }

  const parsed: ParsedSourceMetadata = {};
  const titleLine = lines.find((line) => /^#\s+.+/.test(line.trim()));
  const parsedTitle = titleLine
    ? cleanMetadataValue(titleLine.replace(/^#\s+/, ""))
    : undefined;
  if (parsedTitle) {
    parsed.title = parsedTitle;
  }

  for (const rawLine of lines.slice(metadataLineIndex + 1)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (line === "---" || /^#{1,6}\s+/.test(line)) {
      break;
    }

    const match = line.match(/^(?:\*\s+)?\*\*(.+?):\*\*\s*(.+)\s*$/);
    if (!match) {
      continue;
    }

    const key = match[1].trim().toLowerCase();
    const cleanedValue = cleanMetadataValue(match[2]);
    if (!cleanedValue) {
      continue;
    }

    if (key === "publisher" || key === "channel") {
      parsed.publisherName = cleanedValue;
      continue;
    }

    if (key === "author") {
      parsed.authorName = cleanedValue;
      continue;
    }

    if (key === "published") {
      parsed.publishedDate = cleanedValue;
      continue;
    }

    if (key === "type") {
      const sourceType = mapMetadataTypeToSourceType(cleanedValue);
      if (sourceType) {
        parsed.sourceType = sourceType;
      }
      continue;
    }

    if (key === "url") {
      parsed.canonicalUrl = normalizeSourceUrl(cleanedValue);
    }
  }

  return parsed;
}

export function cleanMetadataValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || /^\[verify\b/i.test(trimmed)) {
    return undefined;
  }

  return trimmed;
}

export function normalizeSourceUrl(value: string | undefined): string | undefined {
  const cleaned = cleanMetadataValue(value);
  if (!cleaned) {
    return undefined;
  }

  const markdownLink = cleaned.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  const candidates = markdownLink
    ? [markdownLink[2], markdownLink[1]]
    : [cleaned];

  for (const candidate of candidates) {
    const normalized = normalizeUrlCandidate(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

function normalizeUrlCandidate(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  try {
    const parsed = new URL(trimmed);

    if (
      parsed.hostname.toLowerCase() === "www.google.com" &&
      parsed.pathname === "/search"
    ) {
      return normalizeUrlCandidate(parsed.searchParams.get("q") ?? "");
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }

    return parsed.toString();
  } catch {
    return undefined;
  }
}

export function mapMetadataTypeToSourceType(
  value: string
): SourceType | undefined {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const mappings: Record<string, SourceType> = {
    article: "article",
    "blog post": "article",
    blog: "article",
    documentation: "article",
    guide: "article",
    report: "report",
    "research report": "report",
    "research paper": "report",
    research: "report",
    podcast: "podcast",
    "podcast episode": "podcast",
    video: "video",
    "youtube video": "video",
    webinar: "video",
    "webinar transcript": "video",
    whitepaper: "whitepaper",
    "white paper": "whitepaper",
    book: "book",
    newsletter: "newsletter",
    "social media": "social",
    social: "social",
    "social post": "social",
    other: "other",
  };

  return mappings[normalized];
}
