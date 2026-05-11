---
name: cm-batch-orchestrator
description: "Curate Mind Batch Orchestrator. Coordinates extraction across multiple sources by spawning sub-agents. Each source gets two sub-agents (Pass 1+2 combined, then Pass 3) that write directly to Convex. The orchestrator collects compact summaries and flags, then presents a consolidated Pass 4 curator review. Use whenever the user says 'process sources', 'run extraction on all pending', 'extract these sources', 'batch process', or wants to process more than one source through the pipeline."
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
**Batch size:** 2 sources in parallel (default). Say "4 sources at a time" to run faster at higher TPM cost.

| # | Title | Type | Tier | Words |
|---|-------|------|------|-------|
| 1 | [title] | [type] | [tier] | [wordCount] |
| 2 | ... | ... | ... | ... |

Ready to begin?
```

Wait for user confirmation.

### 2. Process each source with sub-agents

For each source, spawn **two sequential sub-agents**. Each gets a clean context window and writes directly to Convex.

#### Sub-agent 1: Pass 1 + Pass 2 (Extraction and Mental Model Scan)

Spawn a sub-agent with this prompt:

```
You are running Pass 1 and Pass 2 (Extraction and Mental Model Scan) for Curate Mind.

Source ID: [sourceId]
Project ID: [projectId]

Do NOT invoke any skill file. Follow ONLY these instructions:

--- PASS 1: Core Extraction ---

1. Call cm_extract_source to get the source text and metadata.

2. Assess document size:
   - Under 15,000 words: process as one unit
   - 15,000–30,000 words: 2 chunks at natural section breaks
   - Over 30,000 words: chunks of ~10,000 words, maintaining a running dpSequenceNumber across chunks

3. Extract atomic data points — each a single, specific claim worth capturing as evidence.
   - Target 8-15 DPs per 2,000-word article; 25-50 per 10,000-word report.
   - Skip generic filler, repetition, background context, and marketing language.
   - High-value types: statistics, named frameworks, predictions with timeframes, case studies with outcomes, specific recommendations, notable observations.
   - For each DP produce:
     - claimText: 1-3 sentences in your words, stands alone without source context
     - anchorQuote: 10-40 words copied verbatim from the source (target 15-25). Capture the author's reasoning, not just the conclusion. Must appear word-for-word in the source.
     - evidenceType: statistic | framework | prediction | case-study | observation | recommendation
     - locationType: paragraph | page | timestamp | section
     - locationStart: e.g., "paragraph 12", "section: Enterprise Adoption"
     - dpSequenceNumber: start at 1, increment
   - Do NOT assign tags. Pass empty tagSlugs arrays [] for every DP.

4. Call cm_save_data_points with the sourceId and full DP array. Record the returned DP IDs.

5. Write a source synthesis (2-3 paragraphs):
   - Para 1: Central argument/thesis and its evidence structure.
   - Para 2: Key tensions, surprises, or notable methodology — what makes this source distinctive.
   - Para 3: Strategic implications for AI strategy and adoption.
   Call cm_save_source_synthesis with sourceId and synthesis text.

--- PASS 2: Mental Model Scan ---

The source text from Pass 1 is already in your context. Do NOT call cm_extract_source again.

6. Scan the ENTIRE source text for mental model candidates before selecting any:
   - framework: Named models, typologies, structured ways of thinking (e.g., "The seven workforce archetypes")
   - analogy: Comparisons that illuminate a concept (e.g., "AI agents are like interns, check their work")
   - term: Coined or specialized vocabulary (e.g., "context engineering")
   - metaphor: Figurative language capturing a complex idea (e.g., "the implementation chasm")
   - principle: Rules of thumb or guiding statements (e.g., "Automate the workflow, not the task")
   - After scanning the full source, rank all candidates by: (1) novelty — is this a named thing or a restatement of a common idea? (2) distinctiveness — would a strategist remember and reuse this? Keep the top 3-5 ranked candidates only. Commentary articles often produce 0.
   - For each kept candidate note: title, type, 2-4 sentence description, and which dpSequenceNumber it's most closely associated with.
   - Do NOT save anything to Convex — return candidates only.

Return ONLY this compact result:
- source_title: [title]
- word_count: [n]
- dps_saved: [count]
- dp_ids: [comma-separated list]
- source_synthesis_excerpt: [first 150 chars]
- mental_model_candidates: [count]
- candidates:
  - title: [name] | type: [type] | related_dp_seq: [n] | description: [1-2 sentences]
  - ...
- status: success or failed
- error: [message if failed]
```

Wait for Sub-agent 1 to complete. If it failed, log the error, skip this source, move to the next.

#### Sub-agent 2: Pass 3 (Enrichment)

Spawn a sub-agent with this prompt:

```
You are running Pass 3 (Enrichment) for Curate Mind.

