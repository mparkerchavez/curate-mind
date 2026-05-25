# Curate Mind

A personal research curation system you run as an MCP server, with a queryable knowledge base for tracking a domain over time.

Curate Mind ingests sources you collect, runs them through a four-stage extraction workflow, and builds a structured, append-only foundation of data points, observations, mental models, and research positions. You query that foundation through an MCP-compatible chat app, and generate talking points, summaries, or analysis on demand. There are no maintained deliverable documents. The foundation is the product, and everything else is generated when you need it.

## Live demo

[curatemind.io](https://curatemind.io) shows what the system produces after a full extraction cycle on February 2026 AI research. It is a snapshot of the methodology, not a continuously updating feed.

The `web/` directory contains the source for curatemind.io. It is included for transparency, not designed to be redeployed against your own Convex project. The frontend has demo-specific assumptions baked in: a hardcoded flagship position, AI-strategy-specific copy, and a single-deployment configuration. A configurable public frontend is on the roadmap; for v1, the MCP server is the interface.

## How it works

You should not need to memorize tool names. Ask your assistant for the workflow you want, then let the assistant choose the underlying MCP tools.

Common natural prompts:

- "Let's start ingestion for new files in folder X."
- "Fetch this article for review: <URL>."
- "Show me what sources are waiting for review."
- "Run batch extraction on the indexed sources."
- "Ask my research base: <question>."
- "Link this week's evidence to the current positions."

The `cm-workflow-router` skill maps these plain-language requests to the right Curate Mind workflow, so users do not have to learn the underlying tool list.

Under the hood:

1. Source capture creates reviewed markdown in the local `sources/` inbox.
2. Ingestion stores reviewed source text and original PDF files, when present, in Convex.
3. Extraction skills orchestrate Extract, optional Secondary Capture, Enrich, and Review.
4. Query workflows use `cm_search` for exploration and `cm_ask` for cited answers.

The MCP server is the primary interface. The web demo is a public view of one curated knowledge base.

## Using Claude or Codex

Curate Mind is designed to be operated through an MCP-connected AI assistant. You can use Claude, Codex, or another MCP-compatible app; you do not need multiple assistant subscriptions to run the system.

- **Claude workflow:** Claude Desktop or Claude Code can run the MCP tools, use the Curate Mind skills as workflow instructions or slash commands, and support Claude Dispatch/mobile capture where available.
- **Codex workflow:** Codex can handle repo setup, documentation, code maintenance, commits, and the Curate Mind research workflow when the MCP server is configured. Codex can also support a ChatGPT mobile capture pattern when your workspace has repo and MCP access.

Read the full [assistant workflow guide](docs/assistant-guides/README.md), including [Using Claude](docs/assistant-guides/using-claude.md), [Using Codex](docs/assistant-guides/using-codex.md), and [Common workflows](docs/assistant-guides/common-workflows.md).

## MCP toolsets

The MCP server can expose different tool surfaces with `CURATE_MIND_TOOLSET`:

| Value | Use when | Tool count |
|-------|----------|------------|
| `daily` | You mainly ingest, review, and ask questions | 25 |
| `pipeline` | You run the full research workflow, including extraction and evidence linking | 44 |
| `admin` | You need repair and maintenance tools | 52 |
| `all` | You are debugging tool registration itself | 52 |

If unset, Curate Mind uses `pipeline`, which supports the normal curator workflow while hiding legacy and repair-only tools from the default surface. See [MCP tool inventory](docs/mcp-tool-inventory.md) for the full list.

## Source intake options

Curate Mind supports several ways to turn research into reviewed markdown before it enters Convex:

- **Already-clean markdown or pasted text:** use `cm_add_source` with `reviewed=true`.
- **Articles and web pages:** use `cm_fetch_url`. Requires Supadata.
- **YouTube videos:** use `cm_fetch_youtube`. Requires Supadata.
- **Local PDFs:** use `cm_extract_pdf`. Uses local Python extraction with `pypdf`, `docling`, or `docling_ocr`.
- **Mobile or quick capture:** use your provider's mobile capture path, such as Claude Dispatch with Claude Mobile or Codex through the ChatGPT mobile app, to call the same MCP fetch tools and save markdown for later review.

Read the [source intake guide](docs/source-intake-guide.md) for setup requirements, vendor dependencies, and copy-paste prompts for each intake path. If you want an AI assistant to configure and test intake with you, use the [source intake setup prompt](prompts/setup_source_intake.md).

## Customizing Curate Mind for your own research

Curate Mind separates the parts that should stay stable from the parts that should sound and behave like your research practice.

**Locked method:** The extraction workflow, citation rules, append-only data model, and Explore versus Cite-and-Trace query protocol are part of the system method. They are intentionally not editable because they protect source fidelity, traceability, and recovery from agent mistakes.

**Project profile:** Project-specific facts live in Convex: what you are researching, who the research is for, what time horizon matters, what vocabulary you prefer, which example questions appear in the web demo, and whether Secondary Capture is enabled.

**User style:** Writing preferences are stored separately from any one project. This includes voice, structure, banned punctuation or phrases, hedging style, and other preferences that should follow you across projects.

Customization happens through your own AI assistant using MCP tools. For a fresh install, start with [common assistant workflows](docs/assistant-guides/common-workflows.md), which includes copy-paste prompts for project setup, source intake, extraction, review, and evidence linking. The polished prompt files live in [`prompts/`](prompts/): first-run setup, re-customization, style edits, audience edits, Secondary Capture edits, suggested prompt edits, and source intake setup.

For profile changes, ask your assistant to call `cm_get_project_profile` and `cm_get_user_preferences`, then save approved updates with `cm_update_project_profile` and `cm_update_user_preferences`. That covers first-run setup, re-customizing for a different use case, updating writing style, changing audience or scope, changing Secondary Capture, and updating suggested questions without relying on untracked local prompt files.

## What you get

Five skills do the orchestration work. Your MCP host follows them as workflow instructions or slash commands, depending on the product.

- **cm-workflow-router** is the plain-language front door. It maps user requests like "ingest this folder" or "ask my research base" to the correct workflow.
- **cm-batch-orchestrator** processes multiple sources by spawning sub-agents and coordinating the full pipeline across a queue.
- **cm-deep-extract** runs interactive single-source extraction for high-value Tier 1 sources. The curator engages at each stage.
- **cm-curator-review** runs Review, the human-in-the-loop check of items flagged during extraction.
- **cm-evidence-linker** connects extracted data points to research positions after an extraction wave.

## Requirements

You need a Convex account (free tier works), an OpenAI API key, and Node.js 18 or higher. Supadata is required for article and YouTube intake. Python PDF dependencies are required only if you want PDF intake.

Set these environment variables in `.env.local`:

| Variable | Purpose |
|----------|---------|
| `CONVEX_URL` | Your Convex deployment URL, from the Convex dashboard. |
| `OPENAI_API_KEY` | OpenAI key for embeddings (`text-embedding-3-small`). Powers semantic search. |
| `SUPADATA_API_KEY` | Supadata key for URL scraping and YouTube transcripts. Required when testing or using the MCP fetch tools; optional if you only ingest markdown files you create manually. |
| `CURATE_MIND_PATH` | Absolute path to this repo on your machine. Used by the MCP server when it writes intake files to `sources/`. |
| `CURATE_MIND_TOOLSET` | Optional. `daily`, `pipeline`, `admin`, or `all`. Defaults to `pipeline`. |

For PDF intake, install the local Python dependencies:

```bash
python3 -m pip install -r mcp/requirements.txt
```

## Future work

The next intake evolution is parked for a future phase: an Intake Inbox frontend for pasting links, reviewing fetched markdown, editing metadata, and approving ingestion, plus a Daily Discovery watchlist for YouTube channels, RSS feeds, sites, newsletters, and other recurring sources. The current priority is validating the MCP intake tools in MCP-compatible clients first.

## Get started

Pick the path that fits how you work.

**I want to use one AI assistant to operate Curate Mind.**
Read the [assistant workflow guide](docs/assistant-guides/README.md). It explains how Claude, Codex, or another MCP-compatible assistant can run the full workflow without requiring multiple subscriptions.

**I want to set this up myself.**
Read the [setup guide](docs/setup-guide.md). It walks you from a fresh clone to your first successful extraction, with exact commands at every step.

**I want an AI assistant to walk me through it.**
Open the [assistant-led setup guide](docs/citizen-developer-setup.md), then hand the file to Claude, Codex, or your preferred AI tool with a single instruction: "Read this file and help me set up Curate Mind." The assistant will guide you through every step, ask for the values it needs, and run commands on your behalf.

## Development checks

Before committing changes, run:

```bash
npm run validate
```

This lightweight check confirms `CLAUDE.md` and `AGENTS.md` are still in sync. If it fails after editing `CLAUDE.md`, run `npm run agents:sync`, then run `npm run validate` again.

## License

[MIT](LICENSE).
