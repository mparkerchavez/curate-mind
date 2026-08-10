import type { McpServer } from "@modelcontextprotocol/server";

type ToolsetName = "daily" | "pipeline" | "admin" | "all";

const ALL_TOOLS = [
  "cm_extract_source",
  "cm_remove_data_point_tag_batch",
  "cm_save_data_points",
  "cm_enrich_data_points_batch",
  "cm_update_data_points_tags_batch",
  "cm_save_source_synthesis",
  "cm_update_source_status",
  "cm_fetch_url",
  "cm_fetch_youtube",
  "cm_extract_pdf",
  "cm_add_source",
  "cm_update_source_metadata",
  "cm_add_curator_observation",
  "cm_add_mental_model",
  "cm_get_project_profile",
  "cm_update_project_profile",
  "cm_get_user_preferences",
  "cm_update_user_preferences",
  "cm_preview_prompt_profile",
  "cm_validate_profile",
  "cm_reset_profile_to_defaults",
  "cm_ask",
  "cm_get_themes",
  "cm_get_positions",
  "cm_get_position_detail",
  "cm_get_data_point",
  "cm_get_data_point_corrections",
  "cm_get_source_corrections",
  "cm_get_source",
  "cm_get_source_text",
  "cm_search",
  "cm_get_tag_trends",
  "cm_get_position_history",
  "cm_list_sources",
  "cm_get_research_lens",
  "cm_get_data_points_by_tag",
  "cm_get_data_points_batch",
  "cm_list_data_points_by_source",
  "cm_get_data_point_usage",
  "cm_get_source_usage",
  "cm_review_queue",
  "cm_list_projects",
  "cm_create_project",
  "cm_create_theme",
  "cm_create_position",
  "cm_update_position",
  "cm_update_research_lens",
  "cm_create_tag",
  "cm_retire_tag",
  "cm_get_position_arrays",
  "cm_link_evidence_to_position",
  "cm_update_positions_batch",
  "cm_unlink_evidence_from_position",
  "cm_replace_evidence_on_position",
  "cm_correct_anchor",
  "cm_correct_attribution",
  "cm_correct_claim",
  "cm_supersede_data_point",
  "cm_supersede_data_points_batch",
  "cm_supersede_source",
  "cm_restore_source",
  "cm_get_source_lifecycle_history",
  "cm_restore_data_point",
  "cm_restore_data_points_batch",
  "cm_get_lifecycle_history",
  "cm_generate_embeddings",
] as const;

const DAILY_TOOLS = [
  "cm_list_projects",
  "cm_create_project",
  "cm_get_project_profile",
  "cm_update_project_profile",
  "cm_get_user_preferences",
  "cm_update_user_preferences",
  "cm_preview_prompt_profile",
  "cm_validate_profile",
  "cm_fetch_url",
  "cm_fetch_youtube",
  "cm_extract_pdf",
  "cm_add_source",
  "cm_review_queue",
  "cm_ask",
  "cm_search",
  "cm_get_themes",
  "cm_get_positions",
  "cm_get_position_detail",
  "cm_get_data_point",
  "cm_get_source",
  "cm_get_source_text",
  "cm_get_tag_trends",
  "cm_list_sources",
  "cm_get_data_points_by_tag",
  "cm_list_data_points_by_source",
  "cm_get_data_point_usage",
  "cm_get_source_usage",
] as const;

