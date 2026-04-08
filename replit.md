# Curate Mind

A personal research curation system designed to track AI trends, extract insights from various sources, synthesize research positions, and provide a queryable knowledge base.

## Architecture

- **Frontend**: React 18 + Vite + Tailwind CSS + React Router (in `web/`)
- **Backend**: [Convex](https://www.convex.dev/) — real-time cloud database and serverless functions (in `convex/`)
- **MCP Server**: Model Context Protocol server for AI-driven interaction (in `mcp/`)
- **AI**: OpenAI embeddings (`text-embedding-3-small`) + Claude models via MCP

## Project Layout

```
convex/          Convex schema, queries, mutations (serverless backend)
web/             React frontend (Vite, Tailwind, React Router)
  src/
    pages/       Main app views (Chat, Browse, Positions, Themes, etc.)
    components/  Reusable UI components
    convex.ts    Convex client setup (reads VITE_CONVEX_URL)
    api.ts       API helpers
mcp/             MCP server implementation
  src/tools/     Extraction, intake, query, synthesis tools
  src/lib/       Convex, OpenAI, Supadata client wrappers
skills/          High-level agent skill definitions
```

## Environment Variables / Secrets Required

- `VITE_CONVEX_URL` — Convex deployment URL (e.g. `https://xxx.convex.cloud`). Required for the frontend to connect to the backend.
- `VITE_CURATE_MIND_PROJECT_ID` — (optional) Default project ID to scope queries.
- `OPENAI_API_KEY` — Required for the MCP server to generate embeddings.
- Supadata API key — Required for web scraping / YouTube transcript ingestion via MCP.

## Development Workflow

- The workflow "Start application" runs `cd web && npm run dev` on port 5000 (webview).
- Convex backend is hosted externally (convex.dev). The frontend connects via `VITE_CONVEX_URL`.
- To run Convex functions locally: `npx convex dev` from the project root (requires Convex auth).

## Deployment

- Configured as a **static** deployment: builds `web/` with `npm run build`, serves `web/dist/`.
- The `VITE_CONVEX_URL` secret must be set before building for production.

## Key Design Principles

- **Append-only data**: No deletions or overwrites; entities are versioned by new records.
- **Four-pass extraction pipeline**: Core extraction → mental model scan → enrichment → human review.
- **Progressive disclosure**: Information surfaced in layers (Layer 1–4) based on context and permissions.
