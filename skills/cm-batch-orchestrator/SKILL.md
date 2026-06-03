---
name: cm-batch-orchestrator
description: "Curate Mind Batch Extract orchestrator. Coordinates source processing across many sources by spawning sub-agents that run the Extract, Secondary Capture, and Enrich stages, then emits an Extraction Flag Report for the Batch Review chat. Use whenever the user says 'process sources', 'run extraction on all pending', 'extract these sources', 'batch process', 'start the batch extract', or wants to process more than one source through the pipeline."
---

# Curate Mind, Batch Extract orchestrator

You coordinate source processing across many sources. Your job is queue management, sub-agent spawning, progress tracking, and producing the Extraction Flag Report. You do not do the extraction work yourself. Sub-agents do that and write directly to Convex.

For a single high-value source where the curator wants to watch and engage with every stage, use the `cm-deep-extract` skill instead.

## Curator consent contract

This stage runs under the Curator consent contract defined in `skills/cm-workflow-router/SKILL.md`. Read it as binding here. In short:

- The default at every checkpoint is to pause and wait for an explicit curator "yes". Nothing auto-advances.
- Building the queue does not start processing. Detecting `indexed` sources is not permission to extract them. Present the queue and wait for the curator's confirmation before spawning any sub-agent.
- The Extraction Flag Report only reports flags. This stage never adjudicates them. Adjudication is a hard-stop checkpoint handled in `cm-curator-review` with explicit curator decisions.
- Auto-approve is opt-in per stage and per session. It must be requested for one stage, granted explicitly in the current session, and never carries to a later stage or a later session. A past "auto approve as-is" note is not consent. Ignore it.

## Project profile customization (placeholders for future wiring)

The fields below will be read from the project profile by a later schema change (see `Customization_Design_Proposal_2026-05-20.md`, sections 7 and 16). Until that change lands, treat the values in the right column as the defaults applied to every project.

| Field | Default for now | What it controls |
|---|---|---|
| Domain focus | (defer to project description) | Frames what counts as "on topic" when sub-agents select claims to extract. |
| Secondary Capture enabled | true | Whether the Secondary Capture stage runs at all. |
| Secondary Capture label | "Mental Models" | The user-facing name for the Secondary Capture items. |
| Secondary Capture description | "Frameworks, analogies, terms, metaphors, principles." | The seed prompt that tells the Secondary Capture sub-agent what to look for. |
| High-value evidence types | statistic, framework, prediction, case-study, observation, recommendation | The evidence-type taxonomy the Extract sub-agent uses. |
| Tag strategy notes | "Lowercase hyphenated noun phrases. 1 to 4 tags per data point. Prefer specific over generic." | Guides the Enrich sub-agent's tag assignment. |
| Confidence rubric notes | "strong = well-supported and specific. moderate = plausible but lacks strong quantitative backing. suggestive = speculative or anecdotal." | Guides the Enrich sub-agent's confidence calls. |
| Preferred output style | Analytical, concise, no em dashes. | Shapes extraction notes, source synthesis, and progress reports. |

Until the profile wiring lands, this skill uses the defaults above. When the wiring lands, the values come from a `cm_get_project_profile` call at the start of the orchestrator.

## When to use this skill

- The curator wants to process several sources at once: "process all pending", "extract these ten sources".
- The curator wants to run a batch (any number of sources from a handful to several dozen).
- Any time more than one source needs to move through the full pipeline.

For a single high-value source the curator wants to engage with closely, use the `cm-deep-extract` skill instead.

## Open every activation with the three-block signpost

Before doing any work, emit these three blocks in order. They tell the curator where they are, what this chat does, and what comes next. The same three-block pattern is required at every cross-chat handoff later in the workflow.

