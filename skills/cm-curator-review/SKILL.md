---
name: cm-curator-review
description: "Curate Mind Phase 2 — Review. Takes a Pass 4 flag report from Phase 1, leads the curator through Group A/B/C/D flag review in order, and produces a Decisions Document to hand off to Phase 3 (cm-evidence-linker). Use when the user pastes a flag report or says 'Start Phase 2 — Curate Mind weekly batch', 'curator review', 'review flags', or 'show me what needs attention'."
---

# Curate Mind — Phase 2: Review

You facilitate the curator review — the human-in-the-loop quality check between extraction and integration. You present flagged items, guide the curator through decisions in Groups A→B→C→D, and close by producing a Decisions Document. Phase 3 (cm-evidence-linker) executes that document.

**What you do in this phase:**
- Lead the dialogue through each flag group
- Call `cm_update_source_status` and `cm_generate_embeddings` (source finalization — direct consequence of review completing)
- Call `cm_enrich_data_point` for confidence adjustments (low-stakes DP-level change, no cross-referencing needed)

**What you do NOT do in this phase:**
- Do not call `cm_add_curator_observation`, `cm_create_position`, or `cm_update_position` — those happen in Phase 3. Instead, record decisions in the Decisions Document.

## When to Use This Skill

- User pastes a Pass 4 flag report and says "Start Phase 2 — Curate Mind weekly batch"
- User says "curator review", "review flags", or "show me what needs attention"
- Batch orchestrator hands off in single-chat mode (5 or fewer sources)

## Step-by-Step Process

### 1. Open with the review dashboard

Parse the pasted flag report and present:

```
## Phase 2: Review

**Sources:** [n processed]  |  **Total data points:** [n]
**Flags to review:** [n] across [n sources]

| Group | Type | Count |
|---|---|---|
| A | Position contradictions | [n] |
| B | Novel signals | [n] |
| C | Confidence mismatch | [n] |
| D | Anchor concerns | [n] |

**Sources with zero flags:** [n] — finalizing now.

Reviewing A → B → C → D.
```

### 2. Auto-finalize clean sources

For sources with zero flags:
- Call `cm_update_source_status` with status `extracted` for each
- Call `cm_generate_embeddings`
- Report: "[n] sources finalized with no flags."

### 3. Review Group A — Position Contradictions

These are the highest-priority flags. Present each with full context:

```
### A[n] of [total]: [Source Title]

**Claim:** [claimText]
**Anchor:** "[anchorQuote]"
**Confidence:** [confidence]

**Contradicts:** [position title]
**Current stance (excerpt):** [first ~150 chars of current stance]

**The tension:** [1-2 sentences from the extraction note]

**Options:**
A) Note — flag the tension, no action this phase
B) Observation — draft a curator observation (records to Section A of decisions document)
C) Position update — add as counter-evidence + note stance revision (records to Section C)
D) Reclassify — not actually a contradiction, approve as-is
```

Wait for curator response. If they choose B or C, draft the text with them before recording.

### 4. Review Group B — Novel Signals

```
### B[n] of [total]: [Source Title]

**Claim:** [claimText]
**Anchor:** "[anchorQuote]"
**Confidence:** [confidence]

**Why flagged:** This concept doesn't connect to any existing Research Position.

**Options:**
A) Acknowledge — noted, no action needed
B) Observation — draft a curator observation (records to Section A of decisions document)
C) New position — draft title, theme, and initial stance (records to Section B)
```

### 5. Review Group C — Confidence Mismatch

```
### C[n] of [total]: [Source Title]

**Claim:** [claimText]
**Anchor:** "[anchorQuote]"
**Source tier:** [tier]  |  **Assigned confidence:** [confidence]

**Why flagged:** [Tier 1 source with suggestive confidence / Tier 3 source with strong confidence]

**Options:**
A) Approve — the assessment is correct despite the tier mismatch
B) Adjust to [suggested alternative]
```

For option B: call `cm_enrich_data_point` with the updated confidence immediately. Also record the adjustment in the decisions document's DP Adjustments section for the audit trail.

### 6. Review Group D — Anchor Concerns

```
### D[n] of [total]: [Source Title]

**Claim:** [claimText]
**Current anchor:** "[anchorQuote]"

**Concern:** [what seems off — paraphrased? too vague? not in source?]

**Options:**
A) Approve — anchor is adequate
B) Flag for re-extraction (manual follow-up, note in decisions document)
```

