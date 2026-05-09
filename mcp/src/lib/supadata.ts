/**
 * Supadata client helpers for Curate Mind.
 *
 * Centralizes lazy client initialization plus shared helpers for
 * web scraping and YouTube transcript/metadata retrieval.
 */

import {
  Supadata,
  type Scrape,
  type Transcript,
  type TranscriptOrJobId,
  type YoutubeVideo,
} from "@supadata/js";

const TRANSCRIPT_POLL_INTERVAL_MS = 2_000;
const TRANSCRIPT_MAX_POLLS = 30;

export interface ScrapedUrlContent {
  content: string;
  title: string;
  description: string;
  url: string;
  ogUrl: string;
}

export interface ArticleMetadata {
  title?: string;
  author?: string;
  publisher?: string;
  publishedDate?: string;
  description?: string;
}

export interface YoutubeMetadata {
  title: string;
  authorName: string;
  thumbnailUrl: string;
  durationSeconds?: number;
  publishedDate?: string;
}

interface YoutubeOEmbedResponse {
  title: string;
  author_name: string;
  thumbnail_url: string;
}

let client: Supadata | null = null;

export function getSupadataClient(): Supadata {
  if (!client) {
    const apiKey = process.env.SUPADATA_API_KEY;
    if (!apiKey) {
      throw new Error(
        "SUPADATA_API_KEY environment variable is not set. " +
          "Set it in your Claude Desktop MCP config or in .env.local"
      );
    }

    client = new Supadata({ apiKey });
  }

  return client;
}

export async function scrapeUrl(url: string): Promise<ScrapedUrlContent> {
  const supadata = getSupadataClient();
  const result: Scrape = await supadata.web.scrape(url);

  return {
    content: result.content,
    title: result.name,
    description: result.description,
    url: result.url,
    ogUrl: result.ogUrl,
  };
}

export async function getYoutubeTranscript(
  url: string
): Promise<Transcript["content"]> {
  const supadata = getSupadataClient();
  const initialResult = await supadata.transcript({
    url,
    mode: "auto",
  });

  const transcript = await resolveTranscriptResult(initialResult);
  return transcript.content;
}

export async function getYoutubeMetadata(url: string): Promise<YoutubeMetadata> {
  const oEmbedResponse = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
  );

  if (!oEmbedResponse.ok) {
    const body = await oEmbedResponse.text();
    throw new Error(
      `YouTube oEmbed lookup failed (${oEmbedResponse.status}): ${body.slice(0, 200)}`
    );
  }

  const oEmbed = (await oEmbedResponse.json()) as YoutubeOEmbedResponse;

  let video: YoutubeVideo | null = null;
  const videoId = extractYoutubeVideoId(url);

  if (process.env.SUPADATA_API_KEY && videoId) {
    try {
      video = await getSupadataClient().youtube.video({ id: videoId });
    } catch {
      // Keep the oEmbed metadata if Supadata enrichment is unavailable.
    }
  }

  return {
    title: oEmbed.title || video?.title || "",
    authorName: oEmbed.author_name || video?.channel.name || "",
    thumbnailUrl: oEmbed.thumbnail_url || video?.thumbnail || "",
    durationSeconds: video?.duration,
    publishedDate: video?.uploadDate,
  };
}

async function resolveTranscriptResult(
  result: TranscriptOrJobId
): Promise<Transcript> {
  if (!("jobId" in result)) {
    return result;
  }

  const supadata = getSupadataClient();

  for (let attempt = 0; attempt < TRANSCRIPT_MAX_POLLS; attempt += 1) {
    const job = await supadata.transcript.getJobStatus(result.jobId);

    if (job.status === "completed") {
      if (!job.result) {
        throw new Error(
          `Supadata transcript job ${result.jobId} completed without transcript content.`
        );
      }

      return job.result;
    }

    if (job.status === "failed") {
      const errorMessage = job.error?.message ?? "Unknown transcript job failure";
      const errorDetails = job.error?.details ? ` ${job.error.details}` : "";
      throw new Error(
        `Supadata transcript job failed for ${result.jobId}: ${errorMessage}.${errorDetails}`.trim()
      );
    }

    await sleep(TRANSCRIPT_POLL_INTERVAL_MS);
  }

  throw new Error(
    `Supadata transcript job ${result.jobId} did not complete after ${
      (TRANSCRIPT_POLL_INTERVAL_MS * TRANSCRIPT_MAX_POLLS) / 1000
    } seconds.`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch a URL's raw HTML and extract article metadata (publisher, author,
 * published date) from Open Graph tags, JSON-LD, and standard meta tags.
 *
 * This is a best-effort, lightweight fetch — if the request fails for any
 * reason (network error, paywall, timeout), it returns empty metadata so
 * the caller falls back to [verify] placeholders without crashing.
 */
export async function extractArticleMetadata(url: string): Promise<ArticleMetadata> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "CurateMind/1.0 (metadata extraction)",
        "Accept": "text/html",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return {};
    }

    const html = await response.text();
    return parseHtmlMetadata(html);
  } catch {
    return {};
  }
}