```
## Where you are in the process

You are in the Batch Extract stage of the Curate Mind workflow. Batch Extract is the first of three stages: Batch Extract, then Batch Review, then Batch Integrate. Each runs in its own chat.

## What happens in this chat

This chat reads the sources you have queued, then for each source runs three sub-agents in sequence: Extract (pulls atomic claims with verbatim anchor quotes and writes a short source synthesis), Secondary Capture (rereads the source with a fresh context window and captures the configured secondary item type, default "Mental Models"), and Enrich (loads the data points back from Convex and applies tags, confidence, extraction notes, and links between related data points). Each sub-agent writes its results to Convex directly. This chat closes by producing the Extraction Flag Report, which lists only the items that need a human judgment call.

## What comes next

After this chat finishes, you will open a new chat and paste the Extraction Flag Report into the Batch Review stage. I will give you the exact copy-paste opener at the end of this chat. Batch Review is where you walk through the flagged items and produce the Decisions Document that drives Batch Integrate.
```

## Three-chat workflow (default for multi-source batches)

Processing a multi-source batch runs across three separate chats. Each chat holds a different work shape and hands off via a compact artifact.

```
Batch Extract  (this chat)
        |
        v
[Extraction Flag Report]
        |
        v
Batch Review   (cm-curator-review)
        |
        v
[Decisions Document]
        |
        v
Batch Integrate (cm-evidence-linker)
```

**When to use three-chat mode:** Any batch with more than five sources, or any batch where mixed-quality flags are expected. Splitting the work across chats keeps each chat's context focused on one kind of task and means a rate-limit hit during extraction does not abort curator work.

**When single-chat mode is acceptable:** Small batches (five sources or fewer, low-complexity material) where the curator wants speed over isolation. In single-chat mode, invoke `cm-curator-review` directly after step 5 instead of emitting the Extraction Flag Report as a cross-chat handoff.

**How the handoffs work:**
- Batch Extract (this skill) closes by emitting the Extraction Flag Report with a ready-to-paste opener for Batch Review.
- Batch Review (`cm-curator-review`) closes by emitting the Decisions Document with a ready-to-paste opener for Batch Integrate.
- The curator does not need to remember commands. Each chat tells them exactly how to start the next one.

## Step by step

### 1. Build the queue

Determine which sources to process.

- "All pending" or "all indexed": call `cm_list_sources` with the project identifier and filter for status `indexed`. Present the list and ask the curator to confirm.
- A specific list: verify each source exists and is at `indexed` status. Skip any already at `extracted`.
- A count ("process the next five"): call `cm_list_sources` with status `indexed` and present the first N entries.

Present the queue for confirmation before starting:

```
## Extraction queue

Project: [project name]
Sources to process: [count]
Sources in parallel: 2 by default. Say "four sources at a time" to run faster at higher token-per-minute cost.

| # | Title | Type | Tier | Word count |
|---|-------|------|------|------------|
| 1 | [title] | [type] | [tier] | [word count] |
| 2 | ... | ... | ... | ... |

Ready to begin?
```

Wait for the curator to confirm.

### 2. Process each source with sub-agents

For each source, spawn sub-agents in sequence. Each sub-agent gets a clean context window and writes its results directly to Convex. The number of sub-agents per source depends on whether Secondary Capture is enabled in the project profile.

- **Sub-agent A: Extract** (always runs)
- **Sub-agent B: Secondary Capture** (only when enabled; default is "Mental Models")
- **Sub-agent C: Enrich** (always runs, depends on Extract and on Secondary Capture if enabled)

Secondary Capture runs in its own sub-agent with a fresh context window. This is deliberate: the original architecture intent was that pattern recognition for the secondary item type should not be contaminated by the structured extraction frame. The cost is one extra source-text load per source. Projects that disable Secondary Capture skip that cost entirely.

#### Sub-agent A: Extract

Spawn a sub-agent with this prompt:

```
You are running the Extract stage for Curate Mind.

Source identifier: [source identifier]
Project identifier: [project identifier]

Do not invoke any skill file. Follow only the instructions below.

1. Call cm_extract_source to get the source text and metadata.

2. Assess document size:
   - Under 15,000 words: process as one unit.
   - 15,000 to 30,000 words: split into 2 chunks at natural section breaks.
   - Over 30,000 words: chunks of about 10,000 words. Maintain a running sequence number across chunks.

3. Extract atomic data points. Each data point is a single, specific claim worth capturing as evidence.
   - Target 8 to 15 data points per 2,000-word article; 25 to 50 per 10,000-word report.
   - Skip generic filler, repetition, background context, and marketing language.
   - High-value evidence types: statistic, framework, prediction, case-study, observation, recommendation.
   - For each data point produce:
     - claimText: 1 to 3 sentences in your own words. Stands alone without source context.
     - anchorQuote: 10 to 40 words copied verbatim from the source (target 15 to 25). Capture the author's reasoning, not just the conclusion. Must appear word-for-word in the source.
     - evidenceType: one of the high-value types above.
     - locationType: paragraph, page, timestamp, or section.
     - locationStart: e.g., "paragraph 12", "section: Enterprise Adoption".
     - dpSequenceNumber: start at 1, increment per data point.
   - Do not assign tags. Pass an empty tag list for every data point. Tags are assigned during Enrich.

4. Call cm_save_data_points with the source identifier and the full data point array. Record the returned data point identifiers.

5. Write a source synthesis of 2 to 3 paragraphs:
   - Paragraph 1: central argument or thesis, and its evidence structure.
   - Paragraph 2: key tensions, surprises, or notable methodology. What makes this source distinctive.
   - Paragraph 3: strategic implications for the project's research domain.
   Call cm_save_source_synthesis with the source identifier and the synthesis text. Do not use em dashes in the synthesis.

Return only this compact result:
- source_title: [title]
- word_count: [n]
- data_points_saved: [count]
- data_point_identifiers: [comma-separated list]
- source_synthesis_excerpt: [first 150 characters]
- status: success or failed
- error: [message if failed]
```

Wait for Sub-agent A to complete. If it failed, log the error, skip this source, and move to the next.

#### Sub-agent B: Secondary Capture

Run this sub-agent only when Secondary Capture is enabled in the project profile (default: enabled, with label "Mental Models").

Spawn a sub-agent with this prompt. The Secondary Capture description (defaulting to "Frameworks, analogies, terms, metaphors, principles") substitutes into the body of the prompt; the structure stays the same.

```
You are running the Secondary Capture stage for Curate Mind.

Source identifier: [source identifier]
Project identifier: [project identifier]
Secondary Capture label: Mental Models
Secondary Capture description: [the seed description from the project profile, defaulting to "Frameworks, analogies, terms, metaphors, principles."]

Do not invoke any skill file. Your context window is fresh, deliberately. Follow only the instructions below.

1. Call cm_extract_source again to retrieve the source text and metadata.

2. Scan the entire source text for candidates matching the Secondary Capture description before selecting any.
   - For the default Mental Models configuration, candidate types include:
     - framework: named models, typologies, structured ways of thinking.
     - analogy: comparisons that illuminate a concept.
     - term: coined or specialized vocabulary.
     - metaphor: figurative language capturing a complex idea.
     - principle: rules of thumb or guiding statements.
   - After scanning the full source, rank all candidates by:
     (a) novelty: is this a named thing, or a restatement of a common idea?
     (b) distinctiveness: would a strategist remember and reuse this?
   - Keep the top 3 to 5 ranked candidates only. Commentary articles often produce 0.

3. For each kept candidate note:
   - title (short noun phrase)
   - type (e.g., framework, analogy, term, metaphor, principle for the Mental Models default)
   - description (2 to 4 sentences)
   - related_dp_seq: which data point sequence number from the Extract stage is most closely associated.

4. Do not save anything to Convex during this stage. Return candidates only. The Enrich sub-agent will persist them after cross-checking the Research Lens.

Return only this compact result:
- source_title: [title]
- candidates_found: [count]
- candidates:
  - title: [name] | type: [type] | related_dp_seq: [n] | description: [1 to 2 sentences]
  - ...
- status: success or failed
- error: [message if failed]
```

Wait for Sub-agent B to complete. If Secondary Capture is disabled for this project, skip Sub-agent B entirely and tell Sub-agent C that no candidates were captured.

#### Sub-agent C: Enrich

Spawn a sub-agent with this prompt:

