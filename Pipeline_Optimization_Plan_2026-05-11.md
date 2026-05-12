# Curate Mind Pipeline Optimization Plan

**Date:** 2026-05-11
**Authored by:** Maicol Parker-Chavez + Claude
**Purpose:** Capture the diagnosis, re-prioritized action plan, and ready-to-paste prompts that came out of a retrospective on the 2026-05-03-to-09 weekly batch session. Use this as the canonical reference when kicking off optimization work in separate chats. Each chat appends to the Completion Log at the bottom when its work is done.

---

## 1. How to use this document

1. **The diagnosis (section 2) and prompts (section 4) are living documents.** Update them as work progresses, new information is learned, or decisions change. When updating a prompt, make the edit in place — no need to preserve the original wording separately.
2. **The TODO list (section 3) gets status markers updated** — each prompt has `Status:` flipping from `⬜ Pending` → `🟡 In Progress` → `✅ Completed` or `🔴 Blocked`.
3. **Each chat appends a Completion Log entry (section 6) when its work is done.** Entries follow the template at the top of section 6.
4. **Diagnosis is corrigible by future evidence.** If a later chat discovers the diagnosis was wrong or partially wrong, update section 2 directly, or append a "Diagnosis Update" entry to section 6 if the finding is nuanced enough to warrant a record of the change.

---

## 2. Session diagnosis

### What we did

Processed the 2026-05-03-to-09 weekly source batch through the Curate Mind pipeline:
- 15 sources ingested (Framer "State of Sites 2026" PDF failed due to OCR timeout and was held)
- 15 Pass 1-3 extraction sub-agents (~324 DPs, 79 mental models, 41 flags total)
- Pass 4 curator review with flag taxonomy: Group A (12 position-contradictions), B (20 novel signals), C (8 confidence-mismatch), D (2 anchor-concerns)
- 2 new emerging positions created: Professional Access Gap, Predictions Outpace Knowledge
- 21 curator observations saved across Groups A, B, C/D, and follow-up takes
- ~25 existing position updates linking new evidence and observations

### What broke and where the cost concentrated

**The 5-hour Claude Max usage budget was exhausted in ~5 minutes during source ingestion + Pass 1-3 extraction.** The post-extraction work (curator review, position updates across ~25 positions) used only ~40% of the budget across several hours. The burn was concentrated in extraction, not in the curator dialogue or position updates.

Root causes in extraction (in approximate order of magnitude):

1. **Parallel sub-agents holding multi-thousand-token source texts simultaneously.** The orchestrator ran 4-source parallel batches. Each sub-agent loaded the full source text via `cm_extract_source` (Microsoft WTI = 7,317 words, Karpathy = 6,562, Hassabis = 5,528, etc.). With 4 concurrent agents, the user's effective TPM rate spiked far above sustainable.

2. **Each sub-agent called `cm_extract_source` twice** — once for Pass 1 and once for Pass 2 (mental-model scan). The full source text was already in the sub-agent's context after Pass 1; the second call was redundant.

3. **Each sub-agent read the full `cm-source-pipeline/SKILL.md` (~500 lines) before starting.** Across 15 sub-agents per batch, that's substantial wasted context.

4. **Per-DP enrichment tool calls.** Pass 3 calls `cm_enrich_data_point` once per DP and `cm_update_data_point_tags` once per DP. For a 30-DP source, that's 60+ sequential tool calls just for enrichment.

5. **Pass 3 reads the Research Lens via `cm_get_research_lens`.** Acceptable, but adds to per-sub-agent context.

Secondary causes in curator-review phase (lower magnitude but real):

6. **`cm_get_position_history` returns every prior version with full stance text.** For positions with 7+ versions, this can be 40K+ tokens per fetch. ~14 of these fetches happened in the session.

7. **`cm_update_position` requires the full current stance text on every update.** Even pure linkage operations (adding one observation ID to an array) forced re-sending the entire 5K-10K-character stance. ~25 such updates in the session.

8. **Adding curator-framework prose to position stance text in Group A.** Inflated each update by an extra 200-500 chars of prose that arguably should have lived only in the observation text (which is immutable and linked to the position).

### What worked well

- **Sub-agent isolation by source.** Each sub-agent's clean context window prevented cross-source contamination. Quality of extraction was good.
- **Pass 4 flag taxonomy (Group A/B/C/D)** emerged organically and turned out to be a strong structure for curator review. Worth codifying.
- **AskUserQuestion-driven curator dialogue.** Maicol's commentary on each flag group converted naturally into observation text and position updates.
- **Append-only versioning.** No data lost; every position update preserved prior versions.
- **2-new-position creation with `cm_create_position`** worked cleanly first try (one fetch error on retry was networky, not the tool).

### Workflow shape problem

The work happened in a single chat. The three phases (Phase 1 Intake + Extraction, Phase 2 Curator Review, Phase 3 Integrate) have very different shapes and the context from each pollutes the next. The rate-limit hit during Phase 1 left no graceful failure mode — if it had happened mid-Phase-3, we'd have been in a partial-state mess. The compact natural handoffs (Pass 4 flag report between Phase 1 and 2; decisions document between Phase 2 and 3) are both under 2K tokens, so splitting the work across chats is cheap.

---

## 3. Re-prioritized TODO list

| # | Priority | Change | Why | Status |
|---|---|---|---|---|
| 1 | **P0** | Optimize sub-agent extraction cost (cm-source-pipeline + cm-batch-orchestrator) | Where the 5-minute burn happened | ✅ Completed |
| 2 | **P0** | Add batched enrichment MCP tools (`cm_enrich_data_points_batch`, `cm_update_data_point_tags_batch`) | Cuts 30-60 tool calls per source down to 2-3 | ✅ Completed |
| 3 | **P1** | Document three-chat workflow (extraction / review / integrate) | No infra change; behavioral. Removes the catastrophic-failure scenario | ✅ Completed |
| 4 | **P2** | Add curator-review-phase MCP tools (`cm_get_position_arrays`, `cm_link_evidence_to_position`, `cm_update_positions_batch`) | Real cost in the linking phase even though it used only ~40% today | ✅ Completed |
| 5 | **P3** | Fix Dispatch intake tool date-folder bug | Removes weekly friction | ✅ Completed |
| 6 | **P3** | Add `cm_extract_pdf` retry-with-fallback chain | Eliminates silent PDF timeout failures | ✅ Completed |

**Suggested execution order:** Prompts 1 + 2 first (P0; Prompt 1's skill edits depend on Prompt 2's batched tools landing). Then Prompt 3 (workflow doc, no code, can run in parallel with 1+2). Then Prompts 4-6 as time allows.

