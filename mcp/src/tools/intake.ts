/**
 * Intake tools for Curate Mind MCP.
 *
 * These tools handle getting content into the system:
 * - cm_fetch_url: Fetch a URL via Supadata, save markdown locally for review
 * - cm_fetch_youtube: Fetch a YouTube transcript, save markdown locally for review
 * - cm_add_source: Push verified content to Convex
 * - cm_add_curator_observation: Create a curator observation
 * - cm_add_mental_model: Create a mental model
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createHash } from "crypto";
import { execFile } from "child_process";
import { readFile, writeFile, mkdir, stat } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import type { TranscriptChunk } from "@supadata/js";
import { fileURLToPath } from "url";
import { promisify } from "util";
import { api, asId, convexMutation } from "../lib/convex-client.js";
import {
  scrapeUrl,
  extractArticleMetadata,
  getYoutubeTranscript,
  getYoutubeMetadata,
} from "../lib/supadata.js";
import {
  getDisallowedArchivePathReason,
  getWeekFolderPath,
  sanitizeFilename,
} from "../lib/utils.js";
import {
  normalizeSourceUrl,
  parseSourceMetadataHeader,
  type ParsedSourceMetadata,
  type SourceType,
} from "../lib/sourceMetadata.js";

type InsertSourceResult = typeof api.sources.insertSource["_returnType"];
type TranscriptParagraph = {
  startOffset: number;
  text: string;
};

type PdfExtractionMetadata = {
  title?: string;
  author?: string;
  requestedMethod?: string;
  extractionMethod?: string;
  quality?: "high" | "medium" | "low";
  qualityScore?: number | string;
  reviewRecommended?: boolean | "yes" | "no";
  reviewSummary?: string;
  reviewFocus?: string;
  cleanupApplied?: string;
  candidateScores?: string;
  visualHeaviness?: number | string;
  extractionFailed?: boolean | "yes" | "no";
  recommendation?: string;
};

const SCRAPE_FAILURE_WORD_THRESHOLD = 100;
const TRANSCRIPT_CHUNKS_PER_PARAGRAPH = 5;
const TRANSCRIPT_MIN_CHUNKS_BEFORE_BREAK = 3;
const TRANSCRIPT_PARAGRAPH_GAP_SECONDS = 6;
const PDF_EXTRACTION_TIMEOUT_MS = 270_000;
const PDF_EXTRACTION_MAX_BUFFER_BYTES = 10 * 1024 * 1024;
const REVIEW_STATUS_FILENAME = "review-status.json";

// Structural headings and phrases that reliably mark the end of article body
// content. Matched against trimmed lines only. Add new patterns here as you
// encounter them from additional sites — do NOT add anything that could
// plausibly appear as a section heading inside a real article.
const ARTICLE_END_SIGNALS = [
  /^## related/i,       // "Related Essays", "Related Articles", "Related Posts"
  /^## comments$/i,
  /^## responses$/i,
  /^create a free account to continue reading/i,
];
const reviewStatusSchema = z.object({
  ingested: z.array(
    z.object({
      file: z.string(),
      sourceId: z.string(),
      ingestedDate: z.string(),
    })
  ).default([]),
});
const execFileAsync = promisify(execFile);

export function registerIntakeTools(server: McpServer): void {
  // ============================================================
  // cm_fetch_url — Fetch a URL via Supadata, save locally for review
  // Per Design Decision 16: does NOT push to Convex
  // ============================================================
  server.registerTool(
    "cm_fetch_url",
    {
      title: "Fetch URL for Review",
      description:
        "Fetch a public URL through Supadata and save the markdown content locally " +
        "to the sources/ folder for review and cleanup. This does NOT add the " +
        "source to Convex. After reviewing the saved file, use cm_add_source " +
        'with reviewed=true to push it to the database.\n\n' +
        "Args:\n" +
        "  - url (string): The public URL to fetch\n" +
        "  - title (string): Source title (used for the filename)\n\n" +
        "Returns: The local file path where the markdown was saved.",
      inputSchema: {
        url: z.string().url().describe("The public URL to fetch"),
        title: z.string().min(1).describe("Source title (used for filename)"),
        author: z.string().optional().describe("Override author name (skips extraction)"),
        publisher: z.string().optional().describe("Override publisher name (skips extraction)"),
        publishedDate: z.string().optional().describe("Override published date in YYYY-MM-DD format (skips extraction)"),
        sourceType: z.enum([
          "article", "report", "podcast", "video",
          "whitepaper", "book", "newsletter", "social", "other",
        ]).optional().default("article").describe("Type of source (default: article)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ url, title, author: authorOverride, publisher: publisherOverride, publishedDate: publishedDateOverride, sourceType }) => {
      try {
        const curateMindPath = process.env.CURATE_MIND_PATH;
        if (!curateMindPath) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: CURATE_MIND_PATH environment variable is not set. " +
                  "This should point to your curate-mind folder.",
              },
            ],
          };
        }

        const capturedAt = new Date();

        // Fetch content via Supadata and metadata via direct HTML fetch, concurrently.
        // If the metadata fetch fails for any reason (paywall, network error, etc.)
        // extractArticleMetadata returns {} so we gracefully fall back to [verify].
        const [scraped, articleMeta] = await Promise.all([
          scrapeUrl(url),
          extractArticleMetadata(url),
        ]);

        // Caller overrides win; extracted values are the next fallback; [verify] is last resort.
        const resolvedTitle = articleMeta.title?.trim() || scraped.title.trim() || title;
        const publisher = publisherOverride?.trim() || articleMeta.publisher?.trim() || "[verify]";
        const author = authorOverride?.trim() || articleMeta.author?.trim() || "[verify]";
        const published = publishedDateOverride?.trim()
          || (articleMeta.publishedDate ? formatPublishedDate(articleMeta.publishedDate) : "[verify]");
        const type = sourceType ?? "article";

        const bodyContent = trimArticleContent(scraped.content);
        const bodyWordCount = countWords(bodyContent);
        const scrapeLikelyFailed = bodyWordCount < SCRAPE_FAILURE_WORD_THRESHOLD;

        const markdown =
          `# ${resolvedTitle}\n\n` +
          "## Metadata\n" +
          `* **Publisher:** ${publisher}\n` +
          `* **Author:** ${author}\n` +
          `* **Published:** ${published}\n` +
          `* **Type:** ${type.charAt(0).toUpperCase() + type.slice(1)}\n` +
          `* **URL:** ${url}\n` +
          `* **Captured:** ${formatDateForMetadata(capturedAt)}\n\n` +
          "---\n\n" +
          bodyContent;

        // Determine the week folder
        const weekFolder = getWeekFolderPath(curateMindPath, capturedAt);
        if (!existsSync(weekFolder)) {
          await mkdir(weekFolder, { recursive: true });
        }

        // Use the publisher name as the source label when we have it — more readable than a domain slug.
        const sourceLabel = publisher !== "[verify]" ? publisher : getUrlSourceLabel(url);
        const baseFilename = buildSourceMarkdownFilename({
          sourceLabel,
          title: resolvedTitle,
          capturedAt,
        });
        const filename = scrapeLikelyFailed
          ? `FAILED-${baseFilename}.md`
          : `${baseFilename}.md`;
        const filePath = `${weekFolder}/${filename}`;
        await writeFile(filePath, markdown, "utf-8");

        if (scrapeLikelyFailed) {
          return {
            content: [
              {
                type: "text" as const,
                text:
                  `Warning: scrape returned only ${bodyWordCount} words — likely a blocked or failed page.\n\n` +
                  `Saved for inspection: ${filePath}\n` +
                  `URL: ${url}\n\n` +
                  `The site may be blocking scrapers (common with X/Twitter, paywalled sites, ` +
                  `or pages that require JavaScript to load content).\n\n` +
                  `Options:\n` +
                  `  1. Paste the content manually: use cm_add_source with the text="..." parameter\n` +
                  `  2. Skip this source\n` +
                  `  3. Delete the FAILED- file from the sources folder`,
              },
            ],
          };
        }

        const wordCount = countWords(markdown);

        const metaReport = [
          publisher !== "[verify]" ? `Publisher: ${publisher}` : "Publisher: [not found]",
          author !== "[verify]" ? `Author: ${author}` : "Author: [not found]",
          published !== "[verify]" ? `Published: ${published}` : "Published: [not found]",
        ].join("\n");

        return {
          content: [
            {
              type: "text" as const,
              text:
                `Fetched and saved to: ${filePath}\n\n` +
                `Word count: ${wordCount}\n` +
                `URL: ${url}\n\n` +
                `Metadata extracted:\n${metaReport}\n\n` +
                `Next step: Review and clean up the file, then use cm_add_source ` +
                `with filePath="${filePath}" and reviewed=true to push it to Convex.`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching URL: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ============================================================
  // cm_fetch_youtube — Fetch a YouTube transcript via Supadata, save locally
  // Per Design Decision 16: does NOT push to Convex
  // ============================================================
  server.registerTool(
    "cm_fetch_youtube",
    {
      title: "Fetch YouTube Transcript",
      description:
        "Fetch a YouTube transcript through Supadata and save it locally " +
        "to the sources/ folder for review and cleanup. This does NOT add the " +
        "source to Convex. After reviewing the saved file, use cm_add_source " +
        'with reviewed=true to push it to the database.\n\n' +
        "Args:\n" +
        "  - url (string): YouTube video URL\n" +
        "  - title (string, optional): Override title (uses video title if omitted)\n\n" +
        "Returns: The local file path where the markdown transcript was saved.",
      inputSchema: {
        url: z.string().url().describe("YouTube video URL"),
        title: z.string().optional().describe("Override title (uses video title if omitted)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ url, title }) => {
      try {
        if (!isYoutubeUrl(url)) {
          return {
            content: [
              {
                type: "text" as const,
                text:
                  "Error: Invalid YouTube URL. Provide a youtube.com or youtu.be video URL.",
              },
            ],
          };
        }

        const curateMindPath = process.env.CURATE_MIND_PATH;
        if (!curateMindPath) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: CURATE_MIND_PATH environment variable is not set. " +
                  "This should point to your curate-mind folder.",
              },
            ],
          };
        }

        const capturedAt = new Date();
        const metadata = await getYoutubeMetadata(url);
        const transcriptContent = await getYoutubeTranscript(url);

        const resolvedTitle = resolveYoutubeTitle(url, title, metadata.title);
        const channelName = metadata.authorName.trim() || "[verify]";
        const transcriptMarkdown =
          typeof transcriptContent === "string"
            ? transcriptContent.trim()
            : formatTranscriptChunksAsParagraphs(transcriptContent);
        const markdown =
          `# ${resolvedTitle}\n\n` +
          "## Metadata\n" +
          `* **Channel:** ${channelName}\n` +
          `* **Published:** ${formatPublishedDate(metadata.publishedDate)}\n` +
          `* **Duration:** ${formatDuration(metadata.durationSeconds)}\n` +
          "* **Type:** Video\n" +
          `* **URL:** ${url}\n` +
          `* **Transcript Extracted:** ${formatDateForMetadata(capturedAt)}\n\n` +
          "---\n\n" +
          "## Transcript\n\n" +
          transcriptMarkdown;

        const weekFolder = getWeekFolderPath(curateMindPath, capturedAt);
        if (!existsSync(weekFolder)) {
          await mkdir(weekFolder, { recursive: true });
        }

        const filename =
          `${buildSourceMarkdownFilename({
            sourceLabel: channelName,
            title: resolvedTitle,
            capturedAt,
          })}.md`;
        const filePath = `${weekFolder}/${filename}`;
        await writeFile(filePath, markdown, "utf-8");

        const wordCount = countWords(markdown);

        return {
          content: [
            {
              type: "text" as const,
              text:
                `Fetched YouTube transcript and saved to: ${filePath}\n\n` +
                `Word count: ${wordCount}\n` +
                `Video: ${resolvedTitle}\n` +
                `Channel: ${channelName}\n` +
                `URL: ${url}\n\n` +
                `Next step: Review and clean up the transcript, then use cm_add_source\n` +
                `with filePath="${filePath}" and reviewed=true to push it to Convex.`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                `Error fetching YouTube transcript: ${
                  error instanceof Error ? error.message : String(error)
                }`,
            },
          ],
        };
      }
    }
  );

  // ============================================================
  // cm_extract_pdf — Convert a local PDF via Docling, save locally
  // Per Design Decision 16: does NOT push to Convex
  // ============================================================
  server.registerTool(
    "cm_extract_pdf",
    {
      title: "Extract PDF for Review",
      description:
        "Convert a local PDF to markdown, choose the best extraction path, and save it locally " +
        "to the sources/ folder for review and cleanup. This does NOT add the " +
        "source to Convex. After reviewing the saved file, use cm_add_source " +
        "with reviewed=true to push it to the database.\n\n" +
        "Method guidance:\n" +
        "  - auto: Adaptive chain — tries pypdf first (fast), advances to docling for mixed/visual PDFs, then docling_ocr as a last resort for image-heavy files. Stops early when quality is sufficient. OCR is skipped for files over 60 pages or 30 MB in auto mode.\n" +
        "  - docling: Structured extraction for visual reports and mixed-content PDFs. Use when auto is too slow or you want docling specifically.\n" +
        "  - docling_ocr: Full OCR for image-heavy or scanned PDFs. Slow — expect 2-5 minutes for large files.\n" +
        "  - pypdf: Fastest for purely text-heavy PDFs. Skips all images and charts.\n\n" +
        "Args:\n" +
        "  - filePath (string): Absolute path to the local PDF file\n" +
        "  - title (string, optional): Override title (uses PDF metadata or filename if omitted)\n" +
        "  - method (string, optional): auto, pypdf, docling, or docling_ocr\n\n" +
        "Returns: The local markdown file path plus next-step guidance.",
      inputSchema: {
        filePath: z.string().min(1).describe("Absolute path to the local PDF file"),
        title: z.string().optional().describe("Override title for the saved markdown header"),
        method: z.enum(["auto", "pypdf", "docling", "docling_ocr"]).optional()
          .describe(
            "Extraction mode. Use auto for best effort, docling for large visual reports, docling_ocr for scanned PDFs, or pypdf for a fast text-heavy pass."
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ filePath, title, method }) => {
      try {
        const curateMindPath = process.env.CURATE_MIND_PATH;
        if (!curateMindPath) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: CURATE_MIND_PATH environment variable is not set. " +
                  "This should point to your curate-mind folder.",
              },
            ],
          };
        }

        if (!path.isAbsolute(filePath)) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: filePath must be an absolute path to a local PDF file.",
              },
            ],
          };
        }

        const archivePathReason = getDisallowedArchivePathReason(filePath);
        if (archivePathReason) {
          return {
            content: [
              {
                type: "text" as const,
                text:
                  `Error: ${archivePathReason}\n` +
                  "Use a PDF from Curate Mind or a fresh external file instead.",
              },
            ],
          };
        }

        if (!filePath.toLowerCase().endsWith(".pdf")) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: filePath must point to a .pdf file.",
              },
            ],
          };
        }

        let pdfStats: Awaited<ReturnType<typeof stat>>;
        try {
          pdfStats = await stat(filePath);
        } catch {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: PDF file not found: ${filePath}`,
              },
            ],
          };
        }

        if (!pdfStats.isFile()) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: Path is not a file: ${filePath}`,
              },
            ],
          };
        }

        const capturedAt = new Date();
        const scriptPath = fileURLToPath(
          new URL("../../scripts/extract_pdf.py", import.meta.url)
        );
        const { stdout, stderr } = await execFileAsync(
          getPdfPythonExecutable(curateMindPath),
          [scriptPath, filePath, method ?? "auto"],
          {
            timeout: PDF_EXTRACTION_TIMEOUT_MS,
            maxBuffer: PDF_EXTRACTION_MAX_BUFFER_BYTES,
          }
        );

        const extractedMarkdown = stdout.trim();
        if (!extractedMarkdown) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: Docling returned empty markdown for this PDF.",
              },
            ],
          };
        }

        const pdfMetadata = parsePdfExtractionMetadata(stderr);
        const fallbackFilename = path.parse(filePath).name;
        const resolvedTitle = resolvePdfTitle(
          title,
          pdfMetadata.title,
          fallbackFilename
        );
        const author = pdfMetadata.author?.trim() || "[verify]";
        const requestedMethod = pdfMetadata.requestedMethod ?? method ?? "auto";
        const extractionMethod = pdfMetadata.extractionMethod ?? "unknown";
        const quality = pdfMetadata.quality ?? "medium";
        const qualityScore =
          typeof pdfMetadata.qualityScore === "number"
            ? pdfMetadata.qualityScore
            : undefined;
        const reviewRecommended =
          typeof pdfMetadata.reviewRecommended === "boolean"
            ? pdfMetadata.reviewRecommended
            : undefined;
        const reviewSummary = pdfMetadata.reviewSummary?.trim();
        const reviewFocus = pdfMetadata.reviewFocus?.trim();
        const candidateScores = pdfMetadata.candidateScores?.trim();
        const extractionFailed = pdfMetadata.extractionFailed === true;
        const visualHeaviness = pdfMetadata.visualHeaviness;
        const recommendation = pdfMetadata.recommendation?.trim();

        const markdown =
          `# ${resolvedTitle}\n\n` +
          "## Metadata\n" +
          "* **Publisher:** [verify]\n" +
          `* **Author:** ${author}\n` +
          "* **Published:** [verify]\n" +
          "* **Type:** Report\n" +
          "* **URL:** [verify - add online source URL if available]\n" +
          `* **Captured:** ${formatDateForMetadata(capturedAt)}\n` +
          `* **Original PDF:** ${filePath}\n\n` +
          "---\n\n" +
          extractedMarkdown;

        const weekFolder = getWeekFolderPath(curateMindPath, capturedAt);
        if (!existsSync(weekFolder)) {
          await mkdir(weekFolder, { recursive: true });
        }

        const markdownFilename = buildSourceMarkdownFilename({
          sourceLabel: resolvePdfSourceLabel(author, fallbackFilename),
          title: resolvedTitle,
          capturedAt,
        });
        const markdownFilePath = path.join(
          weekFolder,
          extractionFailed ? `FAILED-${markdownFilename}.md` : `${markdownFilename}.md`
        );
        await writeFile(markdownFilePath, markdown, "utf-8");

        const wordCount = countWords(markdown);
        const fileSizeMb = (pdfStats.size / (1024 * 1024)).toFixed(1);

        if (extractionFailed) {
          return {
            content: [
              {
                type: "text" as const,
                text:
                  `Warning: extraction likely incomplete — only ${wordCount} words from a ${fileSizeMb}MB file.\n\n` +
                  `Saved for inspection: ${markdownFilePath}\n` +
                  `Title: ${resolvedTitle}\n` +
                  `Extraction method: ${extractionMethod}\n` +
                  `Quality: ${quality}${formatQualityScoreSuffix(qualityScore)}\n` +
                  (visualHeaviness !== undefined ? `Visual heaviness: ${visualHeaviness} (MB per word)\n` : "") +
                  (recommendation ? `\nRecommendation: ${recommendation}\n` : "") +
                  `\nThe PDF content is likely in images, charts, or visual elements that text extraction cannot read.\n\n` +
                  `Options:\n` +
                  `  1. Try method=docling_ocr directly (expect 2-5 min for image-heavy PDFs)\n` +
                  `  2. Paste the content manually: use cm_add_source with the text="..." parameter\n` +
                  `  3. Skip this source and delete the FAILED- file`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text:
                `Extracted PDF and saved to: ${markdownFilePath}\n\n` +
                `Word count: ${wordCount}\n` +
                `Original PDF: ${filePath}\n` +
                `Title: ${resolvedTitle}\n` +
                `Requested method: ${requestedMethod}\n` +
                `Extraction method: ${extractionMethod}\n` +
                `Quality: ${quality}${formatQualityScoreSuffix(qualityScore)}\n` +
                (visualHeaviness !== undefined ? `Visual heaviness: ${visualHeaviness} (MB per word)\n` : "") +
                `${formatCandidateScores(candidateScores)}\n` +
                (recommendation ? `Recommendation: ${recommendation}\n` : "") +
                `${formatReviewGuidance(reviewRecommended, reviewSummary, reviewFocus, pdfMetadata.cleanupApplied)}\n\n` +
                `Next step: ${getPdfNextStep(reviewRecommended, reviewFocus)}\n` +
                `with filePath="${markdownFilePath}", originalFilePath="${filePath}", and reviewed=true\n` +
                `to push it to Convex.`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error extracting PDF: ${formatPdfExtractionError(error)}`,
            },
          ],
        };
      }
    }
  );

  // ============================================================
  // cm_add_source — Push verified content to Convex
  // ============================================================
  server.registerTool(
    "cm_add_source",
    {
      title: "Add Source to Convex",
      description:
        "Add a verified source to the Convex database. Provide content via " +
        "filePath (reads a local file) OR text (direct content). When filePath " +
        "points to a reviewed markdown file, the tool can auto-parse metadata " +
        "from the header, optionally upload an original PDF via originalFilePath, " +
        "and update review-status.json after a successful ingest. Only call this " +
        "after the curator has explicitly reviewed and approved the content for ingest. " +
        "Do not use this as an automatic fallback immediately after fetch.\n\n" +
        "The source gets status 'indexed' and is ready for extraction.\n\n" +
        "Args:\n" +
        "  - reviewed (boolean): Must be true only after explicit curator review/approval\n" +
        "  - title (string, optional with filePath): Source title\n" +
        "  - sourceType (string, optional with filePath): article, report, podcast, video, whitepaper, book, newsletter, social, other\n" +
        "  - tier (number): 1 (primary research), 2 (informed analysis), 3 (commentary)\n" +
        "  - urlAccessibility (string): public, paywalled, private\n" +
        "  - filePath (string, optional): Path to a local markdown or text file\n" +
        "  - text (string, optional): Direct text content (use if no file)\n" +
        "  - originalFilePath (string, optional): Path to an original PDF for Convex file storage upload\n" +
        "  - authorName (string, optional): Author or creator\n" +
        "  - publisherName (string, optional): Publication or platform\n" +
        "  - canonicalUrl (string, optional): URL to original source. Required unless an original PDF/file is uploaded\n" +
        "  - publishedDate (string, optional): Original publication date\n" +
        "  - intakeNote (string, optional): Why this source was added\n\n" +
        "Returns: The new source ID, or a duplicate warning if content hash matches.",
      inputSchema: {
        projectId: z.string().describe("Project ID this source belongs to"),
        reviewed: z.boolean()
          .describe("Must be true only after the curator has explicitly reviewed and approved this content"),
        title: z.string().min(1).optional()
          .describe("Source title (optional if filePath metadata header includes it)"),
        sourceType: z.enum([
          "article", "report", "podcast", "video",
          "whitepaper", "book", "newsletter", "social", "other",
        ]).optional()
          .describe("Type of source (optional if filePath metadata header includes it)"),
        tier: z.union([z.literal(1), z.literal(2), z.literal(3)])
          .describe("1=primary research, 2=informed analysis, 3=commentary"),
        urlAccessibility: z.enum(["public", "paywalled", "private"])
          .describe("Whether the original source is publicly accessible"),
        filePath: z.string().optional()
          .describe("Path to a local file to read content from"),
        text: z.string().optional()
          .describe("Direct text content (alternative to filePath)"),
        originalFilePath: z.string().optional()
          .describe("Path to original file (e.g., PDF) for upload to Convex file storage"),
        authorName: z.string().optional().describe("Author or creator"),
        publisherName: z.string().optional().describe("Publication or platform"),
        canonicalUrl: z.string().optional().describe("URL to original source"),
        publishedDate: z.string().optional().describe("Publication date"),
        intakeNote: z.string().optional().describe("Why this source was added"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        if (!params.reviewed) {
          return {
            content: [
              {
                type: "text" as const,
                text:
                  "Error: cm_add_source requires explicit review confirmation.\n" +
                  "Review the local file or pasted text first, then re-run cm_add_source with reviewed=true.",
              },
            ],
          };
        }

        let fullText: string;
        let parsedMetadata: ParsedSourceMetadata = {};

        if (params.filePath) {
          const archivePathReason = getDisallowedArchivePathReason(params.filePath);
          if (archivePathReason) {
            return {
              content: [
                {
                  type: "text" as const,
                  text:
                    `Error: ${archivePathReason}\n` +
                    "Use a reviewed file from Curate Mind's sources folder or pass text directly.",
                },
              ],
            };
          }

          // Guard: reject files whose basename still starts with "verify_".
          // The verify_ prefix is the intake convention for "metadata not yet
          // filled in". Ingesting one of these results in null descriptive
          // metadata in Convex because the parser silently drops [verify]
          // placeholders.
          const basename = path.basename(params.filePath);
          if (basename.startsWith("verify_")) {
            return {
              content: [
                {
                  type: "text" as const,
                  text:
                    `Error: filename "${basename}" still has the "verify_" prefix.\n` +
                    "Fill in the metadata header (Publisher, Author, Published, URL), " +
                    "rename the file to drop the verify_ prefix, then re-run cm_add_source.",
                },
              ],
            };
          }

          fullText = await readFile(params.filePath, "utf-8");

          // Guard: reject content whose metadata header still contains
          // [verify] placeholders. The parser drops these to undefined, which
          // would land in Convex as null. Scan only the header region (text
          // before the first --- separator) so [verify] inside article body
          // text does not cause a false positive.
          const headerEndIdx = fullText.indexOf("\n---");
          const headerRegion = headerEndIdx >= 0 ? fullText.slice(0, headerEndIdx) : fullText;
          if (/\[verify\b/i.test(headerRegion)) {
            const offendingLines = headerRegion
              .split("\n")
              .filter((line) => /\[verify\b/i.test(line))
              .map((line) => `  - ${line.trim()}`)
              .slice(0, 6);
            return {
              content: [
                {
                  type: "text" as const,
                  text:
                    `Error: metadata header in "${basename}" still contains [verify] placeholders.\n` +
                    "Fill in the bracketed values before ingesting:\n" +
                    offendingLines.join("\n"),
                },
              ],
            };
          }

          parsedMetadata = parseSourceMetadataHeader(fullText);
        } else if (params.text) {
          fullText = params.text;
        } else {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: Provide either filePath or text. One is required.",
              },
            ],
          };
        }

        const resolvedTitle =
          params.title !== undefined ? params.title : parsedMetadata.title;
        const resolvedSourceType =
          params.sourceType !== undefined ? params.sourceType : parsedMetadata.sourceType;
        const resolvedAuthorName =
          params.authorName !== undefined ? params.authorName : parsedMetadata.authorName;
        const resolvedPublisherName =
          params.publisherName !== undefined
            ? params.publisherName
            : parsedMetadata.publisherName;
        const resolvedCanonicalUrl = normalizeSourceUrl(
          params.canonicalUrl !== undefined
            ? params.canonicalUrl
            : parsedMetadata.canonicalUrl
        );
        const resolvedPublishedDate =
          params.publishedDate !== undefined
            ? params.publishedDate
            : parsedMetadata.publishedDate;

        if (!resolvedTitle) {
          return {
            content: [
              {
                type: "text" as const,
                text:
                  "Error: title is required. Pass it explicitly or include it in the markdown header.",
              },
            ],
          };
        }

        if (!resolvedSourceType) {
          return {
            content: [
              {
                type: "text" as const,
                text:
                  "Error: sourceType is required. Pass it explicitly or include a supported Type in the markdown header.",
              },
            ],
          };
        }

        const contentHash = createHash("sha256")
          .update(fullText)
          .digest("hex");
        const wordCount = countWords(fullText);

        let storageId: string | undefined;
        if (params.originalFilePath) {
          const archivePathReason = getDisallowedArchivePathReason(params.originalFilePath);
          if (archivePathReason) {
            return {
              content: [
                {
                  type: "text" as const,
                  text:
                    `Error: ${archivePathReason}\n` +
                    "Use an original PDF from Curate Mind or a fresh external file instead.",
                },
              ],
            };
          }

          if (path.extname(params.originalFilePath).toLowerCase() === ".pdf") {
            storageId = await uploadPdfToConvexStorage(params.originalFilePath);
          }
        }

        if (!resolvedCanonicalUrl && !storageId) {
          return {
            content: [
              {
                type: "text" as const,
                text:
                  "Error: Source ingest requires a resolvable destination.\n" +
                  "Provide a valid canonicalUrl in the metadata/header or upload an original PDF via originalFilePath.",
              },
            ],
          };
        }

        const result: InsertSourceResult = await convexMutation(
          api.sources.insertSource,
          {
            projectId: asId<"projects">(params.projectId),
            title: resolvedTitle,
            sourceType: resolvedSourceType,
            tier: params.tier,
            urlAccessibility: params.urlAccessibility,
            fullText,
            contentHash,
            storageId: storageId as typeof api.sources.insertSource["_args"]["storageId"],
            wordCount,
            authorName: resolvedAuthorName,
            publisherName: resolvedPublisherName,
            canonicalUrl: resolvedCanonicalUrl,
            publishedDate: resolvedPublishedDate,
            intakeNote: params.intakeNote,
          }
        );

        if (result.duplicate) {
          return {
            content: [
              {
                type: "text" as const,
                text:
                  `Duplicate detected! A source with the same content hash already exists.\n` +
                  `Existing source ID: ${result.existingId}\n` +
                  `No new record was created.`,
              },
            ],
          };
        }

        let reviewTrackingNote = "";
        if (params.filePath) {
          try {
            await updateReviewStatusFile(params.filePath, String(result.newId));
          } catch (error) {
            reviewTrackingNote =
              `\nWarning: source was added, but review tracking was not updated: ${
                error instanceof Error ? error.message : String(error)
              }`;
          }
        }

        return {
          content: [
            {
              type: "text" as const,
              text:
                `Source added successfully.\n` +
                `Source ID: ${result.newId}\n` +
                `Title: ${resolvedTitle}\n` +
                `Tier: ${params.tier}\n` +
                `Word count: ${wordCount}\n` +
                `${storageId ? `Storage ID: ${storageId}\n` : ""}` +
                `Status: indexed (ready for extraction)` +
                `${reviewTrackingNote}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error adding source: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ============================================================
  // cm_update_source_metadata — Repair descriptive metadata on a source
  // Partial update: only fields explicitly passed are patched in Convex.
  // Use this when a source landed in Convex with null author/publisher/
  // publishedDate/canonicalUrl because the markdown header still had
  // [verify] placeholders at ingest time. The data points and source
  // synthesis are untouched.
  // ============================================================
  server.registerTool(
    "cm_update_source_metadata",
    {
      title: "Update Source Descriptive Metadata",
      description:
        "Repair descriptive metadata on an existing source in Convex. " +
        "Partial update: only fields explicitly passed are written; fields " +
        "left undefined are kept as is. Use this when a source was ingested " +
        "with placeholder ([verify]) metadata that the parser dropped, leaving " +
        "the row with null publisher/author/publishedDate/canonicalUrl. " +
        "Does not touch data points, source synthesis, or status.\n\n" +
        "Args:\n" +
        "  - sourceId (string): The source to update\n" +
        "  - authorName (string, optional): Author or creator\n" +
        "  - publisherName (string, optional): Publication or platform\n" +
        "  - publishedDate (string, optional): Original publication date\n" +
        "  - canonicalUrl (string, optional): URL to original source\n" +
        "  - repairNote (string): Short note explaining why this update is needed\n\n" +
        "Returns: The sourceId, previous values, and the fields that were patched.",
      inputSchema: {
        sourceId: z.string().describe("Source ID to update"),
        authorName: z.string().optional().describe("Author or creator"),
        publisherName: z.string().optional().describe("Publication or platform"),
        publishedDate: z.string().optional().describe("Original publication date"),
        canonicalUrl: z.string().optional().describe("URL to original source"),
        repairNote: z.string().min(1)
          .describe("Short note explaining why this update is needed (audit trail)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const result = await convexMutation(
          api.sources.updateSourceDescriptiveMetadata,
          {
            sourceId: asId<"sources">(params.sourceId),
            authorName: params.authorName,
            publisherName: params.publisherName,
            publishedDate: params.publishedDate,
            canonicalUrl: params.canonicalUrl,
            repairNote: params.repairNote,
          }
        );

        const patchedKeys = Object.keys(result.patched);
        const summaryLines = patchedKeys.map((key) => {
          const previousValue = (result.previous as Record<string, string | null>)[key];
          const newValue = (result.patched as Record<string, string>)[key];
          return `  - ${key}: ${previousValue ?? "(null)"} -> ${newValue}`;
        });

        return {
          content: [
            {
              type: "text" as const,
              text:
                `Source descriptive metadata updated.\n` +
                `Source ID: ${result.sourceId}\n` +
                `Fields patched: ${patchedKeys.length}\n` +
                summaryLines.join("\n") +
                (summaryLines.length > 0 ? "\n" : "") +
                `Repair note: ${result.repairNote}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error updating source metadata: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ============================================================
  // cm_add_curator_observation — Create a curator observation
  // ============================================================
  server.registerTool(
    "cm_add_curator_observation",
    {
      title: "Add Curator Observation",
      description:
        "Create a new Curator Observation — a connective insight that bridges " +
        "data points and/or positions. Observations are immutable once created.\n\n" +
        "Args:\n" +
        "  - observationText (string): The insight or connection being made\n" +
        "  - referencedDataPoints (string[], optional): Array of Data Point IDs this builds on\n" +
        "  - referencedPositions (string[], optional): Array of Research Position IDs this relates to\n" +
        "  - tagSlugs (string[], optional): Tag slugs to link\n\n" +
        "Returns: The new observation ID.",
      inputSchema: {
        observationText: z.string().min(1).describe("The insight or connection"),
        referencedDataPoints: z.array(z.string()).optional()
          .describe("Data Point IDs this observation builds on"),
        referencedPositions: z.array(z.string()).optional()
          .describe("Research Position IDs this relates to"),
        tagSlugs: z.array(z.string()).optional()
          .describe("Tag slugs to link to this observation"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const obsId = await convexMutation(
          api.observations.createObservation,
          {
            observationText: params.observationText,
            referencedDataPoints: params.referencedDataPoints?.map((id) =>
              asId<"dataPoints">(id)
            ),
            referencedPositions: params.referencedPositions?.map((id) =>
              asId<"researchPositions">(id)
            ),
            tagSlugs: params.tagSlugs,
          }
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `Curator Observation created.\nID: ${obsId}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error creating observation: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ============================================================
  // cm_add_mental_model — Create a mental model
  // ============================================================
  server.registerTool(
    "cm_add_mental_model",
    {
      title: "Add Mental Model",
      description:
        "Create a new Mental Model — a framework, analogy, term, metaphor, " +
        "or principle captured from a source. Immutable once created.\n\n" +
        "Args:\n" +
        "  - modelType (string): framework, analogy, term, metaphor, principle\n" +
        "  - title (string): Name of the mental model\n" +
        "  - description (string): What it means and how to use it\n" +
        "  - sourceId (string): Source where first encountered\n" +
        "  - sourceDataPointId (string, optional): Specific data point it was extracted from\n" +
        "  - tagSlugs (string[], optional): Tag slugs to link\n\n" +
        "Returns: The new mental model ID.",
      inputSchema: {
        modelType: z.enum(["framework", "analogy", "term", "metaphor", "principle"])
          .describe("Type of mental model"),
        title: z.string().min(1).describe("Name of the mental model"),
        description: z.string().min(1).describe("What it means and how to use it"),
        sourceId: z.string().describe("Source ID where first encountered"),
        sourceDataPointId: z.string().optional()
          .describe("Data Point ID it was extracted from"),
        tagSlugs: z.array(z.string()).optional()
          .describe("Tag slugs to link"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const modelId = await convexMutation(
          api.mentalModels.createMentalModel,
          {
            modelType: params.modelType,
            title: params.title,
            description: params.description,
            sourceId: asId<"sources">(params.sourceId),
            sourceDataPointId: params.sourceDataPointId
              ? asId<"dataPoints">(params.sourceDataPointId)
              : undefined,
            tagSlugs: params.tagSlugs,
          }
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `Mental Model created.\nID: ${modelId}\nTitle: ${params.title}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error creating mental model: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}

function formatDateForMetadata(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function buildSourceMarkdownFilename({
  sourceLabel,
  title,
  capturedAt,
}: {
  sourceLabel?: string;
  title: string;
  capturedAt: Date;
}): string {
  const sanitizedTitle = sanitizeFilename(title) || "source";
  const sanitizedSourceLabel = sourceLabel ? sanitizeFilename(sourceLabel) : "";
  const dateLabel = formatDateForMetadata(capturedAt);
  const parts: string[] = [];

  if (
    sanitizedSourceLabel &&
    !titleAlreadyIncludesSourceLabel(sanitizedTitle, sanitizedSourceLabel)
  ) {
    parts.push(sanitizedSourceLabel);
  }

  parts.push(sanitizedTitle);

  if (!sanitizedTitle.endsWith(dateLabel)) {
    parts.push(dateLabel);
  }

  return parts.join("_");
}

function titleAlreadyIncludesSourceLabel(
  sanitizedTitle: string,
  sanitizedSourceLabel: string
): boolean {
  return (
    sanitizedTitle === sanitizedSourceLabel ||
    sanitizedTitle.startsWith(`${sanitizedSourceLabel}-`)
  );
}

function getUrlSourceLabel(urlValue: string): string | undefined {
  try {
    const url = new URL(urlValue);
    const hostnameParts = url.hostname
      .toLowerCase()
      .split(".")
      .filter(Boolean)
      .filter((part) => part !== "www" && part !== "m");

    if (hostnameParts.length === 0) {
      return undefined;
    }

    if (
      hostnameParts.length >= 3 &&
      hostnameParts[hostnameParts.length - 1].length === 2 &&
      ["co", "com", "org", "net", "gov", "ac"].includes(
        hostnameParts[hostnameParts.length - 2]
      )
    ) {
      return hostnameParts[hostnameParts.length - 3];
    }

    if (hostnameParts.length >= 2) {
      return hostnameParts[hostnameParts.length - 2];
    }

    return hostnameParts[0];
  } catch {
    return undefined;
  }
}

async function uploadPdfToConvexStorage(originalFilePath: string): Promise<string> {
  const uploadUrl = await convexMutation(api.sources.generateUploadUrl, {});
  const fileBuffer = await readFile(originalFilePath);
  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": "application/pdf" },
    body: fileBuffer,
  });

  if (!uploadResponse.ok) {
    throw new Error(
      `PDF upload failed (${uploadResponse.status} ${uploadResponse.statusText}).`
    );
  }

  const uploadResult = await uploadResponse.json() as { storageId?: string };
  if (!uploadResult.storageId) {
    throw new Error("PDF upload did not return a storageId.");
  }

  return uploadResult.storageId;
}

async function updateReviewStatusFile(filePath: string, sourceId: string): Promise<void> {
  const weekFolderPath = path.dirname(filePath);
  const reviewStatusPath = path.join(weekFolderPath, REVIEW_STATUS_FILENAME);
  let reviewStatus = reviewStatusSchema.parse({ ingested: [] });

  try {
    const existing = await readFile(reviewStatusPath, "utf-8");
    reviewStatus = reviewStatusSchema.parse(JSON.parse(existing));
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== "ENOENT") {
      throw error;
    }
  }

  reviewStatus.ingested.push({
    file: path.basename(filePath),
    sourceId,
    ingestedDate: formatDateForMetadata(new Date()),
  });

  await writeFile(reviewStatusPath, `${JSON.stringify(reviewStatus, null, 2)}\n`, "utf-8");
}

function isYoutubeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    return (
      hostname === "youtu.be" ||
      hostname === "youtube.com" ||
      hostname.endsWith(".youtube.com")
    );
  } catch {
    return false;
  }
}

function resolveYoutubeTitle(
  url: string,
  titleOverride: string | undefined,
  metadataTitle: string
): string {
  const preferredTitle = titleOverride?.trim() || metadataTitle.trim();
  if (preferredTitle) {
    return preferredTitle;
  }

  const videoId = getYoutubeVideoId(url);
  if (videoId) {
    return `youtube-video-${videoId}`;
  }

  return "youtube-video";
}

function getYoutubeVideoId(value: string): string | null {
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
      if (pathParts[0] === "shorts" || pathParts[0] === "live" || pathParts[0] === "embed") {
        return pathParts[1] ?? null;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function formatPublishedDate(publishedDate?: string): string {
  if (!publishedDate) {
    return "[verify]";
  }

  const isoDateMatch = publishedDate.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoDateMatch) {
    return isoDateMatch[1];
  }

  const parsed = new Date(publishedDate);
  if (Number.isNaN(parsed.getTime())) {
    return publishedDate;
  }

  return parsed.toISOString().slice(0, 10);
}

/**
 * Best-effort cleanup of scraped article markdown. Conservative by design:
 * when a pattern is ambiguous, the content is left alone.
 *
 * Start: drops everything before the first H1 heading (# ...).
 *        If no H1 exists, nothing is dropped from the top.
 * End:   drops everything from the first ARTICLE_END_SIGNALS match onward.
 *        If no signal matches, nothing is dropped from the bottom.
 *
 * To handle a new site's footer pattern, add a regex to ARTICLE_END_SIGNALS.
 */
