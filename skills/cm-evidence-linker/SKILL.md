---
name: cm-evidence-linker
description: "Curate Mind Weekly Integrate stage. Executes a Decisions Document from Weekly Review (saving curator observations, creating new positions, updating existing positions with new evidence), then optionally continues with tag-based evidence linking. Use when the user pastes a Decisions Document, says 'Start the Weekly Integrate stage for Curate Mind', 'integrate decisions', or 'link evidence'."
---

# Curate Mind, Weekly Integrate stage

You execute the Decisions Document produced in Weekly Review, then optionally continue with tag-based evidence linking to connect remaining data points to positions.

**Reference:** `Architecture_Spec.md` Evidence Linking Pattern. Design Decisions 27, 28, 29.

## Project profile customization (placeholders for future wiring)

The fields below will be read from the project profile by a later schema change (see `Customization_Design_Proposal_2026-05-20.md`, sections 7 and 16). Until that change lands, use the defaults in the right column.

| Field | Default for now | What it controls |
|---|---|---|
| Domain focus | (defer to project description) | Frames what evidence is meaningfully "on topic" when linking data points to positions. |
| Tag strategy notes | "Lowercase hyphenated noun phrases. Prefer specific tags with high density of new-tier data points." | Guides tag selection during evidence linking. |
| Confidence rubric notes | "strong = well-supported and specific. moderate = plausible but lacks strong quantitative backing. suggestive = speculative or anecdotal." | Anchors the curator's promotion decisions. |
| Preferred output style | Concise, analytical, no em dashes. | Shapes change summaries and stance notes. |

When the profile wiring lands, these values come from a `cm_get_project_profile` call at the start of this skill.

## When to use this skill

- The curator pastes a Decisions Document and says "Start the Weekly Integrate stage for Curate Mind".
- The curator says "integrate decisions" or "link evidence".
- Any standalone session for tag-based evidence linking after an extraction wave.

## Open every activation with the three-block signpost

Before doing any execution, emit these three blocks in order.

```
## Where you are in the process

You are in the Weekly Integrate stage of the Curate Mind workflow. Weekly Extract produced the Extraction Flag Report. Weekly Review turned that report into the Decisions Document you pasted in. Weekly Integrate is the last stage in the weekly batch.

## What happens in this chat

This chat executes the Decisions Document. It saves the curator observations, creates the new positions, updates the existing positions with new evidence, and regenerates the Research Lens if you asked for that in the document. After the document is fully executed, you can optionally continue with tag-based evidence linking, which connects remaining data points to positions using tags rather than per-source review.

## What comes next

When this chat finishes, the weekly batch is closed for this week. The next thing to do is either start a new Weekly Extract chat for the next batch of pending sources, or open a Curate Mind chat against the corpus to query, write, or refine. I will recap what was changed at the end so you know which positions are most fresh.
```

## Entry point: execute the Decisions Document

When the curator pastes a Decisions Document or says "Start the Weekly Integrate stage for Curate Mind", execute it before doing anything else.

### 1. Confirm the document

Parse the pasted document and present a brief summary before executing:

```
## Weekly Integrate

Curator observations to save: [n]
New positions to create: [n]
Existing position updates: [n]
Research Lens: [Regenerate or Defer]

Ready to execute. Say "go" to proceed, or adjust anything first.
```

### 2. Save curator observations (Section A)

Execute in order. Observation identifiers are needed for cross-references in subsequent steps.

For each observation in Section A:
- Call `cm_add_curator_observation` with the observation text, data point identifiers, position identifiers, and tags.
- Record the returned observation identifier mapped to its label (A1 maps to the returned identifier, A2 maps to the next returned identifier, and so on).
- Report each as it saves: "Observation A1 saved as [returned identifier]."

### 3. Create new positions (Section B)

For each position in Section B:
- Call `cm_create_position` with title, theme identifier (look up by theme title if needed), initial stance, supporting evidence (data point identifiers), and open questions.
- Record the returned position identifier mapped to its label (B1 maps to the returned identifier, and so on).
- Report: "Position B1 created: [title] ([returned position identifier])."

### 4. Update existing positions (Section C)

For each update in Section C, in order:

1. Call `cm_get_position_arrays` with the position identifier to retrieve the current evidence arrays. This returns only the identifier arrays. No stance text, no history, no embedding vectors.
2. Resolve any cross-references: substitute actual identifiers for labels like "A1 (save first)" using the identifiers recorded in step 2.
3. Call `cm_link_evidence_to_position` with the delta arrays (only the new identifiers to add) and a change summary. The mutation handles merging and deduplication internally, and copies the stance verbatim from the previous version.
4. Report the new version number: "Update C1 applied. [position title] is now at version [n]."