**Note on Prompt 1 ↔ Prompt 2 dependency:** Prompt 1's optimization E (use batched enrichment tools) requires Prompt 2's tools to exist first. Do Prompt 2 before the final pass of Prompt 1, or scope Prompt 1's edits to defer optimization E until later.

---

## 4. The six prompts

Each prompt is self-contained for use in a separate chat. Copy the entire fenced block into a new chat to kick off the work.

---

### Prompt 1 (P0) — Optimize sub-agent extraction cost

```
I want to reduce the token cost of the Curate Mind source-extraction pipeline. In a recent session I burned through a 5-hour Claude Max usage budget in roughly 5 minutes while processing 15 sources through the Pass 1→2→3 pipeline. The post-extraction work (curator review, evidence linking, position updates across ~25 positions) used only ~40% of budget across several hours. So the burn is concentrated in extraction, not in curator review.

## What's happening today (the root causes)

1. The orchestrator (`skills/cm-batch-orchestrator/SKILL.md`) spawns a sub-agent per source. Each sub-agent:
   - Reads `skills/cm-source-pipeline/SKILL.md` (~500 lines) before starting.
   - Calls `cm_extract_source` in Pass 1 (returns full source text — often 5-15K words).
   - Calls `cm_extract_source` AGAIN in Pass 2 (Mental Model Scan — re-reads the same full text).
   - Calls `cm_get_research_lens` in Pass 3.
   - Calls `cm_enrich_data_point` once per DP (typically 15-40 calls per source).
   - Calls `cm_update_data_point_tags` once per DP.
   - Calls `cm_add_mental_model` once per mental model (typically 4-10).

2. The orchestrator currently runs 4 sub-agents in parallel ("3-4 source parallel batches"). With 4 concurrent agents each holding multi-thousand-token source texts AND making rapid tool calls, the user's token-per-minute rate spikes far above sustainable. Worth confirming: my read is that the cm-batch-orchestrator skill prescribes sequential processing ("source processing is sequential — by design for quality"), but in practice 4-source parallel runs worked fine for quality. The conservative prescription costs more than necessary.

## What I want changed (and why)

A. **Don't re-read the skill in every sub-agent.** Either (i) inline the essential Pass 1/2/3 rules into the orchestrator prompt that creates the sub-agent, and instruct the sub-agent NOT to read the skill file, OR (ii) split the skill into a short "operational rules" core (~50 lines) that sub-agents read, and a longer "edge cases / quality guidance" appendix that only the orchestrator reads. Option (i) is simpler. Either way the goal is to stop paying skill-read tokens × 15 sub-agents per batch.

B. **Don't call cm_extract_source twice per source.** Currently Pass 1 calls it, then Pass 2 re-calls it for the "fresh read" of the mental-model scan. The full source text is already in the sub-agent's context after Pass 1. Pass 2 should not re-fetch. Update `cm-source-pipeline/SKILL.md` Section 2.1 ("Re-read the source") to read: "the Pass 1 cm_extract_source response is already in your context — work from that. Do not call cm_extract_source again."

C. **Cap parallelism explicitly.** Update `cm-batch-orchestrator/SKILL.md` to prescribe 2-source parallel batches as the default, with a note that 4-source batches are acceptable only if the user explicitly accepts higher TPM consumption. Today the skill says "sequential by design" but doesn't address parallelism within a batch — the practical guidance should be 2 sources at a time.

D. **Codify the Pass 4 flag taxonomy.** After Pass 1-3 completes, the orchestrator emits a consolidated curator review. In my recent session I invented a taxonomy on the fly: Group A (position-contradictions), B (novel signals), C (confidence-mismatch), D (anchor-concern). This worked well — worth bottling into the skill so future runs start with it already named. Add a "Pass 4 Flag Taxonomy" section to `cm-batch-orchestrator/SKILL.md` documenting these four categories with one-line decision guidance each (Group A → potential counter-evidence or position update; Group B → potential new position or observation; Group C → curator judgment, usually no DP change; Group D → analyst-protocol issue, cite with caveat).

E. **Reduce per-DP tool-call count** — see Prompt 2 (batched enrichment tools). When those tools land, update `cm-source-pipeline/SKILL.md` Section 3.3 ("Enrich each data point") to use the batched form.

## What NOT to change

- Append-only rule: do not introduce delete mutations or in-place stance edits.
- The three-pass structure (Pass 1 extraction, Pass 2 mental-model scan, Pass 3 enrichment): keep the separation.
- The cm-deep-extract skill (interactive deep-extract for single high-value sources): leave alone.

## What to confirm with me before changes

1. Inline-rules vs split-skill approach for fix A — which do I prefer?
2. Should the 2-source default be configurable via a parameter the user passes to the orchestrator, or hard-coded?
3. Are there other extraction-phase tool calls I'm not naming that should also be reviewed? (Pass 3 reads research lens — is that single-call already?)
4. The Pass 4 taxonomy section — should I propose the wording first, or do you want to dictate it?

Please read the relevant skill files first, then come back with a written plan of changes (file-by-file diff summary) before executing. Hold all edits until I confirm the plan.

## After completing the work

Once the user confirms changes are in good shape:

1. Read `/Users/macbooksmacbookpromax/Downloads/curate-mind/Pipeline_Optimization_Plan_2026-05-11.md` to confirm this prompt is still marked `⬜ Pending` in section 3 (and not already completed by another chat).
2. Flip this prompt's status marker in section 3 from `⬜ Pending` → `✅ Completed` (or `🟡 In Progress` if partial, or `🔴 Blocked` if unable to complete).
3. Append a Completion Log entry to section 6 of that file using the template at the top of that section.
4. Save the file.

If during this work you discover the diagnosis in section 2 was wrong or partially wrong, do NOT edit section 2. Instead append a "Diagnosis Update" entry to section 6 using that template (also at the top of section 6).
```

---

### Prompt 2 (P0) — Add batched enrichment MCP tools

