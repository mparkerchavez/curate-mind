# Curate Mind: Architecture Specification

**Date:** March 17, 2026 (last updated May 25, 2026)
**Author:** Maicol Parker-Chavez (with Claude)
**Status:** Actively being built (Phases 1-3 complete)
**Predecessor:** CRIS Research System (February 2026)

---

## What Curate Mind Is

A personal research curation system for tracking AI trends, extracting insights from sources, synthesizing research positions, and providing a queryable knowledge base that supports analysis, communication, and decision-making.

The system is built on a single principle: **build a robust foundation, generate everything else on demand.**

---

## Design Principles

### 1. Foundation vs. Generated Outputs

The foundation is the persistent, always-maintained knowledge structure. It consists of six entity types (detailed below) that are curated, versioned, and queryable. Everything else, talking points, LinkedIn posts, presentations, client briefs, trend reports, weekly summaries, is generated on demand by prompting against the foundation. No maintained deliverables. No documents that go stale.

### 2. Response Bands (Analysis, Not Extraction)

When querying the knowledge base, the system defaults to the highest level of compression and drills deeper only when the user requests it. The old four-layer progressive disclosure language is deprecated; the current answer shape uses three bands:

- **Stance:** Research Themes and Research Positions: what the project currently says about the question. Most queries are answered here first.
- **Evidence:** Data points, curator observations, and secondary items such as mental models that support or challenge the stance. Evidence items carry anchor quotes as metadata for source deep links, but public routes do not render the quote text visibly.
- **Source:** Provenance metadata: title, author, publisher, date, canonical URL, and resolved links to the original source. MCP tools can fetch full source text for the curator when needed.

Response bands apply to how data is queried and surfaced. They do **not** apply to extraction. Every source that enters the pipeline receives full-fidelity extraction.

**`cm_ask` implements the response-band shape server-side.** The `cm_ask` MCP tool fetches the relevant material in a single call and returns a structured pack: positions first (the current stance on the topic), then supporting evidence (curator observations, secondary items, and data points with resolved source links), with anchor quotes included as verification metadata. Every substantive claim in the pack carries an inline citation label: `[P#]` for positions, `[O#]` for observations, `[M#]` for mental models, `[E#]` for data point evidence. This is the primary tool for cite-and-trace queries. See Design Decision 31 for why it exists as a separate tool from `cm_search`.

### 3. Append-Only Data Architecture

Nothing is deleted. Nothing is overwritten. Every change creates a new record.

- Research Positions are versioned: updates create new version records; previous versions remain intact and queryable.
- Data Points are immutable once created.
- Curator Observations are immutable once created.
- Mental Models are immutable with optional annotations.
- Recovery from agent errors is always possible by reverting a pointer, never by restoring deleted data.

### 4. Full-Fidelity Extraction

Every source that enters the pipeline receives thorough extraction regardless of source tier. The tier affects how data points are weighted in analysis and synthesis, not whether they are extracted thoroughly. Data points are abstractions of the original source. They must be captured at sufficient fidelity that the curator does not need to return to the original source under normal conditions.

### 5. Convex as Source of Truth (No Local File Dependencies)

All source content and files are stored in Convex. The system has no dependency on local file paths after ingestion.

- **Source text:** The `fullText` field on every source record contains the complete text content. This is what the extraction pipeline reads from and what curator-facing MCP tools can fetch when full context is needed.
- **Original files (Tier 1 and Tier 2 PDFs):** Uploaded to Convex file storage during ingestion. Preserves charts, tables, and visual layouts that plain text cannot capture. Referenced via `storageId` on the source record.
- **Tier 3 and markdown sources:** Fully captured by `fullText`. No original file upload needed.
- **Local `sources/` folder:** Functions as a working inbox. New sources land here when downloaded or saved. After ingestion into Convex, the local file has served its purpose. The local folder is a convenience, not a dependency.