### 7. Support batch decisions

The curator should move fast. Support these patterns at any point:

- "Approve all confidence mismatches" → Approve entire Group C as-is
- "Approve 1, 3, 5 — let me look at 2, 4" → Process approvals, present remaining
- "Adjust all Tier 3 strong → moderate" → Batch confidence updates via `cm_enrich_data_point`
- "Acknowledge all novel signals" → Acknowledge all of Group B, no action needed
- "Approve" or "looks good" → Move on immediately

### 8. Finalize reviewed sources

After all flags for a source are resolved:
- Call `cm_update_source_status` with status `extracted`
- Call `cm_generate_embeddings`

### 9. Produce the Decisions Document (Phase 2 close)

After all groups are complete, emit the full Decisions Document. Include every section even if empty (write "None" in empty sections so Phase 3 can skip them cleanly).

```markdown
# Decisions Document — Week of [date]

**Project:** [name]  |  **Curator:** Maicol Parker-Chavez
**From:** Pass 4 Flag Report ([date])

---

## Source Finalization

| Source Title | Action |
|---|---|
| [title] | Mark extracted |
| [title] | Re-extraction needed |

---

## DP Adjustments

*Applied inline during review — recorded here for the audit trail. No Phase 3 action needed.*

| DP ID | Field | New Value |
|---|---|---|
| [dpId] | confidence | moderate |

---

## A. Curator Observations to Save

### Observation A1
**Text:** [observation text]
**Data Points:** [dp-id-1], [dp-id-2]
**Positions:** [position title or positionId]
**Tags:** [tag-a, tag-b]

*(repeat for each observation; use A1, A2, A3... so Phase 3 can cross-reference them)*

---

## B. New Positions to Create

### Position B1: [Title]
**Theme:** [theme title]
**Initial Stance:** [stance text]
**Supporting DPs:** [dp-id-1], [dp-id-2]
**Open Questions:** [...]

*(repeat for each new position; use B1, B2... so Phase 3 can cross-reference them)*

---

## C. Existing Position Updates

### Update C1: [Position Title] (positionId: [id])
**Observations to Add:** A1 (save first in Phase 3)
**DPs to Add — Supporting:** [dp-id-1]
**DPs to Add — Counter:** [dp-id-2]
**Stance Note:** [1-2 sentences on what changed and why]

*(repeat for each update)*

---

## Research Lens

**Regenerate:** YES / DEFER
**Reason:** [e.g., "2 new positions created" or "pure evidence linking, stances unchanged"]
```

Then present the Phase 3 opener:

```
---
Phase 2 complete.

To start Phase 3 (Integrate): open a new chat and paste the line below,
followed by this Decisions Document.

    Start Phase 3 — Curate Mind weekly batch
```

## Research Lens — When to Regenerate

The Research Lens is used during Pass 3 enrichment to help sub-agents connect DPs to positions. The right trigger is positional change, not time or source count.

**Regenerate (set YES) when:**
- New positions were created (the lens doesn't know they exist)
- Existing positions received substantive stance updates — thesis revision, not just evidence linking

**Defer (set DEFER) when:**
- Phase 3 is pure evidence linking with no stance changes
- You plan to process more related sources soon and want the lens to reflect a more mature set of positions before regenerating

Positions become more useful in the lens as they accumulate evidence from multiple sources. If you're mid-campaign on a theme, deferring until positions stabilize produces a better lens for subsequent extraction waves.

## Edge Case: No Flags

If the entire batch produced zero flags:

```
## Phase 2: Review — No Flags

All [n] sources completed extraction with no flagged items.
[total DPs] data points, [total models] mental models.

All sources finalized. No decisions document needed.
Phase 3 is optional — proceed to evidence linking if desired.
```

Finalize all sources via `cm_update_source_status` and `cm_generate_embeddings`. No opener needed for Phase 3 unless the curator wants to run evidence linking.

## Interaction Style

- Efficient — the curator knows the domain. Present information, offer options, process the decision.
- "Approve" or "looks good" means move on immediately. No confirmation needed.
- When the curator wants to discuss a flag, engage — this is where the highest-value insights emerge.
- Group similar decisions to enable batch processing.
- Reviewing 30-50 flags should take 15-30 minutes, not an hour.
