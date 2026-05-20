/**
 * One-shot migration: backfill project profile fields and seed the
 * userPreferences singleton for the existing Curate Mind instance.
 *
 * Run with:
 *   npx tsx scripts/migrate_profile_backfill.ts [projectId]
 *
 * If projectId is omitted, the script picks the first project returned
 * by listProjects (the production instance only has one).
 *
 * No extracted data is touched. The script only fills in optional
 * profile fields and inserts a row into userPreferences if none exists.
 * Append-only invariant holds.
 *
 * Required env (loaded from .env.local if present):
 *   CONVEX_URL
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

loadEnvFile(path.join(repoRoot, ".env.local"));
loadEnvFile(path.join(repoRoot, "web", ".env.local"));

const convexUrl = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
if (!convexUrl) {
  throw new Error(
    "CONVEX_URL (or VITE_CONVEX_URL) must be set before running the profile backfill."
  );
}

const cliProjectId = process.argv[2];
const client = new ConvexHttpClient(convexUrl);
const api = anyApi as any;

// ============================================================
// Defaults captured at migration time
// ------------------------------------------------------------
// Source-of-truth pointers:
//   - domain: existing CLAUDE.md "Domain" line
//   - timeHorizon: project_dual_purpose_framing memory
//   - secondaryCaptureDescription: existing Pass 2 / mental-model scan prompt
//   - suggestedPrompts: web/src/config/homepage.ts EXAMPLE_PROMPTS
//   - bannedPunctuation: feedback_no_em_dashes memory
// ============================================================

const PROFILE_DEFAULTS = {
  domain:
    "AI strategy, adoption, enterprise transformation, agentic workflows",
  audience:
    "Maicol Parker-Chavez (curator and primary analyst); secondarily, technical and strategy readers visiting curatemind.io",
  timeHorizon: "February 2026 research onward",
  researchUnitLabel: "research",
  ideaUnitLabel: "position",
  assistantRoleName: "research assistant",
  suggestedPrompts: [
    "What does the evidence say about AI adoption in the enterprise?",
    "What differentiates companies succeeding with AI from those stalling?",
    "How is AI changing software development?",
    "Where do agentic workflows actually break down?",
    "Is software engineering a preview of AI's impact on white-collar work?",
  ],
  secondaryCaptureEnabled: true,
  secondaryCaptureLabel: "Mental Models",
  secondaryCaptureDescription:
    "Frameworks, analogies, terms, metaphors, principles.",
  themeHints: "",
  highValueEvidenceNotes:
    "Evidence types in use: statistic, framework, prediction, case-study, observation, recommendation.",
  confidenceRubricNotes: "",
  tagStrategyNotes: "",
  profileInitialized: true,
};

const PREFERENCES_DEFAULTS = {
  voice: "analytical" as const,
  structurePreference: "mixed" as const,
  bannedPunctuation: ["—"],
  bannedPhrases: [],
  alwaysIncludeCounterEvidence: false,
  evidenceThinPolicy: "say-so" as const,
  hedgingStyle: "moderate" as const,
  language: "en",
  customStyleNotes:
    "Spell things out. No shorthand or acronyms in user-facing surfaces.",
  preferencesInitialized: true,
};

async function main() {
  console.log(`Connecting to Convex at ${convexUrl}`);

  const project = await resolveTargetProject();
  console.log(`\nTarget project: ${project.name} (${project._id})`);
  console.log(
    `Current profileInitialized: ${project.profileInitialized ?? false}`
  );

  // -------- Project profile backfill --------
  const profilePatch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(PROFILE_DEFAULTS)) {
    if ((project as any)[key] === undefined || (project as any)[key] === null) {
      profilePatch[key] = value;
    }
  }

  if (Object.keys(profilePatch).length === 0) {
    console.log("\nProject profile already populated. No project fields updated.");
  } else {
    console.log("\nProject profile fields to set:");
    for (const [key, value] of Object.entries(profilePatch)) {
      console.log(`  + ${key}: ${formatDiffValue(value)}`);
    }
    const result = await client.mutation(api.projects.updateProjectProfile, {
      projectId: project._id,
      ...profilePatch,
    });
    console.log(
      `\nProfile updated. profileVersion is now ${result.profileVersion}.`
    );
  }

  // -------- User preferences seed --------
  const existingPrefs = await client.query(
    api.userPreferences.getUserPreferences,
    {}
  );

  if (existingPrefs && existingPrefs._id) {
    console.log(
      `\nUser preferences row already exists (${existingPrefs._id}). Skipping seed.`
    );
  } else {
    console.log("\nUser preferences singleton fields to set:");
    for (const [key, value] of Object.entries(PREFERENCES_DEFAULTS)) {
      console.log(`  + ${key}: ${formatDiffValue(value)}`);
    }
    const result = await client.mutation(
      api.userPreferences.updateUserPreferences,
      PREFERENCES_DEFAULTS
    );
    console.log(
      `\nUser preferences seeded. _id=${result._id} updatedAt=${result.updatedAt}.`
    );
  }

  console.log("\nMigration complete. No extracted data was modified.");
}

async function resolveTargetProject(): Promise<any> {
  if (cliProjectId) {
    const project = await client.query(api.projects.getProjectProfile, {
      projectId: cliProjectId,
    });
    if (!project) {
      throw new Error(`Project not found for ID ${cliProjectId}`);
    }
    return project;
  }

  const projects = await client.query(api.projects.listProjects, {});
  if (!Array.isArray(projects) || projects.length === 0) {
    throw new Error("No projects exist in the Convex deployment.");
  }
  if (projects.length > 1) {
    console.warn(
      `Multiple projects found (${projects.length}). Defaulting to the first one.`
    );
    console.warn(
      "Pass an explicit projectId on the command line to target a specific project."
    );
  }
  return projects[0];
}

function formatDiffValue(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[${value.map((v) => JSON.stringify(v)).join(", ")}]`;
  }
  if (typeof value === "string") {
    return value.length > 120 ? `${value.slice(0, 117)}...` : value;
  }
  return JSON.stringify(value);
}

function loadEnvFile(file: string) {
  if (!fs.existsSync(file)) return;
  const content = fs.readFileSync(file, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
