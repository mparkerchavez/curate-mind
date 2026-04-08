---
name: cm-curator-review
description: "Curate Mind Pass 4: Curator Review. The human-in-the-loop quality check. Presents flagged items from the extraction pipeline for the curator to approve, adjust, or annotate. Works with aggregated flags from a batch run or flags from a single source. Use whenever the user says 'review flags', 'curator review', 'show me what needs attention', or after the batch orchestrator completes."
---

# Curate Mind — Pass 4: Curator Review

You facilitate the curator review — the human-in-the-loop quality check. You present flagged items, process decisions efficiently, and finalize source statuses. Your goal is to make this fast and focused. The curator's time is the scarcest resource.

## When to Use This Skill

- The batch orchestrator hands off after Passes 1-3 complete
- The user asks to review flagged items
- The deep-extract skill reaches the review step

## Inputs

You receive:
- A list of flags, each with: sourceId, source title, dpId, flag type, brief reason
- Total sources processed and total DPs extracted
- The project ID

## Step-by-Step Process

### 1. Present the review dashboard

Start with an overview so the curator knows the scope:

```
## Curator Review

**Sources processed:** [n]
**Total data points:** [n]
**Items flagged for review:** [n flags] across [n sources]

| Flag Type | Count |
|-----------|-------|
| Confidence mismatch | [n] |
| Position contradiction | [n] |
| Anchor concern | [n] |
| Novel signal | [n] |

**Sources with zero flags:** [n] (will be marked as extracted automatically)
```

### 2. Auto-finalize clean sources

For sources with zero flags, immediately:
- Call `cm_update_source_status` with status `extracted` for each
- Call `cm_generate_embeddings` to process pending embeddings
- Report: "[n] sources finalized with no flags."

### 3. Present flags grouped by type

Present flags in order of importance, not source-by-source. This lets the curator batch-process similar decisions.

#### Position contradictions (highest priority)

These are the most strategically valuable flags. Present each with full context:

```
### Contradiction [n] of [total]: [Source Title]

**Claim:** [claimText]
**Anchor:** "[anchorQuote]"
**Confidence:** [confidence]

**Contradicts position:** [position title]
**Current stance (abbreviated):** [stance excerpt]

**The tension:** [1-2 sentences from the extraction note]

**Options:**
A) Approve — note the tension, no position update yet
B) Approve + create a Curator Observation documenting the tension
C) Approve + flag the position for potential update later
D) Adjust — the contradiction isn't as strong as flagged
```

#### Confidence mismatches

```
### Mismatch [n] of [total]: [Source Title]

**Claim:** [claimText]
**Anchor:** "[anchorQuote]"
**Source tier:** [tier] | **Assigned confidence:** [confidence]

**Why flagged:** [Tier 1 source with suggestive confidence / Tier 3 source with strong confidence]

**Options:**
A) Approve as-is (the assessment is correct despite the tier mismatch)
B) Adjust confidence to [suggested alternative]
C) Edit the extraction note to clarify
```

#### Novel signals

```
### Novel [n] of [total]: [Source Title]

**Claim:** [claimText]
**Anchor:** "[anchorQuote]"
**Confidence:** [confidence]

**Why flagged:** This concept doesn't connect to any existing Research Position.

**Options:**
A) Acknowledge — it's noted, no action needed now
B) Create a Curator Observation linking it to emerging thinking
C) Note for potential new Research Position (capture the thesis)
```

#### Anchor concerns

```
### Anchor [n] of [total]: [Source Title]

**Claim:** [claimText]
**Current anchor:** "[anchorQuote]"

**Concern:** [what seems off — paraphrased? too vague? not found in source?]

**Options:**
A) Approve — anchor is adequate
B) Flag for re-extraction of this specific DP
```

### 4. Support batch decisions

The curator should be able to move fast. Support these patterns:

- **"Approve all confidence mismatches"** → Approve entire category
- **"Approve 1, 3, 5 — let me look at 2, 4"** → Process approvals, present remaining
- **"Adjust all Tier 3 strong → moderate"** → Batch confidence update
- **"Approve all novel signals"** → Acknowledge all, no action needed
- **"Looks good"** or **"approve"** → Move on immediately

### 5. Process decisions

**Approve:** No action needed, move to next flag.

**Adjust confidence:** Call `cm_enrich_data_point` with the updated confidence.

**Edit extraction note:** Ask for the new note text, then call `cm_enrich_data_point`.

**Create Curator Observation:** Help draft the observation text, ask which DPs and positions to link, then call `cm_add_curator_observation`.

**Flag position for update:** Record the position ID and thesis. Present all flagged positions at the end as a "positions to revisit" list.

**Flag for re-extraction:** Note this — it's a manual follow-up. The curator will need to re-examine the source in a dedicated session.

### 6. Finalize remaining sources

After all flags for a source are resolved, call `cm_update_source_status` with status `extracted` and `cm_generate_embeddings`.

### 7. Close the review

```
## Review Complete

**Flags reviewed:** [n]
- Approved as-is: [n]
- Confidence adjusted: [n]
- Extraction notes edited: [n]
- Curator observations created: [n]
- Re-extraction flagged: [n]

**Sources finalized:** [n total] ([n auto-finalized, n after review])

**Positions to revisit:**
[list of position titles + brief reason, if any]

**Sources needing re-extraction:**
[list, if any]

All sources are now marked as extracted. Embeddings are being generated.
```

## Edge Case: No Flags at All

If the entire batch produced zero flags:

```
## Curator Review: No Flags

All [n] sources completed Passes 1-3 with no items flagged for review.
[total DPs] data points extracted, [total models] mental models created.

All sources marked as extracted. Embeddings being generated.
```

## Interaction Style

- Keep it efficient — the curator knows the domain
- Don't over-explain flags. Present the information, offer options, process the decision.
- Support rapid movement. "Approve" means move on immediately.
- When the curator wants to discuss a flag, engage thoughtfully — this is where the highest-value insights emerge
- Group similar decisions to enable batch processing
- The review for 30-50 flags across 20 sources should take 15-30 minutes, not an hour
