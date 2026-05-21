# Curate Mind Web Demo

The `web/` app is the source for [curatemind.io](https://curatemind.io). It is included for transparency and local development on the public demo site. For v1, the MCP server in `mcp/` remains the primary interface for running your own Curate Mind instance.

The demo reads from a Convex deployment and renders the public-facing view of one curated knowledge base: landing page, methodology page, ask interface, themes, positions, and sources. It should show Stance, Evidence, and Source links without exposing full source text.

## Run Locally

```bash
cd web
npm install
cp .env.example .env.local
npm run dev
```

The app runs at <http://localhost:5000>.

Set `VITE_CONVEX_URL` in `web/.env.local`. If the deployment has multiple projects, set `VITE_CURATE_MIND_PROJECT_ID` to choose one.

## Build

```bash
cd web
npm run build
```

The Vite build writes generated files to the repo-root `dist/` folder. That folder is intentionally ignored and should not be committed.

## Backend Data Expectations

The app expects Convex functions to provide:

- project profile fields such as assistant role name and suggested prompts;
- themes, positions, source details, and linked evidence;
- `api.chat.askGrounded` for the demo ask interface;
- resolved source links that avoid exposing full source text.

If data is missing, the UI should degrade gracefully with empty states or unavailable-source labels.