```
You are running the Enrich stage for Curate Mind.

Source identifier: [source identifier]
Project identifier: [project identifier]
Data point identifiers from Extract: [comma-separated list]
Secondary Capture candidates: [paste Sub-agent B's candidate output here, or "none captured" if Secondary Capture is disabled or returned no candidates]

Do not invoke any skill file. Follow only the instructions below.

1. Retrieve all data points in one call: cm_get_data_points_batch with the full identifier list above.

2. Retrieve the Research Lens: call cm_get_research_lens with the project identifier. If none exists, proceed without it and note this in your summary.

3. Assign tags holistically. Collect all assignments in memory. Do not call any tool yet.
   - 1 to 4 tags per data point, at least one per data point.
   - Lowercase hyphenated noun phrases: agentic-workflows, enterprise-adoption, cost-optimization.
   - Prefer specific over generic. Reuse existing project tags when they fit.
   - Create new tags with cm_create_tag only when no existing tag fits. Call cm_create_tag immediately when needed so the slug exists before the batch write.
   - Record each data point's final tag assignment as {dataPointId, tagSlugs}.

4. Enrich all data points holistically. Collect all enrichment in memory. Do not call any tool yet.
   - confidence: strong, moderate, or suggestive.
     - strong: well-supported, specific, backed by data or clear reasoning.
     - moderate: plausible but lacks strong quantitative backing. Most common.
     - suggestive: speculative, anecdotal, or limited credibility on this topic.
   - extractionNote (1 to 3 sentences): connect this data point to existing Research Positions, open questions in the Research Lens, or argument chains with other data points. Do not summarize the claim. Add curatorial value. Do not use em dashes.
   - relatedDataPoints: data point identifiers from the same source that form an argument chain.
   - Record each data point's enrichment as {dataPointId, confidence, extractionNote, relatedDataPoints?}.

5. Write in two batch calls. Do not use the single-data-point versions of these tools.
   (a) cm_update_data_points_tags_batch: all tag assignments collected in step 3.
   (b) cm_enrich_data_points_batch: all enrichment collected in step 4.

6. Persist Secondary Capture items. For each candidate from the Secondary Capture stage, check the Research Lens for duplicates. If novel, call cm_add_mental_model with title, modelType, description, source identifier, and related data point identifier.
   (For now, every Secondary Capture project uses the Mental Models default and the cm_add_mental_model tool. A future change will route non-default capture types into a dedicated table.)

7. Flag items for the Review stage. Flag conservatively. Only flag items that genuinely need human judgment.
   - confidence-mismatch: Tier 1 source with a suggestive signal, or Tier 3 source with a strong signal.
   - position-contradiction: data point contradicts a current Research Position (per the Research Lens).
   - anchor-concern: the anchor quote seems imprecise or could not be verified.
   - novel-signal: the data point introduces a concept with no connection to any existing position.

Return only this compact result:
- data_points_enriched: [count]
- tags_created: [list of new tag slugs]
- secondary_capture_items_saved: [count]
- flags_for_review: [count]
- flags:
  - [data point identifier] | [flag_type] | [brief reason]
  - ...
- status: success or failed
```

Wait for Sub-agent C to complete.

### 3. Collect results

After all sub-agents complete for a source, merge their outputs into a single source result. Track progress:

```
## Progress: [completed] of [total]

| # | Title | Status | Data points | Secondary Capture items | Flags |
|---|-------|--------|-------------|-------------------------|-------|
| 1 | [title] | Done | 25 | 2 | 3 |
| 2 | [title] | Done | 12 | 0 | 0 |
| 3 | [title] | Processing | (pending) | (pending) | (pending) |
| 4 | [title] | Queued | (pending) | (pending) | (pending) |
| 5 | [title] | Failed | (pending) | (pending) | [error] |
```

Show this progress update to the curator after every 3 to 5 sources complete. Do not report after every single source. That is too noisy.

### 4. Handle failures

If any sub-agent fails:
1. Log the source title and the error message.
2. Leave the source at `indexed` status. Do not mark it as `extracted` or `failed`.
3. Skip to the next source.
4. Include the failure in the final report.

### Flag taxonomy for the Extraction Flag Report

When presenting the Extraction Flag Report, group all flags into four categories. Present Group A first, then Group B, then Group C, then Group D. This order matches decision impact and lets the curator's commentary on Groups A and B inform their judgment on Groups C and D.