This means: if the local folder disappeared, nothing would be lost. The MCP reads from Convex. The extraction pipeline reads from Convex. Curator queries read from Convex. The system is portable across machines.

---

## User Access Model

### Curator

The curator uploads sources, tracks the processing workflow, ensures extraction quality, writes curator observations, captures secondary items, and queries the knowledge base for analysis. This is the single full-access tier.

**Needs:** Efficient intake workflow. Full workflow visibility. Ability to review and annotate at every stage. Cross-referencing across time. Semantic search across all entity types. Ability to verify any claim against source metadata and, when needed, full source text.

**Interface:** MCP with full access to all tools. Public web routes may expose synthesized stance, evidence, and source links, but the MCP remains the primary interface for full-fidelity research work.

---

## Foundation Entities

### 0. Projects

Top-level containers that scope all content. See Design Decision 17.

| Field | Description | Notes |
|-------|-------------|-------|
| name | Project name (e.g., "AI Strategy & Adoption") | Required |
| description | Brief description of the project's scope | Optional |
| createdDate | When the project was created | Auto-generated |

All sources, themes, tags, and the research lens carry a `projectId`. Data points, positions, and other entities inherit their project through their parent. Cross-project queries are a deliberate future feature, not the default.

### 1. Sources

The provenance record for every piece of external content that enters the system.

| Field | Description | Notes |
|-------|-------------|-------|
| projectId | Reference to parent project | Required. See Design Decision 17. |
| title | Source title | Required |
| authorName | Author or creator | Optional |
| publisherName | Publication or platform | Optional |
| canonicalUrl | URL to original source | Optional (not all sources have URLs) |
| publishedDate | Original publication date | Optional |
| sourceType | article, report, podcast, video, etc. | Required |
| tier | 1 (primary research), 2 (informed analysis), 3 (commentary) | Required |
| intakeNote | Curator's reason for adding this source | Optional (sometimes it's a gut feeling) |
| urlAccessibility | public, paywalled, private | Required (informs source-link behavior) |
| fullText | Complete source text (extracted from PDF, fetched from URL, or pasted) | Required. Stored in Convex. Available through curator-facing MCP tools; not rendered on public routes. |
| contentHash | SHA256 for deduplication | Auto-generated |
| storageId | Reference to original file in Convex file storage | Upload for Tier 1 and Tier 2 PDFs (preserves visual layout). Optional for all others. |
| wordCount | Word count of fullText | Auto-generated |
| sourceRelationships | References to related sources (derivative, responds-to, etc.) | Optional |
| ingestedDate | When the source was added to the system | Auto-generated |
| sourceSynthesis | 2-3 paragraph analytical summary of the source's argument, tensions, and implications. Written at end of Extract. | Optional. See Design Decision 21. |
| status | indexed, extracted, failed | Auto-managed by pipeline |

### 2. Data Points

The atomic unit of the entire system. Each data point represents a single curated claim extracted from a source, anchored by verbatim text.

| Field | Description | Notes |
|-------|-------------|-------|
| sourceId | Reference to parent source | Required |
| dpSequenceNumber | Order within the source extraction | Auto-incremented |
| claimText | The synthesized claim | Required |
| anchorQuote | Verbatim 10-40 words from source (target 15-25). Capture the author's reasoning, not just the conclusion. | Required. Used as verification metadata and source deep-link support. See Design Decisions 13 and 18. |
| extractionNote | Why this DP matters; significance and context | Added during Enrich |
| evidenceType | statistic, framework, prediction, case-study, observation, recommendation | Required |
| confidence | strong, moderate, suggestive | Added during Enrich |
| locationType | paragraph, page, timestamp, section | Required |
| locationStart | Location reference within source | Required |
| relatedDataPoints | Array of DP IDs from the same source that form an argument chain | Optional, added during Enrich |
| extractionDate | When this DP was extracted | Auto-generated |
| embedding | 1536-dim vector (OpenAI text-embedding-3-small) | Auto-generated |
| tags | Linked via junction table (dataPointTags) | Required (at least 1) |

