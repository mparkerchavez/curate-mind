# Curate Mind: Product Requirements Document

**Version:** 1.0
**Date:** May 6, 2026
**Owner:** Maicol Parker-Chavez
**Status:** Active — governs v1 GitHub release

---

## What This Project Is

Curate Mind is a personal research curation system built as an MCP (Model Context Protocol) server. It gives you a persistent, queryable knowledge base for tracking a domain of research over time. The workflow is: ingest sources, extract structured data points through a four-pass pipeline, build research positions from the evidence, and query the foundation whenever you need analysis, talking points, or synthesis.

The primary interface is the MCP server. You use it directly inside Claude, Codex, or any chat app that supports MCP tools. The web app at curatemind.io is a live demo showing what the system produces after a full extraction cycle on February 2026 AI research — it demonstrates the methodology, not a continuously updating feed.

The system is built on one principle: **build a robust foundation, generate everything else on demand.** The foundation is append-only, versioned, and queryable. There are no maintained deliverables. Reports, talking points, and summaries are generated when you need them, from the current state of the foundation.

---

## Who This Is For

**Primary user:** Someone who wants to run their own instance for personal research curation. They work in a domain they actively follow — AI strategy, climate tech, financial regulation, or anything else with a steady stream of sources to track. They use Claude, Codex, or another MCP-compatible chat app as their primary work environment.

**What they do to get started:** Clone the repo, create a new Convex project, copy `.env.example` to `.env.local`, add their API keys, point `CURATE_MIND_PATH` to their local repo root, and start ingesting markdown files through the MCP tools and skills.

**What they get:** A structured knowledge base that grows as they add sources, a set of research positions they can update as their understanding evolves, and MCP tools for querying any layer of the foundation.

---

## User Personas

**Research Persona (curator):** Ingests sources, runs the extraction pipeline, writes observations, and maintains research positions. Full MCP access. This is Maicol's role in the demo system.

**Analyst Persona (power user):** Queries the knowledge base for analysis against new projects or opportunities. Full progressive disclosure access across all four layers: Themes and Positions → Evidence → Verification → Full Source. `cm_ask` is the primary query tool for cited analyst answers — it fetches a structured pack with position stances first, then observations, mental models, and data points with resolved source links, all tagged with inline citation labels (`[P#]`, `[O#]`, `[M#]`, `[E#]`). `cm_search` is reserved for exploration and signal-finding when positions don't exist yet or a cited answer is not the goal.

**Reader Persona (external visitors):** Browses the research via the web frontend at curatemind.io. Layer 1 and 2 only — no verbatim anchor quotes, no full source text. The web app is the Reader interface.

---

## V1 Scope

### In scope

**Skills (primary interface — what the user invokes in Claude)**

Skills are the orchestration layer. They contain the step-by-step instructions Claude follows to run complex workflows. The MCP tools are the underlying primitives the skills call to read and write to Convex.

| Skill | Purpose |
|-------|---------|
| `cm-batch-orchestrator` | Processes multiple sources by spawning sub-agents; coordinates the full pipeline across a queue |
| `cm-source-pipeline` | Runs the 3-pass extraction pipeline for a single source; designed to run as a sub-agent |
| `cm-deep-extract` | Interactive single-source extraction for high-value Tier 1 sources; curator engages at each pass |
| `cm-curator-review` | Pass 4 human-in-the-loop review of flagged items from extraction |
| `cm-evidence-linker` | Connects extracted data points to Research Positions after an extraction wave |

**MCP tools (underlying primitives the skills call)**
- `extraction.ts` — `cm_extract_source`, `cm_save_data_points`, `cm_enrich_data_point`, `cm_update_data_point_tags`, `cm_save_mental_models`, `cm_update_source_status`
- `query.ts` — `cm_ask` (Mode 2: analyst query with progressive disclosure and resolved source links), themes, positions, evidence, data points, `cm_search` (Mode 1: semantic exploration), source text, tag trends, position history
- `synthesis.ts` — `cm_create_theme`, `cm_create_position`, `cm_update_position`, `cm_update_research_lens`, `cm_create_tag`, `cm_generate_embeddings`
- `intake.ts` (validation phase) — `cm_add_source`, `cm_add_curator_observation`, and `cm_add_mental_model` are functional; `cm_fetch_url`, `cm_fetch_youtube`, and `cm_extract_pdf` exist for two-step local intake and are being manually tested before being treated as production-ready
- `review.ts` — local file review queue for fetched markdown files; part of the current MCP-based intake validation path

**Convex backend**
- All seven entity types: Projects, Sources, Data Points, Curator Observations, Mental Models, Research Positions (with append-only versioning), Tags
- Research Lens as a system artifact used in Pass 3
- Embeddings via OpenAI text-embedding-3-small for semantic search

