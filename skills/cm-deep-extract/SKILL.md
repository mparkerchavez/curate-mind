---
name: cm-deep-extract
description: "Curate Mind Deep Extract. Interactive single-source extraction for high-value sources (typically Tier 1 reports) where the curator wants to observe and engage with each pass. Runs Pass 1 → 2 → 3 → 4 in a single conversation, presenting results at each stage for curator input. Use whenever the user says 'deep extract', 'walk me through this source', 'extract this one carefully', or when processing a Tier 1 source that deserves full curator attention."
---

# Curate Mind — Deep Extract (Interactive Single Source)

This skill runs the full extraction pipeline for a single source in an interactive, conversational mode. Unlike the batch orchestrator (which processes sources silently via sub-agents), deep extract shows you everything and invites your input at each pass. Use this for Tier 1 reports, sources you want to engage with closely, or when you're calibrating the pipeline on new source types.

## When to Use This Skill

- Processing a high-value Tier 1 source (major research report, foundational paper)
- Trying the pipeline on a new source type for the first time
- When you want to see and verify the extraction quality in real time
- When you expect to add Curator Observations during extraction
- User says "deep extract", "walk me through this", "extract this one carefully"

For batch processing of multiple sources, use **cm-batch-orchestrator** instead.

## Inputs

- A **source ID** (if already ingested) or a source to ingest first
- The **project ID**

## Step-by-Step Process

### Pass 1: Core Extraction (Interactive)

#### 1.1 Retrieve and present the source

Call `cm_extract_source`. Present the source metadata to the curator:

```
## Deep Extract: [Source Title]

**Author:** [author] | **Publisher:** [publisher]
**Type:** [sourceType] | **Tier:** [tier]
**Words:** [wordCount]
**Intake note:** [intakeNote or "none"]

Ready to begin Pass 1 (Core Extraction)?
```

Wait for confirmation. The curator may want to add context or adjust expectations before extraction begins.

#### 1.2 Extract data points

Extract all data points with:
- Verbatim anchor quotes (10-40 words, target 15-25)
- Evidence types, locations
- No tags (assigned in Pass 3)

#### 1.3 Present extraction results

Show the full extraction to the curator — not just a summary:

```
## Pass 1 Results: [count] Data Points

**DP1** [evidenceType]
Claim: [claimText]
Anchor: "[anchorQuote]"
Location: [locationType] [locationStart]

**DP2** [evidenceType]
Claim: [claimText]
Anchor: "[anchorQuote]"
Location: [locationType] [locationStart]

[... all DPs ...]

**Evidence type breakdown:**
- Statistics: [n] | Frameworks: [n] | Predictions: [n]
- Case studies: [n] | Observations: [n] | Recommendations: [n]
```

**Ask the curator:** "Anything look off? Any claims I missed or split wrong? Say 'looks good' to continue, or point out specific DPs to adjust."

If the curator wants changes:
- Add missed claims
- Merge or split DPs
- Fix anchor quotes
- Then re-present the adjusted list

#### 1.4 Present source synthesis

Write the 2-3 paragraph source synthesis and present it:

```
## Source Synthesis

[synthesis text]
```

**Ask the curator:** "Does this capture the document's core argument? Anything to add or adjust?"

#### 1.5 Save

Once the curator approves:
- Call `cm_save_data_points` with the finalized DP list
- Call `cm_save_source_synthesis` with the synthesis
- Report DP IDs saved

---

### Pass 2: Mental Model Scan (Interactive)

#### 2.1 Scan and present candidates

The source text from Pass 1 is already in your context. Do NOT call `cm_extract_source` again. Scan the full source text in context for frameworks, analogies, terms, metaphors, and principles.

Present candidates:

```
## Pass 2: Mental Model Candidates

**[n] candidates found:**

1. **[Title]** ([type])
   [description]
   Related to: DP [n] — [brief claim reference]

2. **[Title]** ([type])
   [description]
   Related to: DP [n] — [brief claim reference]

[... or "No mental models identified in this source." ...]
```

**Ask the curator:** "Any of these to adjust, remove, or add? Anything I missed?"

The curator may:
- Identify mental models the scan missed
- Rephrase descriptions
- Flag that a candidate is already captured from another source
- Add their own mental models inspired by the source

---

### Pass 3: Enrichment (Interactive)

#### 3.1 Retrieve the Research Lens

Call `cm_get_research_lens` with the projectId. If one exists, briefly summarize the current positions and open questions so the curator can see the enrichment context.

#### 3.2 Tag assignment

Present proposed tags for all DPs as a table:

```
## Proposed Tags

| DP# | Claim (abbreviated) | Proposed Tags |
|-----|---------------------|---------------|
| 1 | [first 60 chars...] | tag-a, tag-b |
| 2 | [first 60 chars...] | tag-c, tag-a |
| ... | ... | ... |

**New tags to create:** [list of tags that don't exist yet]
**Existing tags reused:** [list]
```

**Ask the curator:** "Tag assignments look right? Any to change?"

After approval, create new tags via `cm_create_tag`, then call `cm_update_data_points_tags_batch` with all DP tag assignments in a single call.

#### 3.3 Enrichment pass

Enrich each DP with confidence, extraction note, and related DP links. Present the enrichment as a table for review:

```
## Enrichment Results

**DP1** — [confidence]
Note: [extraction note]
Related: [linked DPs]

**DP2** — [confidence]
Note: [extraction note]
Related: [linked DPs]

[... all DPs ...]
```

**Ask the curator:** "Any confidence levels to adjust? Any extraction notes to refine?"

#### 3.4 Save enrichment

After curator approval:
- Call `cm_update_data_points_tags_batch` with all DP tag assignments (if not already called in 3.2)
- Call `cm_enrich_data_points_batch` with all DP enrichment data in a single call
- Call `cm_add_mental_model` for each approved mental model
- Report what was saved

#### 3.5 Flag review (Pass 4 inline)

If any items were flagged, present them inline using the cm-curator-review format. Since this is an interactive session, resolve flags immediately rather than deferring.

If no flags, note that the extraction is clean.

---

### Finalize

```
## Deep Extract Complete: [Source Title]

**Data points:** [count]
**Mental models:** [count]
**Tags:** [count new] new, [count reused] reused
**Flags reviewed:** [count]
**Curator observations added:** [count, if any]

Marking source as extracted and generating embeddings.
```

Call `cm_update_source_status` with status `extracted`.
Call `cm_generate_embeddings`.

---

## Interaction Philosophy

Deep extract is a **collaborative session**, not a report. The curator is engaged throughout:

- Present work in progress, not just final results
- Invite feedback at each stage ("looks good?" / "anything to adjust?")
- When the curator adds insight, capture it — either as an adjustment to the extraction or as a Curator Observation
- This mode is slower but produces the highest-quality extractions and often generates Curator Observations that wouldn't emerge in batch mode
- Expect a deep extract session to take 15-30 minutes per source depending on length and density

## When to Suggest Switching to Batch Mode

If the curator starts a deep extract and the source turns out to be low-complexity (short article, few DPs, no mental models), suggest:

"This source is fairly straightforward — [n] DPs, no mental models, no flags. Want me to finish it quickly without the step-by-step review, or keep going interactively?"

Conversely, if the curator started in batch mode but a source produces interesting flags, they can pull it out for deeper review in a separate deep extract session.
