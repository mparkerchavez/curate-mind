# Curate Mind

**What this is:** A personal research curation system for tracking AI trends, extracting insights from sources, synthesizing research positions, and providing a queryable knowledge base.

**Owner:** Maicol Parker-Chavez
**Domain:** AI strategy, adoption, enterprise transformation, agentic workflows
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

---

## Architecture Summary

### Foundation Entities (Convex)

0. **Projects** — Top-level containers that scope all content. All entities inherit a project.
1. **Sources** — Provenance records. fullText and sourceSynthesis stored in Convex. Original PDFs (Tier 1/2) in Convex file storage. No local file dependencies after ingestion.
2. **Data Points** — Atomic claims from sources with verbatim anchors (10-40 words), confidence, extraction notes, tags. Immutable.
3. **Curator Observations** — The curator's connective insights bridging data points and positions. Immutable.
4. **Mental Models** — Frameworks, analogies, memorable terms. Captured in dedicated Pass 2. Immutable.
5. **Research Positions** — Versioned theses under Research Themes. Append-only versioning (new version row per update, previous versions preserved).
6. **Tags** — Project-scoped flat vocabulary on data points. Powers retrieval and trend detection.
7. **Research Lens** — Auto-generated system artifact from current positions. Used in Pass 3 enrichment.

### Progressive Disclosure (Analysis, Not Extraction)

- **Layer 1:** Themes & Positions (most queries answered here)
- **Layer 2:** Evidence (data points, observations, mental models)
- **Layer 3:** Verification (verbatim anchor quotes) — Analyst only
- **Layer 4:** Full Source (original text/files) — Analyst only

Layers 3-4 are restricted from the Reader persona.

### Phase 1 PDF Intake Flow

PDFs go through a two-step intake. The extraction wraps the PDF in a markdown source file with a metadata header, and the curator fills in any fields the extractor could not read confidently before the source is ingested into Convex.

1. Extract with `cm_extract_pdf`. This writes a `verify_*.md` wrapper into the current week's source folder and saves the original PDF alongside it. Fields the extractor could not resolve appear as `[verify]` placeholders in the metadata header.
2. Open the wrapper and fill in the bracketed `[verify]` placeholders in the metadata header:
   - Publisher
   - Author
   - Published (ISO date preferred, e.g. 2026-03-26)
   - URL (canonical link to the original source)
3. Rename the file to drop the `verify_` prefix.
4. Ingest with `cm_add_source`, passing both `filePath` (the cleaned markdown) and `originalFilePath` (the PDF). The PDF gets uploaded to Convex file storage and the resulting storageId is stored on the source record.

Guard: `cm_add_source` rejects any filename starting with `verify_` and any file whose metadata header still contains `[verify]` placeholders. This is intentional. Fix the metadata first, then ingest.

### Extraction Pipeline

Four-pass, one source at a time. Each pass is a separate sub-agent with its own context window. Sub-agents write directly to Convex.
- **Pass 1:** Core extraction (claims + anchors + source synthesis). No tags, no mental models, no Research Lens.
- **Pass 2:** Mental model scan (frameworks, analogies, terms). Separate cognitive task from extraction.
- **Pass 3:** Enrichment (tags, confidence, extraction notes, related DPs). Uses Research Lens + source synthesis. Saves mental models.
- **Pass 4:** Curator review by exception (only flagged items).

Two modes: **batch** (sub-agents process silently, curator reviews flags) and **deep** (interactive, curator engages at every step).

### Evidence Linking (Post-Extraction)

After extraction waves, data points need to be connected to Research Positions. This is a separate phase from extraction.

**Workflow:** Tag retrieval (`cm_get_data_points_by_tag`) → Curator triage → Position update (`cm_update_position`). Batch 2-3 themes at a time. Prefer tag-based retrieval over semantic search for evidence linking: it scopes to a deliberate vocabulary slice and returns a tight, predictable shape. See Architecture_Spec.md → Evidence Linking Pattern and Design Decisions 27-29.

**Skill:** `cm-evidence-linker` orchestrates this workflow.

### Append-Only Rule

**CRITICAL: Never delete. Never overwrite. Always append.**
- Position updates create new version rows
- Data points are immutable once created
- The only fields that update in place: `currentVersionId` on researchPositions, `status` on sources, `embeddingStatus` on data points
- If an agent makes an error, recovery = revert pointer, never delete records

---

## User Personas

- **Research Persona (Maicol):** Curates sources, runs extraction pipeline, writes observations. Full MCP access.
- **Analyst Persona (Maicol):** Queries knowledge base for analysis. Full progressive disclosure access (Layers 1-4).
- **Reader Persona (Others):** Queries knowledge base externally via the web frontend at curatemind.io. Layers 1-2 only. No verbatim quotes, no original source text. The web app is the Reader interface.

---

## Tech Stack

- **Database:** Convex (new project, separate from CRIS)
- **MCP Server:** Node.js + @modelcontextprotocol/sdk (stdio transport)
- **Embeddings:** OpenAI text-embedding-3-small (1536 dimensions)
- **URL Fetching / Transcripts:** Supadata (`@supadata/js`) for web scraping and YouTube transcripts. `mcp/src/lib/jina.ts` remains in the codebase for reference but is no longer used by intake tools — migration to Supadata is complete.
- **Frontend:** React + Vite, served at curatemind.io. Desktop-only (redirects mobile at &lt;1024px). See Web Frontend section below.
- **Credentials:** Copy `.env.example` to `.env.local` and fill in your keys. Never commit `.env.local`.

---

## Web Frontend

The frontend (`web/`) is a live demo site at curatemind.io. It serves two purposes: (1) a public-facing demo showing Maicol's February 2026 research, and (2) an open-source methodology showcase for GitHub visitors. The MCP is still the primary research interface — the frontend is the Reader interface.

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
- Do not load the Research Lens during Pass 1 or Pass 2. Only Pass 3 (enrichment) uses it.
- Do not assign tags during Pass 1 extraction. Tags are assigned in Pass 3 with a holistic view of all DPs.
- Do not store data in markdown files as a primary store. Convex is the source of truth.
- Do not modify the CRIS Convex project or database. It is archived.
