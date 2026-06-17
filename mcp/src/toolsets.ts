import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

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
  "cm_correct_anchor",
  "cm_correct_attribution",
  "cm_supersede_data_point",
  "cm_supersede_source",
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
  "cm_correct_anchor",
  "cm_supersede_data_point",
  "cm_supersede_source",
  "cm_generate_embeddings",
] as const;

const ADMIN_EXTRA_TOOLS = [
  "cm_update_source_metadata",
  "cm_remove_data_point_tag_batch",
  "cm_reset_profile_to_defaults",
  "cm_get_data_point_corrections",
  "cm_get_position_history",
  "cm_retire_tag",
  "cm_correct_attribution",
] as const;

const TOOLSETS: Record<ToolsetName, ReadonlySet<string>> = {
  daily: new Set(DAILY_TOOLS),
  pipeline: new Set([...DAILY_TOOLS, ...PIPELINE_EXTRA_TOOLS]),
  admin: new Set([...DAILY_TOOLS, ...PIPELINE_EXTRA_TOOLS, ...ADMIN_EXTRA_TOOLS]),
  all: new Set(ALL_TOOLS),
};

export function getToolsetName(): ToolsetName {
  const raw = process.env.CURATE_MIND_TOOLSET?.trim().toLowerCase();
  if (raw === "daily" || raw === "pipeline" || raw === "admin" || raw === "all") {
    return raw;
  }
  return "pipeline";
}

export function installToolsetFilter(server: McpServer): () => void {
  const toolsetName = getToolsetName();
  if (toolsetName === "all") {
    return () => console.error(`MCP toolset: all (${ALL_TOOLS.length} tools)`);
  }

  const allowedTools = TOOLSETS[toolsetName];
  const originalRegisterTool = server.registerTool.bind(server) as any;
  const skippedTools: string[] = [];

  (server as any).registerTool = (name: string, ...args: any[]) => {
    if (!allowedTools.has(name)) {
      skippedTools.push(name);
      return undefined;
    }
    return originalRegisterTool(name, ...args);
  };

  return () => {
    console.error(
      `MCP toolset: ${toolsetName} (${allowedTools.size} tools, ${skippedTools.length} hidden)`
    );
  };
}