/**
 * Parse article metadata from raw HTML using three priority levels:
 * 1. JSON-LD structured data (most structured, highest priority)
 * 2. Open Graph meta tags (og:site_name, article:author, etc.)
 * 3. Standard meta tags and <time> elements (fallback)
 */
export function parseHtmlMetadata(html: string): ArticleMetadata {
  const metadata: ArticleMetadata = {};

  // 1. JSON-LD — highest priority
  const jsonLdMatches = html.matchAll(
    /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  for (const match of jsonLdMatches) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const type: unknown = item["@type"];
        const articleTypes = [
          "Article", "NewsArticle", "BlogPosting",
          "ScholarlyArticle", "TechArticle", "WebPage",
        ];
        if (typeof type !== "string" || !articleTypes.includes(type)) {
          continue;
        }
        if (!metadata.title && item.headline) {
          metadata.title = String(item.headline);
        }
        if (!metadata.author) {
          metadata.author = resolveJsonLdAuthor(item.author);
        }
        if (!metadata.publisher) {
          metadata.publisher = resolveJsonLdPublisher(item.publisher);
        }
        if (!metadata.publishedDate && (item.datePublished || item.dateCreated)) {
          metadata.publishedDate = String(item.datePublished ?? item.dateCreated);
        }
        if (!metadata.description && item.description) {
          metadata.description = String(item.description);
        }
      }
    } catch {
      // Malformed JSON-LD — skip and try the next block
    }
  }

  // 2. Open Graph / article meta tags
  if (!metadata.title) {
    metadata.title =
      getMetaContent(html, 'property="og:title"') ??
      getMetaContent(html, "property='og:title'");
  }
  if (!metadata.author) {
    metadata.author =
      getMetaContent(html, 'property="article:author"') ??
      getMetaContent(html, "property='article:author'") ??
      getMetaContent(html, 'name="author"') ??
      getMetaContent(html, "name='author'");
  }
  if (!metadata.publisher) {
    metadata.publisher =
      getMetaContent(html, 'property="og:site_name"') ??
      getMetaContent(html, "property='og:site_name'");
  }
  if (!metadata.publishedDate) {
    metadata.publishedDate =
      getMetaContent(html, 'property="article:published_time"') ??
      getMetaContent(html, "property='article:published_time'") ??
      getMetaContent(html, 'name="date"') ??
      getMetaContent(html, 'name="publish_date"') ??
      getMetaContent(html, 'name="publication_date"');
  }
  if (!metadata.description) {
    metadata.description =
      getMetaContent(html, 'property="og:description"') ??
      getMetaContent(html, 'name="description"');
  }

  // 3. Fallback: <time datetime="..."> element
  if (!metadata.publishedDate) {
    const timeMatch = html.match(/<time[^>]+datetime=["']([^"']+)["'][^>]*>/i);
    if (timeMatch) {
      metadata.publishedDate = timeMatch[1];
    }
  }

  return metadata;
}

function getMetaContent(html: string, attributeMatch: string): string | undefined {
  const escaped = escapeRegex(attributeMatch);
  // Attribute order: matched-attr first, content second — and vice versa
  const pattern = new RegExp(
    `<meta\\s+[^>]*${escaped}[^>]*content=["']([^"']*?)["'][^>]*/?>` +
    `|<meta\\s+[^>]*content=["']([^"']*?)["'][^>]*${escaped}[^>]*/?>`,
    "i"
  );
  const match = html.match(pattern);
  const value = match?.[1] ?? match?.[2];
  return value?.trim() || undefined;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveJsonLdAuthor(author: unknown): string | undefined {
  if (!author) return undefined;
  if (typeof author === "string") return author;
  if (Array.isArray(author)) {
    const names = (author as unknown[])
      .map((a) => resolveJsonLdAuthor(a))
      .filter((n): n is string => Boolean(n));
    return names.length > 0 ? names.join(", ") : undefined;
  }
  if (typeof author === "object" && author !== null) {
    return (author as Record<string, unknown>).name as string | undefined;
  }
  return undefined;
}

function resolveJsonLdPublisher(publisher: unknown): string | undefined {
  if (!publisher) return undefined;
  if (typeof publisher === "string") return publisher;
  if (typeof publisher === "object" && publisher !== null) {
    return (publisher as Record<string, unknown>).name as string | undefined;
  }
  return undefined;
}

function extractYoutubeVideoId(value: string): string | null {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    if (hostname === "youtu.be") {
      return url.pathname.split("/").filter(Boolean)[0] ?? null;
    }

    if (hostname === "youtube.com" || hostname.endsWith(".youtube.com")) {
      const watchId = url.searchParams.get("v");
      if (watchId) {
        return watchId;
      }

      const pathParts = url.pathname.split("/").filter(Boolean);
      if (
        pathParts[0] === "shorts" ||
        pathParts[0] === "live" ||
        pathParts[0] === "embed"
      ) {
        return pathParts[1] ?? null;
      }
    }
  } catch {
    return null;
  }

  return null;
}