| Group | Flag type | Decision guidance |
|-------|-----------|-------------------|
| A | position-contradiction | Potential counter-evidence or position thesis revision. The curator decides: add to counter-evidence, update stance, or create a competing position. |
| B | novel-signal | Potential new position or curator observation. The curator decides: create a new position, save a curator observation, or hold for more evidence before acting. |
| C | confidence-mismatch | Curator judgment call. Usually no data point change is needed. May indicate a source credibility concern or an edge case in the tier-versus-confidence rubric. |
| D | anchor-concern | Verbatim quote issue. Cite this data point with a caveat, or flag it for re-extraction if the anchor cannot be verified against the source text. |

For each group, present all flagged data points in a table (data point identifier, source title, brief flag reason). Invite the curator's commentary before moving to the next group.

### 5. Emit the Extraction Flag Report (Batch Extract close)

After all sources complete, aggregate all flags and emit the Extraction Flag Report. This is the closing artifact for the Batch Extract stage. Present it in full so the curator can copy it into the Batch Review chat.

```
## Extraction Flag Report, [date]

Project: [project name]   Batch: [date range]
Sources processed: [n]    Failed: [n]
Total data points: [n]    Total flags: [n]

### Group A, Position contradictions ([n])

| Data point identifier | Source title | Claim (abbreviated) | Contradicts position | Flag reason |
|---|---|---|---|---|
| [identifier] | [title] | [first 80 chars] | [position title] | [brief reason] |

### Group B, Novel signals ([n])

| Data point identifier | Source title | Claim (abbreviated) | Flag reason |
|---|---|---|---|
| [identifier] | [title] | [first 80 chars] | [brief reason] |

### Group C, Confidence mismatch ([n])

| Data point identifier | Source title | Source tier | Assigned confidence | Flag reason |
|---|---|---|---|---|
| [identifier] | [title] | [tier] | [confidence] | [brief reason] |

### Group D, Anchor concerns ([n])

| Data point identifier | Source title | Anchor (abbreviated) | Concern |
|---|---|---|---|
| [identifier] | [title] | "[first 60 chars]" | [brief concern] |

### Source summary

| Source title | Data points | Secondary Capture items | Flags | Outcome |
|---|---|---|---|---|
| [title] | [n] | [n] | [n] | Processed |
| [title] | (none) | (none) | (none) | Failed: [error] |
```

Then present the Batch Review opener:

```
Batch Extract is complete.

To start the Batch Review chat, open a new chat and paste the line below, followed by the Extraction Flag Report above.

    Start the Batch Review stage for Curate Mind
```

**Single-chat mode only:** For batches of five sources or fewer, skip the opener and invoke the `cm-curator-review` skill directly to continue in this chat.

### 6. Final report (single-chat mode only)

After `cm-curator-review` completes in the same chat:

```
## Batch extraction complete

Project: [project name]
Date: [today]
Sources processed: [n] of [total]
Successful: [n]   Failed: [n]

Totals:
- Data points extracted: [total]
- Secondary Capture items saved: [total]
- New tags created: [list]
- Flags reviewed: [total]

Failed sources (need manual attention):
[list with error details, if any]

Positions flagged for review:
[list of positions that may need updating, if any]
```

## Parallelism and context window management

**Source-level parallelism: two by default.** Process two sources in parallel. Start both, collect their sub-agent results, then start the next two. This balances throughput against token-per-minute consumption. To run four sources in parallel (faster, higher token-per-minute cost), the curator must explicitly request it at queue confirmation ("four sources at a time").

**Sub-agents within a source are sequential.** Extract must complete before Secondary Capture, and Enrich depends on the data point identifiers from Extract and the candidate output from Secondary Capture.

**Session limits.** After processing about 15 to 20 sources, consider suggesting the curator start a new session to keep the orchestrator's context window clean. The data is safe in Convex. A new session can pick up where this one left off by querying for `indexed` sources.

## First-source special case

If this is the very first extraction in a project (no Research Lens, no existing tags, no positions):

1. Sub-agent A (Extract) runs normally.
2. Sub-agent B (Secondary Capture) runs normally if enabled. Otherwise skipped.
3. Sub-agent C (Enrich) runs without a Research Lens. Note this in the summary.
4. After the first batch completes, suggest that the curator:
   - Reviews the tags created and adjusts if needed.
   - Considers creating initial Research Themes.
   - Generates the Research Lens after initial positions exist.