### 3. Curator Observations

The curator's connective insights. These bridge data points and positions in ways the original sources don't, grounded in the curator's professional experience and perspective.

| Field | Description | Notes |
|-------|-------------|-------|
| observationText | The insight or connection being made | Required |
| referencedDataPoints | Array of DP IDs this observation builds on | Optional (may reference positions instead, or both) |
| referencedPositions | Array of Research Position IDs this relates to | Optional |
| capturedDate | When the observation was made | Auto-generated |
| embedding | 1536-dim vector | Auto-generated |
| tags | Linked via junction table | Optional |

### 4. Mental Models

Reusable cognitive tools: frameworks, analogies, memorable terms, and concepts. Captured during extraction, used for recall and communication.

| Field | Description | Notes |
|-------|-------------|-------|
| modelType | framework, analogy, term, metaphor, principle | Required |
| title | Name of the mental model (e.g., "Capability-Dissipation Gap") | Required |
| description | What it means and how to use it | Required |
| sourceId | Source where first encountered | Required |
| sourceDataPointId | Specific DP it was extracted from | Optional |
| capturedDate | When it was added | Auto-generated |
| embedding | 1536-dim vector | Auto-generated |
| tags | Linked via junction table | Optional |

### 5. Research Positions (Versioned)

The curator's synthesized theses about the research landscape. Organized under Research Themes. Every update creates a new version; nothing is overwritten.

**Research Themes table (project-scoped, see Design Decision 17):**

| Field | Description | Notes |
|-------|-------------|-------|
| projectId | Reference to parent project | Required |
| title | Theme name (e.g., "Enterprise AI Adoption Constraints") | Required |
| description | Brief description of the theme's scope | Optional |
| createdDate | When the theme was established | Auto-generated |

**Research Positions table (identity record):**

| Field | Description | Notes |
|-------|-------------|-------|
| themeId | Parent Research Theme | Required |
| title | Position title | Required |
| currentVersionId | Pointer to the latest version | Updated on each new version |
| createdDate | When the position was first created | Auto-generated |

**Position Versions table (append-only):**

| Field | Description | Notes |
|-------|-------------|-------|
| positionId | Parent Research Position | Required |
| versionNumber | Sequential version number | Auto-incremented |
| previousVersionId | Pointer to prior version | Null for version 1 |
| currentStance | The curator's current thesis statement | Required |
| confidenceLevel | emerging, active, established | Required |
| status | emerging, active, established, evolved, retired | Required |
| supportingEvidence | Array of DP IDs | Required (at least 1) |
| counterEvidence | Array of DP IDs | Optional |
| curatorObservations | Array of Curator Observation IDs | Optional |
| mentalModels | Array of Mental Model IDs | Optional |
| openQuestions | Array of strings: what would change this position | Optional |
| changeSummary | What triggered this version (which new DPs, what shifted) | Required (except version 1) |
| versionDate | When this version was created | Auto-generated |
| embedding | 1536-dim vector of currentStance | Auto-generated |

### 6. Tags

Flat controlled vocabulary applied to data points. Powers retrieval and trend detection. Project-scoped (see Design Decision 17).

| Field | Description | Notes |
|-------|-------------|-------|
| projectId | Reference to parent project | Required. Tags are scoped to a project. |
| name | Display name | Required |
| slug | URL-safe identifier | Required, unique within project |
| category | Optional grouping (topic, method, sector, etc.) | Optional |

**Junction tables:** dataPointTags, curatorObservationTags, mentalModelTags. Tags do not attach to Research Positions directly; position-level tag queries traverse through linked evidence.

### 7. Research Lens (System Artifact)

A compressed document reflecting the current state of Research Positions. Auto-generated, not manually maintained. Project-scoped (see Design Decision 17).

