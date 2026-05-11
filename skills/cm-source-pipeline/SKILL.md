---
name: cm-source-pipeline
description: "Curate Mind Source Pipeline. The complete Pass 1 → Pass 2 → Pass 3 extraction pipeline for a single source. Designed to run as a sub-agent spawned by the batch orchestrator. Each pass writes directly to Convex via MCP tools. Returns a compact summary with any flags for curator review. This skill should NOT be invoked directly by the user — use cm-batch-orchestrator or cm-deep-extract instead."
---

# Curate Mind — Source Pipeline

This skill contains the full three-pass extraction pipeline for a single source. It is designed to run as a **sub-agent** — spawned by the batch orchestrator, given a source ID and project ID, and expected to return a compact summary when done. All data is written directly to Convex as it is produced. The sub-agent does not return full DP records to the orchestrator.

## Inputs

The sub-agent receives:
- `sourceId` — Convex document ID for the source
- `projectId` — Convex document ID for the project

## Output Contract

When the pipeline completes, return ONLY this structured summary (keep it compact — the orchestrator is collecting these from many sources):

```
SOURCE_PIPELINE_RESULT
sourceId: [id]
title: [source title]
status: success | failed
pass1_dps_saved: [count]
pass1_dp_ids: [comma-separated list]
pass2_mental_models_created: [count]
pass3_dps_enriched: [count]
pass3_tags_created: [list of new tag slugs]
flags_for_review: [count]
FLAGS:
- [dpId] | [flag_type] | [brief reason — one line]
- ...
source_synthesis_excerpt: [first 150 characters of source synthesis]
error: [error message if failed, "none" if success]
```

If the pipeline fails at any pass, report the error and stop. Do not continue to the next pass.

---

## Pass 1: Core Extraction

**Job:** Read the source and extract atomic data points with verbatim anchors. Write a source synthesis. No tags, no mental models, no interpretation.

### 1.1 Retrieve the source

Call `cm_extract_source` with the sourceId. This returns source metadata and full text.

If the source is not found or has no text, return a failed result immediately.

### 1.2 Assess document size and chunk if needed

Check `wordCount`:
- **Under 15,000 words**: Process as a single unit
- **15,000–30,000 words**: Process in 2 chunks, split at natural section breaks
- **Over 30,000 words**: Process in chunks of ~10,000 words, splitting at section breaks

For chunked documents, maintain a running dpSequenceNumber across chunks.

### 1.3 Extract data points

For each chunk (or the whole document), extract every distinct atomic claim worth capturing.

**What makes a good data point:**
- States a single, specific claim (not vague)
- Could serve as evidence for or against a research position
- Captures what the source says, not what you infer
- Statistics, named frameworks, predictions with timeframes, case studies with outcomes, specific recommendations, and notable observations are high-value

**What to skip:**
- Generic filler ("AI is transforming everything")
- Repetition of the same point elsewhere in the source
- Background context without a distinct claim
- Marketing language without substance

**For each data point, produce:**

| Field | Rules |
|-------|-------|
| `dpSequenceNumber` | Start at 1, increment across chunks |
| `claimText` | 1-3 sentences in your words. Must stand alone without source context. |
| `anchorQuote` | **10-40 words, soft target 15-25.** Copied verbatim from the source. Must appear word-for-word in the source text. Capture the author's reasoning or evidence, not just the conclusion. |
| `evidenceType` | One of: `statistic`, `framework`, `prediction`, `case-study`, `observation`, `recommendation` |
| `locationType` | One of: `paragraph`, `page`, `timestamp`, `section` |
| `locationStart` | e.g., "paragraph 12", "page 3", "section: Enterprise Adoption" |

**Do NOT assign tags.** Tagging happens in Pass 3 where the model can see all DPs together.

**Evidence type guidance:**
- `statistic`: Contains a number, percentage, dollar amount, or quantified claim
- `framework`: Describes a named model, typology, or structured way of thinking
- `prediction`: Claims about what will happen, with or without a timeframe
- `case-study`: Describes a specific company, project, or initiative and what happened
- `observation`: A qualitative insight or pattern described by the author
- `recommendation`: An explicit suggestion for action

