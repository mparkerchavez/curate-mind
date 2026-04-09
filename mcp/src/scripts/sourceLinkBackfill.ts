/**
 * Audits and backfills source canonical URLs from the local source library.
 *
 * Matching is strict: local files are linked to Convex sources only by the
 * SHA256 content hash used at ingest time. No title/date heuristics are used.
 */

import { createHash } from "crypto";
import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { api, convexMutation, convexQuery } from "../lib/convex-client.js";
import { parseSourceMetadataHeader } from "../lib/sourceMetadata.js";

type Mode = "audit" | "apply";

type AuditCandidate = {
  filePath: string;
  contentHash: string;
  normalizedUrl?: string;
  matchedSourceId?: string;
  matchedSourceTitle?: string;
  reason:
    | "updated"
    | "already-good"
    | "missing-url-in-file"
    | "not-evidence-linked"
    | "no-hash-match"
    | "ambiguous";
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const sourcesRoot = path.join(repoRoot, "sources");
const reportDir = path.join(repoRoot, "tmp");

function loadRepoEnv(): void {
  dotenv.config({ path: path.join(repoRoot, ".env.local") });
}

async function walkSourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        return await walkSourceFiles(absolutePath);
      }

      if (
        entry.isFile() &&
        (absolutePath.endsWith(".md") || absolutePath.endsWith(".txt"))
      ) {
        return [absolutePath];
      }

      return [];
    })
  );

  return files.flat();
}

async function resolveProjectId(): Promise<string> {
  const projects = await convexQuery(api.projects.listProjects, {});
  if (!projects.length) {
    throw new Error("No projects found in the target Convex deployment.");
  }

  return process.env.VITE_CURATE_MIND_PROJECT_ID || String(projects[0]._id);
}

async function getEvidenceLinkedSourceIds(): Promise<Set<string>> {
  const sourceIds = await convexQuery(api.sources.listEvidenceLinkedSourceIds, {});
  return new Set(sourceIds.map((sourceId) => String(sourceId)));
}

async function getCurrentSource(sourceId: string) {
  return await convexQuery(api.sources.getSource, {
    sourceId: sourceId as never,
  });
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

async function audit(mode: Mode): Promise<void> {
  loadRepoEnv();

  const projectId = await resolveProjectId();
  const linkedSourceIds = await getEvidenceLinkedSourceIds();
  const files = await walkSourceFiles(sourcesRoot);
  const seenSourceIds = new Map<string, string[]>();
  const currentSourceCache = new Map<
    string,
    Awaited<ReturnType<typeof getCurrentSource>>
  >();
  const candidates: AuditCandidate[] = [];

  for (const filePath of files) {
    const fullText = await readFile(filePath, "utf-8");
    const metadata = parseSourceMetadataHeader(fullText);
    const contentHash = hashContent(fullText);
    const matched = await convexQuery(api.sources.findByContentHash, {
      contentHash,
    });

    if (!matched) {
      candidates.push({
        filePath,
        contentHash,
        normalizedUrl: metadata.canonicalUrl,
        reason: "no-hash-match",
      });
      continue;
    }

    const sourceId = String(matched._id);
    const filesForSource = seenSourceIds.get(sourceId) ?? [];
    filesForSource.push(filePath);
    seenSourceIds.set(sourceId, filesForSource);

    if (!linkedSourceIds.has(sourceId)) {
      candidates.push({
        filePath,
        contentHash,
        normalizedUrl: metadata.canonicalUrl,
        matchedSourceId: sourceId,
        matchedSourceTitle: matched.title,
        reason: "not-evidence-linked",
      });
      continue;
    }

    let currentSource = currentSourceCache.get(sourceId);
    if (!currentSource) {
      currentSource = await getCurrentSource(sourceId);
      currentSourceCache.set(sourceId, currentSource);
    }

    if (filesForSource.length > 1) {
      candidates.push({
        filePath,
        contentHash,
        normalizedUrl: metadata.canonicalUrl,
        matchedSourceId: sourceId,
        matchedSourceTitle: matched.title,
        reason: "ambiguous",
      });
      continue;
    }

    if (currentSource?.storageUrl || currentSource?.canonicalUrl) {
      candidates.push({
        filePath,
        contentHash,
        normalizedUrl: metadata.canonicalUrl,
        matchedSourceId: sourceId,
        matchedSourceTitle: matched.title,
        reason: "already-good",
      });
      continue;
    }

    if (!metadata.canonicalUrl) {
      candidates.push({
        filePath,
        contentHash,
        matchedSourceId: sourceId,
        matchedSourceTitle: matched.title,
        reason: "missing-url-in-file",
      });
      continue;
    }

    if (mode === "apply") {
      await convexMutation(api.sources.repairSourceCanonicalUrl, {
        sourceId: sourceId as never,
        canonicalUrl: metadata.canonicalUrl,
        repairNote: `sourceLinkBackfill:${path.relative(repoRoot, filePath)}`,
      });
    }

    candidates.push({
      filePath,
      contentHash,
      normalizedUrl: metadata.canonicalUrl,
      matchedSourceId: sourceId,
      matchedSourceTitle: matched.title,
      reason: "updated",
    });
  }

  const summary = {
    mode,
    projectId,
    scannedFiles: files.length,
    evidenceLinkedSources: linkedSourceIds.size,
    matched: candidates.filter((entry) => entry.matchedSourceId).length,
    updated: candidates.filter((entry) => entry.reason === "updated").length,
    alreadyGood: candidates.filter((entry) => entry.reason === "already-good")
      .length,
    missingUrlInFile: candidates.filter(
      (entry) => entry.reason === "missing-url-in-file"
    ).length,
    ambiguous: candidates.filter((entry) => entry.reason === "ambiguous").length,
    unresolved: candidates.filter(
      (entry) =>
        entry.reason === "no-hash-match" ||
        entry.reason === "missing-url-in-file" ||
        entry.reason === "ambiguous"
    ).length,
    skippedNotEvidenceLinked: candidates.filter(
      (entry) => entry.reason === "not-evidence-linked"
    ).length,
  };

  await mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `source-link-backfill-${mode}.json`);
  await writeFile(
    reportPath,
    `${JSON.stringify(
      {
        summary,
        candidates: candidates.map((entry) => ({
          ...entry,
          filePath: path.relative(repoRoot, entry.filePath),
        })),
      },
      null,
      2
    )}\n`,
    "utf-8"
  );

  console.log(JSON.stringify({ ...summary, reportPath }, null, 2));
}

const modeArg = process.argv[2] ?? "audit";
if (modeArg !== "audit" && modeArg !== "apply") {
  console.error('Usage: tsx src/scripts/sourceLinkBackfill.ts <audit|apply>');
  process.exit(1);
}

await audit(modeArg);
