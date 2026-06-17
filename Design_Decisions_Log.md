# Curate Mind: Design Decisions Log

**Purpose:** This document captures the reasoning behind architectural decisions. Read this when you encounter a judgment call during implementation. The Architecture Spec tells you what to build. This tells you why.

**Origin:** These decisions were made during a collaborative design session on March 17, 2026, starting from an outside-in audit of the predecessor system (CRIS Research System).

---

## Decision 1: One Foundation, No Maintained Deliverables

**What:** The system maintains six foundation entities (Sources, Data Points, Curator Observations, Mental Models, Research Positions, Tags). Everything else (talking points, LinkedIn posts, presentations, summaries) is generated on demand.

**Why:** CRIS had five overlapping deliverables (Weekly Learnings, Active Ideas, Current Synthesis, Talking Points, Language Assets) that had to be kept in sync. The maintenance cost was high and the documents went stale between updates. By making the foundation queryable and well-structured, any deliverable can be generated from a prompt against the current state. This eliminates staleness and reduces maintenance to zero.

**The test:** If someone asks "should I create a new document type to store X?", the answer is almost always no. Store the data in the foundation entities. Generate the document when needed.

---

## Decision 2: Progressive Disclosure Is for Analysis, Not Extraction

**What:** The four-layer progressive disclosure model (Themes/Positions → Evidence → Verification → Full Source) applies only to how data is queried and surfaced. Extraction always runs at full fidelity regardless of source tier.

**Why:** Early in the design, progressive disclosure was mistakenly applied to extraction (e.g., "simple sources get lighter extraction"). This was corrected because data points are abstractions of the original source. If extraction is shallow, information is permanently lost. You can't go back and extract more later without reprocessing the entire source. The tier system (1/2/3) affects how data points are weighted in analysis, not whether they are extracted.

**The test:** If someone asks "should we skip enrichment for Tier 3 sources?", the answer is no. Every source gets the full pipeline. Tiering affects downstream weighting, not extraction depth.

---

## Decision 3: Three-Pass Extraction Pipeline

**What:** Extraction runs in three sequential passes: Pass 1 (core extraction, no interpretation), Pass 2 (enrichment with Research Lens), Pass 3 (curator review by exception).

**Why:** The predecessor system had context window issues when trying to do extraction and interpretation simultaneously. The model would hallucinate anchor quotes or conflate claims when asked to hold too many evaluation frames at once. Separating the cognitive tasks (comprehension/precision vs. judgment/evaluation vs. human verification) keeps each pass focused and produces higher-quality output.

**Key constraint:** Pass 1 does NOT receive the Research Lens. This prevents confirmation bias in extraction. The model extracts what the source contains, not what the curator is looking for. The Research Lens is only loaded in Pass 2, where it informs the enrichment (extraction notes, confidence signals) but cannot influence which claims were extracted.

---

## Decision 4: Intake Note Is Optional

**What:** When adding a source, the curator can optionally write a 1-2 sentence note about why they're adding it. This field is not required.

**Why:** Sometimes the curator has a clear reason ("this is the best quantitative data on the trust deficit"). Sometimes it's a gut feeling ("something about this felt important"). Forcing articulation when the signal is intuition produces bad data (generic notes written to satisfy a requirement). The system should capture perspective when it exists and gracefully proceed without it.

---

## Decision 5: Append-Only, Never Delete

**What:** No entity in the system is ever deleted or overwritten. Research Position updates create new version rows. Data points, observations, and mental models are immutable. Recovery from errors is done by reverting pointers, not deleting records.

**Why:** Two reasons. First, the system tracks how understanding evolves over time. Deleting a previous position version destroys intellectual history. The ability to ask "what did I believe about governance three months ago?" requires that old versions exist. Second, AI agents should never have delete permissions. An agent error that creates a bad record is recoverable (revert the pointer). An agent error that deletes a good record may be permanent.

**The implementation pattern:** Research Positions have an identity record (researchPositions table) with a `currentVersionId` pointer. Updates create a new row in `positionVersions` and update the pointer. The routine in-place fields are `currentVersionId` on researchPositions, `status` on sources, and `embeddingStatus` on dataPoints. Decision 32 adds a narrow correction carve-out for source metadata plus data point anchor and speaker-attribution fields, with every change preserved in the append-only `corrections` table.

---

## Decision 6: Research Positions Are Hierarchical (Themes → Positions)

**What:** Research Positions are organized under Research Themes (5-8 macro areas). Each position is its own record.

**Why:** The predecessor system (CRIS) had 18 Active Ideas in a single massive document that was too large to load into context. Making each position its own record in Convex means you never load all positions at once. The progressive disclosure model starts at themes (5-8 of them), drills into positions within a theme (3-5 per theme), and then into evidence. This also enables semantic search across positions without loading the full document.

**Position lifecycle:** Emerging (thin evidence) → Active (growing evidence, being tracked) → Established (confident, would defend in conversation) → Evolved (superseded by a more nuanced position, linked to successor) → Retired (evidence turned against it). "Established" does not mean "settled forever." It means the curator has a clear position right now. The underlying landscape can keep changing.

---

## Decision 7: Curator Observations Are Connections, Not Standalone Insights

**What:** A Curator Observation references the data points and/or positions it builds on. It is not freestanding.

**Why:** The curator's observations are typically triggered by seeing connections across existing research: "Data points X, Y, and Z together suggest something none of the original authors intended, and my experience confirms it." The observation is the connective tissue plus experiential validation. Making the references explicit means the system can trace which observations support which positions, and which data points inform which observations. This is important for the Reader persona, who needs to see which parts of a position are based on external evidence vs. curator judgment.

