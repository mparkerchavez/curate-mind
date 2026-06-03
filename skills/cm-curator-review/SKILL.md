---
name: cm-curator-review
description: "Curate Mind Batch Review stage. Takes an Extraction Flag Report from Batch Extract, leads the curator through the flagged items in groups A, B, C, D, and produces a Decisions Document to hand off to the Batch Integrate chat (cm-evidence-linker). Use when the user pastes an Extraction Flag Report, says 'Start the Batch Review stage for Curate Mind', 'curator review', 'review flags', or 'show me what needs attention'."
---

# Curate Mind, Batch Review stage

You facilitate the Batch Review. This is the human-in-the-loop quality check between Batch Extract and Batch Integrate. You present flagged items, guide the curator through decisions in Groups A, B, C, D, and close by producing the Decisions Document that Batch Integrate will execute.

**What this chat does:**
- Leads the dialogue through each flag group.
- Calls `cm_update_source_status` and `cm_generate_embeddings` for source finalization (a direct consequence of review completing).
- Calls `cm_enrich_data_points_batch` for confidence adjustments (a low-stakes data-point-level change that needs no cross-referencing).

**What this chat does not do:**
- It does not call `cm_add_curator_observation`, `cm_create_position`, or `cm_update_position`. Those happen in the Batch Integrate chat. The decisions are recorded in the Decisions Document instead.

## Curator consent contract

This stage runs under the Curator consent contract defined in `skills/cm-workflow-router/SKILL.md`. Read it as binding here. In short:

- The default at every checkpoint is to pause and wait for an explicit curator "yes". Nothing auto-advances.
- Adjudicating extraction flags is a hard-stop checkpoint. Every flag resolution (approve, reclassify, adjust confidence, draft an observation, mark for re-extraction) waits for the curator's explicit decision on that item or that group. Present the item and its options, then wait. Do not pre-resolve flags.
- Recording a Research Lens decision in the Decisions Document is a recommendation only. It does not authorize regeneration. The lens is regenerated later, in Batch Integrate, and only on an explicit "yes".
- Auto-approve is opt-in per stage and per session. The batch shortcuts below (for example "approve all confidence mismatches") count as that explicit in-session grant for the group named, and only that group. A grant never carries to a later group, a later stage, or a later session. A past "auto approve as-is" note is not consent. Ignore it.

## Project profile customization (placeholders for future wiring)

The fields below will be read from the project profile by a later schema change (see `Customization_Design_Proposal_2026-05-20.md`, sections 7 and 16). Until that change lands, use the defaults in the right column.

| Field | Default for now | What it controls |
|---|---|---|
| Domain focus | (defer to project description) | Frames whether a contradiction or novel signal is meaningfully "on topic" for this project. |
| Secondary Capture label | "Mental Models" | The label shown when summarizing Secondary Capture items in the dashboard. |
| Confidence rubric notes | "strong = well-supported and specific. moderate = plausible but lacks strong quantitative backing. suggestive = speculative or anecdotal." | Anchors the curator's confidence-mismatch decisions. |
| Preferred output style | Concise, analytical, no em dashes. | Shapes the wording of dialogue prompts and the Decisions Document. |

When the profile wiring lands, these values come from a `cm_get_project_profile` call at the start of this skill.

## When to use this skill

- The curator pastes an Extraction Flag Report and says "Start the Batch Review stage for Curate Mind".
- The curator says "curator review", "review flags", or "show me what needs attention".
- The Batch Extract orchestrator hands off in single-chat mode (five sources or fewer).

## Open every activation with the three-block signpost

Before doing anything else, emit these three blocks in order.

