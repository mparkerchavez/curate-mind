# Curate Mind

**What this is:** A personal research curation system for tracking AI trends, extracting insights from sources, synthesizing research positions, and providing a queryable knowledge base.

**Owner:** Maicol Parker-Chavez
**Domain:** AI strategy, adoption, enterprise transformation, agentic workflows
**Predecessor:** CRIS Research System (archived, see reference path below)

---

## Core Principle

**Build a robust foundation, generate everything else on demand.**

The foundation is a set of persistent, append-only entities in Convex (Data Points, Curator Observations, Mental Models, Research Positions, Tags, Sources). There are no maintained deliverables. Talking points, posts, presentations, and reports are generated on demand by prompting against the foundation.

---

## Key Files (Read These First)

- `Architecture_Spec.md` — Complete architecture: entities, schema, extraction pipeline, MCP tools, migration path
- `Implementation_Plan.md` — Step-by-step build plan with progress tracker
- `Design_Decisions_Log.md` — Why decisions were made (not just what). Read this when you hit a judgment call during implementation.

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

### Extraction Pipeline

Four-pass, one source at a time. Each pass is a separate sub-agent with its own context window. Sub-agents write directly to Convex.
- **Pass 1:** Core extraction (claims + anchors + source synthesis). No tags, no mental models, no Research Lens.
- **Pass 2:** Mental model scan (frameworks, analogies, terms). Separate cognitive task from extraction.
- **Pass 3:** Enrichment (tags, confidence, extraction notes, related DPs). Uses Research Lens + source synthesis. Saves mental models.
- **Pass 4:** Curator review by exception (only flagged items).

Two modes: **batch** (sub-agents process silently, curator reviews flags) and **deep** (interactive, curator engages at every step).

### Evidence Linking (Post-Extraction)

After extraction waves, data points need to be connected to Research Positions. This is a separate phase from extraction.

**Workflow:** Tag retrieval (`cm_get_data_points_by_tag`) → Curator triage → Position update (`cm_update_position`). Batch 2-3 themes at a time. Use tag-based retrieval, NOT semantic search (`cm_search` returns embedding vectors that blow out context windows). See Architecture_Spec.md → Evidence Linking Pattern and Design Decisions 27-29.

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
- **Reader Persona (Others):** Queries knowledge base externally. Layers 1-2 only. No verbatim quotes, no original source text. Phase 2 priority.

---

## Tech Stack

- **Database:** Convex (new project, separate from CRIS)
- **MCP Server:** Node.js + @modelcontextprotocol/sdk (stdio transport)
- **Embeddings:** OpenAI text-embedding-3-small (1536 dimensions)
- **URL Fetching / Transcripts:** Supadata (`@supadata/js`) for web scraping and YouTube transcripts. Jina remains in the codebase only as a temporary compatibility path until intake tool migration is complete.
- **Credentials:** Copy `.env.example` to `.env.local` and fill in your keys. Never commit `.env.local`.

---

## Developer Context

The project owner is a citizen developer. The project owner works with Claude (Cowork mode) and OpenAI Codex desktop app. The project owner does not write code directly. Claude and Codex write the code. The project owner describes what he wants, reviews output, and pastes terminal commands when needed. When providing terminal commands, give him the exact command to paste. When writing code, explain what it does in plain language.

---

## What NOT to Do

- Do not create maintained deliverable documents (weekly learnings, synthesis docs, talking points files). Everything is generated on demand.
- Do not build a frontend unless explicitly asked. The MCP is the primary interface.
- Do not add delete mutations to Convex. This is append-only.
- Do not load the Research Lens during Pass 1 or Pass 2. Only Pass 3 (enrichment) uses it.
- Do not assign tags during Pass 1 extraction. Tags are assigned in Pass 3 with a holistic view of all DPs.
- Do not store data in markdown files as a primary store. Convex is the source of truth.
- Do not modify the CRIS Convex project or database. It is archived.
