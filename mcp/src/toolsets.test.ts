// Tests for toolset composition (Chunk 4 correction tooling).
//
// Run with: node --import tsx --test mcp/src/toolsets.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { getToolsetTools } from "./toolsets.js";

const daily = getToolsetTools("daily");
const pipeline = getToolsetTools("pipeline");
const admin = getToolsetTools("admin");
const all = getToolsetTools("all");

test("Part A: tag removal is available from a pipeline session", () => {
  assert.ok(pipeline.has("cm_remove_data_point_tag_batch"));
  // Still reachable in admin (admin includes pipeline) and listed in all.
  assert.ok(admin.has("cm_remove_data_point_tag_batch"));
  assert.ok(all.has("cm_remove_data_point_tag_batch"));
  // But deliberately NOT in the everyday daily toolset.
  assert.equal(daily.has("cm_remove_data_point_tag_batch"), false);
});

test("Part B: re-tier (cm_correct_attribution) is available in pipeline", () => {
  assert.ok(pipeline.has("cm_correct_attribution"));
  assert.ok(admin.has("cm_correct_attribution"));
  assert.equal(daily.has("cm_correct_attribution"), false);
});

test("Part B: source-correction read tool is available in pipeline", () => {
  assert.ok(pipeline.has("cm_get_source_corrections"));
  assert.ok(admin.has("cm_get_source_corrections"));
  assert.ok(all.has("cm_get_source_corrections"));
});
