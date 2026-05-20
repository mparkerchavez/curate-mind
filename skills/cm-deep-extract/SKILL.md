---
name: cm-deep-extract
description: "Curate Mind Deep Extract. Interactive single-source extraction for high-value sources where the curator wants to observe and engage with each stage. Runs the Extract, Secondary Capture (default: Mental Models), Enrich, and Review stages in a single conversation, presenting results at each stage for curator input. Use whenever the user says 'deep extract', 'walk me through this source', 'extract this one carefully', or when processing a Tier 1 source that deserves full curator attention."
---

# Curate Mind, Deep Extract (interactive single source)

This skill runs the full source-processing pipeline for a single source in an interactive, conversational mode. Unlike the Weekly Extract orchestrator (which processes many sources silently via sub-agents), Deep Extract shows you everything and invites your input at each stage. Use this for high-value reports, foundational papers, sources you want to engage with closely, or when you are calibrating the pipeline on a new source type.

## Project profile customization (placeholders for future wiring)

The fields below will be read from the project profile by a later schema change (see `Customization_Design_Proposal_2026-05-20.md`, sections 7 and 16). Until that change lands, use the defaults in the right column.

| Field | Default for now | What it controls |
|---|---|---|
| Domain focus | (defer to project description) | Frames what counts as "on topic" during the Extract and Enrich stages. |
| Secondary Capture enabled | true | Whether the Secondary Capture stage runs. |
| Secondary Capture label | "Mental Models" | The user-facing name for Secondary Capture items. |
| Secondary Capture description | "Frameworks, analogies, terms, metaphors, principles." | The guidance the assistant uses when scanning for Secondary Capture candidates. |
| High-value evidence types | statistic, framework, prediction, case-study, observation, recommendation | The evidence-type taxonomy used in Extract. |
| Tag strategy notes | "Lowercase hyphenated noun phrases. 1 to 4 tags per data point. Prefer specific over generic." | Guides tag assignment in Enrich. |
| Confidence rubric notes | "strong = well-supported and specific. moderate = plausible but lacks strong quantitative backing. suggestive = speculative or anecdotal." | Guides confidence calls in Enrich. |
| Preferred output style | Analytical, concise, no em dashes. | Shapes synthesis, extraction notes, and dialogue prompts. |

When the profile wiring lands, these values come from a `cm_get_project_profile` call at the start of this skill.

## When to use this skill

- Processing a high-value source (a major research report, a foundational paper).
- Trying the pipeline on a new source type for the first time.
- The curator wants to see and verify extraction quality in real time.
- The curator expects to add curator observations during extraction.
- The curator says "deep extract", "walk me through this", "extract this one carefully".

For batch processing of many sources, use the `cm-batch-orchestrator` skill instead.

## Inputs

- A source identifier (if already ingested) or a source to ingest first.
- A project identifier.

## Open every activation with the three-block signpost

Before doing any extraction work, emit these three blocks in order.

```
## Where you are in the process

You are in Deep Extract, the interactive single-source version of the Curate Mind source-processing pipeline. Deep Extract runs in one chat from start to finish. It is the alternative to Weekly Extract (which spawns sub-agents to handle many sources silently).

## What happens in this chat

This chat runs four stages, interactively, in order: Extract (atomic claims with verbatim anchor quotes and a 2-to-3-paragraph source synthesis), Secondary Capture (default: Mental Models, the configured second item type per source), Enrich (tags, confidence, extraction notes, the Research Lens), and Review (any items flagged during Enrich are handled inline). I present my work at each stage and wait for your input before moving on.

## What comes next

When this chat finishes, the source is fully processed: data points saved, Secondary Capture items saved, tags and confidence assigned, the source marked extracted, embeddings generated. The next thing to do is either run another Deep Extract on another source or start a Weekly Extract chat for a larger batch. I will tell you the source counts at the end so you can decide.
```

## Step by step

### Stage 1: Extract (interactive)

#### 1.1 Retrieve and present the source

Call `cm_extract_source`. Present the source metadata to the curator:

```
## Deep Extract: [source title]

Author: [author]    Publisher: [publisher]
Type: [source type]    Tier: [tier]
Words: [word count]
Intake note: [intake note or "none"]

Ready to begin the Extract stage?
```

Wait for confirmation. The curator may want to add context or adjust expectations before extraction begins.

#### 1.2 Extract data points

Extract all data points with:
- Verbatim anchor quotes copied word-for-word from the source, 10 to 40 words each (target 15 to 25).
- Evidence type and location.
- No tags. Tags are assigned during the Enrich stage.

#### 1.3 Present extraction results

Show the full extraction to the curator. Not just a summary:

```
## Extract stage results: [count] data points

Data point 1, [evidence type]
Claim: [claim text]
Anchor (verbatim from the source): "[anchor quote]"
Location: [location type] [location start]

Data point 2, [evidence type]
Claim: [claim text]
Anchor (verbatim from the source): "[anchor quote]"
Location: [location type] [location start]

[... all data points ...]

Evidence type breakdown:
- Statistics: [n]   Frameworks: [n]   Predictions: [n]
- Case studies: [n]   Observations: [n]   Recommendations: [n]
```

Ask the curator: "Anything look off? Any claims I missed or split wrong? Say 'looks good' to continue, or point out specific data points to adjust."

If the curator wants changes:
- Add missed claims.
- Merge or split data points.
- Fix anchor quotes.
- Re-present the adjusted list.