| Field | Description | Notes |
|-------|-------------|-------|
| projectId | Reference to parent project | Required |
| currentPositions | Compressed list of active position stances (5-8 strongest) | Auto-generated from position versions |
| openQuestions | Aggregated from position open questions | Auto-generated |
| surpriseSignals | What evidence would challenge current positions | Auto-generated |
| generatedDate | When this lens was created | Auto-generated |
| triggeredBy | "weekly-synthesis", "exception-signal", or "manual" | Auto-set |

Regenerated weekly after position updates. Exception trigger: when extraction flags data points that contradict current positions.

---

## Extraction Pipeline

*See Design Decisions 19 (four-stage pipeline) and 20 (sub-agent architecture) for full reasoning.*

### Overview

Every source goes through a four-stage workflow. Each machine-led stage handles one focused cognitive task and runs with its own bounded context window. Sources are processed one at a time. Sub-agents write directly to Convex; the orchestrator receives only compact summaries. Convex is the communication channel between stages, not the context window.

### Extract: Document Preparation and Core Extraction (Sub-agent A)

Extract begins by classifying the document and determining processing strategy:

- **Under 15,000 words:** Process as a single unit (most articles, newsletters)
- **15,000–30,000 words:** Process in 2 chunks, split at natural section breaks
- **Over 30,000 words:** Process in chunks of ~10,000 words at section breaks

**Cognitive task:** Comprehension and precision.

**Inputs:** Source text and metadata from Convex.

**Outputs per data point:** Claim text, anchor quote (10-40 words, target 15-25), location, evidence type. No tags. No interpretation.

**Also produces:** A 2-3 paragraph source synthesis — an analytical summary of the source's argument, key tensions, and strategic implications. Stored on the source record (`sourceSynthesis` field). This preserves document-level context that individual DPs cannot capture.

**Does NOT receive:** The Research Lens. No tags. No Secondary Capture. One job only.

**Writes to Convex:** Data points (via `cm_save_data_points`), source synthesis (via `cm_save_source_synthesis`).

### Secondary Capture: Optional Project-Configured Scan (Sub-agent B, when enabled)

**Cognitive task:** Pattern recognition and synthesis.

**Inputs:** Full source text (fresh re-read, clean context window). Extract data point list for cross-referencing.

**Outputs:** Secondary item candidates based on the active project profile. The default captures mental models: title, type (framework/analogy/term/metaphor/principle), description, related DP. Custom projects can use a different `secondaryCaptureLabel` and `secondaryCaptureDescription`, or disable the stage entirely.

**Does NOT write to Convex directly.** Output is small enough to pass directly to Enrich as input. Mental models or custom secondary items are finalized and saved by Enrich, which has the Research Lens context to check for duplicates and relevance.

### Enrich (Sub-agent C)

**Cognitive task:** Judgment and evaluation.