---

## Decision 8: Mental Models Are Captured During Extraction, Not Synthesis

**What:** When Pass 1 encounters a named framework, vivid analogy, or memorable term, it flags it. Pass 2 creates the Mental Model record.

**Why:** Mental Models are about recall, not analysis. The curator wants to be able to say "what was that framework about organizational alignment costs?" and get an answer without remembering which Research Position it relates to. Capturing during extraction (when the model encounters the concept in a source) is the natural moment. Waiting until synthesis means the concept might get lost in the volume of data points, or might only be captured if it happens to be relevant to a current position.

---

## Decision 9: Tags Live on Data Points, Not Research Positions

**What:** Tags attach to data points via junction tables. Research Positions do not have their own tags. Position-level tag queries traverse through linked evidence.

**Why:** Tags serve two purposes: retrieval (find all DPs about "governance") and trend detection (is "specification-engineering" showing up more frequently?). Both of these are pre-interpretive functions. A Research Position is a synthesized thesis, which is the curator's interpretation. Tags on DPs enable a powerful pattern: "show me all data points tagged X that aren't currently linked to any Research Position." Those orphan signals are where new positions come from.

---

## Decision 10: Convex as Source of Truth, No Local File Dependencies

**What:** All source content (fullText) and original files (Tier 1/2 PDFs) are stored in Convex. The local `sources/` folder is a working inbox. After ingestion, the system has no dependency on local files.

**Why:** The predecessor system had dual storage (markdown files + Convex) that had to stay in sync. This created maintenance overhead (index files, filename validation, tracker JSONs). Making Convex the sole source of truth eliminates that entire category of work. It also makes the system portable: you can work from any machine, and the local folder could disappear without losing anything.

---

## Decision 11: Source Tiering Affects Analysis Weight, Not Extraction Depth

**What:** Sources are classified into Tier 1 (primary research with methodology), Tier 2 (informed analysis from credible practitioners), Tier 3 (commentary and opinion). All tiers get full extraction. Tiering affects how data points are weighted during synthesis and analysis.

**Why:** The predecessor system treated all sources equally, which meant a BCG survey of 1,800 executives carried the same structural weight as a YouTube commentator's opinion. Tiering makes the epistemic weight explicit. But extraction depth stays consistent because you never know in advance which data point from a Tier 3 source might turn out to be the most important signal.

---

## Decision 12: No Frontend (Phase 1)

**What:** Phase 1 builds the Convex database and MCP server. The only interface is conversational (through Claude). No web frontend.

**Why:** The predecessor system invested in frontend infrastructure (citation parsers, HTML snapshot generators) that added complexity to every document without being regularly used. The primary interaction pattern is conversational: "what does my research say about X?" The MCP handles this. A frontend would add visual browsing and presentation, which are nice-to-have but not necessary for the Research and Analyst personas. The Reader persona (Phase 2) might warrant a lightweight frontend, but that decision should be informed by actual usage patterns.

**Exception:** The triage interface (a simple single-page React app for classifying 178 sources) is a one-time processing tool, not a permanent frontend.

---

## Decision 13: Reader Persona Access Boundary

**What:** Readers can access Layers 1-2 (Themes, Positions, Data Points as claim + interpretation + source metadata). They cannot access Layers 3-4 (verbatim anchor quotes, original source text). They are directed to source URLs for independent verification.

**Why:** Verbatim anchor quotes and original source text come from copyrighted sources (BCG reports, HBR articles, etc.). Serving these through an API to external users, especially commercially, raises copyright concerns. The Reader gets the curator's synthesized claim (which is original work) plus a pointer to the original source (URL, title, author, date) for verification. This is a cleaner legal position.

**Amendment, May 20, 2026:** The Reader persona access matrix is retired. The system now has one full-access Curator tier, while public web routes act as a demo surface rather than a separate permissioned persona. The copyright mitigation remains: anchor quotes leave the server as verification metadata used for source deep-link URLs, not as visible public-route copy. Public surfaces can show Stance, Evidence, and Source links, but they do not render full source text.

---

## Decision 14: Position Version History Replaces Evolution Logs

**What:** Instead of hand-written narrative entries ("February 22: Reinforced by Deloitte survey"), the system uses structured versioning. Each position update creates a new version row with a change summary and links to the data points that triggered the change.

**Why:** Structured versioning is queryable ("show me all position changes triggered by data points tagged 'trust-deficit'"). Narrative logs are not. Structured versioning also captures the actual before/after state (what the position said before, what it says now), while narrative logs only capture a description of the change. The intellectual history is richer and more useful.

---

## Decision 15: Research Lens as Auto-Generated System Artifact

**What:** The Research Lens is a compressed document reflecting current positions and open questions. It is auto-generated from the state of Research Positions, not manually written.

**Why:** The Research Lens serves one purpose: to give Pass 3 enrichment agents enough context to assess the significance of data points. It needs to be current and it needs to be compact (fit in a context window alongside extracted DPs). Auto-generating it from position states ensures it's always current. Versioning it in Convex shows how the curator's focus areas shift over time.

**Regeneration triggers:** Weekly after position updates (routine). When extraction flags data points that contradict current positions (exception).

---

## Decision 16: URL Ingestion Saves Locally Before Convex (Two-Step Intake)

