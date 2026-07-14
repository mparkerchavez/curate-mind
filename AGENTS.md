# Curate Mind

**What this is:** A personal research curation system for tracking a domain over time, extracting insights from sources, synthesizing research positions, and providing a queryable knowledge base.

Project-specific facts do not live in this file. When an AI assistant needs the active project's domain, audience, time horizon, preferred vocabulary, suggested prompts, or Secondary Capture settings, fetch the project profile with `cm_get_project_profile` instead of assuming this repository's original AI-strategy use case.

**Predecessor:** CRIS Research System (archived, see reference path below)

## Design system

The frontend (`web/`) follows **Untitled UI v8** conventions. The full
agent reference is imported below:

@UNTITLED_UI.md

Key rules to remember while working on any UI:
- Use semantic color classes (`text-primary`, `bg-secondary`, `bg-brand-section`), not raw Tailwind colors (`text-slate-900`, `bg-blue-700`).
- File naming is **kebab-case** (`theme-card.tsx`, not `ThemeCard.tsx`).
- React Aria imports are prefixed with `Aria*` to avoid naming collisions with our custom components.

---

## Core Principle

**Build a robust foundation, generate everything else on demand.**

The foundation is a set of persistent, append-only entities in Convex (Data Points, Curator Observations, Mental Models, Research Positions, Tags, Sources). There are no maintained deliverables. Talking points, posts, presentations, and reports are generated on demand by prompting against the foundation.

---

## Key Files (Read These First)

- `Architecture_Spec.md` — Complete architecture: entities, schema, extraction pipeline, MCP tools, migration path
- `Design_Decisions_Log.md` — Why decisions were made (not just what). Read this when you hit a judgment call during implementation.
- `PRD.md` — Product requirements, v1 scope, definition of done, and agent alignment rules.

## Plain-Language Workflow Routing

The curator should not need to remember MCP tool names. When the user asks in normal language to add sources, ingest a folder, review pending files, process sources, ask the corpus, link evidence, update setup, or repair a record, use `skills/cm-workflow-router/SKILL.md` to route the request to the right workflow.

Examples:
- "Let's start ingestion for new files in folder X."
- "Show me what's waiting for review."
- "Run extraction on the indexed sources."
- "Ask my research base this question."
- "Link the latest evidence to my current positions."

Use the dedicated workflow skills after routing: `cm-batch-orchestrator`, `cm-deep-extract`, `cm-curator-review`, and `cm-evidence-linker`.

### Agent Instruction Docs

`CLAUDE.md` is the canonical project instruction file. `AGENTS.md` mirrors it so Codex and other agent tools receive the same context when the repo is cloned.

When you edit `CLAUDE.md`, run:

```bash
npm run agents:sync
npm run agents:check
```

Commit both files together if the check passes.

---

## Architecture Summary

### Foundation Entities (Convex)

0. **Projects** — Top-level containers that scope all content. All entities inherit a project.
1. **Sources** — Provenance records. fullText and sourceSynthesis stored in Convex. Original PDFs (Tier 1/2) in Convex file storage. No local file dependencies after ingestion.
2. **Data Points** — Atomic claims from sources with verbatim anchors (10-40 words), confidence, extraction notes, tags. Immutable.
3. **Curator Observations** — The curator's connective insights bridging data points and positions. Immutable.
4. **Mental Models** — Frameworks, analogies, memorable terms. Captured by the default Secondary Capture stage. Immutable.
5. **Research Positions** — Versioned theses under Research Themes. Append-only versioning (new version row per update, previous versions preserved).
6. **Tags** — Project-scoped flat vocabulary on data points. Powers retrieval and trend detection.
7. **Research Lens** — Auto-generated system artifact from current positions. Used during Enrich.

### Response Bands (Analysis, Not Extraction)

- **Stance:** Themes and positions. Most queries are answered here first.
- **Evidence:** Data points, curator observations, and secondary items such as mental models. Anchor quotes travel as metadata for source deep links, not as public-facing copy.
- **Source:** Provenance metadata and resolved source links. Full source text remains available through curator-facing MCP tools.

The old four-layer language is deprecated. Use Stance, Evidence, and Source when describing answer shape.

### Phase 1 PDF Intake Flow

PDFs go through a two-step intake. The extraction wraps the PDF in a markdown source file with a metadata header, and the curator fills in any fields the extractor could not read confidently before the source is ingested into Convex.

1. Extract with `cm_extract_pdf`. This writes a `verify_*.md` wrapper into the current week's source folder (the week active when extraction runs, which is not necessarily the week the PDF was captured) and saves the original PDF alongside it. Fields the extractor could not resolve appear as `[verify]` placeholders in the metadata header.
2. Open the wrapper and fill in the bracketed `[verify]` placeholders in the metadata header:
   - Publisher
   - Author
   - Published (ISO date preferred, e.g. 2026-03-26)
   - URL (canonical link to the original source)
