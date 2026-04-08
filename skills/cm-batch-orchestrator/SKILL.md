---
name: cm-batch-orchestrator
description: "Curate Mind Batch Orchestrator. Coordinates extraction across multiple sources by spawning sub-agents. Each source gets three sub-agents (Pass 1, Pass 2, Pass 3) that write directly to Convex. The orchestrator collects compact summaries and flags, then presents a consolidated Pass 4 curator review. Use whenever the user says 'process sources', 'run extraction on all pending', 'extract these sources', 'batch process', or wants to process more than one source through the pipeline."
---

# Curate Mind — Batch Orchestrator

You coordinate the extraction pipeline across multiple sources. Your job is queue management, sub-agent spawning, progress tracking, and presenting the consolidated curator review. You do NOT do extraction yourself — sub-agents do that work and write directly to Convex.

## When to Use This Skill

- User wants to process multiple sources: "process all pending", "extract these 10 sources"
- User wants to run a weekly extraction batch
- Any time more than one source needs the full pipeline

For a single high-value source where the user wants to watch and engage, use **cm-deep-extract** instead.

## Step-by-Step Process

### 1. Build the queue

Determine which sources to process:

**"All pending" or "all indexed":**
Call `cm_list_sources` with the projectId and filter by status `indexed`. Present the list for confirmation.

**Specific sources:**
Verify each exists and is at `indexed` status. Skip any already `extracted`.

**A count ("process the next 5"):**
Call `cm_list_sources` with status `indexed`, present the first N.

Present the queue for confirmation before starting:

```
## Extraction Queue

**Project:** [project name]
**Sources to process:** [count]

| # | Title | Type | Tier | Words |
|---|-------|------|------|-------|
| 1 | [title] | [type] | [tier] | [wordCount] |
| 2 | ... | ... | ... | ... |

Ready to begin?
```

Wait for user confirmation.

### 2. Process each source with sub-agents

For each source, spawn **three sequential sub-agents**. Each sub-agent gets a clean context window and writes directly to Convex.

#### Sub-agent A: Pass 1 (Core Extraction)

Spawn a sub-agent with this prompt:

```
You are running Pass 1 (Core Extraction) for Curate Mind.

Source ID: [sourceId]
Project ID: [projectId]

Follow the Pass 1 instructions from the cm-source-pipeline skill:
1. Call cm_extract_source to get the source text
2. Extract atomic data points with verbatim anchors (10-40 words, target 15-25)
3. Do NOT assign tags (pass empty tagSlugs arrays)
4. Save data points via cm_save_data_points
5. Write a 2-3 paragraph source synthesis and save via cm_save_source_synthesis

Return ONLY this compact result:
- source_title: [title]
- word_count: [n]
- dps_saved: [count]
- dp_ids: [comma-separated list]
- source_synthesis_excerpt: [first 150 chars]
- status: success or failed
- error: [message if failed]
```

Wait for Sub-agent A to complete. If it failed, log the error, skip this source, move to the next.

#### Sub-agent B: Pass 2 (Mental Model Scan)

Spawn a sub-agent with this prompt:

```
You are running Pass 2 (Mental Model Scan) for Curate Mind.

Source ID: [sourceId]

Follow the Pass 2 instructions from the cm-source-pipeline skill:
1. Call cm_extract_source to re-read the full source text
2. Scan for frameworks, analogies, coined terms, metaphors, and principles
3. Do NOT save mental models to Convex — return candidates only

Return ONLY this compact result:
- mental_model_candidates: [count]
- candidates:
  - title: [name] | type: [type] | related_dp_seq: [n] | description: [1-2 sentences]
  - ...
- status: success or failed
```

Wait for Sub-agent B to complete. Its output is small (typically 0-5 candidates).

#### Sub-agent C: Pass 3 (Enrichment)

Spawn a sub-agent with this prompt:

```
You are running Pass 3 (Enrichment) for Curate Mind.

Source ID: [sourceId]
Project ID: [projectId]
DP IDs from Pass 1: [comma-separated list from Sub-agent A]
Mental model candidates from Pass 2:
[paste Sub-agent B's candidates output]

Follow the Pass 3 instructions from the cm-source-pipeline skill:
1. Retrieve DPs from Convex (they were saved in Pass 1)
2. Retrieve source metadata and source synthesis from Convex
3. Retrieve the Research Lens via cm_get_research_lens
4. Assign tags to all DPs (holistic view) — create new tags if needed
5. Enrich each DP with confidence, extraction note, related DP links via cm_enrich_data_point
6. Save mental models to Convex via cm_add_mental_model
7. Compile flags for curator review

Return ONLY this compact result:
- dps_enriched: [count]
- tags_created: [list of new tag slugs]
- mental_models_saved: [count]
- flags_for_review: [count]
- flags:
  - [dpId] | [flag_type] | [brief reason]
  - ...
- status: success or failed
```

Wait for Sub-agent C to complete.

### 3. Collect results

After all three sub-agents complete for a source, merge their outputs into a single source result. Track progress:

```
## Progress: [completed] of [total]

| # | Title | Status | DPs | Models | Flags |
|---|-------|--------|-----|--------|-------|
| 1 | [title] | ✅ Done | 25 | 2 | 3 |
| 2 | [title] | ✅ Done | 12 | 0 | 0 |
| 3 | [title] | 🔄 Processing | — | — | — |
| 4 | [title] | ⏳ Queued | — | — | — |
| 5 | [title] | ❌ Failed | — | — | [error] |
```

Show this progress update to the user after every 3-5 sources complete (not after every single one — that's too noisy).

### 4. Handle failures

If any sub-agent fails:
1. Log the source title and error
2. Leave the source at `indexed` status (do not mark as `extracted` or `failed`)
3. Skip to the next source
4. Include the failure in the final report

### 5. Present consolidated Pass 4 review

After all sources complete, aggregate all flags and hand off to the **cm-curator-review** skill.

Provide the curator review skill with:
- Total sources processed
- Total DPs extracted
- The complete flag list across all sources
- Any failed sources

Then follow the cm-curator-review process for the interactive review.

### 6. Final report

After Pass 4 review is complete:

```
## Batch Extraction Complete

**Project:** [project name]
**Date:** [today]
**Sources processed:** [n] of [total]
**Successful:** [n] | **Failed:** [n]

**Totals:**
- Data points extracted: [total]
- Mental models created: [total]
- New tags created: [list]
- Flags reviewed: [total]

**Failed sources (need manual attention):**
[list with error details, if any]

**Positions flagged for review:**
[list of positions that may need updating, if any]
```

## Concurrency and Context Window Management

**Source processing is sequential** — finish one source completely before starting the next. This is by design for quality.

**Sub-agents within a source are sequential** — Pass 1 must complete before Pass 2, Pass 2 before Pass 3. Each gets its own clean context window.

**Session limits:** After processing ~15-20 sources, consider suggesting the user start a new session to keep the orchestrator's context window clean. The data is safe in Convex — a new session can pick up where this one left off by querying for `indexed` sources.

## First-Source Special Case

If this is the very first extraction in a project (no Research Lens, no existing tags, no positions):

1. Pass 1 runs normally
2. Pass 2 runs normally
3. Pass 3 enrichment runs without a Research Lens — note this in the summary
4. After the first batch completes, suggest the curator:
   - Review the tags created and adjust if needed
   - Consider creating initial Research Themes
   - The Research Lens can be generated after initial positions exist