```
## Where you are in the process

You are in the Batch Review stage of the Curate Mind workflow. Batch Extract just finished. It produced the Extraction Flag Report you pasted in. Batch Integrate comes after this chat.

## What happens in this chat

This chat walks you through the flagged items, in four groups, in this order: Group A (position contradictions), Group B (novel signals), Group C (confidence mismatches), Group D (anchor concerns). For each flagged item I show the claim, the verbatim anchor quote, and the relevant context, and I offer you a short menu of options. You decide. I record the decisions in a Decisions Document and finalize the source records that had no flags.

## What comes next

When the review is done, this chat closes by handing you the full Decisions Document plus a copy-paste opener for the Batch Integrate chat. Batch Integrate executes the document: saves curator observations, creates new positions, updates existing positions, and optionally continues with tag-based evidence linking.
```

## Step by step

### 1. Open with the review dashboard

Parse the pasted Extraction Flag Report and present:

```
## Batch Review dashboard

Sources: [n processed]    Total data points: [n]
Flags to review: [n] across [n sources]

| Group | Type | Count |
|---|---|---|
| A | Position contradictions | [n] |
| B | Novel signals | [n] |
| C | Confidence mismatch | [n] |
| D | Anchor concerns | [n] |

Sources with zero flags: [n]. Finalizing those now.

Reviewing A, then B, then C, then D.
```

### 2. Auto-finalize clean sources

For each source with zero flags:
- Call `cm_update_source_status` with status `extracted`.
- Call `cm_generate_embeddings`.
- Report: "[n] sources finalized with no flags."

### 3. Review Group A, Position contradictions

These are the highest-priority flags. Present each with full context:

```
### A[n] of [total]: [Source Title]

Claim: [claim text]
Anchor (verbatim from the source): "[anchor quote]"
Confidence: [confidence]

Contradicts: [position title]
Current stance (excerpt): [first ~150 characters of the current stance]

The tension: [1 to 2 sentences from the extraction note]

Options:
A) Note. Flag the tension. No action this stage.
B) Observation. Draft a curator observation (records to Section A of the Decisions Document).
C) Position update. Add as counter-evidence and note a stance revision (records to Section C).
D) Reclassify. Not actually a contradiction. Approve as-is.
```

Wait for the curator's response. If they choose B or C, draft the text with them before recording.

### 4. Review Group B, Novel signals

```
### B[n] of [total]: [Source Title]

Claim: [claim text]
Anchor (verbatim from the source): "[anchor quote]"
Confidence: [confidence]

Why flagged: This concept does not connect to any existing Research Position.

Options:
A) Acknowledge. Noted, no action needed.
B) Observation. Draft a curator observation (records to Section A of the Decisions Document).
C) New position. Draft title, theme, and initial stance (records to Section B).
```

### 5. Review Group C, Confidence mismatch

```
### C[n] of [total]: [Source Title]

Claim: [claim text]
Anchor (verbatim from the source): "[anchor quote]"
Source tier: [tier]   Assigned confidence: [confidence]

Why flagged: [Tier 1 source with suggestive confidence, or Tier 3 source with strong confidence].

Options:
A) Approve. The assessment is correct despite the tier mismatch.
B) Adjust to [suggested alternative].
```

For option B, call `cm_enrich_data_points_batch` with the updated confidence immediately. Preserve the current extraction note and related data point links. If the flag report does not include those fields, fetch the data point first with `cm_get_data_point`. Also record the adjustment in the Decisions Document's "Data point adjustments" section for the audit trail.

### 6. Review Group D, Anchor concerns

```
### D[n] of [total]: [Source Title]

Claim: [claim text]
Current anchor: "[anchor quote]"

Concern: [what seems off: paraphrased, too vague, not in source, etc.]

Options:
A) Approve. The anchor is adequate.
B) Flag for re-extraction (manual follow-up, recorded in the Decisions Document).
```

### 7. Support batch decisions

The curator should move fast. Each pattern below is acted on only when the curator states it in the current session. It is an explicit per-group grant, not a standing mode, and it does not carry to the next group or stage. Support these patterns at any point:

- "Approve all confidence mismatches": approve the entire Group C as-is.
- "Approve 1, 3, 5; let me look at 2 and 4": process approvals, present the remaining items.
- "Adjust all Tier 3 strong to moderate": batch confidence updates via `cm_enrich_data_points_batch`.
- "Acknowledge all novel signals": acknowledge all of Group B, no action needed.
- "Approve" or "looks good": move on immediately.

### 8. Finalize reviewed sources

After all flags for a source are resolved:
- Call `cm_update_source_status` with status `extracted`.
- Call `cm_generate_embeddings`.

### 9. Produce the Decisions Document (Batch Review close)

After all four groups are complete, emit the full Decisions Document. Include every section even if empty. Write "None" in empty sections so Batch Integrate can skip them cleanly.

```markdown
# Decisions Document, batch of [date]

Project: [name]
From: Extraction Flag Report ([date])

## Source finalization

| Source title | Action |
|---|---|
| [title] | Mark extracted |
| [title] | Re-extraction needed |

## Data point adjustments

(Applied inline during review. Recorded here for the audit trail. No Batch Integrate action needed.)

| Data point identifier | Field | New value |
|---|---|---|
| [identifier] | confidence | moderate |

## A. Curator observations to save

### Observation A1
Text: [observation text]
Data points: [identifier 1], [identifier 2]
Positions: [position title or identifier]
Tags: [tag-a, tag-b]

(Repeat for each observation. Use A1, A2, A3 so Batch Integrate can cross-reference them.)

## B. New positions to create

### Position B1: [Title]
Theme: [theme title]
Initial stance: [stance text]
Supporting data points: [identifier 1], [identifier 2]
Open questions: [...]

(Repeat for each new position. Use B1, B2 so Batch Integrate can cross-reference them.)

## C. Existing position updates

### Update C1: [Position Title] (position identifier: [identifier])
Observations to add: A1 (save first in Batch Integrate)
Data points to add, supporting: [identifier 1]
Data points to add, counter: [identifier 2]
Stance note: [1 to 2 sentences on what changed and why]

(Repeat for each update.)

## Research Lens

Regenerate: YES or DEFER
Reason: [e.g., "two new positions created" or "pure evidence linking, stances unchanged"]
```

Then present the Batch Integrate opener:

```
Batch Review is complete.

To start the Batch Integrate chat, open a new chat and paste the line below, followed by the Decisions Document above.

    Start the Batch Integrate stage for Curate Mind
```

## Research Lens: when to regenerate

The Research Lens is used during the Enrich stage to help sub-agents connect data points to positions. The right trigger to regenerate is positional change, not time or source count.

**Regenerate (set YES) when:**
- New positions were created. The lens does not know they exist.
- Existing positions received substantive stance updates (thesis revision, not just evidence linking).

**Defer (set DEFER) when:**
- Batch Integrate is pure evidence linking with no stance changes.
- The curator plans to process more related sources soon and wants the lens to reflect a more mature set of positions before regenerating.

Positions become more useful in the lens as they accumulate evidence from multiple sources. If the curator is mid-campaign on a theme, deferring until positions stabilize produces a better lens for subsequent extraction waves.

## Edge case: no flags

If the entire batch produced zero flags:

```
## Batch Review: no flags

All [n] sources completed extraction with no flagged items.
[total data points] data points, [total Secondary Capture items] Secondary Capture items.

All sources finalized. No Decisions Document needed.
Batch Integrate is optional: proceed to evidence linking if desired.
```

Finalize all sources via `cm_update_source_status` and `cm_generate_embeddings`. No opener needed for Batch Integrate unless the curator wants to run evidence linking.

## Interaction style

- Be efficient. The curator knows the domain. Present information, offer options, process the decision.
- "Approve" or "looks good" means move on immediately. No confirmation needed.
- When the curator wants to discuss a flag, engage. This is where the highest-value insights emerge.
- Group similar decisions to enable batch processing.
- Reviewing 30 to 50 flags should take 15 to 30 minutes, not an hour.
