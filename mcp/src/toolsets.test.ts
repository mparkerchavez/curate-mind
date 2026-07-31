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

test("Decision 44: restore is curator-only, out of reach of pipeline agents", () => {
  // The whole point of putting restore in the admin tier: an extraction
  // sub-agent running the pipeline toolset must not be able to reverse a
  // curator's retirement.
  assert.equal(pipeline.has("cm_restore_data_point"), false);
  assert.equal(daily.has("cm_restore_data_point"), false);
  assert.ok(admin.has("cm_restore_data_point"));
  assert.ok(all.has("cm_restore_data_point"));
});

test("Decision 44: retiring stays available to pipeline, only reversing is gated", () => {
  // Retiring is ordinary pipeline work; it is reversal that needs the curator.
  assert.ok(pipeline.has("cm_supersede_data_point"));
  assert.ok(admin.has("cm_supersede_data_point"));
});

test("Decision 44: lifecycle history is a curator-tier read", () => {
  assert.equal(pipeline.has("cm_get_lifecycle_history"), false);
  assert.ok(admin.has("cm_get_lifecycle_history"));
  assert.ok(all.has("cm_get_lifecycle_history"));
});

test("batch lifecycle tools mirror the tier of their single-item counterparts", () => {
  // Batch retire is ordinary pipeline work, like the single-item version.
  assert.ok(pipeline.has("cm_supersede_data_points_batch"));
  assert.ok(admin.has("cm_supersede_data_points_batch"));
  assert.equal(daily.has("cm_supersede_data_points_batch"), false);

  // Batch restore is curator-only, like the single-item version. A batch must
  // not become a way around the tier that gates reversing a retirement.
  assert.equal(pipeline.has("cm_restore_data_points_batch"), false);
  assert.equal(daily.has("cm_restore_data_points_batch"), false);
  assert.ok(admin.has("cm_restore_data_points_batch"));
  assert.ok(all.has("cm_restore_data_points_batch"));
});