**What:** When the URL intake flow fetches a source from the web, it does not push content directly to Convex. Instead, the fetch tool saves the scraped markdown to the local `sources/` folder (organized by the current week, e.g., `sources/2026-03/2026-03-15_to_21/`) and returns the file path. The curator reviews and cleans up the markdown. A separate confirmation step then pushes the verified content to Convex.

**Why:** Two reasons. First, scraper output is imperfect — web pages have noise (navigation, sidebars, ads, formatting artifacts) that produces lower-quality markdown. The curator wants to clean this up before it enters the foundation. Since data points are immutable once extracted, garbage-in at the fullText level means garbage-out at the data point level. Quality control before ingestion is worth the extra step. Second, this maintains a consistent local archive: every source that enters Convex also has a clean local copy in the working inbox, regardless of how it was ingested.

**The workflow:**
1. Curator provides a URL to `add_source`
2. The fetch tool scrapes the content and converts it to reviewable markdown
3. The markdown file is saved locally to `sources/{YYYY-MM}/{YYYY-MM-DD_to_DD}/`
4. Curator reviews and cleans up the file
5. Curator confirms ingestion → content is pushed to Convex with status `indexed`

**Current implementation note (April 1, 2026):** The architectural direction is Supadata for web scraping and YouTube transcripts. Some legacy code and prompts may still mention Jina during the migration, but the intended steady state is Supadata plus the same two-step local review flow.

**For paywalled or non-public sources:** The curator saves the content manually (copy/paste or PDF download), cleans it up locally, and ingests from the file — skipping the automated web fetch step entirely.

**Date:** March 21, 2026

---

## Decision 17: Project-Scoped Architecture

**What:** All content in Curate Mind is scoped to a Project — a top-level container. Sources, Research Themes, Tags, and the Research Lens all carry a `projectId`. Data Points, Curator Observations, Mental Models, and Position Versions inherit their project through their parent source or theme. Each project has its own tag vocabulary, its own Research Lens, and its own set of themes and positions.

**Why:** Curate Mind was originally designed for AI & Emerging Technology research, but the structural pattern (sources → extraction → data points → positions) is valuable for other domains: job search strategy, client project work, personal interests. Making everything project-scoped from the start prevents cross-contamination between domains. Tag trends, generated outputs (weekly learnings, talking points), and semantic search all stay clean within a project without requiring manual filtering.

**Tags are project-scoped, not global.** The same word (e.g., "governance") can mean different things in different projects. Project-scoped tags ensure that tag trends and retrieval are automatically clean. If cross-project pattern detection is needed, it will be built as a deliberate analytical tool (not the default behavior).

**What inherits project vs. what carries projectId directly:**
- `projectId` on: sources, researchThemes, tags, researchLens (direct ownership)
- Inherits project via parent: dataPoints (through sourceId), researchPositions (through themeId), positionVersions (through positionId → themeId), curatorObservations (through referenced entities), mentalModels (through sourceId)

**Cross-project bridge:** Deferred to a future phase. Will be a separate, explicit tool (e.g., `cm_search_across_projects`) that the curator invokes deliberately.

**Date:** March 22, 2026

---

## Decision 18: Expanded Anchor Quotes (10-40 Words)

**What:** Anchor quotes on data points are expanded from the original 5-15 word range to 10-40 words, with a soft target of 15-25 words. The anchor should capture the author's reasoning or evidence, not just the conclusion.