3. Rename the file to drop the `verify_` prefix.
4. Ingest with `cm_add_source`, passing both `filePath` (the cleaned markdown) and `originalFilePath` (the PDF). The PDF gets uploaded to Convex file storage and the resulting storageId is stored on the source record.
5. Week-folder rule: source folders represent the week the curator **captured** (downloaded) a source, not the week it happened to be processed. If a PDF sat around before extraction ran, so extraction landed in a later week folder than capture, move the wrapper markdown and the PDF back into the capture week's folder after ingestion, and update `review-status.json` in both folders (add the entry to the capture week, remove it from the extraction week). This same rule applies to `cm_fetch_url` and `cm_fetch_youtube` intake: all three tools currently file by "now," not by the source's original capture date, so the same reconciliation may be needed for web and YouTube captures too.

Guard: `cm_add_source` rejects any filename starting with `verify_` and any file whose metadata header still contains `[verify]` placeholders. This is intentional. Fix the metadata first, then ingest.

PDF parser maintenance note: `cm_extract_pdf` uses LiteParse first for most clean born-digital PDFs, normal Docling with OCR disabled for academic/table-heavy PDFs, Docling OCR with RapidOCR/onnxruntime for scanned or image-heavy PDFs, and pypdf only as an emergency fallback. Parser dependencies are pinned in `mcp/requirements.txt`; run `npm --prefix mcp run test:pdf-scoring` and, when the local golden PDFs are available, `npm --prefix mcp run eval:pdf-golden` before changing parser versions or routing behavior.

### Extraction Pipeline

Four stages, one source at a time. Each machine-led stage runs in a focused context window. Sub-agents write directly to Convex.
- **Extract:** Core extraction of claims, anchor quotes, and source synthesis. No tags, no Secondary Capture, no Research Lens.
- **Secondary Capture:** Optional and project-configurable. The default captures mental models such as frameworks, analogies, and memorable terms. When enabled, it runs with a fresh read of the source.
- **Enrich:** Adds tags, confidence, extraction notes, and related data point links. Uses the Research Lens and source synthesis. Finalizes default mental model captures or custom secondary items.
- **Review:** Curator review by exception for flagged items.

Two modes: **batch** (sub-agents process silently, curator reviews flags) and **deep** (interactive, curator engages at every step).

### Evidence Linking (Post-Extraction)

After extraction waves, data points need to be connected to Research Positions. This is a separate phase from extraction.

**Workflow:** Tag retrieval (`cm_get_data_points_by_tag`) → Curator triage → additive position update (`cm_link_evidence_to_position` or `cm_update_positions_batch`). Batch 2-3 themes at a time. Prefer tag-based retrieval over semantic search for evidence linking: it scopes to a deliberate vocabulary slice and returns a tight, predictable shape. Use `cm_update_position` only when the stance text or open questions are changing. See Architecture_Spec.md → Evidence Linking Pattern and Design Decisions 27-29.

**Skill:** `cm-evidence-linker` orchestrates this workflow.

### Append-Only Rule

**CRITICAL: Never delete. Never overwrite. Always append.**
- Position updates create new version rows
- Data points are immutable once created
- The only fields that update in place: `currentVersionId` on researchPositions; `status` plus lineage pointers (`supersededBy`, `replaces`, `supersededAt`, `supersedeReason`) on sources; `embeddingStatus` and lifecycle fields (`status`, `supersededBy`, `supersededAt`, `supersedeReason`) on data points. Lifecycle and lineage pointers are set once and never re-pointed (Decision 38); the original data point claim/anchor and source content are never altered.
- Retiring or replacing a single data point uses `cm_supersede_data_point`; linking a re-ingested source to the one it replaced uses `cm_supersede_source`. Both are append-only. Superseded/retired data points are excluded from live evidence (cm_ask, cm_search, public routes, tag retrieval) but stay fetchable by id.
- If an agent makes an error, recovery = revert pointer, never delete records

---

## MCP Query Protocol

The MCP has two distinct query modes. Using the wrong tool produces shallow or uncitable answers.

### Mode 1 — Explore & Synthesize (`cm_search`)

Use when: scanning new sources for signals, finding emerging narratives, pressure-testing a brief or idea against the corpus, or doing early corpus work before positions exist.

`cm_search` searches across all entity types (data points, positions, observations, mental models) and returns broad results for the calling model to synthesize. The output is meant to spark a reaction — an observation, a perspective, a challenge. Citation rigor is not the goal.

**Trigger phrases:** "what signals are emerging", "what does the corpus say about", "challenge this brief", "what patterns do you see", "help me think through".