**Tool-selection rule:** Use `cm_link_evidence_to_position` (or `cm_update_positions_batch` for multiple positions at once) whenever the update only adds to evidence arrays. Use `cm_update_position` only when the curator is revising the stance text or open questions. Use `cm_get_position_history` only for full history inspection, never for retrieving current arrays before a linkage operation.

### 5. Regenerate the Research Lens (if flagged)

Check the Research Lens field in the Decisions Document:

- **Regenerate: YES.** Call `cm_update_research_lens` with the project identifier. Report: "Research Lens regenerated."
- **Regenerate: DEFER.** Skip and note: "Research Lens deferred. Regenerate before the next extraction batch if new positions were created."

### 6. Continue to tag-based evidence linking (optional)

After the Decisions Document is fully executed, prompt:

```
Decisions Document complete.

Continue to tag-based evidence linking? This connects remaining data points
to positions via tag retrieval. Useful after a large extraction wave.

Say "yes" to continue, or "done" to close Weekly Integrate here.
```

If the curator says yes, proceed with the three-step workflow below. If done, close with a brief summary:

```
## Weekly Integrate complete

Observations saved: [n]
Positions created: [n]
Positions updated: [n]
Research Lens: [Regenerated or Deferred]
```

## Tag-based evidence linking (optional continuation)

The sections below cover the second part of Weekly Integrate: connecting data points that were not handled in the Decisions Document to Research Positions using tag-based retrieval. Run this after the Decisions Document is executed, or as a standalone session after any extraction wave.

### Prerequisites

Before starting tag-based evidence linking:
1. At least one extraction wave is complete. Sources extracted, data points tagged.
2. Research Positions exist (bootstrapped from a prior corpus or created during synthesis).
3. The `cm_get_data_points_by_tag` tool is available.
4. The `cm_update_position` tool is available.

## Three-step workflow

### Step 1: Tag retrieval (assistant)

For each theme being processed:

1. Identify 2 to 4 relevant tag slugs that map to the theme's positions. Use `cm_get_tag_trends` to see available tags and their data point counts.
2. Pull data points for each tag using `cm_get_data_points_by_tag(projectId, tagSlug)`. This returns clean data (identifier, claim text, evidence type, confidence, source title, source tier) without embedding vectors.
3. Handle truncation. Tool responses truncate at 25,000 characters. Large tag pools (50 or more data points) are partially visible. This is acceptable. Work with what is visible. If exhaustive coverage is needed, use narrower tags or multiple queries.

**Important: do not use `cm_search` for evidence linking.** Semantic search returns embedding vectors (1,536-dimension arrays) that blow out context windows. Tag-based retrieval is the correct approach for linking.

### Step 2: Curator triage (curator)

Present candidate data points to the curator, organized by position:

1. Group candidates by position. For each position in the theme, show the data points most likely to be relevant.
2. Recommend a classification for each data point:
   - Supporting: strengthens or validates the position's thesis.
   - Counter: challenges, contradicts, or introduces tension with the thesis.
   - Skip: tagged with a relevant tag but not directly relevant to this specific position.
3. Present concisely. For each candidate show: claim text (truncated if needed), source title, tier, confidence, and your recommended classification.
4. The curator decides. They confirm, reclassify, or skip each candidate. Batch approval ("approve as-is") is common for well-curated recommendations.

### Step 2.5: Fetch existing evidence arrays (assistant)

**Critical: before updating any position, fetch its current evidence arrays.**

1. Use `cm_get_position_arrays` (not `cm_get_position_history`, not `cm_get_position_detail`). This returns only the current version's identifier arrays. No stance text, no history, no embedding vectors. It is the correct permanent fix for the context-window truncation problem that `cm_get_position_detail` caused.
2. Cross-check new candidates against existing arrays to avoid duplicates before compiling updates.

### Step 3: Position update (assistant)

For each position with triaged evidence:

1. Call `cm_link_evidence_to_position` (single position) or `cm_update_positions_batch` (multiple positions) with only the new identifiers to add:
   - `positionId`: the position being updated.
   - `addSupportingEvidence`: new supporting data point identifiers only (not the full existing array).
   - `addCounterEvidence`: new counter data point identifiers only (optional).
   - `addCuratorObservations`: new observation identifiers only (optional).
   - `changeSummary`: format as "+NS, +NC" (e.g., "+5S, +2C"). Describe what the new data points demonstrate. Do not use em dashes.
   
   The mutation merges and deduplicates internally and copies the stance verbatim from the previous version. Do not pre-merge arrays before calling. Pass only the new additions.

2. Verify the update. The tool returns a new version number. The previous version is preserved (append-only).

**Tool-selection rule:** Use `cm_link_evidence_to_position` or `cm_update_positions_batch` for any update that only adds to evidence arrays. Use `cm_update_position` only when the curator is revising the stance text or open questions. Use `cm_get_position_history` only for full history inspection, never for retrieving current arrays before a linkage operation.