```
I want to add two new MCP tools to the Curate Mind server that batch enrichment operations during Pass 3 extraction. The motivation is reducing per-source tool-call count: today Pass 3 calls `cm_enrich_data_point` once per DP (typically 15-40 calls) and `cm_update_data_point_tags` once per DP. For a 30-DP source, that's 60+ sequential tool calls just for enrichment.

## Current state

- MCP server code lives in `mcp/src/` and exposes tools via `@modelcontextprotocol/sdk` (stdio transport).
- Convex schema and mutations live in `convex/`.
- Today's tools:
  - `cm_enrich_data_point(dataPointId, confidence, extractionNote, relatedDataPoints?)`
  - `cm_update_data_point_tags(dataPointId, tagSlugs[])`
- Both are single-DP operations.

## What I want added

### Tool 1: `cm_enrich_data_points_batch`

Args:
- `enrichments`: array of objects, each:
  - `dataPointId` (string)
  - `confidence` (strong | moderate | suggestive)
  - `extractionNote` (string)
  - `relatedDataPoints` (string[], optional)

Behavior: same as cm_enrich_data_point but for an array. Server-side transaction that enriches all DPs atomically (or as close to atomic as Convex allows). Returns array of `{dataPointId, success: true | error_message}`.

### Tool 2: `cm_update_data_points_tags_batch`

Args:
- `updates`: array of objects, each:
  - `dataPointId` (string)
  - `tagSlugs` (string[])

Behavior: same as cm_update_data_point_tags for an array. Additive only (matches single-DP behavior). Returns array of `{dataPointId, tagsAdded: n, tagsSkipped: n}`.

### Tool 3: `cm_get_data_points_batch`

Args:
- `dataPointIds` (string[])

Behavior: fetch multiple data points by ID in a single call. Returns array of full data point records. Replaces the current Pass 3 pattern of calling `cm_get_data_point` once per DP ID (15-40 sequential calls per source) when Sub-agent 2 retrieves DPs at the start of enrichment.

## Constraints

- Both batch tools should validate ALL inputs before writing ANY. If one DP ID is invalid, fail the whole batch with a clear error indicating which ID failed — do not partially apply (this matches the curator's mental model of atomic source-level operations).
- Append-only rule: enrichment can be applied to a DP only if it hasn't been enriched already. Existing single-DP behavior should be preserved here. Worth confirming current behavior — does cm_enrich_data_point allow re-enrichment, or is it once-only?
- Performance target: 30-DP batch should complete in roughly the time of 3 single calls today, not 30.

## After tools land

Update `skills/cm-batch-orchestrator/SKILL.md` Sub-agent 2 (Pass 3) prompt to use the new batch tools:
1. Replace the per-DP `cm_get_data_point` loop (Step 1) with ONE call to `cm_get_data_points_batch`.
2. Collect all enrichment data in memory during Pass 3 analysis.
3. Make ONE call to `cm_enrich_data_points_batch` and ONE call to `cm_update_data_points_tags_batch` at the end.
4. Stop calling the per-DP versions of all three tools.

Note: as of Prompt 1 completion, the canonical sub-agent instructions now live in `skills/cm-batch-orchestrator/SKILL.md` (Sub-agent 2 prompt), not in `skills/cm-source-pipeline/SKILL.md` Section 3.3. Update the orchestrator file, not the pipeline skill.

## What to confirm with me before changes

1. Does Convex transaction shape support multi-record mutations cleanly, or will this need to be implemented as a loop with error rollback? (Affects implementation complexity.)
2. The single-DP versions of these tools — keep them around for backwards compatibility, or deprecate? My preference: keep them but mark deprecated in tool description so models prefer the batch version.
3. Should the batch tools accept a `projectId` parameter for validation (verify all DPs belong to the same project)? Or trust the DP IDs?
4. `cm_get_data_points_batch` is now confirmed as needed (discovered during Prompt 1 work — Pass 3 Sub-agent 2 calls cm_get_data_point once per DP at enrichment start). Are there other per-record tools that would also benefit from batching? (cm_create_tag, cm_add_mental_model come to mind.)

Please read `mcp/src/` (relevant tool definitions), `convex/` (the data point schema and existing mutations), and `skills/cm-source-pipeline/SKILL.md` first. Then return a plan (Convex mutations to add + MCP tool definitions to add + skill edit summary) before executing.

## After completing the work

Once the user confirms changes are in good shape:

1. Read `/Users/macbooksmacbookpromax/Downloads/curate-mind/Pipeline_Optimization_Plan_2026-05-11.md` to confirm this prompt is still marked `⬜ Pending` in section 3 (and not already completed by another chat).
2. Flip this prompt's status marker in section 3 from `⬜ Pending` → `✅ Completed` (or `🟡 In Progress` if partial, or `🔴 Blocked` if unable to complete).
3. Append a Completion Log entry to section 6 of that file using the template at the top of that section.
4. Save the file.

If during this work you discover the diagnosis in section 2 was wrong or partially wrong, do NOT edit section 2. Instead append a "Diagnosis Update" entry to section 6 using that template (also at the top of section 6).
```

---

### Prompt 3 (P1) — Document three-chat workflow

```
I want to formalize a three-chat workflow for processing a weekly source batch in Curate Mind. Right now everything happens in a single chat, which mixes very different work shapes and pollutes context across phases. I recently ran a full weekly batch in one chat and burned a Claude Max usage limit mid-extraction.

## The three phases (with very different shapes)

Phase 1 — INTAKE & EXTRACTION
- Source ingest (cm_extract_pdf, cm_add_source)
- Pass 1-3 sub-agent extraction
- Emit Pass 4 consolidated flag report as the closing artifact

Phase 2 — CURATOR REVIEW (dialogue-heavy)
- Read Pass 4 flag report
- Curator commentary on each flag group (Group A position-contradictions, B novel signals, C confidence-mismatch, D anchor-concern)
- Decisions: which observations to create, which positions to update or create, which DPs to link

Phase 3 — INTEGRATE (mechanical)
- Save curator observations
- Create new positions
- Update existing positions with new evidence + observation IDs
- Optionally regenerate Research Lens

## Why this split

Each phase's context is large and unrelated to the others:
- Phase 1 holds 15 source extractions and tool flows.
- Phase 2 holds the user-curator dialogue and decision history.
- Phase 3 holds existing position arrays and the integration plan.

Carrying all three in one chat means: (a) Phase 1's tokens are still resident when Phase 3 starts, (b) rate-limit hits during Phase 1 abort the run before any curator work happens, (c) it's hard for the model to maintain quality across the three different work shapes.

## Handoff artifacts (compact)

Phase 1 → Phase 2: the Pass 4 flag report (typically <2K tokens, structured as a table by source + a flag list grouped by category).

Phase 2 → Phase 3: a decisions document with:
- Curator observations to save (text + DP refs + position refs + tags)
- New positions to create (title + theme + initial stance + supporting DPs + open questions)
- Existing position updates (positionId + observations to add + DPs to add to supporting/counter)

## Skill edits I'm proposing

A. `skills/cm-batch-orchestrator/SKILL.md` — add a "Workflow Shape: Three-Chat Default" section near the top. Explain when to use single-chat vs three-chat (default: three-chat for any batch with >5 sources or with mixed-quality flags expected). Note: this file was significantly rewritten in Prompt 1 — read the current state before editing. The Pass 4 Flag Taxonomy (Groups A/B/C/D) is already codified there.

B. `skills/cm-curator-review/SKILL.md` already exists — read it before deciding whether to update or replace. Define/update it as: takes a Pass 4 flag report, leads the curator through Group A/B/C/D in order, produces the decisions document.

C. `skills/cm-evidence-linker/SKILL.md` — already exists. Update to add Phase 3 entry-point behavior: takes the decisions document, executes saves/creates/updates, regenerates Research Lens at the end.

## What NOT to change

- The cm-deep-extract skill (interactive single-source extraction) should remain independent. The three-chat workflow is for batches; deep-extract is for individual high-value sources.
- The Pass 4 flag taxonomy (Group A/B/C/D) should be consistent across phases.

## What to confirm with me before changes

1. ~~Does `cm-curator-review/SKILL.md` already exist?~~ It does — read it first.
2. The decisions-document format — should it be a structured Markdown file in `/sources/<week>/_decisions.md`, or a JSON artifact, or just a chat-pasteable list? My preference is structured Markdown that's both human-readable and pasteable.
3. Should Phase 3 always regenerate the Research Lens, or is that a separate decision?
4. Is there a phase-naming convention you want? "Intake / Review / Integrate" or different names?

Please read the existing skill files first (cm-batch-orchestrator, cm-curator-review if exists, cm-evidence-linker, cm-deep-extract) and the project CLAUDE.md, then return a plan for the skill edits before executing.

## After completing the work

Once the user confirms changes are in good shape:

1. Read `/Users/macbooksmacbookpromax/Downloads/curate-mind/Pipeline_Optimization_Plan_2026-05-11.md` to confirm this prompt is still marked `⬜ Pending` in section 3 (and not already completed by another chat).
2. Flip this prompt's status marker in section 3 from `⬜ Pending` → `✅ Completed` (or `🟡 In Progress` if partial, or `🔴 Blocked` if unable to complete).
3. Append a Completion Log entry to section 6 of that file using the template at the top of that section.
4. Save the file.

If during this work you discover the diagnosis in section 2 was wrong or partially wrong, do NOT edit section 2. Instead append a "Diagnosis Update" entry to section 6 using that template (also at the top of section 6).
```

