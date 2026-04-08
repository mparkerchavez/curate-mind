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
