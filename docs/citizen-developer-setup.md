# Curate Mind Setup, for AI Assistants

> This file is written to be handed to an AI assistant (Claude, Codex, or similar). The user clones the repo, opens their AI tool, and says: "Read this file and help me set up Curate Mind." The instructions below are addressed to you, the assistant.

## Your role

You are helping a citizen developer set up Curate Mind on their machine. They do not write code directly. Your job is to walk them through every step, ask for the information you need one question at a time, run commands on their behalf, and explain what is happening in plain language. Do not move to the next step until the current one is confirmed complete. If a command fails, diagnose the error and fix it before proceeding.

Speak in plain language. The user does not need to know what a build system is or what stdio transport means. They need to know that step 5 is "telling Claude where the server lives," and that step 7 is "ingesting their first piece of research."

## What you are setting up

Curate Mind is a personal research curation system that runs as an MCP (Model Context Protocol) server. It connects to Convex (a hosted database), uses Claude skills to run a four-pass extraction pipeline, and stores structured research knowledge that the user can query through Claude or any MCP-compatible chat app.

The user is setting up their own private instance. The live demo at [curatemind.io](https://curatemind.io) shows what the system produces after a full extraction cycle, so the user can see what they are building toward.

## Before you start, gather this information

Ask the user these questions one at a time. Do not ask all of them at once. Wait for each answer before moving to the next.

1. What operating system are you on (Mac, Windows, or Linux)?
2. Do you have Node.js installed? Run `node --version` for them and check the output. They need version 18 or higher. If they do not have it, or the version is too old, guide them to install or upgrade via [nodejs.org](https://nodejs.org).
3. Do you have a Convex account? If not, walk them to [convex.dev](https://convex.dev) and have them sign up. The free tier is sufficient.
4. Do you have an OpenAI API key? If not, walk them to [platform.openai.com/api-keys](https://platform.openai.com/api-keys) and have them create one. Tell them to save it somewhere safe, since they will need to paste it later.
5. Do you have a Supadata API key? If not, walk them to [supadata.ai](https://supadata.ai). This is optional if the user will only ingest markdown files directly, but required if they want to test URL or YouTube link-to-markdown intake.

Once you have all five answers, confirm with the user: "Great, I have everything I need. Ready to start?" Wait for confirmation before running any commands.

## Step-by-step setup

### Step 1: Install dependencies

Run these commands for the user (one at a time, confirming each completes):

```bash
npm install
cd mcp && npm install && cd ..
```

The first command installs the dependencies for the repo root. The second installs the dependencies for the MCP server. Both should finish without errors. If either fails, read the error message and fix it before continuing.

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

Now walk the user through each of the four variables one at a time. For each one, ask for the value, paste it into `.env.local` for them, and confirm before moving to the next.

**CONVEX_URL.** Tell the user: "Open the Convex dashboard at [dashboard.convex.dev](https://dashboard.convex.dev), select the project you just created, and copy the deployment URL. It looks like `https://something.convex.cloud`. Paste it here." Set the value in `.env.local`.

**OPENAI_API_KEY.** Tell the user: "Paste the OpenAI API key you created earlier. This is what generates the embeddings that power semantic search across your research." Set the value in `.env.local`.

**SUPADATA_API_KEY.** Tell the user: "Paste your Supadata key if you want to test URL or YouTube intake. If you skipped this earlier and only want markdown ingestion for now, leave it blank; you can come back to it later." Set the value or leave blank.

**CURATE_MIND_PATH.** Run `pwd` from the repo root to get the absolute path. Tell the user: "This is the full path to the folder where you cloned Curate Mind. The MCP server uses it when it needs to write files into the `sources/` folder. I am going to set it to: `/Users/yourname/projects/curate-mind` (substituting their real path). Confirm that looks right." Set the value.

After all four are filled in, tell the user: "Your `.env.local` is configured. Never share this file or commit it to git, since it has your API keys in it."

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
        "CURATE_MIND_PATH": "<from .env.local>"
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

Then set the four environment variables in their shell profile or in the MCP entry's `env` field.

Verify the server is connected by running `claude mcp list` and confirming `curate-mind` appears.

### Step 6: Install the skills

Tell the user: "The `skills/` folder has five files that tell Claude how to run the extraction pipeline. I am going to make them available to Claude now."

**If Claude Code:** Run:

```bash
mkdir -p ~/.claude/skills
ln -s "$(pwd)/skills/cm-batch-orchestrator" ~/.claude/skills/cm-batch-orchestrator
ln -s "$(pwd)/skills/cm-source-pipeline" ~/.claude/skills/cm-source-pipeline
ln -s "$(pwd)/skills/cm-deep-extract" ~/.claude/skills/cm-deep-extract
ln -s "$(pwd)/skills/cm-curator-review" ~/.claude/skills/cm-curator-review
ln -s "$(pwd)/skills/cm-evidence-linker" ~/.claude/skills/cm-evidence-linker
```

Tell the user: "Restart any open Claude Code sessions. The skills are now available as slash commands like `/cm-deep-extract`."

**If Claude Desktop:** Walk the user through adding each `skills/cm-*` folder in Settings under the Skills section.

### Step 7: First extraction

This is the moment of truth. Walk the user through their first end-to-end extraction.

1. Ask the user to write a short markdown file about any topic they are researching. A few paragraphs is enough. Save it somewhere they can find it, for example `/tmp/first-source.md`. If they cannot think of anything, suggest a topic from a domain they care about and offer to draft a sample for them.

2. Open Claude (Desktop or Code) and confirm the MCP server is connected. Look for the `cm_*` tools in the tools list.

3. Have the user paste this prompt into Claude: "Use `cm_add_source` to ingest the file at `/tmp/first-source.md`, then run `cm-deep-extract` on it."

4. Watch the extraction unfold. Claude will run Pass 1 (claims and anchors), Pass 2 (mental models), Pass 3 (tags and enrichment), and Pass 4 (curator review). Explain what is happening at each pass in plain language.

5. Once extraction completes, have the user run: "Use `cm_get_themes` to show me what was extracted." They should see structured data points and themes from their source.

Congratulate them. The system is now live with one source in it. They can keep adding markdown files and run `cm-batch-orchestrator` to process them in waves.

## If something goes wrong

Check these in order:

- **`CONVEX_URL` not set or wrong.** The MCP server will fail to connect to the database. Verify the URL in `.env.local` matches the deployment URL in the Convex dashboard.
- **`CURATE_MIND_PATH` not set.** Intake tools will error when they try to write files. Run `pwd` from the repo root and paste the result into `.env.local`.
- **Skills not found.** Claude does not see the slash commands. Check that the symlinks (or settings entries) point to the correct `skills/cm-*` folders.
- **Node version too low.** Run `node --version`. If it is below 18, the user needs to upgrade. Guide them through installing a newer version.
- **MCP server not appearing in Claude.** Did the user fully quit and reopen Claude Desktop? Did they run `npm run build` in `mcp/` after pulling the latest code?
- **Convex schema errors.** Make sure `npx convex dev` is still running in the first terminal tab. If it stopped, restart it.

## What to do next

Once setup is complete, point the user to:

- [docs/setup-guide.md](setup-guide.md) for the full technical reference, including the folder structure and the underlying commands.
- [curatemind.io](https://curatemind.io) to see a live example of what a complete extraction cycle produces.

If the user wants to start ingesting more sources, suggest they read the `cm-batch-orchestrator` skill's `SKILL.md` for how to process multiple files at once.
