# Curate Mind: Product Requirements Document

**Version:** 1.2
**Date:** May 25, 2026
**Owner:** Maicol Parker-Chavez
**Status:** Active. Governs v1 GitHub release.

**Change log:**
- 1.2 (2026-05-25): Adds MCP toolsets (`daily`, `pipeline`, `admin`, `all`) and the `cm-workflow-router` skill so citizen-developer workflows can be prompted in plain language while repair tools stay out of the default surface. Clarifies that curatemind.io Ask uses `askAnalyst` / `cm_ask`; the older retrieval-only evidence-pack tool was removed.
- 1.1 (2026-05-20): Reflects the customization architecture decisions in `Customization_Design_Proposal_2026-05-20.md`. Renames the four extraction passes to descriptive stages (Extract, Secondary Capture, Enrich, Review). Retires the Reader persona; consolidates personas into one Curator with two query modes. Replaces the four-layer access matrix with the three-band response shape (Stance, Evidence, Source). Adds the customization layer (project profile, user preferences, MCP tools, copy-paste prompt library) to in-scope v1 deliverables. Marks Secondary Capture as configurable per project.
- 1.0 (2026-05-06): Initial v1 scope.

---

## What This Project Is

Curate Mind is a personal research curation system built as an MCP (Model Context Protocol) server. It gives you a persistent, queryable knowledge base for tracking a domain of research over time. The workflow is: ingest sources, extract structured data points through a four-stage source processing loop (Extract, Secondary Capture, Enrich, Review), build research positions from the evidence, and query the foundation whenever you need analysis, talking points, or synthesis.

The primary interface is the MCP server. You use it directly inside any chat app or coding agent that supports MCP tools. The web app at curatemind.io is a live demo showing what the system produces on an AI strategy and adoption research corpus updated through May 2026. It demonstrates the methodology, not a continuously updating feed.

The system is built on one principle: **build a robust foundation, generate everything else on demand.** The foundation is append-only, versioned, and queryable. There are no maintained deliverables. Reports, talking points, and summaries are generated when you need them, from the current state of the foundation.

Curate Mind is shipped as an open-source project. Strangers who clone the repo can customize it for their own research without editing source code: a small project profile, an instance-wide user style preferences row, and a library of copy-paste prompts let the user configure their domain, audience, vocabulary, writing style, and what (if anything) the Secondary Capture stage should look for. The method itself, including the four extraction stages, the append-only invariants, and the three-band response shape, stays locked.

---

## Who This Is For

**Primary user:** Someone who wants to run their own instance for personal research curation. They work in a domain they actively follow — AI strategy, climate tech, financial regulation, or anything else with a steady stream of sources to track. They use an MCP-compatible chat app or coding agent as their primary work environment.

**What they do to get started:** Clone the repo, create a new Convex project, copy `.env.example` to `.env.local`, add their API keys, point `CURATE_MIND_PATH` to their local repo root, and start ingesting markdown files through the MCP tools and skills.

**What they get:** A structured knowledge base that grows as they add sources, a set of research positions they can update as their understanding evolves, and MCP tools for querying any layer of the foundation.

---

## Personas and Access Tiers

Curate Mind has **one persona** and **two access tiers**. Earlier versions of this document described separate Research, Analyst, and Reader personas; that split was never enforced in code and is retired in v1.1.

**The Curator (single persona).** The person who installs and runs Curate Mind. Ingests sources, runs the extraction pipeline, writes observations, maintains research positions, and queries the knowledge base. Full MCP access to every tool and every stored field.

The Curator works in two query modes, both available through MCP:

- **Explore mode** (`cm_search`). Scans the corpus for signals, surfaces emerging narratives, pressure-tests briefs. Used when positions do not exist yet or when a cited answer is not the goal.
- **Cite-and-trace mode** (`cm_ask`). Returns a structured pack in the three-band response shape: **Stance** (current position stances, labeled `[P#]` as plain references), **Evidence** (data points cited inline with `[E#]`; curator observations as `[O#]` and mental models as `[M#]` available in the pack as background context, not as inline citations), **Source** (resolved deep links to original sources, including anchor quotes used as URL fragment metadata). Used when a question needs a rigorous cited answer traceable back to original sources.

**Access tiers:**

| Tier | Who | What they get |
|---|---|---|
| Curator (authenticated, via MCP) | The owner of the instance | The active MCP toolset, every stored field, full source text, anchor quote text, and customization tools. `pipeline` is the default; `admin`/`all` expose repair and compatibility tools when explicitly needed. |
| Public viewer (unauthenticated, via curatemind.io) | Anyone | Stance and Evidence rendered through the web. Anchor quotes leave the server only as URL fragment metadata for "Open at source" deep links, never as visible text on live routes. Full source text is never served. |