#### 1.4 Present source synthesis

Write a 2-to-3-paragraph source synthesis and present it:

```
## Source synthesis

[synthesis text]
```

Ask the curator: "Does this capture the document's core argument? Anything to add or adjust?"

#### 1.5 Save

Once the curator approves:
- Call `cm_save_data_points` with the finalized data point list.
- Call `cm_save_source_synthesis` with the synthesis.
- Report the data point identifiers that were saved.

### Stage 2: Secondary Capture (interactive)

Run this stage only when Secondary Capture is enabled in the project profile. Default: enabled, with label "Mental Models" and the default description "Frameworks, analogies, terms, metaphors, principles."

The architecture intent for Secondary Capture is a fresh context window. In Deep Extract, the curator is engaged and the source text is already familiar, so we do not spin a separate sub-agent. We do, however, deliberately pause and reset the cognitive frame: announce the stage shift, scan the source again with the Secondary Capture description in mind, and treat this as a different kind of attention than the structured extraction above.

#### 2.1 Scan and present candidates

The source text from the Extract stage is already in context. Do not call `cm_extract_source` again. Scan the full source text in context for candidates matching the Secondary Capture description.

For the default "Mental Models" configuration, candidate types are:
- framework: named models, typologies, structured ways of thinking.
- analogy: comparisons that illuminate a concept.
- term: coined or specialized vocabulary.
- metaphor: figurative language capturing a complex idea.
- principle: rules of thumb or guiding statements.

Present candidates:

```
## Secondary Capture stage (Mental Models): candidates

[n] candidates found.

1. [title] ([type])
   [description]
   Related to data point [n]: [brief claim reference].

2. [title] ([type])
   [description]
   Related to data point [n]: [brief claim reference].

[... or "No Mental Models identified in this source." ...]
```

Ask the curator: "Any of these to adjust, remove, or add? Anything I missed?"

The curator may:
- Identify candidates the scan missed.
- Rephrase descriptions.
- Flag that a candidate is already captured from another source.
- Add their own candidates inspired by the source.

### Stage 3: Enrich (interactive)

#### 3.1 Retrieve the Research Lens

Call `cm_get_research_lens` with the project identifier. If one exists, briefly summarize the current positions and open questions so the curator can see the enrichment context.

#### 3.2 Tag assignment

Present proposed tags for all data points as a table:

```
## Proposed tags

| Data point | Claim (abbreviated) | Proposed tags |
|---|---|---|
| 1 | [first 60 chars] | tag-a, tag-b |
| 2 | [first 60 chars] | tag-c, tag-a |
| ... | ... | ... |

New tags to create: [list of tags that do not exist yet]
Existing tags reused: [list]
```

Ask the curator: "Tag assignments look right? Any to change?"

After approval, create new tags via `cm_create_tag`, then call `cm_update_data_points_tags_batch` with all tag assignments in a single call.

#### 3.3 Enrichment pass

Enrich each data point with confidence, extraction note, and related data point links. Present the enrichment as a table for review:

```
## Enrichment results

Data point 1, [confidence]
Note: [extraction note]
Related: [linked data points]

Data point 2, [confidence]
Note: [extraction note]
Related: [linked data points]

[... all data points ...]
```

Ask the curator: "Any confidence levels to adjust? Any extraction notes to refine?"

#### 3.4 Save enrichment

After curator approval:
- Call `cm_update_data_points_tags_batch` with all tag assignments (if not already called in step 3.2).
- Call `cm_enrich_data_points_batch` with all enrichment data in a single call.
- Persist Secondary Capture items: for the default Mental Models configuration, call `cm_add_mental_model` for each approved candidate. (A future change will route non-default capture types into a dedicated table.)
- Report what was saved.

#### 3.5 Review stage (inline)

If any items were flagged during enrichment, present them inline using the same dialogue shape that `cm-curator-review` uses (Groups A, B, C, D). Because this is an interactive session, resolve flags immediately rather than deferring to a separate Weekly Review chat.

If nothing was flagged, note that the extraction is clean.

### Finalize

```
## Deep Extract complete: [source title]

Data points: [count]
Secondary Capture items (Mental Models): [count]
Tags: [count new] new, [count reused] reused
Flags reviewed: [count]
Curator observations added: [count, if any]

Marking source as extracted and generating embeddings.
```

Call `cm_update_source_status` with status `extracted`.
Call `cm_generate_embeddings`.

## Interaction philosophy

Deep Extract is a collaborative session, not a report. The curator is engaged throughout:

- Present work in progress, not just final results.
- Invite feedback at each stage ("looks good?", "anything to adjust?").
- When the curator adds insight, capture it. Either as an adjustment to the extraction or as a curator observation.
- This mode is slower but produces the highest-quality extractions and often generates curator observations that would not emerge in batch mode.
- Expect a Deep Extract session to take 15 to 30 minutes per source depending on length and density.

## When to suggest switching to batch mode

If the curator starts a Deep Extract and the source turns out to be low-complexity (short article, few data points, no Secondary Capture items), suggest:

"This source is fairly straightforward: [n] data points, no Secondary Capture items, no flags. Want me to finish it quickly without the step-by-step review, or keep going interactively?"

Conversely, if the curator started in batch mode but a source produces interesting flags, they can pull it out for deeper review in a separate Deep Extract session.
