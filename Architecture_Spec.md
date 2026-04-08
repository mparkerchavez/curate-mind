# Curate Mind: Architecture Specification

**Date:** March 17, 2026 (last updated March 22, 2026)
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

### 2. Progressive Disclosure (Analysis, Not Extraction)

When querying the knowledge base, the system defaults to the highest level of compression and drills deeper only when the user requests it:

- **Layer 1 — Themes & Positions:** Research Themes (5-8 macro areas) and Research Positions (specific theses with current stance and confidence). Most queries are answered here.
- **Layer 2 — Evidence:** The data points, curator observations, and mental models that support or challenge a position. Accessed when a claim needs support or stress-testing.
- **Layer 3 — Verification:** Verbatim anchor quotes and extraction notes. Accessed when exact wording or source fidelity needs confirmation.
- **Layer 4 — Full Source:** Original source text and files. Accessed rarely, when the full context of a source is needed beyond what was extracted.

Progressive disclosure applies to how data is queried and surfaced. It does **not** apply to extraction. Every source that enters the pipeline receives full-fidelity extraction.

### 3. Append-Only Data Architecture

Nothing is deleted. Nothing is overwritten. Every change creates a new record.

- Research Positions are versioned: updates create new version records; previous versions remain intact and queryable.
- Data Points are immutable once created.
- Curator Observations are immutable once created.
- Mental Models are immutable with optional annotations.
- Recovery from agent errors is always possible by reverting a pointer, never by restoring deleted data.

### 4. Full-Fidelity Extraction

Every source that enters the pipeline receives thorough extraction regardless of source tier. The tier affects how data points are weighted in analysis and synthesis, not whether they are extracted thoroughly. Data points are abstractions of the original source. They must be captured at sufficient fidelity that the Analyst does not need to return to the original source under normal conditions.

### 5. Convex as Source of Truth (No Local File Dependencies)

All source content and files are stored in Convex. The system has no dependency on local file paths after ingestion.

- **Source text:** The `fullText` field on every source record contains the complete text content. This is what the extraction pipeline reads from and what the Analyst queries at Layer 4.
- **Original files (Tier 1 and Tier 2 PDFs):** Uploaded to Convex file storage during ingestion. Preserves charts, tables, and visual layouts that plain text cannot capture. Referenced via `storageId` on the source record.
- **Tier 3 and markdown sources:** Fully captured by `fullText`. No original file upload needed.
- **Local `sources/` folder:** Functions as a working inbox. New sources land here when downloaded or saved. After ingestion into Convex, the local file has served its purpose. The local folder is a convenience, not a dependency.

This means: if the local folder disappeared, nothing would be lost. The MCP reads from Convex. The extraction pipeline reads from Convex. The Analyst queries Convex. The system is portable across machines.

---

## User Personas

### Research Persona (Maicol)

The curator. Uploads sources, tracks the processing pipeline, ensures extraction quality, writes curator observations, captures mental models. This persona controls what enters the system and at what quality bar.

**Needs:** Efficient intake workflow. Full pipeline visibility. Ability to review and annotate at every stage. Iteration on extraction quality over time.

**Interface:** MCP (full access to all tools).

### Analyst Persona (Maicol)

The power user. Queries the knowledge base to analyze new projects, opportunities, and external context against curated research. Needs full traceability: claim to data point to interpretation to verbatim text to original source.

**Needs:** Progressive disclosure navigation. Cross-referencing across time (3-6 months). Semantic search across all entity types. Ability to verify any claim down to the original source.

**Interface:** MCP (full access, all layers of progressive disclosure).

### Reader Persona (Others)

External users who query the curated knowledge base. Can see Research Positions, data points (claim + interpretation + source metadata), and Mental Models. Cannot see verbatim anchor quotes or original source text. Directed to source URLs for independent verification.

**Needs:** Natural language query interface. Evidence-grounded responses. Clear source attribution with URLs. Transparent about what's curator interpretation vs. external evidence.

**Interface:** Authenticated REST API (filtered view) + LLM wrapper (Claude Project, Custom GPT, or similar). Secondary priority; built after the foundation is validated for the Research and Analyst personas.