---

## V1 Scope

### In scope

**Skills (primary interface — what the user invokes in their MCP host)**

Skills are the orchestration layer. They contain the step-by-step instructions the calling model follows to run complex workflows. The MCP tools are the underlying primitives the skills call to read and write to Convex.

| Skill | Purpose |
|-------|---------|
| `cm-workflow-router` | Plain-language front door. Routes requests like "ingest this folder", "show pending sources", "process indexed sources", and "ask my research base" to the correct tool or workflow skill |
| `cm-batch-orchestrator` | Processes multiple sources by spawning sub-agents; coordinates the Batch Extract phase (Extract, Secondary Capture if enabled, Enrich) across a queue and emits the flag report |
| `cm-deep-extract` | Interactive single-source extraction for high-value Tier 1 sources; curator engages at each stage (Extract, Secondary Capture, Enrich, Review) |
| `cm-curator-review` | Batch Review phase: walks the curator through the flag report from Batch Extract and produces the Decisions Document |
| `cm-evidence-linker` | Batch Integrate phase: executes the Decisions Document, then runs tag-based evidence linking to connect data points to Research Positions |

**MCP tools (underlying primitives the skills call)**

Curate Mind exposes tools through named toolsets, controlled by `CURATE_MIND_TOOLSET`. If unset, the server uses `pipeline`.

| Toolset | Count | Purpose |
|---|---:|---|
| `daily` | 25 | Project setup, source intake, review queue, profile edits, browsing, and questions |
| `pipeline` | 44 | Default curator workflow: `daily` plus extraction, enrichment, evidence linking, and embeddings |
| `admin` | 52 | `pipeline` plus repair, reset, correction, and retirement tools |
| `all` | 52 | Debug mode; registers every tool without filtering |

The full inventory lives in `docs/mcp-tool-inventory.md`. Agents should treat skills and natural workflow prompts as the primary interface, not ask the user to name low-level tools.

Key user-facing tools:
- Intake: `cm_fetch_url`, `cm_fetch_youtube`, `cm_extract_pdf`, `cm_review_queue`, `cm_add_source`
- Query: `cm_search` for exploration, `cm_ask` for cited answers. The public Ask page calls Convex `api.chat.askAnalyst`, the same backend path exposed through `cm_ask`.
- Workflow support: `cm_extract_source`, `cm_save_data_points`, `cm_save_source_synthesis`, `cm_update_data_points_tags_batch`, `cm_enrich_data_points_batch`, `cm_update_source_status`, `cm_generate_embeddings`
- Evidence linking: `cm_get_data_points_by_tag`, `cm_get_position_arrays`, `cm_link_evidence_to_position`, `cm_update_positions_batch`
- Customization: `cm_get_project_profile`, `cm_update_project_profile`, `cm_get_user_preferences`, `cm_update_user_preferences`, `cm_preview_prompt_profile`, `cm_validate_profile`

**Convex backend**
- All seven core entity types: Projects, Sources, Data Points, Curator Observations, Mental Models, Research Positions (with append-only versioning), Tags
- Customization tables (new in 1.1): extended `projects` profile fields, `userPreferences` singleton, `secondaryItems` table for non-default Secondary Capture types. See `Customization_Design_Proposal_2026-05-20.md` Section 7.
- Research Lens as a system artifact used in the Enrich stage
- Embeddings via OpenAI text-embedding-3-small for semantic search

**Web demo site (curatemind.io)**
- Landing page with hero ask input, theme cards, and live position demo
- Themes index, Theme detail, Position detail pages
- Source page (metadata and extracted data points, no full text)
- Ask page (AI chat querying the knowledge base)
- Methodology page (explains the system and pipeline)
- Convex backend visualization page: shows real entity counts and structure from the backend; `fullText` and verbatim anchor fields are hidden to protect copyrighted source content

**GitHub repo**
- README: what it is, who it is for, link to curatemind.io demo, and the "Customizing Curate Mind for your own research" section that links the copy-paste prompts in `prompts/`
- Setup guide: step-by-step from clone to first successful extraction, including the initial setup prompt that runs the onboarding interview
- Copy-paste prompt library at `prompts/`: `setup_initial.md`, `setup_recustomize.md`, `setup_source_intake.md`, `edit_style.md`, `edit_audience.md`, `edit_secondary_capture.md`, `edit_suggested_prompts.md`. See `Customization_Design_Proposal_2026-05-20.md` Section 12.
- `.env.example`: every required key documented with a description
- License: MIT

### Out of scope for v1

