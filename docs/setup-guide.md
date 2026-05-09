# Curate Mind Setup Guide

This guide walks you from a fresh clone to your first successful extraction. Every step has an exact command. If a command fails, fix the issue before moving on.

## 1. Prerequisites

Have these ready before you start:

- **Node.js 18 or higher.** Check with `node --version`. If you need to upgrade, install via [nodejs.org](https://nodejs.org) or use a version manager like `nvm`.
- **A Convex account.** Free tier is sufficient. Sign up at [convex.dev](https://convex.dev).
- **An OpenAI API key.** Used to generate embeddings for semantic search. Create one at [platform.openai.com/api-keys](https://platform.openai.com/api-keys).
- **A Supadata API key.** Used by the MCP fetch tools for URL scraping and YouTube transcripts. Optional if you only ingest markdown files directly, required if you want to test link-to-markdown intake. Sign up at [supadata.ai](https://supadata.ai) if you want it ready.

## 2. Clone the repo and install dependencies

```bash
git clone https://github.com/mparkerchavez/curate-mind.git
cd curate-mind
npm install
cd mcp && npm install && cd ..
```

The repo root holds the Convex functions, skills, and frontend. The MCP server lives in `mcp/` and has its own `package.json`.

## 3. Create a Convex project and deploy the schema

Convex provisions a database for you and pushes the schema in a single interactive command:

```bash
npx convex dev
```

The first time you run this, Convex will:

1. Open a browser tab and ask you to log in.
2. Prompt you to create a new project (give it any name, for example `curate-mind`).
3. Push the schema in `convex/schema.ts` to your new deployment.
4. Watch your local files for changes.

Leave this process running in a terminal tab. It deploys schema and function changes automatically as you edit them. Open a second terminal for the rest of the setup.

If you ever need to redeploy without the dev watcher, run `npx convex dev --once`. You do not need a Convex deploy key for local development.

## 4. Configure environment variables

Copy the example file:

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in each variable.

- **`CONVEX_URL`**: After step 3, open the Convex dashboard at [dashboard.convex.dev](https://dashboard.convex.dev), select your project, and copy the deployment URL. It looks like `https://your-project-name.convex.cloud`.
- **`OPENAI_API_KEY`**: Paste the key you created on [platform.openai.com/api-keys](https://platform.openai.com/api-keys). Used for embeddings only.
- **`SUPADATA_API_KEY`**: Paste your Supadata key if you want to test URL or YouTube intake. Leave it blank if you only ingest markdown files manually.
- **`CURATE_MIND_PATH`**: The absolute path to this repo on your machine. The MCP server uses it when intake tools write source files to `sources/`. Run `pwd` from the repo root to get the value, then paste it in. Example: `/Users/yourname/projects/curate-mind`.

Never commit `.env.local`. It is already gitignored.

## 5. Build the MCP server and connect it to Claude

Build the server so Claude can run it:

```bash
cd mcp
npm run build
cd ..
```

This produces `mcp/dist/index.js`, the entry point Claude will launch.

Now register the server with Claude. The exact step depends on which Claude product you use.

### Claude Desktop

Open your Claude Desktop config file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Add a `mcpServers` entry. Replace every `/absolute/path/to/curate-mind` with the value of `CURATE_MIND_PATH` from step 4:

```json
{
  "mcpServers": {
    "curate-mind": {
      "command": "node",
      "args": ["/absolute/path/to/curate-mind/mcp/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://your-project.convex.cloud",
        "OPENAI_API_KEY": "sk-...",
        "SUPADATA_API_KEY": "",
        "CURATE_MIND_PATH": "/absolute/path/to/curate-mind"
      }
    }
  }
}
```

Restart Claude Desktop. The `cm_*` tools should appear in the tools menu.

### Claude Code

Add the server to your project from the repo root:

```bash
claude mcp add curate-mind node /absolute/path/to/curate-mind/mcp/dist/index.js
```

Set the same four environment variables in your shell or in the MCP entry's `env` field.

Verify the server is connected by running `claude mcp list` and confirming `curate-mind` appears.

## 6. Install the skills

The `skills/` folder contains five `SKILL.md` files. Claude reads these as slash commands and runs the workflows they describe.

### Claude Code

From the repo root, the skills folder is already in the right place. Make Claude Code aware of it:

```bash
mkdir -p ~/.claude/skills
ln -s "$(pwd)/skills/cm-batch-orchestrator" ~/.claude/skills/cm-batch-orchestrator
ln -s "$(pwd)/skills/cm-source-pipeline" ~/.claude/skills/cm-source-pipeline
ln -s "$(pwd)/skills/cm-deep-extract" ~/.claude/skills/cm-deep-extract
ln -s "$(pwd)/skills/cm-curator-review" ~/.claude/skills/cm-curator-review
ln -s "$(pwd)/skills/cm-evidence-linker" ~/.claude/skills/cm-evidence-linker
```

Restart any open Claude Code session. The skills are now invocable as `/cm-deep-extract`, `/cm-batch-orchestrator`, and so on.

### Claude Desktop

Open Settings, navigate to the Skills section, and add each `skills/cm-*` folder.

## 7. Ingest your first source

Open Claude (Desktop or Code) and confirm the MCP server is connected. Then:

1. Create a markdown file at the repo root with any content you want to extract from. A few paragraphs is enough. For example:

   ```bash
   cat > /tmp/first-source.md <<'EOF'
   # The Rise of Agentic Workflows in 2026

   Enterprise AI adoption shifted in early 2026 from one-shot prompts to multi-step agents
   that operate over long horizons. Three patterns emerged ...
   EOF
   ```

2. In Claude, ask: "Use cm_add_source to ingest /tmp/first-source.md, then run cm-deep-extract on it." Claude will call the MCP tools to push the file to Convex and then walk you through the extraction passes interactively.

3. Once extraction completes, query the result:

   ```
   Use cm_get_themes to show me what was extracted.
   ```

   Or browse the Convex dashboard directly to see the new entities in your database.

If everything works, you have a queryable foundation with one source in it. From here, scale up by adding more markdown files and using `cm-batch-orchestrator` to process them in waves.

### Optional: test link-to-markdown intake

The MCP server also includes intake tools that are currently being validated:

- `cm_fetch_url` fetches a public article/page through Supadata and saves markdown into `sources/`.
- `cm_fetch_youtube` fetches a YouTube transcript and saves markdown into `sources/`.
- `cm_review_queue` shows local markdown files that are pending review or already ingested.

These tools follow a two-step workflow: fetch to local markdown first, then review the file before calling `cm_add_source` with `reviewed=true`. A future Intake Inbox frontend and daily source watchlist are planned, but not part of the current setup flow.

## Folder structure reference

```
curate-mind/                    <- CURATE_MIND_PATH points here
├── convex/                     <- Convex schema and functions (checked in)
├── mcp/                        <- MCP server (checked in)
│   └── src/
│       ├── tools/              <- MCP tool registrations
│       └── lib/                <- Convex client, OpenAI, Supadata
├── skills/                     <- Claude skills (checked in)
│   ├── cm-batch-orchestrator/
│   ├── cm-source-pipeline/
│   ├── cm-deep-extract/
│   ├── cm-curator-review/
│   └── cm-evidence-linker/
├── web/                        <- Frontend demo site (checked in, optional for MCP-only use)
├── sources/                    <- Local working inbox, git-ignored
│   └── YYYY-MM/
│       └── YYYY-MM-DD_to_DD/  <- Markdown files land here during intake
├── .env.example                <- Checked in, documents all required keys
└── .env.local                  <- You create this, never committed
```

The MCP server generates paths inside `sources/` automatically. Do not move `sources/` relative to the repo root.
