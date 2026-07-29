# MCP Tool Inventory

This inventory reflects the registered Curate Mind MCP tools in `mcp/src/tools/`.

Users should normally start with the `cm-workflow-router` skill rather than this inventory. The inventory is for agents, debugging, and maintenance.

The MCP server filters the visible tools with `CURATE_MIND_TOOLSET`:

| Toolset | Count | Intended use |
|---|---:|---|
| `daily` | 27 | Simple project setup, source intake, review, browsing, and questions |
| `pipeline` | 55 | Default curator workflow: intake, extraction, enrichment, evidence linking, corrections, and questions |
| `admin` | 60 | Repair, correction history, reset, and retirement tools included |
| `all` | 60 | Debug mode; registers every tool without filtering |

If `CURATE_MIND_TOOLSET` is unset, the MCP server uses `pipeline`.

Toolset membership is defined in `mcp/src/toolsets.ts`. A tool must be listed in `ALL_TOOLS` there in addition to being registered in `mcp/src/tools/`, because `ALL_TOOLS` is the superset backing every toolset. A registered tool that is missing from `ALL_TOOLS` is hidden in all four toolsets, including `all`. `mcp/src/toolRegistry.test.ts` fails if the registered tools and `ALL_TOOLS` ever drift apart, so update both when adding a tool.

The public research pack tool (`cm_get_research_pack` in `mcp/src/tools/public.ts`) is served by the separate public HTTP server and is not part of these toolsets.

## Daily Tools

Use these for normal interaction with an assistant. Users can prompt in plain language; agents choose these tools.

| Tool | Purpose |
|---|---|
| `cm_list_projects` | List projects available in the instance |
| `cm_create_project` | Create a new top-level project |
| `cm_get_project_profile` | Read the active project's domain, audience, vocabulary, and workflow settings |
| `cm_update_project_profile` | Save approved project-profile changes |
| `cm_get_user_preferences` | Read writing style preferences |
| `cm_update_user_preferences` | Save approved writing style changes |
| `cm_preview_prompt_profile` | Preview the assembled prompt profile |
| `cm_validate_profile` | Check project and user preferences for issues |
| `cm_fetch_url` | Fetch an article or web page into local markdown for review |
| `cm_fetch_youtube` | Fetch a YouTube transcript into local markdown for review |
| `cm_extract_pdf` | Convert a local PDF into a reviewable markdown wrapper |
| `cm_add_source` | Ingest reviewed source text into Convex |
| `cm_review_queue` | Show local source files waiting for review |
| `cm_ask` | Cite-and-trace answer using Stance, Evidence, and Source |
| `cm_search` | Explore the corpus for signals and patterns |
| `cm_get_themes` | List research themes |
| `cm_get_positions` | List research positions |
| `cm_get_position_detail` | Read one position with linked evidence |
| `cm_get_data_point` | Read one data point |
| `cm_get_source` | Read source metadata without full text |
| `cm_get_source_text` | Read full source text for curator verification |
| `cm_get_tag_trends` | Read project-scoped tag usage counts |
| `cm_list_sources` | List sources by project and optional status |
| `cm_get_data_points_by_tag` | Retrieve project-scoped data points for a tag |
| `cm_list_data_points_by_source` | List data points extracted from one source |
| `cm_get_data_point_usage` | Show where one data point is used across positions |
| `cm_get_source_usage` | Show the blast radius of one source across the corpus |

## Pipeline Tools

The `pipeline` toolset includes every daily tool plus these tools for extraction, enrichment, evidence linking, and logged corrections.

| Tool | Purpose |
|---|---|
| `cm_extract_source` | Read full source text and extraction metadata |
| `cm_save_data_points` | Save Extract-stage data points |
| `cm_enrich_data_points_batch` | Add confidence, extraction notes, and related DP links |
| `cm_update_data_points_tags_batch` | Add Enrich-stage tags in batch |
| `cm_remove_data_point_tag_batch` | Remove one tag from multiple data points |
| `cm_save_source_synthesis` | Save the source-level synthesis |
| `cm_update_source_status` | Mark source status as indexed, extracted, or failed |
| `cm_add_curator_observation` | Create an immutable curator observation |
| `cm_add_mental_model` | Create an immutable mental model |
| `cm_get_research_lens` | Read the current Research Lens for Enrich |
| `cm_get_data_points_batch` | Fetch multiple data points in one compact call |
| `cm_create_theme` | Create a research theme |
| `cm_create_position` | Create a research position |
| `cm_update_position` | Create a full new position version |
| `cm_update_research_lens` | Regenerate the Research Lens |
| `cm_create_tag` | Create a project-scoped tag |
| `cm_get_position_arrays` | Read current evidence arrays only |
| `cm_link_evidence_to_position` | Add evidence to one position without changing stance |
| `cm_update_positions_batch` | Add evidence to multiple positions atomically |
| `cm_unlink_evidence_from_position` | Remove one evidence item from a position |
| `cm_replace_evidence_on_position` | Swap one evidence item for another on a position |
| `cm_correct_anchor` | Correct data point anchor text with a correction log |
| `cm_correct_attribution` | Correct source metadata or DP speaker attribution with a correction log |
| `cm_correct_claim` | Correct data point claim text with a correction log, within a 0.5x to 2x length guard, and reset the embedding for reindexing (Decision 37) |
| `cm_get_source_corrections` | Read the correction history for a source |
| `cm_supersede_data_point` | Retire a data point, or replace it with another, append-only |
| `cm_supersede_source` | Link a re-ingested source to the one it replaces |
| `cm_generate_embeddings` | Generate pending embeddings |

## Admin And Compatibility Tools

These are hidden from the default `pipeline` surface. Use `CURATE_MIND_TOOLSET=admin` only when the user explicitly needs repair or compatibility operations.

| Tool | Purpose |
|---|---|
| `cm_update_source_metadata` | Repair source metadata after ingestion |
| `cm_reset_profile_to_defaults` | Reset project and/or user profile data |
| `cm_get_data_point_corrections` | Audit correction history for a data point |
| `cm_get_position_history` | Read full position version history |
| `cm_retire_tag` | Retire a tag slug and redirect it |