| Feature | Status |
|---------|--------|
| Hosted/local Intake Inbox frontend for pasting links, reviewing markdown, editing metadata, and approving ingestion | Future phase. Do not build until the MCP intake tools have been validated in MCP-compatible clients. |
| Daily source monitoring for sites, RSS feeds, YouTube channels, newsletters, and other watchlist sources | Future phase. Requires candidate queue, dedupe rules, and scheduled discovery jobs. |
| Automated site/page crawling beyond explicit user-provided URLs | Future phase. Prefer RSS/YouTube feeds first; use Supadata crawl/scrape only after source-specific behavior is understood. |
| Web settings interface for editing the project profile or user preferences | Out of scope for v1. Customization happens through MCP-mediated chat with the user's AI assistant, using the copy-paste prompts in `prompts/`. Can be added later if MCP setup proves to be meaningful onboarding friction. |
| Fully custom secondary entity schemas (user-defined Convex tables) | Out of scope. The free-text Secondary Capture description model covers the customization need without dynamic schema. |
| Multi-curator support (multiple users sharing one instance) | Out of scope. The `userPreferences` singleton assumes one curator per instance. |
| Per-project user style overrides | Out of scope. User Style is instance-wide; a `styleOverrides` field can be added to the project profile later if needed. |
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
- [ ] All five active skills are documented in the README or a dedicated setup guide, using the renamed stage vocabulary (Extract, Secondary Capture, Enrich, Review), the Batch Extract / Batch Review / Batch Integrate phase names, and plain-language workflow routing for users
- [ ] Every skill opens with the three-block signpost (where you are, what happens in this chat, what comes next, with copy-paste handoff prompt when the next step is a separate chat)
- [ ] `cm-workflow-router`, `cm-batch-orchestrator`, `cm-deep-extract`, `cm-curator-review`, and `cm-evidence-linker` are functional end-to-end against a fresh Convex project
- [ ] Core MCP tool files are functional: `extraction.ts`, `query.ts`, `synthesis.ts`, `customization.ts`, and the working tools in `intake.ts`
- [ ] `cm_add_source` successfully ingests a markdown file and stores fullText in Convex
- [ ] The four-stage source processing loop (Extract, Secondary Capture, Enrich, Review) runs without errors on a single source via `cm-deep-extract` or `cm-batch-orchestrator`. Secondary Capture is skipped when the project profile has `secondaryCaptureEnabled: false`.
- [ ] Secondary Capture runs in its own sub-agent with a clean context window when enabled (reverses the previous P1+P2 sub-agent combination)
- [ ] `cm_search` returns semantic results (embeddings are generated and stored correctly)
- [ ] `cm_ask` returns the three-band Stance/Evidence/Source pack with inline `[E#]` citations on every source-backed claim, `[P#]` position labels available as plain references, and `[O#]`/`[M#]` observations and mental models available as background context (not cited inline); every evidence item includes a resolved source link
- [ ] `CURATE_MIND_TOOLSET=daily`, `pipeline`, `admin`, and `all` register the expected tool counts documented in `docs/mcp-tool-inventory.md`
- [ ] `cm_fetch_url`, `cm_fetch_youtube`, `cm_extract_pdf`, and `cm_review_queue` have been manually smoke-tested against representative sources before being documented as production-ready intake tools

### Customization layer (new in 1.1)
- [ ] All seven customization MCP tools are functional: `cm_get_project_profile`, `cm_update_project_profile`, `cm_get_user_preferences`, `cm_update_user_preferences`, `cm_preview_prompt_profile`, `cm_validate_profile`, `cm_reset_profile_to_defaults`
- [ ] `cm_preview_prompt_profile` returns the assembled prompt with `lockedBlocks` clearly labeled so the curator can see what is editable and what is not
- [ ] All seven copy-paste prompts in `prompts/` are written and tested with a real AI assistant (Claude or Codex) against a fresh instance
- [ ] The initial setup prompt successfully runs the onboarding interview end-to-end and produces a fully initialized project profile and user preferences row
- [ ] No hardcoded `Maicol`, `artificial intelligence strategy`, or other personal-domain content remains in `CLAUDE.md`, `AGENTS.md`, or any skill file; all such content is read from the project profile at runtime
- [ ] Migration script `scripts/migrate_profile_backfill.ts` has been run successfully against the existing Convex project and the backfilled profile reviewed by the curator

### Convex backend
- [ ] Schema deploys cleanly to a fresh Convex project with no migration errors
- [ ] All entity types are created correctly through the MCP pipeline
- [ ] Extended `projects` profile fields, `userPreferences` singleton, and `secondaryItems` table are present in the schema
- [ ] `.env.example` includes `CONVEX_URL`, `CONVEX_DEPLOY_KEY`, `OPENAI_API_KEY`, and `SUPADATA_API_KEY` with descriptions

