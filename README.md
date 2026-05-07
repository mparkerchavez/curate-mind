# Curate Mind

A personal research curation system you run as an MCP server, with a queryable knowledge base for tracking a domain over time.

Curate Mind ingests sources you collect, runs them through a four-pass extraction pipeline, and builds a structured, append-only foundation of data points, observations, mental models, and research positions. You query that foundation through Claude or any MCP-compatible chat app, and generate talking points, summaries, or analysis on demand. There are no maintained deliverable documents. The foundation is the product, and everything else is generated when you need it.

## Live demo

[curatemind.io](https://curatemind.io) shows what the system produces after a full extraction cycle on February 2026 AI research. It is a snapshot of the methodology, not a continuously updating feed.

The `web/` directory contains the source for curatemind.io. It is included for transparency, not designed to be redeployed against your own Convex project. The frontend has demo-specific assumptions baked in: a hardcoded flagship position, AI-strategy-specific copy, and a single-deployment configuration. A configurable Reader frontend is on the roadmap; for v1, the MCP server is the interface.

## How it works

1. You drop markdown files into the repo (one source per file).
2. You invoke a Curate Mind skill in Claude (for example, `cm-deep-extract` or `cm-batch-orchestrator`).
3. The skill orchestrates the extraction pipeline: claims with verbatim anchors, mental models, tags, and a curator review pass. Sub-agents write directly to your Convex database.
4. You query the foundation through MCP tools (`cm_get_themes`, `cm_search`, `cm_get_position_detail`, and others) from Claude, Codex, or any MCP-compatible client.

The MCP server is the primary interface. The web demo is a Reader view of one curated knowledge base.

## What you get

Five skills do the orchestration work. Claude follows them as slash commands.

- **cm-batch-orchestrator** processes multiple sources by spawning sub-agents and coordinating the full pipeline across a queue.
- **cm-source-pipeline** runs the three-pass extraction pipeline for a single source. Designed to run as a sub-agent inside the batch orchestrator.
- **cm-deep-extract** runs interactive single-source extraction for high-value Tier 1 sources. The curator engages at each pass.
- **cm-curator-review** runs Pass 4, the human-in-the-loop review of items flagged during extraction.
- **cm-evidence-linker** connects extracted data points to research positions after an extraction wave.

## Requirements

You need a Convex account (free tier works), an OpenAI API key, and Node.js 18 or higher. Set these four environment variables in `.env.local`:

| Variable | Purpose |
|----------|---------|
| `CONVEX_URL` | Your Convex deployment URL, from the Convex dashboard. |
| `OPENAI_API_KEY` | OpenAI key for embeddings (`text-embedding-3-small`). Powers semantic search. |
| `SUPADATA_API_KEY` | Supadata key for URL scraping and YouTube transcripts. Required for future intake tools, optional for v1 markdown-only ingestion. |
| `CURATE_MIND_PATH` | Absolute path to this repo on your machine. Used by the MCP server when it writes intake files to `sources/`. |

## Get started

Pick the path that fits how you work.

**I want to set this up myself.**
Read [docs/setup-guide.md](docs/setup-guide.md). It walks you from a fresh clone to your first successful extraction, with exact commands at every step.

**I want an AI assistant to walk me through it.**
Open [docs/citizen-developer-setup.md](docs/citizen-developer-setup.md), then hand the file to Claude, Codex, or your preferred AI tool with a single instruction: "Read this file and help me set up Curate Mind." The assistant will guide you through every step, ask for the values it needs, and run commands on your behalf.

## License

[MIT](LICENSE).
