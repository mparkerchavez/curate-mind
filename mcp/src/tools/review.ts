/**
 * Review queue tools for Curate Mind MCP.
 *
 * These tools help the Research persona see which local intake files
 * are still waiting for review before they are added to Convex.
 */

import { readdir, readFile } from "fs/promises";
import path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const DEFAULT_WEEK_RANGE = 4;
const METADATA_LINE_LIMIT = 20;

const reviewStatusSchema = z.object({
  ingested: z.array(
    z.object({
      file: z.string(),
      sourceId: z.string(),
      ingestedDate: z.string(),
    })
  ).default([]),
});

type IngestedRecord = z.infer<typeof reviewStatusSchema>["ingested"][number];
type QueueFileEntry =
  | {
      kind: "pending";
      filename: string;
      wordCount: number;
      sourceType: string;
      capturedDate: string | null;
    }
  | {
      kind: "ingested";
      filename: string;
      sourceId: string;
      ingestedDate: string;
    };

type WeekQueue = {
  label: string;
  entries: QueueFileEntry[];
  pendingCount: number;
  ingestedCount: number;
};

export function registerReviewTools(server: McpServer): void {
  server.registerTool(
    "cm_review_queue",
    {
      title: "Review Queue",
      description:
        "Show pending source files that have been fetched but not yet pushed to Convex. " +
        "Scans the sources/ folder and cross-references with ingestion tracking.\n\n" +
        "Args:\n" +
        "  - weekRange (number, optional): How many weeks back to scan. Default: 4.\n\n" +
        "Returns: A formatted list of pending and ingested source files.",
      inputSchema: {
        weekRange: z.number().optional().describe("Weeks back to scan (default: 4)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ weekRange }) => {
      try {
        const text = await buildReviewQueueSummary({ weekRange });
        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}

export async function buildReviewQueueSummary({
  weekRange = DEFAULT_WEEK_RANGE,
  curateMindPath = process.env.CURATE_MIND_PATH,
}: {
  weekRange?: number;
  curateMindPath?: string;
} = {}): Promise<string> {
  if (!curateMindPath) {
    throw new Error(
      "CURATE_MIND_PATH environment variable is not set. This should point to your curate-mind folder."
    );
  }

  const normalizedWeekRange = normalizeWeekRange(weekRange);
  const sourcesPath = path.join(curateMindPath, "sources");
  const weekFolders = await getWeekFolders(sourcesPath);
  const selectedWeekFolders = weekFolders.slice(0, normalizedWeekRange);

  const queues: WeekQueue[] = [];
  let totalPending = 0;
  let totalIngested = 0;

  for (const folder of selectedWeekFolders) {
    const queue = await buildWeekQueue(folder.absolutePath, folder.label);
    if (!queue) {
      continue;
    }

    queues.push(queue);
    totalPending += queue.pendingCount;
    totalIngested += queue.ingestedCount;
  }

  const header =
    `Review Queue — ${totalPending} pending, ${totalIngested} ingested ` +
    `(${formatWeekRangeLabel(normalizedWeekRange)})`;

  if (queues.length === 0) {
    return `${header}\n\nNo pending files in the review queue.`;
  }

  const sections = queues.map(formatWeekQueue);
  return `${header}\n\n${sections.join("\n\n")}`;
}

function normalizeWeekRange(weekRange: number): number {
  if (!Number.isFinite(weekRange) || weekRange < 1) {
    throw new Error("weekRange must be a number greater than or equal to 1.");
  }

  return Math.floor(weekRange);
}

async function getWeekFolders(
  sourcesPath: string
): Promise<Array<{ absolutePath: string; label: string; sortKey: number }>> {
  let monthEntries;
  try {
    monthEntries = await readdir(sourcesPath, { withFileTypes: true });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const folders: Array<{ absolutePath: string; label: string; sortKey: number }> = [];

  for (const monthEntry of monthEntries) {
    if (!monthEntry.isDirectory() || monthEntry.name.startsWith(".")) {
      continue;
    }

    const monthPath = path.join(sourcesPath, monthEntry.name);
    const weekEntries = await readdir(monthPath, { withFileTypes: true });

    for (const weekEntry of weekEntries) {
      if (!weekEntry.isDirectory() || weekEntry.name.startsWith(".")) {
        continue;
      }

      const absolutePath = path.join(monthPath, weekEntry.name);
      folders.push({
        absolutePath,
        label: `${monthEntry.name}/${weekEntry.name}/`,
        sortKey: getWeekFolderSortKey(monthEntry.name, weekEntry.name),
      });
    }
  }

  folders.sort((a, b) => {
    if (a.sortKey !== b.sortKey) {
      return b.sortKey - a.sortKey;
    }
    return b.label.localeCompare(a.label);
  });

  return folders;
}

function getWeekFolderSortKey(monthFolderName: string, weekFolderName: string): number {
  const parsed = parseWeekFolderDateRange(monthFolderName, weekFolderName);
  if (parsed) {
    return parsed.endDate.getTime();
  }

  const fallback = Date.parse(`${monthFolderName}-01T00:00:00Z`);
  return Number.isNaN(fallback) ? 0 : fallback;
}

function parseWeekFolderDateRange(
  monthFolderName: string,
  weekFolderName: string
): { startDate: Date; endDate: Date } | null {
  const fullRangeMatch = weekFolderName.match(
    /^(\d{4})-(\d{2})-(\d{2})_to_(\d{4})-(\d{2})-(\d{2})$/
  );
  if (fullRangeMatch) {
    const [, startYear, startMonth, startDay, endYear, endMonth, endDay] = fullRangeMatch;
    return {
      startDate: createUtcDate(startYear, startMonth, startDay),
      endDate: createUtcDate(endYear, endMonth, endDay),
    };
  }

  const monthDayRangeMatch = weekFolderName.match(
    /^(\d{4})-(\d{2})-(\d{2})_to_(\d{2})-(\d{2})$/
  );
  if (monthDayRangeMatch) {
    const [, startYear, startMonth, startDay, endMonth, endDay] = monthDayRangeMatch;
    const startYearNumber = Number(startYear);
    const endYearNumber = Number(endMonth) < Number(startMonth) ? startYearNumber + 1 : startYearNumber;
    return {
      startDate: createUtcDate(startYear, startMonth, startDay),
      endDate: createUtcDate(String(endYearNumber), endMonth, endDay),
    };
  }

  const dayOnlyRangeMatch = weekFolderName.match(/^(\d{4})-(\d{2})-(\d{2})_to_(\d{2})$/);
  if (dayOnlyRangeMatch) {
    const [, startYear, startMonth, startDay, endDay] = dayOnlyRangeMatch;
    return {
      startDate: createUtcDate(startYear, startMonth, startDay),
      endDate: createUtcDate(startYear, startMonth, endDay),
    };
  }

  const monthMatch = monthFolderName.match(/^(\d{4})-(\d{2})$/);
  if (!monthMatch) {
    return null;
  }

  const fallbackStart = Date.parse(`${monthFolderName}-01T00:00:00Z`);
  if (Number.isNaN(fallbackStart)) {
    return null;
  }

  const startDate = new Date(fallbackStart);
  const endDate = new Date(fallbackStart);
  return { startDate, endDate };
}

function createUtcDate(year: string, month: string, day: string): Date {
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

async function buildWeekQueue(
  weekFolderPath: string,
  label: string
): Promise<WeekQueue | null> {
  const entries = await readdir(weekFolderPath, { withFileTypes: true });
  const markdownFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  if (markdownFiles.length === 0) {
    return null;
  }

  const ingestedByFile = await readReviewStatusFile(weekFolderPath);
  const pendingEntries: QueueFileEntry[] = [];
  const ingestedEntries: QueueFileEntry[] = [];

  for (const filename of markdownFiles) {
    const ingested = ingestedByFile.get(filename);
    if (ingested) {
      ingestedEntries.push({
        kind: "ingested",
        filename,
        sourceId: ingested.sourceId,
        ingestedDate: ingested.ingestedDate,
      });
      continue;
    }

    const filePath = path.join(weekFolderPath, filename);
    const content = await readFile(filePath, "utf-8");
    const metadata = parseFileMetadata(content);
    pendingEntries.push({
      kind: "pending",
      filename,
      wordCount: countWords(content),
      sourceType: metadata.sourceType,
      capturedDate: metadata.capturedDate,
    });
  }

  return {
    label,
    entries: [...pendingEntries, ...ingestedEntries],
    pendingCount: pendingEntries.length,
    ingestedCount: ingestedEntries.length,
  };
}

async function readReviewStatusFile(weekFolderPath: string): Promise<Map<string, IngestedRecord>> {
  const reviewStatusPath = path.join(weekFolderPath, "review-status.json");

  try {
    const raw = await readFile(reviewStatusPath, "utf-8");
    const parsed = reviewStatusSchema.parse(JSON.parse(raw));
    return new Map(parsed.ingested.map((entry) => [entry.file, entry]));
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return new Map();
    }

    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      return new Map();
    }

    throw error;
  }
}

function parseFileMetadata(content: string): {
  sourceType: string;
  capturedDate: string | null;
} {
  const firstLines = content.split(/\r?\n/).slice(0, METADATA_LINE_LIMIT);
  let sourceType = "unknown type";
  let capturedDate: string | null = null;

  for (const line of firstLines) {
    const typeMatch = line.match(/^\* \*\*Type:\*\*\s*(.+)\s*$/);
    if (typeMatch) {
      sourceType = typeMatch[1].trim();
    }

    const capturedMatch = line.match(
      /^\* \*\*(Captured|Transcript Extracted):\*\*\s*(.+)\s*$/
    );
    if (capturedMatch) {
      capturedDate = capturedMatch[2].trim();
    }
  }

  return { sourceType, capturedDate };
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }

  return trimmed.split(/\s+/).length;
}

function formatWeekQueue(queue: WeekQueue): string {
  const lines = [`📂 ${queue.label}`];

  if (queue.pendingCount === 0) {
    lines.push("  (all ingested)");
    return lines.join("\n");
  }

  for (const entry of queue.entries) {
    if (entry.kind === "pending") {
      const details = [
        `${formatNumber(entry.wordCount)} words`,
        entry.sourceType,
        entry.capturedDate ? `captured ${entry.capturedDate}` : "captured unknown",
      ];
      lines.push(`  ☐ ${entry.filename} (${details.join(" | ")})`);
      continue;
    }

    lines.push(
      `  ☑ ${entry.filename} (ingested ${entry.ingestedDate} -> source ${entry.sourceId})`
    );
  }

  return lines.join("\n");
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatWeekRangeLabel(weekRange: number): string {
  return weekRange === 1 ? "last 1 week" : `last ${weekRange} weeks`;
}