---

### Prompt 4 (P2) — Add curator-review-phase MCP tools

```
I want to add three new MCP tools to the Curate Mind server that reduce token cost during the curator-review and evidence-linking phase. These are lower priority than extraction-phase optimizations (extraction is where the recent usage-limit burn happened, not review), but the review phase still has real inefficiencies worth fixing.

## What's expensive today

When linking new evidence (DPs, observations) to existing positions, the workflow is:

1. Call `cm_get_position_history(positionId)` — returns EVERY prior version of the position with full stance text. For positions like Infrastructure-Application Diverged that have been versioned 7 times with ~5K-character stances, this returns ~40K tokens just to retrieve current evidence arrays.

2. Call `cm_update_position(positionId, ...)` — REQUIRES current stance text on every update. Even if I'm just adding one observation ID to the curatorObservations array, the tool forces me to re-send the full stance verbatim. With ~25 position updates in a recent session, that's 25 × (~5K chars) = ~125K tokens of redundant outbound.

## What I want added

### Tool 1: `cm_get_position_arrays`

Args:
- `positionId` (string)

Returns ONLY the latest version's:
- `supportingEvidence` (DP IDs)
- `counterEvidence` (DP IDs)
- `curatorObservations` (Observation IDs)
- `mentalModels` (Mental Model IDs)
- `openQuestions` (strings)
- `confidenceLevel`, `status`, `versionNumber`, `currentVersionId`

NO stance text. NO history. ~95% token reduction vs cm_get_position_history for linkage operations.

### Tool 2: `cm_link_evidence_to_position`

Args:
- `positionId` (string)
- `addSupportingEvidence` (string[], optional)
- `addCounterEvidence` (string[], optional)
- `addCuratorObservations` (string[], optional)
- `addMentalModels` (string[], optional)
- `changeSummary` (string)

Behavior:
- Additive only (merge into existing arrays, dedupe).
- Does NOT require currentStance — copies it verbatim from the previous version.
- Creates a new version (append-only versioning, same as cm_update_position).
- Returns new version ID + array deltas.

When to use vs cm_update_position: this is for pure linkage operations. cm_update_position remains the right tool when the curator is changing the thesis text or revising open questions.

### Tool 3: `cm_update_positions_batch`

Args:
- `updates`: array of objects, each:
  - `positionId` (string)
  - `addSupportingEvidence` (string[], optional)
  - `addCounterEvidence` (string[], optional)
  - `addCuratorObservations` (string[], optional)
  - `addMentalModels` (string[], optional)
  - `changeSummary` (string)

Behavior: same as cm_link_evidence_to_position but for an array of positions. Creates new versions for all positions atomically (or as atomic as Convex allows). Returns array of `{positionId, newVersionId, versionNumber}`.

## Constraints

- Append-only versioning preserved.
- changeSummary remains required (it's how we trace why a version was created).
- Validate all position IDs before writing any. If one is invalid, fail the whole batch.
- Don't break cm_update_position or cm_get_position_history — they're still the right tools for thesis edits and full history inspection.

## After tools land

Update `skills/cm-evidence-linker/SKILL.md` in two specific places. The skill was rewritten in Prompt 3 — read the current file before editing. The two locations are:

**1. Phase 3 entry-point, step 4 ("Update existing positions")**

This step currently calls `cm_get_position_history` to retrieve current evidence arrays and `cm_update_position` to apply the update. Decisions-document position updates are always pure linkage (adding DP IDs and observation IDs — never stance rewrites), so the lighter tools are always correct here:
- Replace `cm_get_position_history` with `cm_get_position_arrays`
- Replace `cm_update_position` with `cm_link_evidence_to_position`

**2. Tag-based workflow, Pass 2.5 and Pass 3**

- Pass 2.5 ("Fetch Existing Evidence Arrays"): replace `cm_get_position_history` with `cm_get_position_arrays`. The entire rationale for Pass 2.5 was avoiding embedding-vector truncation from cm_get_position_detail — cm_get_position_arrays is the right permanent fix.
- Pass 3 ("Position Update"): replace `cm_update_position` with `cm_link_evidence_to_position` (single position) or `cm_update_positions_batch` (multiple) as the default linkage path.

**The rule to embed in both places:** use `cm_link_evidence_to_position` / `cm_update_positions_batch` for any update that only adds to evidence arrays. Use `cm_update_position` only when the curator is revising the stance text or open questions. Use `cm_get_position_history` only for full history inspection — never for retrieving current arrays before a linkage operation.

## What to confirm with me before changes

1. Convex versioning model — does append-only + "copy stance from previous version" require any schema change, or is it just a new mutation that reads the previous version's stance and inserts a new version row?
2. Do you anticipate any case where stance should NOT be auto-copied (e.g., archived positions, retired status)? My read is that this should be fine for any position not in `retired` status.
3. cm_update_positions_batch atomicity — Convex transactions support multi-record writes, but at what size limit? Should the batch tool cap at N positions per call?
4. Should we also add a non-batched `cm_get_positions_arrays_batch` for fetching multiple positions' arrays at once?

Please read `mcp/src/` (tool definitions and Convex client), `convex/` (positions schema and existing mutations like updatePosition), and `skills/cm-evidence-linker/SKILL.md` first. Return a plan before executing.

## After completing the work

Once the user confirms changes are in good shape:

1. Read `/Users/macbooksmacbookpromax/Downloads/curate-mind/Pipeline_Optimization_Plan_2026-05-11.md` to confirm this prompt is still marked `⬜ Pending` in section 3 (and not already completed by another chat).
2. Flip this prompt's status marker in section 3 from `⬜ Pending` → `✅ Completed` (or `🟡 In Progress` if partial, or `🔴 Blocked` if unable to complete).
3. Append a Completion Log entry to section 6 of that file using the template at the top of that section.
4. Save the file.

If during this work you discover the diagnosis in section 2 was wrong or partially wrong, do NOT edit section 2. Instead append a "Diagnosis Update" entry to section 6 using that template (also at the top of section 6).
```