**Why:** The anchor quote serves two purposes: verification (can you find this passage in the source months later?) and context preservation (does the anchor preserve enough of the author's voice and reasoning to trust the claim without returning to the source?). At 5-15 words, the verification purpose was well served but context preservation often fell short. The Architecture Spec states that data points should be "captured at sufficient fidelity that the Analyst does not need to return to the original source under normal conditions." Expanding the range closes this gap. Storage cost is negligible — an extra 15-20 words per DP across thousands of records is trivial in Convex.

**The guidance:** Prefer anchors that capture reasoning, not just conclusions. "focused first on internal knowledge management workflows" is verifiable but thin. "the companies that saw the highest ROI — including three Fortune 100 firms we interviewed — focused first on internal knowledge management workflows, treating employee productivity as the proving ground" is verifiable AND preserves the argument.

**Date:** March 22, 2026

---

## Decision 19: Four-Stage Pipeline with Separated Cognitive Tasks

**What:** The extraction pipeline is structured as four stages, with each stage handling one focused cognitive task:

| Stage | Cognitive task |
|------|----------------|
| Extract | Comprehension + precision — extract claims, write source synthesis |
| Secondary Capture | Pattern recognition — identify configurable secondary items. Default: mental models such as frameworks, analogies, and memorable terms. |
| Enrich | Judgment + evaluation — confidence, extraction notes, tags, related DPs |
| Review | Human verification — review flags, approve, annotate |

**Why:** The original three-pass design bundled mental model flagging and tag assignment into the first extraction step alongside data point extraction. These are different cognitive modes that degrade each other when combined, especially on longer documents. Splitting them ensures each stage stays focused.

Specific changes from the original three-pass design:
- **Tagging moved from Extract to Enrich.** Tags assigned one-at-a-time during extraction are less consistent than tags assigned after seeing all DPs together. Enrich has a holistic view of the source's data points, which produces better tag assignments.
- **Secondary Capture split into its own stage.** This is a different kind of reading than data point extraction — it requires pattern recognition and synthesis rather than structured decomposition. Giving it a dedicated stage with a fresh read of the source text produces higher-quality secondary captures.
- **Source synthesis added to end of Extract.** A 2-3 paragraph analytical summary of the source's argument, tensions, and implications. Preserves document-level context that individual DPs cannot capture. Travels with source metadata into Enrich to inform enrichment.

**Amendment, May 20, 2026:** Secondary Capture is now optional and project-configurable. Mental Models remain the default capture type, but a project can disable the stage or define a different secondary capture target through its project profile.

**Date:** March 22, 2026

---

## Decision 20: Sub-Agent Architecture with Direct Convex Writes

**What:** In batch mode, each source is processed by focused sub-agents. Extract runs in one sub-agent. Secondary Capture, when enabled, runs in its own sub-agent with a fresh context window. Enrich runs in a later sub-agent. Each sub-agent writes results directly to Convex via MCP tools as it works and returns only compact summaries to the orchestrator. Review runs in the main conversation with aggregated flags.

**Why:** The system needs to handle 40+ sources per week (February had 178 sources in 28 days). Processing at this scale requires that:

1. **Each sub-agent gets a bounded context window.** A single agent running all three machine-led stages for a dense report accumulates the full source text, 25+ DP records, secondary capture candidates, and the Research Lens — the same cognitive overload problem the multi-stage design was created to solve. The staged sub-agent model gives Secondary Capture a fresh read of the source while giving Enrich a fresh context with only the DP IDs, secondary candidates, source synthesis, and Research Lens it needs.

2. **The orchestrator's context stays lean.** If sub-agents returned full DP records, the orchestrator would be holding summaries of thousands of data points. By writing to Convex and returning only compact summaries, the orchestrator can track dozens of sources without context window pressure.

3. **Later stages read from Convex, not from the orchestrator.** Enrich retrieves the DPs from Convex that Extract saved, rather than inheriting full records through the orchestrator. This is the key architectural pattern — Convex is the communication channel between extraction and enrichment, not the orchestrator context window.

**Exception: Secondary Capture output is small enough (0-5 candidates, ~20-30 lines) to pass directly to Enrich as input rather than saving to Convex first. Mental models or custom secondary items are finalized and saved to Convex by Enrich, which has the Research Lens context to check for duplicates.**

**Two operating modes:**
- **Batch mode** (cm-batch-orchestrator + cm-curator-review): Sub-agents process sources silently, curator engages during Review. For volume processing, Tier 2-3 sources.
- **Deep mode** (cm-deep-extract): Interactive single-source extraction where curator observes and engages at every stage. For Tier 1 reports and pipeline calibration.

**Amendment, May 20, 2026:** This reverses the earlier optimization that combined Extract and Secondary Capture in one sub-agent. Secondary Capture now runs in its own clean context window when enabled. Because Secondary Capture can be disabled per project, only projects that need it pay the extra source-text load.

**Date:** March 22, 2026

---

## Decision 21: Source Synthesis as a Schema Field

**What:** A `sourceSynthesis` field (optional string) is added to the sources table. Pass 1 generates a 2-3 paragraph analytical summary of the source's argument, key tensions, and strategic implications. This travels with the source into later passes.

**Why:** Individual data points capture atomic claims but lose the document-level argumentative context. The CRIS predecessor system had an "Initial Observations" section in its extraction documents that served this purpose. Without it, Pass 3 enrichment has to work from structured DP records alone, which produces thinner extraction notes. The source synthesis bridges this gap — it tells Pass 3 "what this source is actually arguing" so enrichment notes can connect DPs to the source's broader argument.

**Stored on the source record (not as a separate entity) because:** it's a property of the source, generated once during extraction, and doesn't need its own versioning or linking. It's analogous to `intakeNote` (curator's perspective before reading) but written by the extraction agent after reading.

**Date:** March 22, 2026

---

## Decision 22: Separate Tag Assignment Tool for Pass 3

**What:** Added a `cm_update_data_point_tags` MCP tool backed by a `dataPoints.updateTags` Convex mutation. This allows tags to be added to existing data points after creation. Additive only — does not remove existing tag links.

**Why:** The four-pass pipeline (Decision 19) deliberately leaves tags empty in Pass 1 and assigns them in Pass 3, where the agent has seen all DPs from the source and can make holistic, consistent tag assignments. But the original MCP only allowed tags at creation time (via `cm_save_data_points`). This meant Pass 3 had no way to retroactively assign tags. Discovered during the first pipeline test on the Anthropic Economic Index report (March 22, 2026).

**Why additive-only:** Consistent with the append-only rule. If a tag assignment is wrong, the resolution is to add a better tag, not remove the incorrect one. Tag links are lightweight junction table rows — over-tagging is a minor cost; missing tags break retrieval.

**Date:** March 22, 2026

---

## Decision 23: Sub-Agent Per Pass for Batch Extraction

**What:** Each source in batch mode gets one sub-agent per extraction pass, each with a fresh context window containing only what that pass needs. Pass 1 gets just the source text. Pass 3 gets the Research Lens + source synthesis + DPs from that source.

**Why:** Validated during Step 3.5 testing. Sources 1-2 were extracted inline (same conversation). By Source 2 Pass 3, the context window carried all of Source 1's data, the CRIS merge work, and the Research Lens — competing for attention during precise enrichment decisions. Sources 3-4 used sub-agents and produced comparable quality with better context isolation. The risk compounds at scale: by source 10 inline, the context window would be saturated.

**The test:** If extraction quality degrades on later sources in a batch, check whether the sub-agent received a clean context or inherited accumulated state.

**Date:** March 22, 2026

---

## Decision 24: Controlled Tag Vocabulary Enforced in Sub-Agent Prompts