**Web demo site (curatemind.io)**
- Landing page with hero ask input, theme cards, and live position demo
- Themes index, Theme detail, Position detail pages
- Source page (metadata and extracted data points, no full text)
- Ask page (AI chat querying the knowledge base)
- Methodology page (explains the system and pipeline)
- Convex backend visualization page: shows real entity counts and structure from the backend; `fullText` and verbatim anchor fields are hidden to protect copyrighted source content

**GitHub repo**
- README: what it is, who it is for, link to curatemind.io demo
- Setup guide: step-by-step from clone to first successful extraction
- `.env.example`: every required key documented with a description
- License: MIT

### Out of scope for v1

| Feature | Status |
|---------|--------|
| Hosted/local Intake Inbox frontend for pasting links, reviewing markdown, editing metadata, and approving ingestion | Future phase. Do not build until the MCP intake tools have been validated in Claude/Codex. |
| Daily source monitoring for sites, RSS feeds, YouTube channels, newsletters, and other watchlist sources | Future phase. Requires candidate queue, dedupe rules, and scheduled discovery jobs. |
| Automated site/page crawling beyond explicit user-provided URLs | Future phase. Prefer RSS/YouTube feeds first; use Supadata crawl/scrape only after source-specific behavior is understood. |
| Reader persona authentication layer | Out of scope |
| Multi-user or multi-tenant support | Out of scope |
| Mobile-responsive frontend | Out of scope |
| Any new maintained deliverable documents | Never in scope |

### Future Work: Intake Inbox and Daily Discovery

This work is intentionally parked until the current MCP intake tools have been tested end-to-end. The future version should be a review-first intake system, not an automatic ingestion pipeline.

**Intake Inbox goals:**
- Paste a YouTube, article, report, or other source URL
- Fetch the source into reviewable markdown
- Show fetch status, saved path, word count, and metadata
- Let the curator review/edit markdown and metadata before ingestion
- Approve ingestion into Convex using the same append-only source rules

**Daily Discovery goals:**
- Maintain a watchlist of YouTube channels, RSS feeds, websites, newsletters, and other recurring sources
- Check watched sources on a schedule and create candidate source records for new items
- Keep discovery separate from ingestion: new item -> candidate queue -> fetch markdown -> review -> approve -> source
- Prefer structured feeds where possible; use crawling/scraping as a fallback for sites without reliable feeds

**Candidate future entities:**
- `watchedSources`: name, type, URL/feed URL, enabled flag, default tier/source type, last checked timestamp, notes
- `intakeCandidates`: watched source, title, URL, discovered date, published date, status, dedupe key, fetch error
- `intakeDrafts`: fetched markdown, parsed metadata, review status, reviewed/approved timestamps, source ID after ingestion

---

## Definition of Done

The v1 GitHub release is complete when all of the following are true:

### Skills and MCP server
- [ ] All five skills are documented in the README or a dedicated setup guide
- [ ] `cm-batch-orchestrator`, `cm-source-pipeline`, `cm-deep-extract`, `cm-curator-review`, and `cm-evidence-linker` are functional end-to-end against a fresh Convex project
- [ ] Core MCP tool files are functional: `extraction.ts`, `query.ts`, `synthesis.ts`, and the working tools in `intake.ts`
- [ ] `cm_add_source` successfully ingests a markdown file and stores fullText in Convex
- [ ] Four-pass extraction pipeline runs without errors on a single source via `cm-deep-extract` or `cm-batch-orchestrator`
- [ ] `cm_search` returns semantic results (embeddings are generated and stored correctly)
- [ ] `cm_ask` returns a structured analyst pack with `[P#]`, `[O#]`, `[M#]`, `[E#]` citation labels and resolved source links
- [ ] `cm_fetch_url`, `cm_fetch_youtube`, `cm_extract_pdf`, and `cm_review_queue` have been manually smoke-tested against representative sources before being documented as production-ready intake tools

### Convex backend
- [ ] Schema deploys cleanly to a fresh Convex project with no migration errors
- [ ] All entity types are created correctly through the MCP pipeline
- [ ] `.env.example` includes `CONVEX_URL`, `CONVEX_DEPLOY_KEY`, `OPENAI_API_KEY`, and `SUPADATA_API_KEY` with descriptions

### Web demo site
- [ ] All six routes render correctly with live data from Convex
- [ ] Convex backend visualization page is live and shows real entity counts and structure
- [ ] `fullText` and `anchorQuote` fields are not exposed anywhere in the frontend
- [ ] Desktop-only redirect works correctly below 1024px
- [ ] No hardcoded personal data or API keys in the frontend build