---

### Prompt 5 (P3) — Fix Dispatch intake tool date-folder bug

```
The Dispatch intake tool (which I invoke to capture sources for Curate Mind) creates a weekly folder when I start a new batch. There's a bug: the folder dates are computed wrong — it created a folder starting on the day I resumed gathering sources rather than the Sunday of that week.

## Convention I want enforced

- Weekly folders run Sunday → Saturday.
- Folder name format: `YYYY-MM-DD_to_DD` (year-month-startday_to_endday). Example: `2026-05-03_to_09` for the week starting Sunday May 3 and ending Saturday May 9.
- The startday is always the most recent Sunday relative to the current date, regardless of when I actually start using the folder.

## Current bug

When I started gathering sources mid-week, the tool created a folder beginning on the day I started (a Wednesday or whatever) instead of on the prior Sunday. I had to manually move sources between folders.

## What I want fixed

1. The folder creation logic should compute `startday = most_recent_sunday(current_date)` and `endday = startday + 6 days`.
2. If a folder already exists for the current week, use it. Don't create a duplicate or differently-named one.
3. Configurable week-start day: default Sunday, but allow override (some curators may want Monday-start). Read from a config file or environment variable.

## Where the change lives

I don't know the exact location of the Dispatch intake tool code. It's invoked from the Curate Mind workflow but may live in a separate repo. Please ask me to point you to the right location before starting — I can look it up.

## Constraints

- Don't break existing folder structure. If older folders use a different naming pattern, leave them alone. Only fix the creation logic for new folders going forward.
- Don't move files between folders automatically. If past folders are wrong, that's a separate cleanup task.

## What to confirm with me before changes

1. Where does the Dispatch intake tool code live? I'll need to point you there.
2. Should the week-start configuration be project-wide (one setting for all Curate Mind) or per-user/per-session?
3. Are there other intake-tool issues I should batch into this fix (since you're touching the code)?
4. What's the test plan? Manual verification with `current_date = Wednesday May 13` should produce folder `2026-05-10_to_16`. I can validate.

This is a small, scoped fix but high-friction-reduction. Please confirm the location first, then make a plan before editing.

## After completing the work

Once the user confirms changes are in good shape:

1. Read `/Users/macbooksmacbookpromax/Downloads/curate-mind/Pipeline_Optimization_Plan_2026-05-11.md` to confirm this prompt is still marked `⬜ Pending` in section 3 (and not already completed by another chat).
2. Flip this prompt's status marker in section 3 from `⬜ Pending` → `✅ Completed` (or `🟡 In Progress` if partial, or `🔴 Blocked` if unable to complete).
3. Append a Completion Log entry to section 6 of that file using the template at the top of that section.
4. Save the file.

If during this work you discover the diagnosis in section 2 was wrong or partially wrong, do NOT edit section 2. Instead append a "Diagnosis Update" entry to section 6 using that template (also at the top of section 6).
```

---

### Prompt 6 (P3) — Add cm_extract_pdf retry-with-fallback chain

```
I want to improve `cm_extract_pdf` so that PDF extraction failures (especially OCR timeouts) have a graceful fallback path rather than silently failing.

## Current state

The MCP tool `cm_extract_pdf` accepts a `method` parameter: `auto | pypdf | docling | docling_ocr`. In a recent session, I tried to extract a heavily visual PDF (Framer "State of Sites 2026", 8MB):
- First attempt (method=docling): succeeded but produced only 635 words — most content was in unreadable chart fragments.
- Second attempt (method=docling_ocr): timed out (~30 seconds).
- Third attempt (method=docling_ocr): timed out again.

No fallback was attempted automatically. I ended up skipping that source for the batch.

## What I want changed

### Add a retry-with-fallback chain (new default behavior when method is unspecified, or via method=auto_fallback)

Order:
1. Try `pypdf` first (fast, text-heavy PDFs).
2. If word count < threshold (suggest 1000 words for documents >5MB, or 500 words for <5MB) → try `docling`.
3. If word count still low → try `docling_ocr` with a longer timeout (60s instead of default 30s).
4. If all fail or quality is too low → return a structured error with: best-effort extraction (lowest-quality result), recommendation (e.g., "manual review recommended; visual-heavy PDF"), and the quality scores from each method tried.

### Add a quality assessment step

After each extraction method completes, compute and return:
- `wordCount`
- `qualityScore` (existing — already returned)
- `visualHeaviness` (new) — heuristic based on (file size in MB) / (word count). High ratio = likely visual-heavy.
- `recommendation` (new) — string describing whether the extraction is good enough to ingest.

### Don't silently succeed with garbage

If the final result has wordCount < 500 for a file >5MB, the tool should return an error rather than a success — these are almost always PDF cases where the content is in images/charts and the extracted text is useless.

## Constraints

- Don't change the existing single-method calls (pypdf, docling, docling_ocr) — these still work for users who want a specific method.
- The retry chain is opt-in via method=auto_fallback OR is the default when method is unspecified — confirm with me which I prefer.
- For the "don't silently succeed with garbage" case, use a `FAILED-` filename prefix (consistent with cm_fetch_url, which uses the same pattern for low-word-count URL scrapes). Return a warning response with remediation options rather than throwing a hard error — the user may still want to inspect the extracted content.

## What to confirm with me before changes

1. Should `method=auto` (current default) be renamed `method=auto_fallback`, OR should the fallback chain be added to the existing `auto` behavior? (My preference: improve `auto` so it does the chain — backwards-compatible name, smarter behavior.)
2. Timeout per method — pypdf is fast (5s OK), docling is medium (30s OK), docling_ocr is slow (need 60s+). Should these be configurable per call?
3. The visualHeaviness heuristic — is there an existing notion of PDF "quality" or "content density" we should reuse rather than invent?
4. For very large PDFs (>20MB Microsoft WTI succeeded at 7,317 words via OCR but took multiple attempts), should the tool offer a chunked extraction mode that processes 10-page chunks and concatenates? Or is that overkill for now?

Please read the current `cm_extract_pdf` implementation in `mcp/src/` first, plus any related PDF utilities, then return a plan before editing.

## After completing the work

Once the user confirms changes are in good shape:

1. Read `/Users/macbooksmacbookpromax/Downloads/curate-mind/Pipeline_Optimization_Plan_2026-05-11.md` to confirm this prompt is still marked `⬜ Pending` in section 3 (and not already completed by another chat).
2. Flip this prompt's status marker in section 3 from `⬜ Pending` → `✅ Completed` (or `🟡 In Progress` if partial, or `🔴 Blocked` if unable to complete).
3. Append a Completion Log entry to section 6 of that file using the template at the top of that section.
4. Save the file.

If during this work you discover the diagnosis in section 2 was wrong or partially wrong, do NOT edit section 2. Instead append a "Diagnosis Update" entry to section 6 using that template (also at the top of section 6).
```