**What:** Sub-agent extraction prompts must include the complete controlled tag vocabulary and an explicit instruction: "Use ONLY these tag slugs. Do NOT create new tags." Tags are only created by the curator, not by extraction sub-agents.

**Why:** Source 3's sub-agent created 20 rogue tags because the prompt listed available tags but didn't explicitly prohibit creating new ones. These rogue tags now exist in Convex (append-only, cannot delete) and create noise in retrieval. Source 4 used the corrected prompt and stayed within vocabulary. At 178 sources, unconstrained tag creation would produce hundreds of overlapping, inconsistent tags.

**The test:** After each batch wave, check `cm_get_tag_trends` for unexpected slugs. If any appear, the sub-agent prompt constraint leaked.

**Date:** March 22, 2026

---

## Decision 25: CRIS Research Lens Bootstrap Before Batch Processing

**What:** Bootstrapped the Research Lens from CRIS deliverables (155+ extractions, ~3,000 DPs, 18 Active Ideas) before processing new sources. Created 7 CRIS themes and 16 CRIS positions at their actual confidence levels (active/established), rather than building the lens incrementally from scratch.

**Why:** Source 1's extraction produced only "emerging" positions — too thin for meaningful Pass 3 enrichment. The Research Lens is what gives Pass 3 its analytical power: connecting new DPs to existing positions, identifying convergent evidence, and flagging counter-evidence. Without a substantive lens, Pass 3 degrades to basic tagging. Bootstrapping from CRIS preserved 2+ months of accumulated research understanding.

**The test:** If Pass 3 enrichment notes feel generic or disconnected from research themes, the Research Lens may need regeneration with updated positions.

**Date:** March 22, 2026

---

## Decision 26: Curator Observations for Cross-Source Tension Signals

**What:** Used Curator Observations to capture tension signals and cross-source patterns that emerge during extraction but don't belong to a specific Research Position yet. Each observation links to specific DPs and positions, includes a "Watch for" signal for future extractions.

**Why:** Open questions on positions capture uncertainties within a known thesis. But some findings create tensions between positions or suggest entirely new positions that aren't ready to formalize. These were being lost at the end of each session. Curator Observations are the designed entity for this — connective insights bridging data points and positions — but weren't being used in the pipeline until this was identified during testing.

**The test:** At the end of each extraction batch, ask: "Did any cross-source patterns emerge that don't fit neatly into an existing position?" If yes, capture as a Curator Observation, not a position.

**Date:** March 22, 2026

---

## Decision 27: Tag-Based Retrieval Over Semantic Search for Evidence Linking

**What:** When linking data points to Research Positions (evidence linking), use `cm_get_data_points_by_tag` (tag-based retrieval) instead of `cm_search` (semantic search). Tags are the primary retrieval mechanism for building evidence pools.

**Why:** Semantic search (`cm_search`) returns full embedding vectors (1536-dimension arrays) alongside each result. When building evidence pools for position linking, you need to review dozens or hundreds of DPs. The embedding data blows out context windows — a search returning 20 results can consume 50K+ tokens on embedding arrays alone, leaving no room for the actual claim text, triage decisions, or position update calls. Tag-based retrieval returns clean data (ID, claim text, evidence type, confidence, source title, source tier) with no embeddings.

Additionally, semantic search matches against specific stance language, which can miss broader evidence. A position about "specification bottleneck" might not semantically match a DP about "85% of knowledge workers lack a value-driving AI use case" — but that DP is tagged `specification-bottleneck` because the enrichment pass (Pass 3) made the connection with the Research Lens in context.

**The test:** If you need to find DPs that relate to a Research Position, start with tag-based retrieval on 2-4 relevant tags. Only fall back to semantic search for very specific, narrow queries where tag coverage might miss something.

**Date:** March 23, 2026

---

## Decision 28: Three-Pass Evidence Linking Workflow

**What:** After extraction is complete for a batch of sources, evidence linking (connecting DPs to Research Positions) follows a three-pass workflow:

| Pass | Name | Actor | Purpose |
|------|------|-------|---------|
| Pass 1 | Tag Retrieval | Agent | Pull DPs by tag slug using `cm_get_data_points_by_tag`. Use 2-4 tags per theme. |
| Pass 2 | Curator Triage | Curator (Maicol) | Review candidate DPs. Classify each as supporting, counter-evidence, or skip. |
| Pass 3 | Position Update | Agent | Execute `cm_update_position` with the triaged evidence arrays. |

**Why:** Evidence linking is a separate cognitive task from extraction. It requires judgment about which data points actually strengthen, challenge, or are irrelevant to a specific thesis. Attempting to do this automatically during extraction (Passes 1-4) would either miss most connections (extraction agents focus on one source at a time) or overwhelm the context window (loading all positions during each source extraction). The three-pass workflow keeps each step focused: retrieval is mechanical, triage is human judgment, update is mechanical.

**Batch themes 2-3 at a time** to manage context window size. Each theme typically has 2-4 positions and draws from 2-4 tags.

**The test:** If position updates feel thin or miss obvious evidence, check whether the right tags were used for retrieval. Tags are the bridge between extraction and positions.

**Date:** March 23, 2026

---

## Decision 29: Handling MCP Response Truncation During Evidence Linking

**What:** MCP tool responses truncate at 25,000 characters. Large tag pools (50+ DPs) will be partially visible in a single retrieval. This is acceptable — work with what's visible and iterate if needed.