### Web demo site
- [ ] All six routes render correctly with live data from Convex
- [ ] Convex backend visualization page is live and shows real entity counts and structure
- [ ] `fullText` is never exposed anywhere in the frontend
- [ ] `anchorQuote` is never rendered as visible text on live routes; it is used only as URL fragment metadata for "Open at source" deep links. The hardcoded demo content on `MethodologyPage` is the only exception and is intentionally illustrative.
- [ ] Landing page hero suggested questions are read from `projects.suggestedPrompts` (not hardcoded)
- [ ] Assistant role name displayed in chat UI is read from `projects.assistantRoleName` (not hardcoded)
- [ ] Desktop-only redirect works correctly below 1024px
- [ ] No hardcoded personal data, domain-specific copy, or API keys in the frontend build

### GitHub repo
- [ ] `README.md` explains what the project is, who it is for, links to curatemind.io, and includes the "Customizing Curate Mind for your own research" section
- [ ] `CLAUDE.md` and `AGENTS.md` no longer contain hardcoded owner or domain content; both point AI assistants at `cm_get_project_profile` for project-specific facts
- [ ] `Architecture_Spec.md` reflects the renamed stages, the three-band response shape, and the retired Reader persona (per Section 14 of the customization design proposal)
- [ ] `Design_Decisions_Log.md` includes amendments to Decisions 13, 19, 20, and new Decisions 33, 34, 35, 36
- [ ] Setup guide walks through: clone → Convex project creation → `.env.local` → paste the initial setup prompt into your AI assistant → first ingestion
- [ ] `LICENSE` file present (MIT)
- [ ] No `.env.local` or secrets committed to the repo
- [ ] Deprecated Jina helper code and `JINA_API_KEY` references are removed; Supadata is the documented URL and transcript intake path

---

## Agent Alignment Rules

These rules apply to every agent working on this project. Do not deviate without explicit instruction from the project owner.

**Data integrity — never break these:**
- Never add delete mutations to Convex. The system is append-only.
- Never overwrite existing records. Position updates create new version rows.
- The only fields that update in place: `currentVersionId` on `researchPositions`, `status` on `sources`, `embeddingStatus` on `dataPoints`.
- If an agent makes an error, recovery is always by reverting a pointer — never by deleting records.

**Extraction pipeline — never break these:**
- Do not load the Research Lens during the Extract or Secondary Capture stages. Only the Enrich stage uses it.
- Do not assign tags during Extract. Tags are assigned during Enrich with a holistic view of all data points from the source.
- Secondary Capture is optional and per-project. If the project profile has `secondaryCaptureEnabled: false`, skip the stage entirely. If enabled, run it in its own sub-agent with a clean context window (fresh re-fetch of source text).
- Do not hardcode "mental models" or any other capture type in skills or prompts. Read `secondaryCaptureLabel` and `secondaryCaptureDescription` from the project profile.
- Do not use the old "Pass 1 / Pass 2 / Pass 3 / Pass 4" or "Layer 1 / 2 / 3 / 4" language in any user-facing text (skill openings, MCP tool descriptions, prompts, web copy). Use the renamed stages (Extract, Secondary Capture, Enrich, Review) and the three response bands (Stance, Evidence, Source). Internal code identifiers are exempt.
- Do not use `cm_search` for evidence linking. Use `cm_get_data_points_by_tag`. Semantic search returns embedding vectors that blow out context windows.
- Do not use `cm_search` to answer analyst questions that require cited sources. Use `cm_ask`, which returns the three-band Stance/Evidence/Source pack with resolved source links.
- Do not reintroduce a retrieval-only evidence-pack tool for answer workflows. `cm_ask` is the single cite-and-trace interface.

**Customization layer — never break these:**
- Do not hardcode owner identity, domain, audience, vocabulary, persona name, suggested prompts, or writing style anywhere in code, skills, or prompts. All of these come from the project profile or the user preferences singleton at runtime.
- Do not edit or expose tools that mutate locked prompt blocks. Locked is locked.
- Do not bypass `cm_validate_profile` checks when updating profiles through MCP tools.
- Do not require users to know MCP tool names for normal operation. Plain-language requests should route through `cm-workflow-router` or the relevant dedicated workflow skill.

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
├── skills/                     ← Skills (checked in)
│   ├── cm-workflow-router/
│   ├── cm-batch-orchestrator/
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
| `CURATE_MIND_TOOLSET` | Optional MCP tool filter: `daily`, `pipeline`, `admin`, or `all`; defaults to `pipeline` |

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
