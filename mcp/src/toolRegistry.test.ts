// Guard test: every tool registered on the stdio server must be listed in the
// toolsets registry (ALL_TOOLS in toolsets.ts).
//
// Why this exists: installToolsetFilter monkey-patches server.registerTool and
// silently skips any name that is not in the active toolset. ALL_TOOLS is the
// superset backing every toolset, so a tool that is registered but missing from
// ALL_TOOLS is unreachable in all four toolsets, including "all". That is how
// cm_correct_claim shipped dead on 2026-06-17. This test fails loudly instead.
//
// Run with: node --import tsx --test mcp/src/toolRegistry.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerIntakeTools } from "./tools/intake.js";
import { registerExtractionTools } from "./tools/extraction.js";
import { registerQueryTools } from "./tools/query.js";
import { registerReviewTools } from "./tools/review.js";
import { registerSynthesisTools } from "./tools/synthesis.js";
import { registerProfileTools } from "./tools/profile.js";
import { getToolsetTools } from "./toolsets.js";

// The public HTTP server (tools/public.ts) registers its own tools on a
// separate server that installToolsetFilter never touches, so it is
// deliberately excluded here.
function collectRegisteredToolNames(): string[] {
  const names: string[] = [];
  const fakeServer = {
    registerTool: (name: string) => {
      names.push(name);
      return undefined;
    },
  } as unknown as McpServer;

  registerIntakeTools(fakeServer);
  registerExtractionTools(fakeServer);
  registerQueryTools(fakeServer);
  registerReviewTools(fakeServer);
  registerSynthesisTools(fakeServer);
  registerProfileTools(fakeServer);

  return names;
}

const registeredNames = collectRegisteredToolNames();
const allTools = getToolsetTools("all");

test("every registered tool is listed in ALL_TOOLS", () => {
  const missing = registeredNames.filter((name) => !allTools.has(name));
  assert.deepEqual(
    missing,
    [],
    `These tools are registered on the server but missing from ALL_TOOLS in ` +
      `mcp/src/toolsets.ts, so the toolset filter hides them in every toolset: ` +
      `${missing.join(", ")}`
  );
});

test("every ALL_TOOLS entry is actually registered on the server", () => {
  const registered = new Set(registeredNames);
  const stale = [...allTools].filter((name) => !registered.has(name));
  assert.deepEqual(
    stale,
    [],
    `These names are listed in ALL_TOOLS in mcp/src/toolsets.ts but no tool ` +
      `registers under them: ${stale.join(", ")}`
  );
});

test("no tool name is registered twice", () => {
  const seen = new Set<string>();
  const duplicates = registeredNames.filter((name) => {
    if (seen.has(name)) return true;
    seen.add(name);
    return false;
  });
  assert.deepEqual(duplicates, [], `Duplicate tool registrations: ${duplicates.join(", ")}`);
});

test("cm_correct_claim is reachable from the pipeline toolset", () => {
  const pipeline = getToolsetTools("pipeline");
  const admin = getToolsetTools("admin");
  const daily = getToolsetTools("daily");

  assert.ok(registeredNames.includes("cm_correct_claim"));
  // Placed with its correction siblings: pipeline and above, not daily.
  assert.ok(pipeline.has("cm_correct_claim"));
  assert.ok(admin.has("cm_correct_claim"));
  assert.ok(allTools.has("cm_correct_claim"));
  assert.equal(daily.has("cm_correct_claim"), false);
  assert.equal(pipeline.has("cm_correct_anchor"), true);
  assert.equal(pipeline.has("cm_correct_attribution"), true);
});