**Why:** The 25K character limit exists to prevent context window saturation (a single tool response shouldn't consume the entire conversation). For evidence linking, this means a tag with 133 DPs will show roughly 60-80 DPs before truncation. The strongest candidates tend to appear in the visible set because DPs are returned in extraction-date order (most recent first). If a theme requires exhaustive coverage, run multiple tag queries with narrower tags rather than one broad query.

**Overlap across tags is expected and acceptable.** A single DP can support multiple positions across different themes. The `cm_update_position` tool accepts DP ID arrays — the same ID appearing in two positions' `supportingEvidence` is the correct behavior, not a data integrity issue.

**The test:** After linking evidence to a theme, if a position still has zero evidence and you suspect relevant DPs exist, try additional tags or use `cm_search` for a targeted semantic query on a specific gap.

**Date:** March 23, 2026

---

## Decision 30: Controlled Mutations Are Allowed for Structural Maintenance

**What:** The append-only rule (Decision 5) protects *knowledge entities* — data points, positions, observations, mental models, and position version history. It does **not** prohibit structural maintenance operations on plumbing records (junction table rows, tag assignments, source status fields) when there is a clear, documented justification.

Allowed mutation types (with justification required):
1. **Tag reassignment** — Moving DPs from a retired/duplicate tag to its canonical replacement (e.g., `measurement-metrics` → `measurement-framework`). Junction row deleted, canonical row created.
2. **Tag link cleanup** — Removing an incorrect tag assignment made by an extraction agent error (e.g., a rogue tag from a sub-agent that ignored the controlled vocabulary).
3. **Source status correction** — Resetting a source status after a failed extraction that left it in an inconsistent state.
4. **Extraction error recovery** — If an agent writes malformed data points (e.g., missing anchors, wrong source ID), the bad records can be marked or removed rather than left as noise in the foundation.

**What remains strictly append-only:**
- Data point claim text (immutable once created)
- Data point verbatim anchors except for logged correction writes described in Decision 32
- Position version history (never delete old versions)
- Curator observations and mental models (immutable once created)
- Research Lens history (each generation is a snapshot)

**Why:** Decision 5 was written before the system had 91 extracted sources and 120+ tags. At scale, structural maintenance becomes necessary — tag vocabularies evolve, extraction agents make mistakes, and consolidation improves retrieval quality. The original rationale for append-only (preserving intellectual history + preventing catastrophic agent errors) still holds for knowledge entities. But applying it rigidly to junction table rows creates data quality debt that compounds over time.

**The guardrail:** Every mutation must be (a) logged in this Design Decisions Log or in a migration script with comments, (b) scoped to plumbing records, never knowledge entities, and (c) reversible (you can always re-create a junction row). No general-purpose delete mutations are added to the MCP server. Maintenance mutations are Convex-side scripts run manually.

**Relationship to Decision 5:** This extends, not replaces, Decision 5. The core principle — "the system tracks how understanding evolves, so don't destroy history" — is unchanged. This decision clarifies that *structural plumbing* is not *intellectual history*.

**Date:** March 24, 2026

---

## Decision 31: Two-Mode Query Protocol — `cm_search` for Exploration, `cm_ask` for Analysis

**What:** The MCP query interface is split into two distinct tools with non-overlapping purposes:

- **Mode 1 (`cm_search`):** Semantic vector search across all entity types. For exploration: scanning for emerging signals, pressure-testing a brief, or doing early corpus work before positions exist. Does not produce citations — source links in results are not resolved. Output is meant to spark a reaction or surface patterns, not support a cited argument.

- **Mode 2 (`cm_ask`):** Progressive disclosure analyst tool. Always surfaces positions first (Layer 1 — the curator's current stance), then curator observations and mental models (Layer 2 — connective reasoning), then data points with resolved source links (Layer 2). Verbatim anchor quotes are included in the pack for Layer 3 verification on demand. Returns a structured pack with inline citation labels: `[P#]` for positions, `[O#]` for observations, `[M#]` for mental models, `[E#]` for data point evidence.

**Why:** Without `cm_ask`, Claude defaulted to `cm_search` for all queries — both exploration and analysis. This produced two problems: (1) answers that led with raw evidence clusters rather than the curator's synthesized position, burying the most important context; and (2) hallucinated source links. `cm_search` returns embedding vectors and unresolved source metadata. When Claude tried to construct source URLs from this, it fabricated URLs that looked plausible but didn't exist. Analyst answers became uncitable.

**Why not just fix `cm_search`?** The two modes serve genuinely different workflows, not just different output formats. Exploration needs breadth: scan across entity types, surface patterns, return results that spark a perspective. Analysis needs depth: start from synthesized positions, layer in grounded evidence, resolve every source to an actual link. Collapsing them into a single tool with a flag would require loading the full progressive disclosure machinery for every exploratory query — slower, more expensive, and semantically wrong for early-corpus work when positions don't exist yet.

**`cm_retrieve_evidence_pack` as the predecessor:** Before `cm_ask`, there was `cm_retrieve_evidence_pack` — a tool that fetched data points with resolved source links for a specific position. It partially addressed the hallucinated-URL problem, but it didn't include positions or observations, so Claude still had to synthesize the curator's stance from evidence rather than retrieving it. `cm_ask` expands this into the full analyst pack: positions first, evidence second, all source links resolved throughout. The predecessor tool was removed on May 25, 2026; `cm_ask` is now the only cite-and-trace interface.

**The boundary rule:** Do not use `cm_search` to produce cited answers. Do not use `cm_ask` for early corpus exploration when positions don't yet exist.

**Date:** May 2026

---

## Decision 32: Logged Corrections for Anchors, Attribution, and Source Metadata

**What:** Data points are append-only with respect to claims and tags, but their verbatim anchor and speaker-attribution fields support corrections through a logged in-place write. Source descriptive metadata fields (`publisherName`, `authorName`, `canonicalUrl`, `publishedDate`, `tier`) use the same correction pattern. Every correction creates an immutable row in the `corrections` table before the target field is patched.

**Why:** Pass 4 review and post-hoc audits surface small factual-plumbing errors that should not require re-extraction or pointer recovery: mistyped anchors, wrong anchor passages, missing transcript speaker attribution, or source metadata misread during intake. Versioning every typo or attribution fix would add ceremony without improving analysis. The correction row preserves the previous value and curator rationale, so the audit trail remains intact.

**The implementation pattern:** `cm_correct_anchor` handles `anchor_text`, `anchor_passage`, `anchor_missing`, and two-DP `anchor_swap` corrections. `cm_correct_attribution` handles source metadata fixes and `dp_speaker_attribution`. The write happens in one Convex mutation: insert the `corrections` row, then patch the target field. For anchor swaps, both correction rows and both data point patches happen atomically in the same mutation.

**Guardrails:** Anchor corrections require 10-40 words and a reason of at least 10 characters. The tool checks the source `fullText` for a case-insensitive, whitespace-tolerant substring match and returns a warning when no match is found, but allows the curator to proceed. Source URL corrections must parse as HTTP(S) URLs. Published dates must be valid `YYYY-MM-DD` ISO dates. Speaker attribution is structured metadata, not a claim rewrite.

**Relationship to Decision 5:** This is a deliberate carve-out, not a repeal. The system still does not rewrite claims, delete evidence, or mutate position history. It allows a small set of verification and attribution fields to be corrected while preserving the previous value in an append-only audit table.

**Date:** May 15, 2026

---

## Decision 33: Secondary Capture as a Customizable Stage

**What:** Secondary Capture is project-configurable. Projects can keep the default Mental Models capture, disable the stage, or define a custom secondary capture target with a label and free-text description.

**Why:** Mental model scanning is valuable for the original Curate Mind corpus, but open-source users may care more about other recurring items: decision points, methodology limitations, dollar amounts, named products, risks, or quotations. Locking the second stage to mental models forces every project into one cognitive shape. A configurable label and description gives users flexibility without requiring dynamic schemas or custom extraction code.

**The implementation pattern:** `secondaryCaptureEnabled`, `secondaryCaptureLabel`, and `secondaryCaptureDescription` live on the project profile. The default label is "Mental Models" and continues to use the existing mental model storage path. Non-default capture types use a generic secondary item storage path.

**Date:** May 20, 2026

---

## Decision 34: Three-Band Response Shape Replaces Four-Layer Access Matrix

**What:** The old four-layer progressive disclosure model is replaced in user-facing documentation with three response bands: Stance, Evidence, and Source.

**Why:** The four-layer model was originally tied to a Reader versus Analyst access matrix. That permission model was never implemented as a separate product boundary, and the web frontend already behaves more like a public demo than an authenticated Reader interface. What remains useful is the answer shape: start with the project's current stance, support it with evidence, and provide source provenance for verification.

**The guardrail:** Anchor quotes remain verification metadata. Public routes can use them to construct source deep links, but should not render them as visible public copy. MCP tools can still return full source context for the curator.

**Date:** May 20, 2026

---

## Decision 35: Three Customization Layers

**What:** Open-source customization is organized into three layers: Locked System Behavior, Project Profile, and User Style.

**Why:** Users need to adapt Curate Mind to their own research without accidentally weakening the parts that make the system reliable. The locked layer protects the method: citation contracts, append-only behavior, the extraction stages, and the Explore versus Cite-and-Trace query boundary. The project profile captures facts that vary by research project: domain, audience, time horizon, preferred vocabulary, suggested prompts, and Secondary Capture settings. User style captures writing preferences that should follow the person across projects.

**The implementation pattern:** Locked behavior remains in source code and can be previewed but not edited. Project Profile lives on the `projects` table and is read with `cm_get_project_profile`. User Style lives in a singleton preferences record and is read separately so one person's voice can apply across projects.

**Date:** May 20, 2026

---

## Decision 36: Descriptive Stage Naming in User-Facing Surfaces

**What:** User-facing surfaces use descriptive stage names: Extract, Secondary Capture, Enrich, and Review. Pass numbers are deprecated in current workflow instructions, README language, and agent-facing guidance.

**Why:** The repo had accumulated overlapping vocabularies: pass numbers in the architecture spec, sub-agent labels in batch orchestration, and phase language in weekly skills. New users could not tell whether these were different workflows or different names for the same workflow. Descriptive stage names make the workflow self-explanatory and portable across projects.

**The guardrail:** Internal implementation details can keep existing function names where changing them would create churn. Documentation, prompts, skills, and assistant instructions should use the stage names unless they are describing historical decisions.

**Date:** May 20, 2026

---

## Decision 37: One Corrections Table, and Claim Text Becomes Correctable

**What:** Two parallel correction subsystems existed. The live MCP tools (`cm_correct_anchor`, `cm_correct_attribution`) wrote the `corrections` table and patched the target field in place, while a separate, orphaned write path wrote a `dataPointCorrections` table and set a `dataPoints.currentCorrectionId` pointer. The read layer (`resolveEffectiveContent`) only consulted the orphaned table, so corrections succeeded but `correctionStatus` never reflected them. The `corrections` table is now the single source of truth. `resolveEffectiveContent` returns the in-place effective values (`anchorQuote`, `claimText`) and computes `correctionStatus` by reading the `corrections` table via a new `by_target` index. The orphaned `dataPointCorrections` write path and the `currentCorrectionId` pointer were retired.

This decision also reopens claim text to logged correction. Decision 32 (amended) had locked claim text entirely; `cm_correct_claim` now allows a logged, append-only claim correction with a 0.5x-2x length guard that keeps it a correction rather than a substantive rewrite. The corrected claim is patched in place, the prior value is preserved in the `corrections` row, and `embeddingStatus` is reset so semantic search reindexes.

**Why:** A correction that does not show up in `correctionStatus` is worse than no correction, because it looks unverified. Converging on one append-only table removes the split-brain and matches the pattern Decision 32 already described ("insert the `corrections` row, then patch the target field"). Claim text corrections were a real curator need (mis-transcribed claims) that the orphaned path served accidentally; making them a first-class, guarded, logged tool keeps the audit trail honest.

**Append-only guarantees:** No row in either table is deleted. A backfill migration (`migrations.backfillCorrections`, with a `dryRun` mode) carries every retired `dataPointCorrections` row into `corrections` and materializes the latest effective value onto each data point, so historical corrections still resolve. The retired `dataPointCorrections` table is kept and its rows remain findable by `dataPointId`. The vestigial `dataPoints.currentCorrectionId` pointer was confirmed unset on every data point (a consequence of the append-only invariant and an empty retired table) and removed from the schema; see the note in `convex/migrations.ts` for the recovery path if a deployment is ever found to still carry it.

**Relationship to Decision 5 and 32:** Still a deliberate carve-out, not a repeal. Claims, evidence, observations, and position history are not silently rewritten. Claim text joins anchors, speaker attribution, and source metadata as a narrow set of fields correctable only through a logged, append-only write.

**Date:** June 17, 2026

---

## Decision 38: Append-Only Supersede and Source Lineage

**What:** A single data point can now be retired or replaced without failing its whole source, and a re-ingested source can be explicitly linked to the one it replaced. Two new lifecycle states, both append-only:

- **Data point supersede/retire.** `dataPoints` gains `status` (active | superseded | retired), `supersededBy` (a pointer to the replacement data point), `supersededAt`, and `supersedeReason`. `cm_supersede_data_point` (mutation `supersedeDataPoint`) sets these in place. A replacement id makes the data point `superseded`; omitting it makes the data point `retired` (removed, no replacement). A reason of at least 10 characters is required, matching the correction tools. A data point that is already superseded or retired cannot be changed again. The original `claimText` and `anchorQuote` are never altered.
- **Source replacement lineage.** `sources` gains `supersededBy` (forward pointer on the retired source), `replaces` (back pointer on the new source), `supersededAt`, and `supersedeReason`. `cm_supersede_source` (mutation `supersedeSource`) sets both pointers and marks the old source `status: "failed"`. The replacement source is added normally with `cm_add_source` first; this is a separate, focused mutation rather than an overload of `cm_add_source`/`cm_update_source_status`, because the curator decides a source is a replacement only after the new one already exists, and a generic status setter should not carry lineage semantics.

**Read behavior (the high-risk part):** superseded and retired data points are excluded from *live evidence* by default but remain *fetchable by id*, and their lifecycle status is surfaced wherever a data point is returned.

- Excluded by default: `cm_ask` (filtered at the single `hydrateDataPoints` chokepoint, covering carried and fresh evidence for both grounded and analyst modes), `cm_search`, the public web routes (`hydratePublicDataPoints`, and `getSourceDetail`, which backs the public source page and the source-scoped ask context), and `cm_get_data_points_by_tag` (the evidence-linking pool; pass `includeSuperseded: true` to override).
- Kept (with status surfaced): `cm_get_data_point`, `cm_get_data_points_batch`, `cm_list_data_points_by_source`, and the curator source views. A superseded data point that is filtered out is simply dropped; its replacement surfaces on its own if relevant (no automatic substitution).
- `cm_link_evidence_to_position` returns a non-blocking warning if any added evidence data point is superseded or retired.
- Chunk-1 usage tools (`cm_get_data_point_usage`, `cm_get_source_usage`) report the data point's supersede status and `supersededBy`, and the source's `replaces` / `supersededBy` lineage.

**Why:** Before this, retiring a single bad claim meant failing or re-extracting its whole source, and replacement lineage lived only in handoff docs. Excluding retired evidence from cited answers and the public site keeps the corpus honest, while keeping it fetchable by id preserves the audit trail.

**Append-only guarantees:** Nothing is deleted and no original content is overwritten. Only the lifecycle/lineage fields are set, once, and cannot be re-pointed. This extends the existing in-place-update whitelist (previously `currentVersionId` on positions, `status` on sources, `embeddingStatus` on data points) to the data point lifecycle fields and source lineage fields. A migration (`migrations.backfillDataPointStatus`, paginated; `migrations.backfillSourceLineage`, with a `dryRun` mode) initializes existing data points to `active` and backfills the known OpenAI re-ingestion lineage; reads treat a missing status as `active`, so they stay correct even before the backfill runs.

**Date:** June 17, 2026

---

*When making implementation decisions not covered here, apply this test: does this decision serve the foundation (persistent, queryable, append-only knowledge structure) or does it serve a specific output? If the latter, it probably doesn't belong in the core system. Generate it on demand instead.*