---

## 5. Update protocol for chats working on these prompts

When a chat finishes the work for a prompt:

1. Read this file first to confirm the prompt is still ⬜ Pending and not already completed.
2. Execute the work per the prompt. Pause for user confirmation before making destructive changes — the prompts are written to require this.
3. Flip the prompt's status marker in section 3 from `⬜ Pending` → `✅ Completed` (or `🔴 Blocked` if work couldn't complete).
4. Append a Completion Log entry to section 6 using the template at the top of that section.
5. If you discover that a prompt's instructions are outdated or based on assumptions that no longer hold, update the prompt in section 4 directly. Note the change in the Completion Log entry.
6. If you discover the diagnosis was wrong or partially wrong, update section 2 directly or append a "Diagnosis Update" entry to section 6 for nuanced findings.

For chats running in parallel (e.g., Prompt 3 in one chat while Prompts 1+2 run in another):

- Each chat flips its own status marker only.
- Append entries in chronological order. If a conflict arises, the later entry should reference the earlier one.

---

## 6. Completion Log

Entries are appended in chronological order. Each entry uses this template:

```
### YYYY-MM-DD — Prompt N: <Title>
- **Status:** Completed | Partially completed | Blocked
- **What changed:** <files / tools / skills modified, with paths>
- **Deviations from plan:** <if any>
- **New follow-ups discovered:** <if any>
- **Next chat should know:** <if any>
```

### Diagnosis Update template (for use when later evidence revises section 2)

```
### YYYY-MM-DD — Diagnosis Update: <topic>
- **Original claim (section 2):** <quote or summary>
- **New evidence:** <what was learned>
- **Updated reading:** <how the diagnosis should be re-read going forward>
- **Implications for remaining prompts:** <if any prompt's scope or priority should change>
```

---

*(End of plan. New entries below this line.)*

### 2026-05-11 — Prompt 6: Add cm_extract_pdf retry-with-fallback chain
- **Status:** Completed
- **What changed:**
  - `mcp/scripts/extract_pdf.py` — added `import signal`; added seven new constants (`_METHOD_TIMEOUTS_SECONDS`, `_OCR_PAGE_GATE=60`, `_OCR_SIZE_GATE_MB=30.0`, `_IMAGES_FRACTION_THRESHOLD=0.20`, `_LARGE_FILE_THRESHOLD_MB=5.0`, `_PYPDF_WORD_THRESHOLD_LARGE_FILE=1000`, `_PYPDF_WORD_THRESHOLD_SMALL_FILE=500`); added `_MethodTimeoutError` class; added `_run_with_alarm()` (SIGALRM per-method timeout, no-ops on non-Unix); added `_get_pdf_info()` (single pypdf pass returning page_count + has_significant_images via image XObject check); added `_build_candidates_adaptive()` (pypdf→docling→docling_ocr, per-method timeouts, early-stop logic, OCR gates, returns candidates + ocr_skipped flag); added `_compute_recommendation()` (human-readable string based on quality, visualHeaviness, image_count, ocr_skipped); updated `main()` to branch on auto vs. single-method, compute file_size_mb, visualHeaviness, extraction_failed (wordCount < 500 and fileSizeMb > 5), and emit three new metadata fields (`visualHeaviness`, `extractionFailed`, `recommendation`); updated docling early-check to only block for explicit `docling`/`docling_ocr` single-method calls (auto gracefully handles missing docling via fallback).
  - `mcp/src/tools/intake.ts` — bumped `PDF_EXTRACTION_TIMEOUT_MS` from 180,000 to 270,000; added `visualHeaviness`, `extractionFailed`, `recommendation` to `PdfExtractionMetadata` type; updated `parsePdfExtractionMetadata()` to coerce and validate new fields; updated handler to detect `extractionFailed`, write file with `FAILED-` prefix when true, and return a warning response with remediation options (try docling_ocr directly, paste manually, skip); added `visualHeaviness` and `recommendation` to success response; updated tool description for `auto` to describe the adaptive chain and OCR gates; updated `formatPdfExtractionError()` timeout message from 180s to 270s.
- **Deviations from plan:** None. All four Q&A decisions from the planning conversation were implemented as discussed (pypdf early-stop disabled when `>20%` of pages have images; dual OCR gate page_count > 60 OR file_size_mb > 30; timeouts pypdf=30s docling=90s docling_ocr=120s; no chunked extraction).
- **New follow-ups discovered:** `_run_with_alarm` uses SIGALRM which can only interrupt C extensions when they yield back to Python — Vision Framework calls in docling_ocr may run slightly past the 120s mark before the alarm fires. Acceptable in practice; worth noting if docling_ocr timeout enforcement feels loose on macOS.
- **Next chat should know:** `auto` mode now runs pypdf → docling → docling_ocr (fast-first). Single-method calls (docling, pypdf, docling_ocr) are unaffected. `FAILED-` prefix fires when wordCount < 500 and file_size_mb > 5. The `recommendation` field replaces the need to manually interpret `quality` + `visualHeaviness` — it's a ready-to-read sentence surfaced in both the warning and success responses.