**Anchor quote guidance:**
The anchor serves two purposes: verification (can you find this passage in the source 6 months from now?) and context preservation (does the anchor preserve enough of the author's voice and reasoning?). When choosing what to include:
- Prefer anchors that capture the author's reasoning, not just the conclusion
- Include surrounding context that makes the claim meaningful
- A 25-word anchor that preserves the argument is better than a 10-word anchor that only captures the headline

**Extraction density guidance:**
- 2,000-word article: 8-15 data points
- 10,000-word report: 25-50 data points
- Significantly fewer suggests over-filtering; significantly more suggests splitting claims too finely

### 1.4 Save data points

Call `cm_save_data_points` with the sourceId and full array of extracted data points. Record the returned DP IDs.

Note: Pass the `tagSlugs` as empty arrays `[]` for each data point. Tags will be assigned in Pass 3.

### 1.5 Write source synthesis

After extracting all data points, write a 2-3 paragraph analytical summary of the source. This is NOT a generic summary. It should capture:

- **Paragraph 1:** The source's central argument or thesis — what is it actually claiming, and what evidence structure supports it?
- **Paragraph 2:** Key tensions, surprising findings, or notable methodology — what makes this source distinctive or potentially important?
- **Paragraph 3:** Strategic implications — what does this mean for someone working in AI strategy and adoption? What questions does it raise?

This is modeled on the "Initial Observations" from the CRIS extraction system. It preserves the document-level argumentative context that individual data points cannot capture, and it travels with the source metadata into Pass 3 where it informs enrichment.

Call `cm_save_source_synthesis` with the sourceId and the synthesis text.

---

## Pass 2: Mental Model Scan

**Job:** Focused re-read of the full source text to identify frameworks, analogies, coined terms, metaphors, and principles. This is a different cognitive task from data point extraction — it requires pattern recognition and synthesis.

### 2.1 Use the source text already in context

The `cm_extract_source` response from Pass 1 is already in your context — work from that. Do not call `cm_extract_source` again.

### 2.2 Scan for mental models

Read through the source looking specifically for:

| Type | What to look for | Example |
|------|-----------------|---------|
| `framework` | Named models, typologies, structured ways of thinking | "The seven workforce archetypes" |
| `analogy` | Comparisons that illuminate a concept | "AI agents are like interns — you need to check their work" |
| `term` | Coined or specialized vocabulary | "Context engineering", "skill partnerships" |
| `metaphor` | Figurative language that captures a complex idea | "The implementation chasm" |
| `principle` | Rules of thumb or guiding statements | "Automate the workflow, not the task" |

For each candidate, note:
- **Title**: The name of the framework/analogy/term
- **Type**: framework, analogy, term, metaphor, or principle
- **Description**: 2-4 sentences explaining the concept and why it's worth capturing
- **Related DP**: Which DP from Pass 1 is most closely associated (by dpSequenceNumber)

### 2.3 Return candidates

Do NOT save mental models to Convex in this pass. Return them as structured output. They will be finalized and saved in Pass 3, which has the Research Lens context to check for duplicates.

A typical source produces 0-5 mental model candidates. Some sources (especially frameworks-heavy reports) may produce more. Commentary articles and news sources often produce 0.

---

## Pass 3: Enrichment

**Job:** Enrich each data point with confidence, extraction notes, related DP links, and tags. Finalize and save mental models. Flag items for curator review. Uses the Research Lens and source synthesis for context.

### 3.1 Retrieve context

Gather everything this pass needs:
1. **Data points from Convex**: Call `cm_get_data_point` for each DP ID from Pass 1 (or use the DP list you already have)
2. **Source metadata**: From the Pass 1 retrieval (title, tier, intake note, source type)
3. **Source synthesis**: From Pass 1 step 1.5
4. **Mental model candidates**: From Pass 2
5. **Research Lens**: Call `cm_get_research_lens` with the projectId

If no Research Lens exists yet (early in the project), proceed without it. Note in the summary that enrichment was done without a lens.

### 3.2 Assign tags (holistic view)

Now that you can see all DPs from this source together, assign tags to each one. This is done here rather than in Pass 1 because seeing all DPs at once produces better, more consistent tag assignments.

**Tagging rules:**
- 1-4 tags per data point, at least one per DP
- Lowercase hyphenated: `agentic-workflows`, `enterprise-adoption`, `cost-optimization`
- Prefer specific over generic: `retrieval-augmented-generation` over `ai-techniques`
- Reuse existing project tags when they fit
- Consider source-level context (title, publisher, source type) when assigning topical tags that may not be explicit in the DP claim text

Before assigning, check existing tags via the project's tag list. Create new tags with `cm_create_tag` only when no existing tag fits.

Note: Since `cm_save_data_points` was called in Pass 1 with empty tagSlugs, you will need to create the tag links separately. Use `cm_update_data_point_tags` to assign tags to each DP after any needed `cm_create_tag` calls.

### 3.3 Enrich each data point

For each DP, determine:

**Confidence signal:**
- `strong`: Well-supported, specific, backed by data or clear reasoning. Tier 1 default unless speculative.
- `moderate`: Plausible, reasonable source, but lacks strong quantitative backing. Most common signal.
- `suggestive`: Speculative, anecdotal, or from limited credibility on this topic. Worth capturing but shouldn't anchor a position alone.

Tier informs your prior, but the claim's specificity and evidence determines the signal.

**Extraction note (1-3 sentences):**
This is the highest-value output of Pass 3. It should tell the curator something they'd want to know when encountering this DP in a query result six months from now.

Use the source synthesis and Research Lens to write notes that connect, not summarize:
- How does this relate to current Research Positions?
- Does this connect to open questions in the Research Lens?
- Does this DP form an argument chain with other DPs from this source?
- If an intake note exists, does this relate to what the curator was looking for?

**Related data points:**
Identify DPs from the same source that form argument chains (a statistic supporting a prediction, a case study illustrating a framework, etc.)

Call `cm_enrich_data_point` for each DP with confidence, extractionNote, and relatedDataPoints. Do not use this step for tag assignment; tags should already have been written via `cm_update_data_point_tags`.

### 3.4 Save mental models

For each mental model candidate from Pass 2, check against the Research Lens for duplicates. If novel, call `cm_add_mental_model` with:
- `title`, `modelType`, `description`, `sourceId`
- `sourceDataPointId`: The DP ID most closely associated (from the related DP noted in Pass 2)

### 3.5 Compile flags for curator review

Flag items that need human judgment:

| Flag type | Condition |
|-----------|-----------|
| `confidence-mismatch` | Tier 1 + suggestive, or Tier 3 + strong |
| `position-contradiction` | DP contradicts a current Research Position (per Research Lens) |
| `anchor-concern` | Anchor quote seems imprecise or could not be verified |
| `novel-signal` | DP introduces a concept with no connection to any existing position |

Flag conservatively. Only flag items that genuinely need human judgment.

### 3.6 Return result

Return the compact summary following the Output Contract at the top of this skill. Include all flags. The orchestrator will collect these and present them in the consolidated Pass 4 review.