Source ID: [sourceId]
Project ID: [projectId]
DP IDs from Pass 1: [comma-separated list from Sub-agent 1]
Mental model candidates from Pass 2:
[paste Sub-agent 1's candidates output]

Do NOT invoke any skill file. Follow ONLY these instructions:

1. Retrieve ALL DPs in ONE call: cm_get_data_points_batch with the full DP ID list above.
2. Retrieve the Research Lens: call cm_get_research_lens with projectId. If none exists, proceed without it and note this in your summary.

3. Assign tags holistically — collect all assignments in memory. Do NOT call any tool yet.
   - 1-4 tags per DP, at least one per DP
   - Lowercase hyphenated: agentic-workflows, enterprise-adoption, cost-optimization
   - Prefer specific over generic; reuse existing project tags when they fit
   - Create new tags with cm_create_tag only when no existing tag fits (call cm_create_tag immediately when needed so the slug exists before the batch write)
   - Record each DP's final tag assignment: {dataPointId, tagSlugs[]}

4. Enrich all DPs holistically — collect all enrichment in memory. Do NOT call any tool yet.
   - confidence: strong | moderate | suggestive
     - strong: well-supported, specific, backed by data or clear reasoning
     - moderate: plausible but lacks strong quantitative backing (most common)
     - suggestive: speculative, anecdotal, or limited credibility on this topic
   - extractionNote (1-3 sentences): connect this DP to existing Research Positions, open questions in the Research Lens, or argument chains with other DPs. Do not summarize the claim — add curatorial value. Do not use em dashes.
   - relatedDataPoints: DP IDs from same source that form argument chains
   - Record each DP's enrichment: {dataPointId, confidence, extractionNote, relatedDataPoints?}

5. Write in two batch calls (do NOT use the single-DP versions of these tools):
   a. cm_update_data_points_tags_batch — pass all tag assignments collected in step 3
   b. cm_enrich_data_points_batch — pass all enrichment data collected in step 4

6. Save mental models: for each candidate from Pass 2, check Research Lens for duplicates. If novel, call cm_add_mental_model with title, modelType, description, sourceId, and sourceDataPointId.

7. Flag for curator review (flag conservatively — only items that genuinely need human judgment):
   - confidence-mismatch: Tier 1 source + suggestive signal, or Tier 3 + strong
   - position-contradiction: DP contradicts a current Research Position (per Research Lens)
   - anchor-concern: anchor quote seems imprecise or could not be verified
   - novel-signal: DP introduces a concept with no connection to any existing position

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

Wait for Sub-agent 2 to complete.

### 3. Collect results

After both sub-agents complete for a source, merge their outputs into a single source result. Track progress:

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

### Pass 4 Flag Taxonomy

When presenting the consolidated curator review, group all flags into four categories. Present Group A first, then B, then C, then D — this order matches decision impact and allows the curator's commentary on A and B to inform judgment on C and D.

| Group | Flag type | Decision guidance |
|-------|-----------|-------------------|
| A | `position-contradiction` | Potential counter-evidence or position thesis revision. Curator decides: add to counter-evidence array, update stance, or create a competing position. |
| B | `novel-signal` | Potential new position or observation. Curator decides: create new position, save a curator observation, or hold for more evidence before acting. |
| C | `confidence-mismatch` | Curator judgment call; usually no DP change needed. May indicate source credibility concern or an edge case in the tier-confidence heuristic. |
| D | `anchor-concern` | Analyst-protocol issue. Cite this DP with a caveat, or flag for re-extraction if the anchor cannot be verified against the source text. |

For each group, present all flagged DPs in a table (dpId, source title, brief flag reason), then invite the curator's commentary before moving to the next group.

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

**Source-level parallelism: 2 by default.** Process 2 sources in parallel — start both, collect their sub-agent results, then start the next 2. This balances throughput against TPM consumption. To run 4 sources in parallel (faster, higher TPM cost), the user must explicitly request it at queue confirmation ("4 sources at a time").

**Sub-agents within a source are sequential** — Sub-agent 1 (Pass 1+2) must complete before Sub-agent 2 (Pass 3). Sub-agent 2 depends on the DP IDs and mental model candidates from Sub-agent 1.

**Session limits:** After processing ~15-20 sources, consider suggesting the user start a new session to keep the orchestrator's context window clean. The data is safe in Convex — a new session can pick up where this one left off by querying for `indexed` sources.

## First-Source Special Case

If this is the very first extraction in a project (no Research Lens, no existing tags, no positions):

1. Sub-agent 1 (Pass 1+2) runs normally
2. Sub-agent 2 (Pass 3) runs without a Research Lens — note this in the summary
3. After the first batch completes, suggest the curator:
   - Review the tags created and adjust if needed
   - Consider creating initial Research Themes
   - The Research Lens can be generated after initial positions exist