function trimArticleContent(content: string): string {
  const lines = content.split("\n");

  // Find start — first H1 heading; drop everything before it
  const h1Index = lines.findIndex((line) => /^# /.test(line));
  const bodyLines = h1Index >= 0 ? lines.slice(h1Index) : lines;

  // Find end — first structural end signal; drop everything from it onward
  const endIndex = bodyLines.findIndex((line) =>
    ARTICLE_END_SIGNALS.some((signal) => signal.test(line.trim()))
  );
  const trimmedLines = endIndex >= 0 ? bodyLines.slice(0, endIndex) : bodyLines;

  // Remove trailing blank lines left by the trim
  while (trimmedLines.length > 0 && trimmedLines[trimmedLines.length - 1].trim() === "") {
    trimmedLines.pop();
  }

  return trimmedLines.join("\n");
}

function formatDuration(durationSeconds?: number): string {
  if (durationSeconds === undefined) {
    return "[verify]";
  }

  const totalSeconds = Math.max(0, Math.floor(durationSeconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return [
      String(hours).padStart(2, "0"),
      String(minutes).padStart(2, "0"),
      String(seconds).padStart(2, "0"),
    ].join(":");
  }

  return [
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0"),
  ].join(":");
}

function formatTranscriptChunksAsParagraphs(chunks: TranscriptChunk[]): string {
  const timeScale = inferTranscriptOffsetScale(chunks);
  const cleanedChunks = chunks
    .map((chunk) => ({
      startOffset: chunk.offset * timeScale,
      duration: chunk.duration * timeScale,
      text: chunk.text.trim(),
    }))
    .filter((chunk) => chunk.text.length > 0);

  if (cleanedChunks.length === 0) {
    return "";
  }

  const paragraphs: TranscriptParagraph[] = [];
  let currentChunks: typeof cleanedChunks = [];
  let previousOffset = cleanedChunks[0].startOffset;

  for (const chunk of cleanedChunks) {
    const previousChunk = currentChunks[currentChunks.length - 1];
    const previousText = previousChunk?.text ?? "";
    const gap = chunk.startOffset - previousOffset;
    const hasNaturalPause =
      currentChunks.length >= TRANSCRIPT_MIN_CHUNKS_BEFORE_BREAK &&
      (gap >= TRANSCRIPT_PARAGRAPH_GAP_SECONDS || /[.!?]["']?$/.test(previousText));
    const shouldBreak =
      currentChunks.length >= TRANSCRIPT_CHUNKS_PER_PARAGRAPH || hasNaturalPause;

    if (currentChunks.length > 0 && shouldBreak && previousChunk) {
      paragraphs.push({
        startOffset: currentChunks[0].startOffset,
        text: currentChunks.map((currentChunk) => currentChunk.text).join(" ").trim(),
      });
      currentChunks = [];
    }

    currentChunks.push(chunk);
    previousOffset = chunk.startOffset;
  }

  if (currentChunks.length > 0) {
    paragraphs.push({
      startOffset: currentChunks[0].startOffset,
      text: currentChunks.map((currentChunk) => currentChunk.text).join(" ").trim(),
    });
  }

  return paragraphs
    .map((paragraph) =>
      `[${formatTimestamp(paragraph.startOffset)}] ${paragraph.text}`.trim()
    )
    .join("\n\n");
}

function formatTimestamp(offsetSeconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(offsetSeconds));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function inferTranscriptOffsetScale(chunks: TranscriptChunk[]): number {
  const positiveGaps: number[] = [];

  for (let index = 1; index < chunks.length; index += 1) {
    const gap = chunks[index].offset - chunks[index - 1].offset;
    if (gap > 0) {
      positiveGaps.push(gap);
    }
  }

  const sampleGap = positiveGaps[0] ?? chunks[0]?.duration ?? 0;

  // Supadata transcript offsets are often returned in milliseconds.
  // A gap larger than one minute between adjacent chunks is a strong signal
  // that we should normalize to seconds for paragraphing/timestamps.
  return sampleGap > 60 ? 0.001 : 1;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }

  return trimmed.split(/\s+/).length;
}

function parsePdfExtractionMetadata(stderr: string): PdfExtractionMetadata {
  const lines = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(lines[index]) as PdfExtractionMetadata;
      const qualityScore =
        typeof parsed.qualityScore === "string"
          ? Number(parsed.qualityScore)
          : parsed.qualityScore;
      const reviewRecommended =
        parsed.reviewRecommended === "yes"
          ? true
          : parsed.reviewRecommended === "no"
            ? false
            : parsed.reviewRecommended;
      const visualHeaviness =
        typeof parsed.visualHeaviness === "string"
          ? Number(parsed.visualHeaviness)
          : parsed.visualHeaviness;
      const extractionFailed =
        parsed.extractionFailed === "yes"
          ? true
          : parsed.extractionFailed === "no"
            ? false
            : parsed.extractionFailed;
      return {
        title: parsed.title?.trim() || undefined,
        author: parsed.author?.trim() || undefined,
        requestedMethod: parsed.requestedMethod?.trim() || undefined,
        extractionMethod: parsed.extractionMethod?.trim() || undefined,
        quality:
          parsed.quality === "high" || parsed.quality === "medium" || parsed.quality === "low"
            ? parsed.quality
            : undefined,
        qualityScore: typeof qualityScore === "number" && Number.isFinite(qualityScore)
          ? qualityScore
          : undefined,
        reviewRecommended:
          typeof reviewRecommended === "boolean" ? reviewRecommended : undefined,
        reviewSummary: parsed.reviewSummary?.trim() || undefined,
        reviewFocus: parsed.reviewFocus?.trim() || undefined,
        cleanupApplied: parsed.cleanupApplied?.trim() || undefined,
        candidateScores: parsed.candidateScores?.trim() || undefined,
        visualHeaviness:
          typeof visualHeaviness === "number" && Number.isFinite(visualHeaviness)
            ? visualHeaviness
            : undefined,
        extractionFailed:
          typeof extractionFailed === "boolean" ? extractionFailed : undefined,
        recommendation: parsed.recommendation?.trim() || undefined,
      };
    } catch {
      continue;
    }
  }

  return {};
}

function resolvePdfTitle(
  titleOverride: string | undefined,
  metadataTitle: string | undefined,
  fallbackFilename: string
): string {
  const preferredTitle = titleOverride?.trim()
    || normalizePdfTitleCandidate(metadataTitle)
    || normalizePdfTitleCandidate(fallbackFilename);

  return preferredTitle || "untitled-pdf";
}

function resolvePdfSourceLabel(
  author: string | undefined,
  fallbackFilename: string
): string | undefined {
  const normalizedAuthor = normalizePdfTitleCandidate(author);
  if (normalizedAuthor && normalizedAuthor.toLowerCase() !== "multiple") {
    return normalizedAuthor;
  }

  const underscorePrefix = fallbackFilename.split("_")[0]?.trim();
  if (underscorePrefix && underscorePrefix !== fallbackFilename) {
    return normalizePdfTitleCandidate(underscorePrefix);
  }

  return undefined;
}

function normalizePdfTitleCandidate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  let normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  normalized = normalized
    .replace(/\.[A-Za-z0-9]+$/, "")
    .replace(/[_]+/g, " ")
    .replace(/[-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b(\d{4}) (\d{2}) (\d{2})\b$/, "")
    .replace(/\bq(?=\d\b)/gi, "Q")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return undefined;
  }

  return normalized;
}