### 2026-05-11 — Prompt 5: Fix Dispatch intake tool date-folder bug
- **Status:** Completed
- **What changed:**
  - `mcp/src/lib/utils.ts` — replaced fixed monthly-band logic (1-7, 8-14, 15-21, 22-end) with Sunday→Saturday calendar week calculation. `getWeekFolderPath` now computes `weekStart = most_recent_sunday(date)`, `weekEnd = weekStart + 6 days`. Cross-month weeks use `YYYY-MM-DD_to_MM-DD` format; same-month weeks use `YYYY-MM-DD_to_DD`. Added two private helpers: `resolveWeekStartDay()` (reads `CURATE_MIND_WEEK_START` env var, defaults to 0=Sunday) and `getMostRecentWeekStart()`. Parent folder is always the week-start month.
  - `mcp/src/tools/intake.ts` — added `SCRAPE_FAILURE_WORD_THRESHOLD = 100` constant. In `cm_fetch_url` handler, extracted `trimArticleContent(scraped.content)` to a `bodyContent` variable and checks `countWords(bodyContent)` before saving. If under threshold: saves file with `FAILED-` prefix and returns a warning response with three options (paste manually, skip, delete file). Normal success path unchanged.
  - `.env.example` — added documented `CURATE_MIND_WEEK_START` variable (commented out, shows default and valid values).
- **Deviations from plan:** Batched in a second fix (failed-scrape detection) at curator request. Week-start config landed as an env var rather than a config file — consistent with existing `CURATE_MIND_PATH` / `CURATE_MIND_PYTHON_PATH` pattern and easiest for AI-assisted maintenance.
- **New follow-ups discovered:** TypeScript build shows pre-existing errors in `convex/*.ts`, `extraction.ts`, and `synthesis.ts` — unrelated to this change. Worth a separate cleanup pass if the build is ever needed to pass cleanly.
- **Next chat should know:** Test case — Wednesday May 13, 2026 produces folder `sources/2026-05/2026-05-10_to_16/`. Cross-month week example: Sunday April 27 produces `sources/2026-04/2026-04-27_to_05-03/`. Failed scrapes land as `FAILED-<normal-filename>.md` in the same week folder.