### Mode 2 — Cite & Trace (`cm_ask`)

Use when: the corpus has positions and the question requires a rigorous cited answer traceable to original sources.

`cm_ask` implements the response-band shape. Always follow this order in the response:

1. **Stance first.** What does the project currently say about this topic? Current stance is the starting point, not raw evidence.
2. **Evidence next.** Curator observations and secondary items that connect claims to positions; data points as atomic grounding.
3. **Source on demand.** Resolved source links and provenance are included in the pack; use them when a specific claim needs verification.

Every substantive claim in the answer should carry an inline label drawn from the analyst pack: `[P1]` for position stances, `[O1]` for observations, `[M1]` for mental models, `[E1]` for data point evidence.

**Trigger phrases:** "what's my position on", "analyze", "what does the research show", "give me a cited answer", "write the brief", "write it up".

### Boundary rules

- Do not use `cm_search` to produce cited analyst answers. It returns raw JSON without source links or citation structure.
- Do not use `cm_ask` for early corpus exploration when positions do not exist yet. `cm_search` is faster and more appropriate.
- Do not construct curatemind.io URLs manually. Source links are resolved server-side in the analyst pack.

---

## User Access Model

- **Curator:** Runs intake, extraction, review, synthesis, and analysis. The curator has full MCP access, including source text and verification metadata.
- **Public web visitors:** Use the demo frontend where available. Public routes should show synthesized stance, evidence, and source links, but not full source text.

---

## Tech Stack

- **Database:** Convex (new project, separate from CRIS)
- **MCP Server:** Node.js + @modelcontextprotocol/sdk (stdio transport)
- **Embeddings:** OpenAI text-embedding-3-small (1536 dimensions)
- **URL Fetching / Transcripts:** Supadata (`@supadata/js`) for web scraping and YouTube transcripts.
- **Frontend:** React + Vite, served at curatemind.io. Desktop-only (redirects mobile at &lt;1024px). See Web Frontend section below.
- **Credentials:** Copy `.env.example` to `.env.local` and fill in your keys. Never commit `.env.local`.

---

## Web Frontend

The frontend (`web/`) is a live demo site at curatemind.io. It serves two purposes: (1) a public-facing demo showing one configured research project, and (2) an open-source methodology showcase for GitHub visitors. The MCP is still the primary research interface.

**Current pages and routes:**

| Route | Page | Purpose |
|-------|------|---------|
| `/` | `LandingPage` | Hero with ask input, theme cards, live position demo |
| `/methodology` | `MethodologyPage` | Explains the research system and extraction pipeline |
| `/ask` | `AskPage` | AI chat interface querying the knowledge base |
| `/themes` | `ThemesIndexPage` | All research themes |
| `/themes/:themeId` | `ThemePage` | Positions within a theme |
| `/themes/:themeId/positions/:positionId` | `PositionPage` | Full position detail with evidence |
| `/sources/:sourceId` | `SourcePage` | Source metadata and extracted data points |

**Key contexts:**
- `ProjectProvider` — resolves the active Convex project ID
- `WorkspaceProvider` — loads themes, positions, and handles AI queries; wraps all routes

**Notes for agents:**
- `WorkspacePage.tsx` exists in `web/src/pages/` but is not in the router. Do not delete it without explicit instruction — treat as reserved.
- File naming: new files in `components/base/`, `components/application/`, `components/foundations/`, and `components/shared-assets/` use kebab-case (Untitled UI convention). Existing top-level components in `components/` are PascalCase (legacy). New top-level components should use kebab-case going forward.
- Do not add new pages or components unless explicitly asked.

---

## Developer Context

The project owner is a citizen developer. The project owner works with Claude (Cowork mode) and OpenAI Codex desktop app. The project owner does not write code directly. Claude and Codex write the code. The project owner describes what he wants, reviews output, and pastes terminal commands when needed. When providing terminal commands, give him the exact command to paste. When writing code, explain what it does in plain language.

---

## What NOT to Do

- Do not create maintained deliverable documents (weekly learnings, synthesis docs, talking points files). Everything is generated on demand.
- Do not add new frontend pages or components unless explicitly asked. The frontend is in a defined state — additions require explicit instruction.
- Do not add delete mutations to Convex. This is append-only.
- Do not load the Research Lens during Extract or Secondary Capture. Only Enrich uses it.
- Do not assign tags during Extract. Tags are assigned during Enrich with a holistic view of all DPs.
- Do not store data in markdown files as a primary store. Convex is the source of truth.
- Do not modify the CRIS Convex project or database. It is archived.
- Do not use `cm_search` to answer analyst questions. It is an exploration tool only.
- Do not construct source URLs manually in responses. The `cm_ask` pack includes resolved links.