function formatPdfExtractionError(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "killed" in error &&
    "signal" in error &&
    (error as { killed?: boolean }).killed &&
    (error as { signal?: string | null }).signal === "SIGTERM"
  ) {
    return (
      "PDF extraction timed out after 270 seconds. " +
      "The file may be too large or complex for automated extraction. " +
      "Try method=docling or method=pypdf, or paste the content manually with cm_add_source."
    );
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "stderr" in error &&
    typeof (error as { stderr?: unknown }).stderr === "string"
  ) {
    const stderr = (error as { stderr: string }).stderr.trim();
    if (stderr) {
      return stderr;
    }
  }

  return error instanceof Error ? error.message : String(error);
}

function formatQualityScoreSuffix(score?: number): string {
  if (score === undefined) {
    return "";
  }

  return ` (${score}/100)`;
}

function formatReviewGuidance(
  reviewRecommended?: boolean,
  reviewSummary?: string,
  reviewFocus?: string,
  cleanupApplied?: string
): string {
  const defaultGuidance = reviewRecommended === false
    ? "Likely ready after a quick skim."
    : reviewRecommended === true
      ? "Skim recommended before pushing to Convex."
      : "Review before pushing to Convex.";
  const guidance = reviewSummary || defaultGuidance;
  const focusSuffix = reviewFocus ? ` Focus: ${reviewFocus}.` : "";

  if (!cleanupApplied) {
    return `Review guidance: ${guidance}${focusSuffix}`;
  }

  return `Review guidance: ${guidance}${focusSuffix}\nCleanup applied: ${cleanupApplied}`;
}

function formatCandidateScores(candidateScores?: string): string {
  if (!candidateScores) {
    return "Candidate scores: [not available]";
  }

  return `Candidate scores: ${candidateScores}`;
}

function getPdfNextStep(reviewRecommended?: boolean, reviewFocus?: string): string {
  if (reviewRecommended === false && reviewFocus?.includes("tables/charts")) {
    return "Do a quick skim of tables/charts, then use cm_add_source with reviewed=true";
  }

  if (reviewRecommended === false) {
    return "Do a quick skim, then use cm_add_source with reviewed=true";
  }

  if (reviewFocus?.includes("tables/charts")) {
    return "Skim tables/charts, then use cm_add_source with reviewed=true";
  }

  return "Skim the markdown, then use cm_add_source with reviewed=true";
}

function getPdfPythonExecutable(curateMindPath: string): string {
  const configuredPath = process.env.CURATE_MIND_PYTHON_PATH?.trim();
  if (configuredPath) {
    return configuredPath;
  }

  const projectVenvPython = path.join(curateMindPath, ".venv", "bin", "python3");
  if (existsSync(projectVenvPython)) {
    return projectVenvPython;
  }

  return "python3";
}