**Access boundary:** The Reader can access everything through Layer 2 (Evidence) of progressive disclosure, but Layer 3 (Verification: verbatim quotes) and Layer 4 (Full Source: original text/files) are restricted to the Analyst persona only.

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
| urlAccessibility | public, paywalled, private | Required (informs Reader experience) |
| fullText | Complete source text (extracted from PDF, fetched from URL, or pasted) | Required. Stored in Convex. For Analyst access only; omitted from Reader API. |
| contentHash | SHA256 for deduplication | Auto-generated |
| storageId | Reference to original file in Convex file storage | Upload for Tier 1 and Tier 2 PDFs (preserves visual layout). Optional for all others. |
| wordCount | Word count of fullText | Auto-generated |
| sourceRelationships | References to related sources (derivative, responds-to, etc.) | Optional |
| ingestedDate | When the source was added to the system | Auto-generated |
| sourceSynthesis | 2-3 paragraph analytical summary of the source's argument, tensions, and implications. Written at end of Pass 1. | Optional. See Design Decision 21. |
| status | indexed, extracted, failed | Auto-managed by pipeline |

### 2. Data Points

The atomic unit of the entire system. Each data point represents a single curated claim extracted from a source, anchored by verbatim text.

| Field | Description | Notes |
|-------|-------------|-------|
| sourceId | Reference to parent source | Required |
| dpSequenceNumber | Order within the source extraction | Auto-incremented |
| claimText | The synthesized claim | Required |
| anchorQuote | Verbatim 10-40 words from source (target 15-25). Capture the author's reasoning, not just the conclusion. | Required (Analyst-only access). See Design Decision 18. |
| extractionNote | Why this DP matters; significance and context | Added in Pass 2 enrichment |
| evidenceType | statistic, framework, prediction, case-study, observation, recommendation | Required |
| confidence | strong, moderate, suggestive | Added in Pass 2 enrichment |
| locationType | paragraph, page, timestamp, section | Required |
| locationStart | Location reference within source | Required |
| relatedDataPoints | Array of DP IDs from the same source that form an argument chain | Optional, added in Pass 2 |
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

*See Design Decisions 19 (four-pass pipeline) and 20 (sub-agent architecture) for full reasoning.*

### Overview

Every source goes through a four-pass pipeline. Each pass handles one focused cognitive task and runs as a separate sub-agent with its own context window. Sources are processed one at a time. Sub-agents write directly to Convex; the orchestrator receives only compact summaries. Convex is the communication channel between passes, not the context window.

### Document Preparation (within Pass 1)

Before extraction, Pass 1 classifies the document and determines processing strategy:

- **Under 15,000 words:** Process as a single unit (most articles, newsletters)
- **15,000–30,000 words:** Process in 2 chunks, split at natural section breaks
- **Over 30,000 words:** Process in chunks of ~10,000 words at section breaks

### Pass 1: Core Extraction (Sub-agent A)

**Cognitive task:** Comprehension and precision.

**Inputs:** Source text and metadata from Convex.

**Outputs per data point:** Claim text, anchor quote (10-40 words, target 15-25), location, evidence type. No tags. No interpretation.

**Also produces:** A 2-3 paragraph source synthesis — an analytical summary of the source's argument, key tensions, and strategic implications. Stored on the source record (`sourceSynthesis` field). This preserves document-level context that individual DPs cannot capture.

**Does NOT receive:** The Research Lens. No tags. No mental model scanning. One job only.

**Writes to Convex:** Data points (via `cm_save_data_points`), source synthesis (via `cm_save_source_synthesis`).

### Pass 2: Mental Model Scan (Sub-agent B)

**Cognitive task:** Pattern recognition and synthesis.

**Inputs:** Full source text (fresh re-read, clean context window). Pass 1 DP list (for cross-referencing).

**Outputs:** Mental model candidates — title, type (framework/analogy/term/metaphor/principle), description, related DP. Typically 0-5 per source.

**Does NOT write to Convex.** Output is small enough to pass directly to Pass 3 as input. Mental models are finalized and saved by Pass 3, which has the Research Lens context to check for duplicates.

### Pass 3: Enrichment (Sub-agent C)

**Cognitive task:** Judgment and evaluation.