**Inputs:** Data points retrieved from Convex (not from Extract's context). Secondary Capture candidates when enabled. Source metadata and source synthesis from Convex. The current Research Lens from Convex.

**Outputs per data point:** Tags (1-4, assigned with holistic view of all DPs), confidence signal (strong/moderate/suggestive), extraction note (why this DP matters, connections to research), related DP links.

**Also creates:** Mental Model records or custom secondary item records, finalized from Secondary Capture candidates and deduplicated against the Research Lens when applicable.

**Flags for curator review:** Confidence mismatches (Tier 1 + suggestive, Tier 3 + strong), position contradictions, anchor concerns, novel signals.

**Writes to Convex:** Tag assignments (via `cm_update_data_points_tags_batch`), enrichment (via `cm_enrich_data_points_batch`), mental models (via `cm_add_mental_model`), or custom secondary items.

### Review (Main conversation)

**Cognitive task:** Human-in-the-loop quality check. Review by exception.

**Inputs:** Aggregated flags from Enrich (across one or many sources in batch mode).

**Curator actions:** Approve, adjust confidence, edit extraction note, flag for re-extraction, add a Curator Observation, flag a Research Position for update.

**Supports batch processing:** Flags grouped by type, batch approvals, efficient review flow. Designed so 30-50 flags across 20 sources takes 15-30 minutes.

### Post-Pipeline

- Source status updated to "extracted" (via `cm_update_source_status`)
- Embeddings generated for all new DPs, observations, and mental models (via `cm_generate_embeddings`)
- If DPs were flagged as contradicting current positions, positions are queued for curator review

### Two Operating Modes

**Batch mode** (`cm-batch-orchestrator` + `cm-curator-review`): For volume processing. Sub-agents process silently. Curator engages during Review. Designed for 40+ sources/week.

**Deep mode** (`cm-deep-extract`): For Tier 1 reports and pipeline calibration. Interactive single-source extraction where curator observes and approves at every stage. 15-30 minutes per source.

---

## Batch Reprocessing Architecture

For processing large backlogs (e.g., reprocessing all 178 February sources through the new pipeline):

### Triage Interface

A lightweight single-page React app for rapid source classification:

- Displays all sources in the processing queue
- For each source: name, file type, size/page count
- Curator inputs: tier (1/2/3), optional intake note, optional source relationships, process yes/no
- Reads from and writes to Convex
- Build target: one afternoon in Cowork

### Batch Orchestration

The `cm-batch-orchestrator` skill manages batch processing:

- Takes a list of sources (or "all indexed in project")
- For each source, spawns focused sub-agents: Extract, Secondary Capture when enabled, then Enrich
- Each sub-agent writes directly to Convex and returns a compact summary
- Collects all flags across sources for consolidated Review
- Handles failures: log, skip, continue, report
- Tracks progress after every 3-5 sources
- Suggests session breaks after ~15-20 sources (context window hygiene)

### Model Selection for Cost Optimization

- **Extract:** Sonnet-tier model. Precision task (structured extraction, verbatim quotes).
- **Secondary Capture:** Sonnet-tier model. Pattern recognition task. Lightweight and optional.
- **Enrich:** Opus-tier model. Judgment task (assessing significance, connecting to Research Lens). Benefits from deeper reasoning.
- **Review:** Any model. Interactive, low compute.

### Deduplication

When reprocessing sources that were previously extracted:

- Compare new DP claim text embeddings against existing DPs from the same source
- Flag high-similarity matches for curator review
- Original extraction data preserved as v1; reprocessed data stored as v2
- Curator decides which version to treat as current

---

## MCP Tool Architecture (Curate Mind v1)

The MCP surface is intentionally split into toolsets. This keeps normal assistant interactions focused while preserving repair and compatibility tools for explicit maintenance work.

| Toolset | Count | Purpose |
|---|---:|---|
| `daily` | 25 | Project setup, source intake, local review queue, profile edits, browsing, and questions |
| `pipeline` | 44 | Default. `daily` plus extraction, enrichment, evidence linking, and embeddings |
| `admin` | 52 | `pipeline` plus repair, reset, correction, and retirement tools |
| `all` | 52 | Debug mode; registers every tool without filtering |

`CURATE_MIND_TOOLSET` controls the active surface. If unset, the server uses `pipeline`. The complete inventory lives in `docs/mcp-tool-inventory.md`.

### User-Facing Workflow Tools

Users should not need to name low-level tools. The expected interaction is a natural workflow prompt such as "start ingestion for new files in folder X", "show pending sources", "run batch extraction", or "ask my research base this question". Agents then choose the tools below.

The `cm-workflow-router` skill is the front door for these requests. It reads the user's plain-language intent, checks project context when needed, and routes to intake tools, query tools, repair tools, or one of the dedicated workflow skills.

| Workflow | Primary tools |
|---|---|
| Intake | `cm_fetch_url`, `cm_fetch_youtube`, `cm_extract_pdf`, `cm_review_queue`, `cm_add_source` |
| Extraction | `cm_extract_source`, `cm_save_data_points`, `cm_save_source_synthesis`, `cm_update_data_points_tags_batch`, `cm_enrich_data_points_batch`, `cm_update_source_status`, `cm_generate_embeddings` |
| Secondary Capture | `cm_add_mental_model` by default; future custom capture types route through their dedicated storage |
| Review and repair | Normal Review uses `cm_update_source_status` and batch enrichment tools. Logged correction tools are available during normal curation in `pipeline`: `cm_correct_anchor`, `cm_correct_attribution` (publisher, author, URL, published date, and source tier), and the `cm_get_source_corrections` audit-log reader. Lower-level repair tools such as `cm_update_source_metadata` and `cm_get_data_point_corrections` stay in `admin`. |
| Evidence linking | `cm_get_data_points_by_tag`, `cm_get_position_arrays`, `cm_link_evidence_to_position`, `cm_update_positions_batch`, `cm_update_research_lens` |
| Customization | `cm_get_project_profile`, `cm_update_project_profile`, `cm_get_user_preferences`, `cm_update_user_preferences`, `cm_preview_prompt_profile`, `cm_validate_profile` |

### Query & Analysis Tools

The query tools operate in two distinct modes. **Mode 1 (`cm_search`)** is Explore & Synthesize: scanning the corpus for emerging patterns, pressure-testing a brief, or doing early corpus work before positions exist. **Mode 2 (`cm_ask`)** is Cite & Trace: producing cited answers traceable from position stance to evidence and source provenance. See Design Decision 31.

| Tool | Description |
|------|-------------|
| `cm_ask` | **Mode 2 — Cite & Trace.** Fetches a structured pack: positions first (Stance), then curator observations, secondary items, and data points with resolved source links (Evidence), plus source provenance and anchor metadata for verification (Source). Returns `[P#]`, `[O#]`, `[M#]`, `[E#]` citation labels on every claim. Use for any question requiring a cited, traceable answer. |
| `cm_search` | **Mode 1 — Explore & Synthesize.** Semantic vector search across data points, positions, observations, and mental models. Use for scanning emerging signals, pressure-testing a brief, or exploring the corpus when positions don't yet exist. Do not use for producing cited answers — source links in `cm_search` results are not resolved. |
| `cm_get_themes` | Return all Research Themes with position counts. |
| `cm_get_positions` | Return positions within a theme, or all positions. Current stance, confidence, and status. |
| `cm_get_position_detail` | Return a position with linked evidence, counter-evidence, observations, and mental models. |
| `cm_get_data_point` | Return a single data point with anchor quote and source metadata. |
| `cm_get_source` | Return source metadata without full text. |
| `cm_get_source_text` | Return full source text for curator-only verification. |
| `cm_get_data_points_by_tag` | Retrieve project-scoped DPs linked to a tag slug. Primary evidence-linking retrieval tool. |
| `cm_get_tag_trends` | Return project-scoped tag usage counts. |
| `cm_get_position_history` | Return all versions of a position. Admin toolset because it is large and rarely needed. |

### Synthesis Tools (Position Management)

| Tool | Description |
|------|-------------|
| `cm_create_theme` | Create a new Research Theme. |
| `cm_create_position` | Create a new Research Position under a theme with initial stance and evidence. |
| `cm_update_position` | Create a full new version of a Research Position. Use when stance or open questions change. |
| `cm_link_evidence_to_position` | Add evidence arrays without touching stance text. Preferred for evidence-linking updates. |
| `cm_update_positions_batch` | Add evidence arrays to multiple positions in one atomic transaction. |
| `cm_update_research_lens` | Regenerate the Research Lens from current position states. |
| `cm_create_tag` | Create a project-scoped tag. |

---

## Evidence Linking Pattern

*See Design Decisions 27 (tag-based retrieval), 28 (three-pass workflow), and 29 (truncation handling) for full reasoning.*

### Overview

After extraction is complete for a batch of sources, data points exist in Convex but are not yet connected to Research Positions. Evidence linking is the process of reviewing extracted DPs and adding them to positions' `supportingEvidence` or `counterEvidence` arrays. This is a separate phase from extraction and runs between extraction waves.

### Three-Step Workflow

| Step | Actor | Tool | Purpose |
|------|-------|------|---------|
| 1. Tag Retrieval | Agent | `cm_get_data_points_by_tag` | Pull candidate DPs using 2-4 relevant tags per theme. Returns clean data without embeddings. |
| 2. Curator Triage | Curator | Conversation | Review candidates. Classify each DP as: supporting, counter-evidence, or skip. |
| 3. Position Update | Agent | `cm_link_evidence_to_position` or `cm_update_positions_batch` | Add only the newly triaged evidence IDs. Creates new version (append-only) and copies stance forward. |

### Key Constraints

**Use tag-based retrieval, not semantic search.** `cm_search` returns embedding vectors that blow out context windows. `cm_get_data_points_by_tag` returns clean, compact data. Tags are the bridge between extracted DPs and position-level synthesis.

**Batch 2-3 themes at a time.** Each theme has 2-4 positions drawing from 2-4 tags. Processing all 11 themes at once would exceed context window limits.

**MCP responses truncate at 25,000 characters.** Large tag pools (50+ DPs) will be partially visible. This is acceptable — the strongest candidates appear in the visible set. Use narrower tags or multiple queries for exhaustive coverage.

**Overlap is expected.** A DP can appear in multiple tag pools and can support multiple positions. The same DP ID in two positions' `supportingEvidence` is correct behavior.

**Stance text stays stable during evidence linking.** When linking evidence to existing positions, keep `currentStance`, `confidenceLevel`, and `status` unchanged unless the evidence warrants a revision. The `changeSummary` should describe what evidence was linked and why.

**Use additive linking tools for evidence-only updates.** `cm_update_position` is still available for true stance revisions, but evidence-only updates should use `cm_link_evidence_to_position` or `cm_update_positions_batch` so agents do not accidentally omit existing evidence arrays.

### When to Run

Evidence linking runs between extraction waves — after a batch of sources has completed Extract, Secondary Capture when enabled, Enrich, and Review, and before the next batch begins. It can also run after all extraction is complete for a comprehensive pass.

---

## What Was Removed from CRIS

| CRIS Artifact | Curate Mind Replacement |
|---------------|------------------------|
| Weekly Learnings (documents) | Position version history + change summaries |
| Current Synthesis (document) | Queryable aggregate state of Research Positions |
| Active Ideas (document) | Research Positions in Convex |
| Talking Points (maintained artifacts) | Generated on demand from positions |
| Language Assets (library) | Mental Models (captured during extraction) |
| Evolution logs (narrative) | Structured position versioning (append-only) |
| Markdown extraction files | Convex as source of truth (no dual-write) |
| Citation HTML metadata | No frontend parser contract |
| Filename validation | No file system naming conventions needed |
| Index file synchronization | Convex handles indexing natively |
| Tag hygiene protocol | Flat tag list, trend detection at query time |
| Three-session synthesis workflow | Position updates as needed (not session-bound) |
| Multiple system files to load per operation | Research Lens as single context document |

---

## Project Structure

### Folder Layout

```
curate-mind/                           (active project folder)
├── sources/                           (working inbox for new source files)
│   └── 2026-02/                       (moved from CRIS 01_Raw_Inputs)
│       ├── 2026-02-01_to_07/
│       ├── 2026-02-08_to_14/
│       ├── 2026-02-15_to_21/
│       └── 2026-02-22_to_28/
├── convex/                            (Convex schema + functions)
│   ├── schema.ts
│   ├── sources.ts
│   ├── dataPoints.ts
│   ├── positions.ts
│   ├── observations.ts
│   ├── mentalModels.ts
│   ├── search.ts
│   ├── tags.ts
│   └── researchLens.ts
├── mcp/                               (MCP server)
│   ├── index.ts
│   ├── tools/
│   │   ├── intake.ts
│   │   ├── extraction.ts
│   │   ├── query.ts
│   │   └── synthesis.ts
│   └── lib/
│       ├── convex-client.ts
│       ├── openai-client.ts
│       └── supadata.ts
├── .env.local                         (Convex + OpenAI + Supadata credentials)
├── package.json
├── Architecture_Spec.md
└── PRD.md

CRIS_Research_System/                  (archived, read-only reference)
├── 02_Extractions/                    (old extraction markdown files)
├── 03_Weekly_Learnings/               (old synthesis documents)
├── 06_Current_Understanding/          (old Active Ideas, Current Synthesis)
├── _System/                           (old system files, skills, prompts)
├── cris-system/                       (old MCP + Convex code, reference for patterns)
└── ...
```

### Convex Setup

Curate Mind uses a **new, separate Convex project**. The existing CRIS Convex project remains untouched with all its data. The new project gets its own URL, deploy key, and empty database.

### Source Storage Strategy

All source content is stored in Convex after ingestion. The local `sources/` folder is a working inbox, not a system dependency. See Design Principle 5 (Convex as Source of Truth) for details.

---

## Migration Path from CRIS

### Phase 0: Project Setup

1. Create `curate-mind` folder on local machine
2. Move planning documents (this spec + implementation plan) into it
3. Move source library (`01_Raw_Inputs/` → `curate-mind/sources/`)
4. Create new Convex project (separate from CRIS)
5. Configure environment variables (Convex URL, deploy key, OpenAI key, Jina key)

### Phase 1: Schema & MCP (Build the foundation)

1. Design and deploy new Convex schema to the new Convex project
2. Build updated MCP tools for curator workflows
3. Build extraction workflow (Extract, Secondary Capture, Enrich, Review orchestration)
4. Build Research Lens generation

### Phase 2: Reprocess February (Validate the pipeline)

1. Build triage interface
2. Build batch orchestration skill
3. Triage all 178 February sources (assign tiers, intake notes)
4. Ingest sources into Convex (fullText + file upload for Tier 1/2 PDFs)
5. Run full reprocessing pipeline
6. Curator review of flagged items
7. Validate: are the reprocessed extractions higher quality than the originals?

### Phase 3: Synthesize (Build the position layer)

1. Create Research Themes from the patterns in February's data
2. Create initial Research Positions (migrating and refining the 18 CRIS Active Ideas)
3. Link evidence from reprocessed data points
4. Generate initial Research Lens
5. Create Curator Observations that capture the connective insights from CRIS User Observations

### Phase 4: Public Access (Expose the foundation)

1. Add public-safe HTTP endpoints to Convex if the web frontend needs a filtered API
2. Add query logging
3. Build first public interface or LLM wrapper
4. Test with 2-3 external users
5. Iterate based on public usage patterns

---

## Open Questions for Technical Review

1. **Embedding model lock-in:** Currently using OpenAI text-embedding-3-small (1536 dims). If we switch providers or models, all embeddings need regeneration. Should we abstract the embedding layer?

2. **Convex as sole backend:** All data lives in Convex. Should we build an export/backup strategy from day one?

3. **Extract model selection:** Is Sonnet sufficient for high-fidelity verbatim extraction on complex PDFs, or does extraction quality justify Opus for Tier 1 sources?

4. **Research Lens size:** The lens needs to fit in Enrich's context window alongside the extracted DPs. As positions grow, the lens grows. What's the compression strategy when positions exceed a manageable size?

5. **Public access model:** Static demo, API keys, OAuth, or another approach? Deferred to Phase 4 but worth early consideration.

6. **Curator Observation as a connection:** When an observation references 5+ data points across multiple sources and positions, how should the search index handle it? Embed the full observation text, or create multiple embeddings for different facets?

---

*This spec was developed through a collaborative design session on March 17, 2026, starting from an outside-in audit of the CRIS Research System and iterating through persona definition, data model design, extraction pipeline architecture, and deliverable simplification.*
