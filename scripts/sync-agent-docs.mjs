#!/usr/bin/env node

/**
 * Keeps the Claude and Codex repository instruction files in sync.
 *
 * CLAUDE.md is the canonical source because most product/design updates happen
 * in Claude. AGENTS.md mirrors it so Codex and other agent tools see the same
 * project context when the repo is cloned.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const claudePath = path.join(root, "CLAUDE.md");
const agentsPath = path.join(root, "AGENTS.md");
const checkOnly = process.argv.includes("--check");

const [claude, agents] = await Promise.all([
  readFile(claudePath, "utf8"),
  readFile(agentsPath, "utf8").catch((error) => {
    if (error?.code === "ENOENT") return "";
    throw error;
  }),
]);

if (claude === agents) {
  console.log("Agent docs are in sync: CLAUDE.md and AGENTS.md match.");
  process.exit(0);
}

if (checkOnly) {
  console.error(
    "Agent docs are out of sync. Run `npm run agents:sync` to mirror CLAUDE.md into AGENTS.md."
  );
  process.exit(1);
}

await writeFile(agentsPath, claude, "utf8");
console.log("Synced AGENTS.md from CLAUDE.md.");
