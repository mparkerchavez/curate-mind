# cm-evidence-linker

**Purpose:** Orchestrate the post-extraction evidence linking workflow — connecting extracted Data Points to Research Positions as supporting or counter-evidence.

**When to use:** After an extraction wave is complete (sources have status `extracted`, DPs exist in Convex, but positions have empty or incomplete evidence chains). This is Phase 3.75 in the Implementation Plan.

**Reference:** Architecture_Spec.md → Evidence Linking Pattern. Design Decisions 27, 28, 29.

---

## Prerequisites

Before starting evidence linking:
1. At least one extraction wave is complete (sources extracted, DPs tagged)
2. Research Positions exist (bootstrapped from CRIS or created during synthesis)
3. The `cm_get_data_points_by_tag` MCP tool is available
4. The `cm_update_position` MCP tool is available

---

## Three-Pass Workflow

### Pass 1: Tag Retrieval (Agent)

For each theme being processed:

1. **Identify 2-4 relevant tag slugs** that map to the theme's positions. Use `cm_get_tag_trends` to see available tags and their DP counts.

2. **Pull DPs for each tag** using `cm_get_data_points_by_tag(projectId, tagSlug)`. This returns clean data (ID, claim text, evidence type, confidence, source title, source tier) without embedding vectors.

3. **Handle truncation.** MCP responses truncate at 25,000 characters. Large tag pools (50+ DPs) will be partially visible. This is acceptable — work with what's visible. If exhaustive coverage is needed, use narrower tags or multiple queries.

**IMPORTANT: Do NOT use `cm_search` for evidence linking.** Semantic search returns embedding vectors (1536-dimension arrays) that blow out context windows. Tag-based retrieval is the correct approach.

### Pass 2: Curator Triage (Curator)

Present candidate DPs to the curator organized by position:

1. **Group candidates by position.** For each position in the theme, show the DPs most likely to be relevant.

2. **Recommend a classification** for each DP:
   - **Supporting** — Strengthens or validates the position's thesis
   - **Counter** — Challenges, contradicts, or introduces tension with the thesis
   - **Skip** — Tagged with a relevant tag but not directly relevant to this specific position

3. **Present concisely.** For each candidate show: claim text (truncated if needed), source title, tier, confidence, and your recommended classification.

4. **Curator decides.** The curator confirms, reclassifies, or skips each candidate. Batch approval ("approve as-is") is common for well-curated recommendations.

### Pass 2.5: Fetch Existing Evidence Arrays (Agent)

**CRITICAL: Before updating any position, fetch its current evidence arrays.**

1. **Use `cm_get_position_history`** (NOT `cm_get_position_detail`). The detail endpoint returns `supportingEvidenceDetails` and `counterEvidenceDetails` which contain full embedding vectors (~1536 dimensions per DP), causing response truncation at ~25K characters and hiding the evidence ID arrays. History returns clean ID arrays without embeddings.

2. **Extract existing arrays** from the latest version: `supportingEvidence` and `counterEvidence`.

3. **Cross-check new candidates against existing arrays** to avoid duplicates before compiling updates.

### Pass 3: Position Update (Agent)

For each position with triaged evidence:

1. **Compile FULL evidence arrays.** `cm_update_position` requires the COMPLETE updated arrays (existing + new), not just the new additions. Passing only new DPs will OVERWRITE the existing evidence.
   - Merge: `[...existingSupportingEvidence, ...newSupportingDPs]`
   - Merge: `[...existingCounterEvidence, ...newCounterDPs]`

2. **Call `cm_update_position`** with:
   - `positionId`: The position being updated
   - `currentStance`: Update to integrate new evidence into the thesis narrative. Explain what the new evidence adds.
   - `confidenceLevel`: Keep unchanged unless evidence warrants a shift
   - `status`: Keep unchanged unless evidence warrants a shift
   - `supportingEvidence`: FULL array of supporting DP IDs (existing + new)
   - `counterEvidence`: FULL array of counter-evidence DP IDs (existing + new, optional)
   - `changeSummary`: Describe what evidence was linked — format as "+NE S, +NC C" (e.g., "+5S, +2C"), list what new DPs demonstrate

3. **Verify the update.** The tool returns a new version number. Previous version is preserved (append-only).

---

## Batching Strategy

**Batch 2-3 themes per session** to manage context window size. Each theme typically has 2-4 positions and draws from 2-4 tags.