### GitHub repo
- [ ] `README.md` explains what the project is, who it is for, and links to curatemind.io
- [ ] Setup guide walks through: clone → Convex project creation → `.env.local` → first ingestion
- [ ] `LICENSE` file present (MIT)
- [ ] No `.env.local` or secrets committed to the repo
- [ ] `mcp/src/lib/jina.ts` is either removed or clearly marked as unused
- [ ] `JINA_API_KEY` reference removed from `mcp/src/index.ts` comments (Supadata replaced Jina)

---

## Agent Alignment Rules

These rules apply to every agent working on this project. Do not deviate without explicit instruction from the project owner.

**Data integrity — never break these:**
- Never add delete mutations to Convex. The system is append-only.
- Never overwrite existing records. Position updates create new version rows.
- The only fields that update in place: `currentVersionId` on `researchPositions`, `status` on `sources`, `embeddingStatus` on `dataPoints`.
- If an agent makes an error, recovery is always by reverting a pointer — never by deleting records.

**Extraction pipeline — never break these:**
- Do not load the Research Lens during Pass 1 or Pass 2. Only Pass 3 uses it.
- Do not assign tags during Pass 1. Tags are assigned in Pass 3 with a holistic view of all data points.
- Do not use `cm_search` for evidence linking — use `cm_get_data_points_by_tag`. Semantic search returns embedding vectors that blow out context windows.
- Do not use `cm_search` to answer analyst questions that require cited sources. Use `cm_ask` — it returns positions first, then grounded evidence with resolved source links.

**Frontend — follow these exactly:**
- Do not add new pages or components unless explicitly asked.
- File naming for new components: kebab-case (`source-card.tsx`, not `SourceCard.tsx`).
- Use semantic color classes (`text-primary`, `bg-secondary`), not raw Tailwind colors (`text-slate-900`).
- React Aria imports are prefixed with `Aria*`.
- `WorkspacePage.tsx` is unrouted but retained. Do not delete it.
- Never expose `fullText`, `anchorQuote`, or `storageId` in any frontend component.

**Scope — do not build these:**
- No maintained deliverable documents. Everything is generated on demand.
- No Intake Inbox frontend, watchlist monitor, daily discovery queue, or automatic crawling workflow unless explicitly requested as a future phase.
- No new Convex projects or databases. One project per environment.
- Do not modify or reference the CRIS Convex project. It is archived.

---

## Folder Structure

The following structure is required. `CURATE_MIND_PATH` must point to the repo root. Do not change the location of `sources/` relative to the root — the MCP server generates paths within it automatically.

```
curate-mind/                    ← CURATE_MIND_PATH points here
├── convex/                     ← Convex schema and functions (checked in)
├── mcp/                        ← MCP server (checked in)
│   └── src/
│       ├── tools/              ← MCP tool registrations
│       └── lib/                ← Convex client, OpenAI, Supadata
├── skills/                     ← Claude skills (checked in)
│   ├── cm-batch-orchestrator/
│   ├── cm-source-pipeline/
│   ├── cm-deep-extract/
│   ├── cm-curator-review/
│   └── cm-evidence-linker/
├── web/                        ← Frontend demo site (checked in, optional for MCP-only use)
├── sources/                    ← Local working inbox, git-ignored
│   └── YYYY-MM/
│       └── YYYY-MM-DD_to_DD/  ← Markdown files land here during intake
├── .env.example                ← Checked in, documents all required keys
└── .env.local                  ← User creates this, never committed
```

**Required environment variables** (document all of these in `.env.example`):

| Variable | Purpose |
|----------|---------|
| `CONVEX_URL` | Convex deployment URL for the user's own project |
| `OPENAI_API_KEY` | OpenAI key for embeddings (`text-embedding-3-small`) |
| `SUPADATA_API_KEY` | Supadata key for URL scraping and YouTube transcripts; required when testing or using MCP fetch tools |
| `CURATE_MIND_PATH` | Absolute path to the repo root on the user's machine |

Note: `JINA_API_KEY` is referenced in `mcp/src/index.ts` comments but is no longer used. Remove it from the comments before the GitHub release.

---

## Tech Stack

Do not change any of these without explicit discussion:

| Layer | Technology |
|-------|-----------|
| Database + file storage | Convex |
| MCP server | Node.js + `@modelcontextprotocol/sdk` (stdio transport) |
| Embeddings | OpenAI `text-embedding-3-small` (1536 dimensions) |
| URL fetching / transcripts | Supadata (`@supadata/js`) |
| Frontend framework | React + Vite |
| Frontend design system | Untitled UI v8 |
| Hosting | Replit (frontend + MCP server) |
| License | MIT |