### 2026-05-11 — Prompt 4: Add curator-review-phase MCP tools
- **Status:** Completed
- **What changed:**
  - `convex/positions.ts` — added three new exports: `getPositionArrays` query (returns only the current version's ID arrays + metadata, no stance, no history, no embeddings); `linkEvidenceToPosition` mutation (additive-only, copies stance/confidenceLevel/status/openQuestions verbatim from previous version, merges + dedupes each incoming array, guards against linking to retired positions); `linkEvidenceBatch` mutation (same logic for up to 20 positions, validates all IDs before writing anything — fully atomic).
  - `mcp/src/tools/synthesis.ts` — added three MCP tools: `cm_get_position_arrays`, `cm_link_evidence_to_position`, `cm_update_positions_batch`. All three sit between `cm_update_position` and `cm_generate_embeddings` in the file. `cm_link_evidence_to_position` and `cm_update_positions_batch` include the tool-selection rule in their descriptions.
  - `skills/cm-evidence-linker/SKILL.md` — four targeted edits: (1) Phase 3 Step 4 rewritten to use `cm_get_position_arrays` + `cm_link_evidence_to_position` with tool-selection rule appended; (2) Pass 2.5 rewritten to use `cm_get_position_arrays` and explain why it's the permanent fix; (3) Pass 3 rewritten to use `cm_link_evidence_to_position` / `cm_update_positions_batch` with delta-only arg semantics explained; (4) Failure modes 5 and 6 updated to reflect the new tools.
- **Deviations from plan:** Q4 (`cm_get_positions_arrays_batch`) not added — confirmed unnecessary during planning since the batch mutation fetches current arrays internally. Retired-position guard throws a descriptive error (title + ID + instructions) surfaced as a standard MCP text response.
- **New follow-ups discovered:** None.
- **Next chat should know:** `cm_link_evidence_to_position` and `cm_update_positions_batch` accept ONLY the new IDs to add (delta), not full arrays. `cm_update_position` still requires full arrays — use the new tools for all pure linkage operations. The batch cap is 20 positions per call.

### 2026-05-11 — Prompt 3: Document three-chat workflow
- **Status:** Completed
- **What changed:**
  - `skills/cm-batch-orchestrator/SKILL.md` — added "Three-Chat Workflow (Default for Batches)" section after "When to Use This Skill" (explains when to use three-chat vs single-chat, how handoffs work, ready-to-paste opener pattern); rewrote Step 5 to emit a structured Pass 4 Flag Report artifact with the Phase 2 opener, instead of handing off to cm-curator-review inline; updated Step 6 header to flag it as "single-chat mode only."
  - `skills/cm-curator-review/SKILL.md` — full rewrite: reframed as standalone Phase 2 skill that accepts a pasted flag report; updated frontmatter description; added 9-step process (open dashboard, auto-finalize clean sources, Groups A/B/C/D review, batch decisions, source finalization, Decisions Document output); moved cm_add_curator_observation / cm_create_position / cm_update_position calls out of this skill and into Phase 3; kept inline calls for source finalization (cm_update_source_status, cm_generate_embeddings) and confidence adjustments (cm_enrich_data_point); added Research Lens cadence guidance (trigger-based, not time-based) as an inline section; added Phase 3 opener at the close.
  - `skills/cm-evidence-linker/SKILL.md` — added frontmatter header (was the only skill without one); added Phase 3 entry-point section at the top covering: confirm document, save observations in order (capture returned IDs for cross-references), create new positions, update existing positions with merged arrays, regenerate Research Lens per decisions document flag, prompt to continue to tag-based linking or close; added "Tag-Based Evidence Linking (Optional Continuation)" header to frame the existing Three-Pass Workflow as the optional second part of Phase 3.
- **Deviations from plan:** Research Lens cadence guidance added to cm-curator-review as an inline section (not in cm-evidence-linker) — that's where the regeneration decision is captured (in the Decisions Document field), so the guidance belongs there. Evidence-linker step 5 implements the flag, not the decision logic.
- **New follow-ups discovered:** When Prompt 4 lands (cm_get_position_arrays, cm_link_evidence_to_position, cm_update_positions_batch), Phase 3 step 4 in cm-evidence-linker should be updated to prefer cm_link_evidence_to_position over cm_update_position for pure linkage operations.
- **Next chat should know:** Phase naming is Extract / Review / Integrate (soft, lowercase). The Decisions Document format is structured Markdown with sections A (observations), B (new positions), C (existing position updates), and a Research Lens field. Labels A1/A2/B1/B2/C1/C2 are used for cross-referencing within the document. The opener phrases are: "Start Phase 2 — Curate Mind weekly batch" and "Start Phase 3 — Curate Mind weekly batch."

### 2026-05-11 — Prompt 2: Add batched enrichment MCP tools
- **Status:** Completed
- **What changed:**
  - `convex/dataPoints.ts` — removed `enrichDataPoint` and `updateTags` mutations (orphaned after MCP tool removal); added `enrichBatch` mutation (validates all DP IDs before writing, allows re-enrichment), `updateTagsBatch` mutation (same all-or-nothing validation, additive tag logic), and `getDataPointsBatch` query (same shape as `getDataPoint`, null-preserving for missing IDs).
  - `mcp/src/tools/extraction.ts` — removed `cm_enrich_data_point` and `cm_update_data_point_tags` entirely; added `cm_enrich_data_points_batch` and `cm_update_data_points_tags_batch`. Updated file header comment.
  - `mcp/src/tools/query.ts` — added `cm_get_data_points_batch` (replaces per-DP loop in Pass 3 Sub-agent 2). Kept `cm_get_data_point` (still used by analyst Layer 3 queries).
  - `skills/cm-batch-orchestrator/SKILL.md` — Sub-agent 2 prompt rewritten: step 1 now uses `cm_get_data_points_batch`; steps 3-4 collect all tags/enrichment in memory; new step 5 writes both in two batch calls. Mental model scan in Sub-agent 1 prompt updated to scan full source first, then rank by novelty and distinctiveness, keep top 3-5.
  - `skills/cm-deep-extract/SKILL.md` — fixed Pass 2.1 re-fetch bug (no longer calls `cm_extract_source` again); replaced `cm_update_data_point_tags` (per-DP) with `cm_update_data_points_tags_batch`; replaced `cm_enrich_data_point` (per-DP) with `cm_enrich_data_points_batch`.
- **Deviations from plan:** Append-only rule relaxed for enrichment fields (confidence, extractionNote, relatedDataPoints, tags) — re-enrichment now allowed and overwrites existing values. This was agreed during planning as the right trade-off: provenance fields (claimText, anchorQuote, sourceId) remain immutable, curator-judgment fields are correctable. Single-DP Convex mutations (`enrichDataPoint`, `updateTags`) removed alongside the MCP tools rather than kept — cleaner because they had no other callers.
- **New follow-ups discovered:** `cm-deep-extract` still references `cm-source-pipeline/SKILL.md` at Pass 1 step 1.2 ("Follow the Pass 1 instructions from cm-source-pipeline"). That skill file is now only a documentation reference and no longer used by any active skill prompt. Consider removing or archiving it in a future cleanup pass.
- **Next chat should know:** Per-DP enrichment and tag tools are gone — any workflow referencing `cm_enrich_data_point` or `cm_update_data_point_tags` must be updated to use the batch versions. The batch versions require all DP IDs to be valid before writing anything.

### 2026-05-11 — Prompt 1: Optimize sub-agent extraction cost
- **Status:** Completed
- **What changed:**
  - `skills/cm-batch-orchestrator/SKILL.md` — full rewrite with fixes A, C, D, and the architectural merge for fix B:
    - **Fix A:** Sub-agent prompts are now self-contained with all quality rules inlined. Both prompts include "Do NOT invoke any skill file." No skill read on every sub-agent spawn.
    - **Fix B (architecture):** Merged Pass 1 and Pass 2 into a single Sub-agent 1. This eliminates the redundant `cm_extract_source` call — source text stays in context between Pass 1 and Pass 2 within the same sub-agent. Also reduces sub-agents per source from 3 to 2. Sub-agent 2 (Pass 3) remains separate.
    - **Fix C:** Concurrency section updated to prescribe 2-source parallel default. Queue confirmation block now displays batch size and the "4 sources at a time" escape hatch on every run.
    - **Fix D:** Pass 4 Flag Taxonomy section added between Step 4 and Step 5, with Groups A/B/C/D, one-line decision guidance each, and presentation-order note (A→B→C→D).
  - `skills/cm-source-pipeline/SKILL.md` — Section 2.1 updated: "Do not call cm_extract_source again." Correct for single-agent use (cm-deep-extract). Fix E deferred pending Prompt 2 batch tools.
- **Deviations from plan:** Fix B required a structural change (merging Sub-agents A+B) rather than a text-only edit to cm-source-pipeline. Root cause: in the three-sub-agent batch model, Pass 2 is a fresh sub-agent with no context from Pass 1 — the source text is genuinely not present. The text fix to cm-source-pipeline Section 2.1 applies correctly to the single-agent (cm-deep-extract) case.
- **New follow-ups discovered:** Pass 3 Sub-agent 2 still calls `cm_get_data_point` individually for each DP (15-40 calls). A `cm_get_data_points_batch` tool would help; worth adding to Prompt 2 scope alongside the enrichment batch tools.
- **Next chat should know:** The orchestrator now runs 2 sub-agents per source (not 3). Sub-agent 1 prompt is ~80 lines, Sub-agent 2 prompt is ~50 lines — both self-contained. The cm-source-pipeline skill is now only used by cm-deep-extract and for documentation reference; batch sub-agents no longer read it.

### 2026-05-11 — Diagnosis Update: three-sub-agent vs. single-sub-agent model
- **Original claim (section 2):** "Each sub-agent: Reads cm-source-pipeline/SKILL.md (~500 lines) before starting. Calls cm_extract_source in Pass 1. Calls cm_extract_source AGAIN in Pass 2. The full source text is already in the sub-agent's context after Pass 1."
- **New evidence:** The cm-batch-orchestrator skill as written spawns THREE separate sub-agents per source (A for Pass 1, B for Pass 2, C for Pass 3), each with a clean context window. Sub-agent B (Pass 2) does not have Sub-agent A's context — the source text is genuinely absent. The "source text already in context" framing is only accurate for the single-agent model used by cm-deep-extract.
- **Updated reading:** Root cause #2 ("calls cm_extract_source twice in the same sub-agent") should read: "spawns three sub-agents where two of them (A and B) independently fetch the same source text, adding a redundant full-text retrieval per source." The diagnosis conclusion (it's wasteful and should be fixed) is still correct; only the mechanism differs.
- **Implications for remaining prompts:** None. Prompt 2 (batch enrichment tools) and Prompt 3 (three-chat workflow) are unaffected by this clarification.