**Tag overlap is expected.** A DP can appear in multiple tag pools and can support multiple positions across different themes. The same DP ID in two positions' `supportingEvidence` is correct behavior.

**Process order suggestion:** Start with the theme that has the strongest tag coverage (most DPs in relevant tags), then move to themes with less coverage. This front-loads the most productive linking work.

---

## After All Themes Are Linked

1. **Regenerate the Research Lens** via `cm_update_research_lens`. The lens now reflects evidence-backed positions and will be stronger for subsequent extraction waves.

2. **Review confidence levels.** Some positions may warrant promotion (emerging → active → established) based on the volume and quality of linked evidence.

3. **Capture Curator Observations.** If the linking process revealed cross-theme patterns or tensions, add them via `cm_add_curator_observation`.

4. **Update the progress tracker** in Implementation_Plan.md (Phase 3.75 Evidence Linking Progress table).

---

## Incremental Linking (Round 2+)

When running evidence linking after additional extraction waves (e.g., T3 sources after T1+T2 were already linked):

1. **Filter by sourceTier.** Tag pool results include `sourceTier` for each DP. When linking newly extracted DPs, focus on the new tier (e.g., `sourceTier: 3` for T3 evidence). Previously linked DPs from earlier tiers are already in the existing evidence arrays.

2. **Use targeted tags with high density** of new-tier DPs rather than broad tags. For example, `augmentation-vs-automation` (81 DPs) may have high T3 density, while `ai-adoption-patterns` may be mostly T1/T2.

3. **Curator auto-approve mode.** If the curator says "auto approve as-is" or equivalent, compile triage internally and execute all updates without stopping for approval at each batch. This dramatically speeds up multi-batch sessions.

4. **Cross-position DP reuse is expected and correct.** The same DP can be supporting evidence for one position and counter-evidence for another, or supporting for multiple positions across themes. This is by design — a single finding can have different implications for different theses.

## Promotion Criteria (Emerging → Active)

After incremental linking, assess emerging positions for promotion:

- **Promote** when: Multi-source corroboration from 3+ independent sources, supporting DPs significantly outnumber counter, central claim is validated by different methodologies or contexts.
- **Keep emerging** when: Single-source basis (even if many DPs), volatile by its own admission, counter-evidence is as strong as supporting, or claim is too narrow/specific.
- **Key signal:** If a position gained only counter-evidence in a linking round, it's weakening, not strengthening.

## Failure Modes to Watch For

1. **Context window saturation.** If you're processing too many tags or themes at once, the context fills up and triage quality degrades. Solution: reduce to 2 themes per session.

2. **Over-linking.** Not every DP tagged with a relevant slug is actually relevant to a specific position. The curator triage pass exists to filter. Don't skip it.

3. **Missing evidence.** If a position has zero candidates from tag retrieval, the position may need different tags, or the evidence may exist under unexpected tags. Try `cm_get_tag_trends` to find related tags, or use a targeted `cm_search` query for a specific gap.

4. **Stale Research Lens.** If the lens was last generated before evidence linking, it won't reflect the strengthened positions. Always regenerate after linking is complete.

5. **cm_get_position_detail truncation.** NEVER use this for fetching existing evidence arrays — embedding vectors cause truncation at ~25K chars. Always use `cm_get_position_history` instead.

6. **Overwriting evidence arrays.** `cm_update_position` takes FULL arrays, not deltas. If you pass only new DPs, all existing evidence is lost. Always merge existing + new before calling update.

---

## Example Session Flow

```
1. Curator: "Let's link evidence for the AI Adoption Dynamics theme (3 positions)"

2. Agent identifies relevant tags: adoption-dynamics, usage-patterns, diffusion-speed
   → Pulls DPs for each tag via cm_get_data_points_by_tag

3. Agent presents triage:
   Position 1: "AI usage follows a power-law concentration"
   - [SUPPORTING] "Top 10 tasks account for 24% of consumer traffic..." (T1, strong)
   - [SUPPORTING] "Usage clusters around coding, writing, and data analysis..." (T2, strong)
   - [SKIP] "Enterprises are investing in AI training programs..." (relevant to adoption, not concentration)

4. Curator: "Approve as-is" or "Move #3 to supporting"

5. Agent executes cm_update_position for each position with triaged evidence

6. Repeat for next theme
```