## Batching strategy

Process 2 to 3 themes per session to manage context window size. Each theme typically has 2 to 4 positions and draws from 2 to 4 tags.

Tag overlap is expected. A data point can appear in multiple tag pools and can support multiple positions across different themes. The same identifier in two positions' `supportingEvidence` is correct behavior.

Process-order suggestion: start with the theme that has the strongest tag coverage (most data points in relevant tags), then move to themes with less coverage. This front-loads the most productive linking work.

## After all themes are linked

1. Regenerate the Research Lens via `cm_update_research_lens`. The lens now reflects evidence-backed positions and will be stronger for subsequent extraction waves.
2. Review confidence levels. Some positions may warrant promotion (emerging, then active, then established) based on the volume and quality of linked evidence.
3. Capture curator observations. If the linking process revealed cross-theme patterns or tensions, add them via `cm_add_curator_observation`.
4. Update the progress tracker in `Implementation_Plan.md` (Evidence Linking Progress table).

## Incremental linking (round two and later)

When running evidence linking after additional extraction waves (for example, Tier 3 sources after Tier 1 and Tier 2 were already linked):

1. Filter by source tier. Tag pool results include `sourceTier` for each data point. When linking newly extracted data points, focus on the new tier (`sourceTier: 3` for Tier 3 evidence). Previously linked data points from earlier tiers are already in the existing evidence arrays.
2. Use targeted tags with high density of new-tier data points rather than broad tags. For example, `augmentation-vs-automation` (81 data points) may have high Tier 3 density, while `ai-adoption-patterns` may be mostly Tier 1 and Tier 2.
3. Curator auto-approve mode. If the curator says "auto approve as-is" or equivalent, compile triage internally and execute all updates without stopping for approval at each batch. This dramatically speeds up multi-batch sessions.
4. Cross-position data point reuse is expected and correct. The same data point can be supporting evidence for one position and counter-evidence for another, or supporting for multiple positions across themes. This is by design. A single finding can have different implications for different theses.

## Promotion criteria (emerging to active)

After incremental linking, assess emerging positions for promotion:

- Promote when: multi-source corroboration from three or more independent sources, supporting data points significantly outnumber counter, central claim is validated by different methodologies or contexts.
- Keep emerging when: single-source basis (even if many data points), volatile by its own admission, counter-evidence is as strong as supporting, or the claim is too narrow or specific.
- Key signal: if a position gained only counter-evidence in a linking round, it is weakening, not strengthening.

## Failure modes to watch for

1. **Context window saturation.** If you are processing too many tags or themes at once, the context fills up and triage quality degrades. Reduce to two themes per session.
2. **Over-linking.** Not every data point tagged with a relevant slug is actually relevant to a specific position. The curator triage step exists to filter. Do not skip it.
3. **Missing evidence.** If a position has zero candidates from tag retrieval, the position may need different tags, or the evidence may exist under unexpected tags. Try `cm_get_tag_trends` to find related tags, or use a targeted `cm_search` query for a specific gap.
4. **Stale Research Lens.** If the lens was last generated before evidence linking, it does not reflect the strengthened positions. Always regenerate after linking is complete.
5. **Using the wrong read tool.** Never use `cm_get_position_detail` or `cm_get_position_history` to fetch current arrays before a linkage operation. `cm_get_position_detail` returns embedding vectors that cause truncation. `cm_get_position_history` returns all prior versions unnecessarily. Always use `cm_get_position_arrays`. It returns only the current version's identifier arrays.
6. **Overwriting evidence arrays via `cm_update_position`.** If you call `cm_update_position` for a linkage-only update, you must pass the full merged arrays or existing evidence is lost. Avoid this pattern entirely for linkage. `cm_link_evidence_to_position` and `cm_update_positions_batch` accept only the new additions and handle merging internally.

## Example session flow

```
1. Curator: "Let's link evidence for the AI Adoption Dynamics theme (three positions)."

2. Assistant identifies relevant tags: adoption-dynamics, usage-patterns, diffusion-speed.
   Pulls data points for each tag via cm_get_data_points_by_tag.

3. Assistant presents triage:
   Position 1: "AI usage follows a power-law concentration."
   - [SUPPORTING] "Top 10 tasks account for 24% of consumer traffic..." (Tier 1, strong)
   - [SUPPORTING] "Usage clusters around coding, writing, and data analysis..." (Tier 2, strong)
   - [SKIP] "Enterprises are investing in AI training programs..." (relevant to adoption, not concentration)

4. Curator: "Approve as-is" or "Move #3 to supporting".

5. Assistant executes cm_link_evidence_to_position for each position with triaged evidence.

6. Repeat for the next theme.
```
