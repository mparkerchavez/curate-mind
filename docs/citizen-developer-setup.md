# Curate Mind Setup, for AI Assistants

> This file is written to be handed to an AI assistant (Claude, Codex, or similar). The user clones the repo, opens their AI tool, and says: "Read this file and help me set up Curate Mind." The instructions below are addressed to you, the assistant.

## Your role

You are helping a citizen developer set up Curate Mind on their machine. They do not write code directly. Your job is to walk them through every step, ask for the information you need one question at a time, run commands on their behalf, and explain what is happening in plain language. Do not move to the next step until the current one is confirmed complete. If a command fails, diagnose the error and fix it before proceeding.

Speak in plain language. The user does not need to know what a build system is or what stdio transport means. They need to know that step 5 is "telling Claude where the server lives," and that step 7 is "ingesting their first piece of research."

## What you are setting up

Curate Mind is a personal research curation system that runs as an MCP (Model Context Protocol) server. It connects to Convex (a hosted database), uses skills to run a four-stage extraction workflow, and stores structured research knowledge that the user can query through Claude or any MCP-compatible chat app.

The user is setting up their own private instance. The live demo at [curatemind.io](https://curatemind.io) shows what the system produces after a full extraction cycle, so the user can see what they are building toward.

## Before you start, gather this information

Ask the user these questions one at a time. Do not ask all of them at once. Wait for each answer before moving to the next.

1. What operating system are you on (Mac, Windows, or Linux)?
2. Do you have Node.js installed? Run `node --version` for them and check the output. They need version 18 or higher. If they do not have it, or the version is too old, guide them to install or upgrade via [nodejs.org](https://nodejs.org).
3. Do you have a Convex account? If not, walk them to [convex.dev](https://convex.dev) and have them sign up. The free tier is sufficient.
4. Do you have an OpenAI API key? If not, walk them to [platform.openai.com/api-keys](https://platform.openai.com/api-keys) and have them create one. Tell them to save it somewhere safe, since they will need to paste it later.
5. What source types do you want to add to Curate Mind: already-clean markdown, web articles, YouTube videos, PDFs, or Claude Dispatch/mobile capture?
6. If they want web articles, YouTube videos, or Dispatch capture for links: Do you have a Supadata API key? If not, walk them to [supadata.ai](https://supadata.ai). Supadata is required for `cm_fetch_url` and `cm_fetch_youtube`.
7. If they want PDFs: Do you have Python 3.10 or higher installed? Run `python3 --version` for them and check the output.

Once you have the answers, confirm with the user: "Great, I have everything I need. Ready to start?" Wait for confirmation before running any commands.

## Step-by-step setup

### Step 1: Install dependencies

Run these commands for the user (one at a time, confirming each completes):

```bash
npm install
cd mcp && npm install && cd ..
```

The first command installs the dependencies for the repo root. The second installs the dependencies for the MCP server. Both should finish without errors. If either fails, read the error message and fix it before continuing.

If the user wants PDF intake, run this from the repo root:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r mcp/requirements.txt
```

Tell the user: "This installs the pinned local PDF extraction libraries. LiteParse handles most clean PDFs first, IBM Docling handles academic or table-heavy PDFs, Docling OCR handles scanned files, and pypdf is a fallback." If installation fails, show the full error and fix it before continuing. If Docling cannot be installed right now, explain that they can still use manual markdown, web, and YouTube intake.

### Step 2: Create a Convex project

Run:

```bash
npx convex dev
```

Tell the user: "This is going to open a browser tab. It will ask you to log into Convex (use the account you created earlier), then ask you to create a new project. Pick any name you like, something like 'curate-mind' is fine. Tell me when you have done both."

Wait for confirmation. Once the user confirms, Convex will start watching the local files and pushing schema changes automatically. Tell the user: "Leave this terminal tab running for the rest of setup. I am going to use a separate terminal for the rest of the steps."

Open a second terminal for the remaining steps.

### Step 3: Confirm the schema deployed

The schema in `convex/schema.ts` was pushed automatically when `npx convex dev` started. You should see output in the Convex terminal that says something like "Convex functions ready" or similar. Confirm this with the user. If you see errors instead, read them and fix them before continuing.

### Step 4: Configure environment variables

Run:

```bash
cp .env.example .env.local
```

Now walk the user through each required variable one at a time. For each one, ask for the value, paste it into `.env.local` for them, and confirm before moving to the next.

**CONVEX_URL.** Tell the user: "Open the Convex dashboard at [dashboard.convex.dev](https://dashboard.convex.dev), select the project you just created, and copy the deployment URL. It looks like `https://something.convex.cloud`. Paste it here." Set the value in `.env.local`.

**OPENAI_API_KEY.** Tell the user: "Paste the OpenAI API key you created earlier. This is what generates the embeddings that power semantic search across your research." Set the value in `.env.local`.

**SUPADATA_API_KEY.** Tell the user: "Paste your Supadata key if you want article, YouTube, or Dispatch link capture. If you only want manual markdown or PDF intake for now, leave it blank; you can come back to it later." Set the value or leave blank.

**CURATE_MIND_PATH.** Run `pwd` from the repo root to get the absolute path. Tell the user: "This is the full path to the folder where you cloned Curate Mind. The MCP server uses it when it needs to write files into the `sources/` folder. I am going to set it to: `/Users/yourname/projects/curate-mind` (substituting their real path). Confirm that looks right." Set the value.

**CURATE_MIND_TOOLSET.** Tell the user: "This controls how many MCP tools your assistant sees. I recommend `pipeline` because it supports normal Curate Mind work while hiding repair-only tools. You can switch to `daily` for a simpler intake/query setup or `admin` for repairs later." Set it to `pipeline` unless the user chooses otherwise.

After these are filled in, tell the user: "Your `.env.local` is configured. Never share this file or commit it to git, since it has your API keys in it."

### Step 5: Connect the MCP server to Claude

First, build the server:

```bash
cd mcp
npm run build
cd ..
```

This produces `mcp/dist/index.js`. Tell the user: "This is the file Claude will run when it talks to your knowledge base."

Ask the user: "Are you using Claude Desktop or Claude Code?"

**If Claude Desktop:** Tell them you are going to add the server to their Claude config file. The path is:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Show them this config block and explain that you will fill it in with the values from `.env.local`:

```json
{
  "mcpServers": {
    "curate-mind": {
      "command": "node",
      "args": ["<CURATE_MIND_PATH>/mcp/dist/index.js"],
      "env": {
        "CONVEX_URL": "<from .env.local>",
        "OPENAI_API_KEY": "<from .env.local>",
        "SUPADATA_API_KEY": "<from .env.local or empty>",
        "CURATE_MIND_PATH": "<from .env.local>",
        "CURATE_MIND_TOOLSET": "pipeline"
      }
    }
  }
}
```

Read the values from `.env.local` and write the filled-in JSON to the user's Claude config file. If the file already has other servers, merge into the existing `mcpServers` object instead of overwriting.

Tell the user: "Quit Claude Desktop completely, then reopen it. The Curate Mind tools will now be available."

**If Claude Code:** Run this from the repo root, with the absolute path filled in:

```bash
claude mcp add curate-mind node /absolute/path/to/curate-mind/mcp/dist/index.js
```

Then set the same environment variables in their shell profile or in the MCP entry's `env` field.

Verify the server is connected by running `claude mcp list` and confirming `curate-mind` appears.

### Step 6: Install the skills

Tell the user: "The `skills/` folder has five active files. The workflow router lets you ask for Curate Mind tasks in plain language, and the other skills run extraction, review, and evidence linking. I am going to make them available to Claude now."

**If Claude Code:** Run:

```bash
mkdir -p ~/.claude/skills
ln -s "$(pwd)/skills/cm-workflow-router" ~/.claude/skills/cm-workflow-router
ln -s "$(pwd)/skills/cm-batch-orchestrator" ~/.claude/skills/cm-batch-orchestrator
ln -s "$(pwd)/skills/cm-deep-extract" ~/.claude/skills/cm-deep-extract
ln -s "$(pwd)/skills/cm-curator-review" ~/.claude/skills/cm-curator-review
ln -s "$(pwd)/skills/cm-evidence-linker" ~/.claude/skills/cm-evidence-linker
```

Tell the user: "Restart any open Claude Code sessions. The skills are now available as slash commands like `/cm-workflow-router` and `/cm-deep-extract`."

**If Claude Desktop:** Walk the user through adding each `skills/cm-*` folder in Settings under the Skills section.

### Step 7: First extraction

This is the moment of truth. Walk the user through their first end-to-end extraction.

1. Ask the user to write a short markdown file about any topic they are researching. A few paragraphs is enough. Save it somewhere they can find it, for example `/tmp/first-source.md`. If they cannot think of anything, suggest a topic from a domain they care about and offer to draft a sample for them.

2. Open Claude (Desktop or Code) and confirm the MCP server is connected. Look for the `cm_*` tools in the tools list.

3. Have the user paste this prompt into Claude: "Use the Curate Mind workflow router. This file is reviewed and ready: `/tmp/first-source.md`. Ingest it, then run Deep Extract on it."

4. Watch the extraction unfold. Claude will run Extract (claims, anchors, and source synthesis), Secondary Capture when enabled, Enrich (tags, confidence, and notes), and Review (human check). Explain what is happening at each stage in plain language.

5. Once extraction completes, have the user run: "Use the Curate Mind workflow router. Ask my research base what was extracted from the first source." They should get a plain-language answer grounded in the new source.

Congratulate them. The system is now live with one source in it. They can keep adding sources with plain-language router prompts and run Batch Extract when they have several indexed sources ready.

### Step 8: Set up source intake paths

Tell the user: "Now we will test the source capture paths you said you care about. These tools create local markdown first. Convex only gets the source after you review it and call `cm_add_source reviewed=true`."

Use only the branches that match the user's answer from the opening questions.

**If they want web articles:** Ask for a test URL, then have Claude run:

```text
Use cm_fetch_url to fetch this article for review: <URL>
```

Confirm the tool returns a file path under `sources/`.

**If they want YouTube videos:** Ask for a test YouTube URL, then have Claude run:

```text
Use cm_fetch_youtube to fetch this YouTube transcript for review: <URL>
```

Confirm the tool returns a transcript markdown file under `sources/`.

**If they want PDFs:** Ask for an absolute path to a local PDF, then have Claude run:

```text
Use cm_extract_pdf on this local PDF for review: <absolute path to PDF>
```

Confirm the tool returns a markdown file path and preserves the original PDF path for later `cm_add_source`.

**If they want Claude Dispatch/mobile capture:** Explain: "Dispatch is not a separate Curate Mind service. It is a way to ask Claude to call the same MCP tools from a quick-capture surface. The URL still lands as local markdown in `sources/`, and you still review it before ingestion." Test with a URL if their Dispatch setup can reach the same MCP-connected Claude environment.

After any fetch/extract test succeeds, have Claude run:

```text
Use cm_review_queue to show me pending source files.
```

Then tell the user to review one generated file. After review, ingest it with:

```text
Use cm_add_source with reviewed=true to ingest this reviewed file: <file path>
```

Point them to the [source intake guide](source-intake-guide.md) and the [source intake setup prompt](../prompts/setup_source_intake.md) for future intake setup or troubleshooting.

## If something goes wrong

Check these in order:

- **`CONVEX_URL` not set or wrong.** The MCP server will fail to connect to the database. Verify the URL in `.env.local` matches the deployment URL in the Convex dashboard.
- **`CURATE_MIND_PATH` not set.** Intake tools will error when they try to write files. Run `pwd` from the repo root and paste the result into `.env.local`.
- **`SUPADATA_API_KEY` missing.** Article and YouTube intake will fail. Add the key to `.env.local` and to the MCP server environment your assistant uses.
- **PDF extraction dependencies missing.** Run `python3 -m pip install -r mcp/requirements.txt`. If Docling fails to install, use manual markdown intake until it is fixed.
- **Skills not found.** Claude does not see the slash commands. Check that the symlinks (or settings entries) point to the correct `skills/cm-*` folders.
- **Node version too low.** Run `node --version`. If it is below 18, the user needs to upgrade. Guide them through installing a newer version.
- **MCP server not appearing in Claude.** Did the user fully quit and reopen Claude Desktop? Did they run `npm run build` in `mcp/` after pulling the latest code?
- **Convex schema errors.** Make sure `npx convex dev` is still running in the first terminal tab. If it stopped, restart it.

## What to do next

Once setup is complete, point the user to:

- [Setup guide](setup-guide.md) for the full technical reference, including the folder structure and the underlying commands.
- [Source intake guide](source-intake-guide.md) for article, YouTube, PDF, markdown, and Dispatch intake workflows.
- [Source intake setup prompt](../prompts/setup_source_intake.md) if they want an AI assistant to re-run or troubleshoot source intake setup later.
- [curatemind.io](https://curatemind.io) to see a live example of what a complete extraction cycle produces.

If the user wants to start ingesting more sources, suggest: "Use the Curate Mind workflow router. Let's start ingestion for new files in folder <folder path>."