const PIPELINE_EXTRA_TOOLS = [
  "cm_extract_source",
  "cm_save_data_points",
  "cm_enrich_data_points_batch",
  "cm_update_data_points_tags_batch",
  "cm_remove_data_point_tag_batch",
  "cm_save_source_synthesis",
  "cm_update_source_status",
  "cm_add_curator_observation",
  "cm_add_mental_model",
  "cm_get_research_lens",
  "cm_get_data_points_batch",
  "cm_create_theme",
  "cm_create_position",
  "cm_update_position",
  "cm_update_research_lens",
  "cm_create_tag",
  "cm_get_position_arrays",
  "cm_link_evidence_to_position",
  "cm_update_positions_batch",
  "cm_unlink_evidence_from_position",
  "cm_replace_evidence_on_position",
  "cm_correct_anchor",
  "cm_correct_attribution",
  "cm_correct_claim",
  "cm_get_source_corrections",
  "cm_supersede_data_point",
  "cm_supersede_data_points_batch",
  "cm_supersede_source",
  "cm_generate_embeddings",
] as const;

const ADMIN_EXTRA_TOOLS = [
  "cm_update_source_metadata",
  "cm_reset_profile_to_defaults",
  "cm_get_data_point_corrections",
  "cm_get_position_history",
  "cm_retire_tag",
  // Decision 44. Restore is curator-only by design: an extraction sub-agent
  // running the pipeline toolset must not be able to reverse a curator's
  // retirement. The toolsets are cumulative tiers (daily -> pipeline ->
  // admin), so admin is the only set a curator has that pipeline does not.
  // This tier is already where the repair tools live.
  "cm_restore_data_point",
  "cm_restore_data_points_batch",
  "cm_get_lifecycle_history",
  "cm_restore_source",
  "cm_get_source_lifecycle_history",
] as const;

const TOOLSETS: Record<ToolsetName, ReadonlySet<string>> = {
  daily: new Set(DAILY_TOOLS),
  pipeline: new Set([...DAILY_TOOLS, ...PIPELINE_EXTRA_TOOLS]),
  admin: new Set([...DAILY_TOOLS, ...PIPELINE_EXTRA_TOOLS, ...ADMIN_EXTRA_TOOLS]),
  all: new Set(ALL_TOOLS),
};

/** The resolved set of tool names exposed by a given toolset. */
export function getToolsetTools(name: ToolsetName): ReadonlySet<string> {
  return TOOLSETS[name];
}

export function getToolsetName(): ToolsetName {
  const raw = process.env.CURATE_MIND_TOOLSET?.trim().toLowerCase();
  if (raw === "daily" || raw === "pipeline" || raw === "admin" || raw === "all") {
    return raw;
  }
  return "pipeline";
}

/**
 * Wrap the server's registerTool so that (a) tools outside the active toolset
 * are skipped, and (b) the tools that survive are registered in a deterministic
 * order rather than in module-import order.
 *
 * Registrations are buffered rather than passed straight through, because
 * tools/list returns tools in registration order. Buffering lets the returned
 * report function sort by name and register once, so the tool list a client
 * caches is stable no matter how the register* modules are reordered later.
 * The returned function performs the real registration and must be called. It
 * returns a one-line summary for the caller to log, rather than logging itself,
 * because serveStdio may build more than one server instance per process.
 */
export function installToolsetFilter(server: McpServer): () => string {
  const toolsetName = getToolsetName();
  const allowedTools = toolsetName === "all" ? null : TOOLSETS[toolsetName];
  const originalRegisterTool = server.registerTool.bind(server) as any;
  const skippedTools: string[] = [];
  const buffered: Array<{ name: string; args: unknown[] }> = [];

  (server as any).registerTool = (name: string, ...args: unknown[]) => {
    if (allowedTools && !allowedTools.has(name)) {
      skippedTools.push(name);
      return undefined;
    }
    buffered.push({ name, args });
    return undefined;
  };

  return () => {
    (server as any).registerTool = originalRegisterTool;

    // Code point order, not localeCompare: the result must not depend on the
    // machine's locale.
    buffered.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const { name, args } of buffered) {
      originalRegisterTool(name, ...args);
    }

    const exposed = allowedTools ? allowedTools.size : ALL_TOOLS.length;
    return `MCP toolset: ${toolsetName} (${exposed} tools, ${skippedTools.length} hidden)`;
  };
}