**Inputs:** DPs retrieved from Convex (not from Pass 1's context). Mental model candidates from Pass 2. Source metadata and source synthesis from Convex. The current Research Lens from Convex.

**Outputs per data point:** Tags (1-4, assigned with holistic view of all DPs), confidence signal (strong/moderate/suggestive), extraction note (why this DP matters, connections to research), related DP links.

**Also creates:** Mental Model records (finalized from Pass 2 candidates, deduplicated against Research Lens).

**Flags for curator review:** Confidence mismatches (Tier 1 + suggestive, Tier 3 + strong), position contradictions, anchor concerns, novel signals.

**Writes to Convex:** Tag assignments (via `cm_update_data_point_tags`), enrichment (via `cm_enrich_data_point`), mental models (via `cm_add_mental_model`).

### Pass 4: Curator Review (Main conversation)

**Cognitive task:** Human-in-the-loop quality check. Review by exception.

**Inputs:** Aggregated flags from Pass 3 (across one or many sources in batch mode).

**Curator actions:** Approve, adjust confidence, edit extraction note, flag for re-extraction, add a Curator Observation, flag a Research Position for update.

**Supports batch processing:** Flags grouped by type, batch approvals, efficient review flow. Designed so 30-50 flags across 20 sources takes 15-30 minutes.

### Post-Pipeline

- Source status updated to "extracted" (via `cm_update_source_status`)
- Embeddings generated for all new DPs, observations, and mental models (via `cm_generate_embeddings`)
- If DPs were flagged as contradicting current positions, positions are queued for curator review

### Two Operating Modes

**Batch mode** (`cm-batch-orchestrator` + `cm-curator-review`): For weekly volume. Sub-agents process silently. Curator only engages at Pass 4. Designed for 40+ sources/week.

**Deep mode** (`cm-deep-extract`): For Tier 1 reports and pipeline calibration. Interactive single-source extraction where curator observes and approves at every step. 15-30 minutes per source.

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
- For each source, spawns three sequential sub-agents (Pass 1 → 2 → 3)
- Each sub-agent writes directly to Convex and returns a compact summary
- Collects all flags across sources for consolidated Pass 4 review
- Handles failures: log, skip, continue, report
- Tracks progress after every 3-5 sources
- Suggests session breaks after ~15-20 sources (context window hygiene)

### Model Selection for Cost Optimization

- **Pass 1 (extraction):** Sonnet-tier model. Precision task (structured extraction, verbatim quotes).
- **Pass 2 (mental model scan):** Sonnet-tier model. Pattern recognition task. Lightweight.
- **Pass 3 (enrichment):** Opus-tier model. Judgment task (assessing significance, connecting to research lens). Benefits from deeper reasoning.
- **Pass 4 (curator review):** Any model. Interactive, low compute.

### Deduplication

When reprocessing sources that were previously extracted:

- Compare new DP claim text embeddings against existing DPs from the same source
- Flag high-similarity matches for curator review
- Original extraction data preserved as v1; reprocessed data stored as v2
- Curator decides which version to treat as current

---

## MCP Tool Architecture (Curate Mind v1)

### Research Persona Tools (Intake & Extraction)

| Tool | Description |
|------|-------------|
| `add_source` | Ingest a source from URL, file, or text. Extracts and stores fullText in Convex. Uploads original file to Convex file storage for Tier 1/2 PDFs. Requires: title, sourceType, tier. Optional: intakeNote, sourceRelationships, urlAccessibility. |
| `extract_source` | Trigger the three-pass extraction pipeline on a source. Returns progress and flagged items for curator review. |
| `add_curator_observation` | Create a new Curator Observation, linking it to data points and/or positions. |
| `add_mental_model` | Create a new Mental Model record (can also be created automatically during Pass 2). |

### Analyst Persona Tools (Query & Analysis)

| Tool | Description |
|------|-------------|
| `get_themes` | Return all Research Themes with position counts and summary stats. (Layer 1) |
| `get_positions` | Return positions within a theme, or all positions matching a filter. Current stance, confidence, status. (Layer 1) |
| `get_position_detail` | Return a position with all linked evidence, counter-evidence, observations, mental models, and version history. (Layer 2) |
| `get_data_point` | Return a single DP with full detail including anchor quote and extraction note. (Layer 3) |
| `get_source_text` | Return the full text of a source. (Layer 4) |
| `search_knowledge_base` | Semantic vector search across data points, positions, observations, and mental models. Returns results at the highest applicable layer. |
| `get_data_points_by_tag` | Retrieve all DPs linked to a specific tag by slug. Returns clean data (ID, claim, evidence type, confidence, source title, source tier) without embeddings. Primary tool for building evidence pools during evidence linking. See Evidence Linking Pattern below. |
| `get_tag_trends` | Return tag frequency over time periods. Identifies emerging and growing topics. |
| `get_position_history` | Return all versions of a position with diffs. Supports the 3-6 month cross-referencing use case. |
| `compare_positions` | Show how two or more positions relate, including shared evidence and tension points. |

### Synthesis Tools (Position Management)

| Tool | Description |
|------|-------------|
| `update_position` | Create a new version of a Research Position. Append-only: previous version preserved. Requires change summary. |
| `create_position` | Create a new Research Position under a theme with initial stance and evidence. |
| `create_theme` | Create a new Research Theme. |
| `update_research_lens` | Regenerate the Research Lens from current position states. |

---

## Evidence Linking Pattern

*See Design Decisions 27 (tag-based retrieval), 28 (three-pass workflow), and 29 (truncation handling) for full reasoning.*

### Overview

After extraction is complete for a batch of sources, data points exist in Convex but are not yet connected to Research Positions. Evidence linking is the process of reviewing extracted DPs and adding them to positions' `supportingEvidence` or `counterEvidence` arrays. This is a separate phase from extraction and runs between extraction waves.

### Three-Pass Workflow

| Pass | Actor | Tool | Purpose |
|------|-------|------|---------|
| 1. Tag Retrieval | Agent | `cm_get_data_points_by_tag` | Pull candidate DPs using 2-4 relevant tags per theme. Returns clean data without embeddings. |
| 2. Curator Triage | Curator | Conversation | Review candidates. Classify each DP as: supporting, counter-evidence, or skip. |
| 3. Position Update | Agent | `cm_update_position` | Execute position updates with triaged evidence arrays. Creates new version (append-only). |

### Key Constraints

**Use tag-based retrieval, not semantic search.** `cm_search` returns embedding vectors that blow out context windows. `cm_get_data_points_by_tag` returns clean, compact data. Tags are the bridge between extracted DPs and position-level synthesis.

**Batch 2-3 themes at a time.** Each theme has 2-4 positions drawing from 2-4 tags. Processing all 11 themes at once would exceed context window limits.

**MCP responses truncate at 25,000 characters.** Large tag pools (50+ DPs) will be partially visible. This is acceptable — the strongest candidates appear in the visible set. Use narrower tags or multiple queries for exhaustive coverage.

**Overlap is expected.** A DP can appear in multiple tag pools and can support multiple positions. The same DP ID in two positions' `supportingEvidence` is correct behavior.

**Stance text stays stable during evidence linking.** When linking evidence to existing positions, keep `currentStance`, `confidenceLevel`, and `status` unchanged unless the evidence warrants a revision. The `changeSummary` should describe what evidence was linked and why.

### When to Run

Evidence linking runs between extraction waves — after a batch of sources has been extracted (Passes 1-4) and before the next batch begins. It can also run after all extraction is complete for a comprehensive pass.

---

### Reader Persona API (Authenticated REST, Phase 2)

Filtered subset of Analyst tools. Returns all data except:
- `anchorQuote` on data points (omitted)
- `fullText` on sources (omitted)
- `storageId` on sources (omitted)
- Layer 3 and Layer 4 access (restricted)

Adds:
- Query logging (timestamp, query text, results returned) for understanding Reader usage patterns.

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
│       └── jina.ts
├── .env.local                         (Convex + OpenAI + Jina credentials)
├── package.json
├── Architecture_Spec.md
└── Implementation_Plan.md

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
2. Build updated MCP tools for Research and Analyst personas
3. Build extraction pipeline (Pass 1, Pass 2, Pass 3 orchestration)
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

### Phase 4: Reader Access (Expose the foundation)

1. Add authenticated HTTP endpoints to Convex (filtered view)
2. Add query logging
3. Build first Reader interface (Claude Project or Custom GPT with API as tool)
4. Test with 2-3 external users
5. Iterate based on Reader usage patterns

---

## Open Questions for Technical Review

1. **Embedding model lock-in:** Currently using OpenAI text-embedding-3-small (1536 dims). If we switch providers or models, all embeddings need regeneration. Should we abstract the embedding layer?

2. **Convex as sole backend:** All data lives in Convex. Should we build an export/backup strategy from day one?

3. **Pass 1 model selection:** Is Sonnet sufficient for high-fidelity verbatim extraction on complex PDFs, or does extraction quality justify Opus for Tier 1 sources?

4. **Research Lens size:** The lens needs to fit in Pass 2's context window alongside the extracted DPs. As positions grow, the lens grows. What's the compression strategy when positions exceed a manageable size?

5. **Reader authentication model:** API keys? OAuth? Usage-based pricing? Deferred to Phase 4 but worth early consideration.

6. **Curator Observation as a connection:** When an observation references 5+ data points across multiple sources and positions, how should the search index handle it? Embed the full observation text, or create multiple embeddings for different facets?

---

*This spec was developed through a collaborative design session on March 17, 2026, starting from an outside-in audit of the CRIS Research System and iterating through persona definition, data model design, extraction pipeline architecture, and deliverable simplification.*
