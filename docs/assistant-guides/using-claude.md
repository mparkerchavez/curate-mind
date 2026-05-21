# Using Claude With Curate Mind

Claude can run the full Curate Mind workflow by itself when it is connected to the Curate Mind MCP server.

You do not need Codex to use Curate Mind with Claude. Codex can be helpful for code maintenance, but the research workflow does not require it.

## Claude Setup Paths

Curate Mind currently documents two Claude setup paths:

- **Claude Desktop:** Connects the local MCP server through `claude_desktop_config.json`.
- **Claude Code:** Connects the local MCP server from the repo and can use project skills as slash commands.

Start with the main [setup guide](../setup-guide.md). For a guided, assistant-led setup, give Claude [citizen-developer-setup.md](../citizen-developer-setup.md) and say:

```text
Read this file and help me set up Curate Mind.
```

After setup, Claude should be able to see Curate Mind tools such as:

- `cm_get_project_profile`
- `cm_update_project_profile`
- `cm_fetch_url`
- `cm_fetch_youtube`
- `cm_extract_pdf`
- `cm_review_queue`
- `cm_add_source`
- `cm_search`
- `cm_ask`

## Skills And Slash Commands

The repo includes workflow skills in `skills/`:

- `skills/cm-deep-extract/`
- `skills/cm-batch-orchestrator/`
- `skills/cm-curator-review/`
- `skills/cm-evidence-linker/`

In Claude Code, these can be installed as slash commands such as `/cm-deep-extract` and `/cm-batch-orchestrator`. In Claude Desktop, add the skill folders through Settings if your Claude plan and app version support skills.

If slash commands are not available, Claude can still follow the workflow. Ask it to read the relevant `SKILL.md` file:

```text
Run Curate Mind Deep Extract on source <sourceId>. Use the instructions in skills/cm-deep-extract/SKILL.md.
```

## Claude Dispatch And Mobile Capture

Claude Dispatch is specific to Claude. If your Claude setup supports Dispatch, you can use Claude Mobile on your phone as a quick source capture surface.

Dispatch is not a separate Curate Mind service. It is a way to ask the Claude environment connected to your already-running computer to call the same MCP tools. The phone sends the request; the MCP-connected computer creates the markdown file locally in this repo's `sources/` folder.

Example:

```text
Use cm_fetch_url to fetch this article for review: <URL>
```

or:

```text
Use cm_fetch_youtube to fetch this YouTube transcript for review: <URL>
```

The file still lands in `sources/`, and you still review it before ingestion:

```text
Use cm_add_source with reviewed=true to ingest this reviewed file: <file path>
```

If you are using Codex instead of Claude, use Codex's ChatGPT mobile access pattern rather than Claude Dispatch. See [Using Codex](using-codex.md).

## Example Prompts

### First Project Setup

```text
Help me set up Curate Mind for the first time. First call cm_get_project_profile and cm_get_user_preferences. If setup is not complete, interview me one question at a time, save approved answers through cm_update_project_profile and cm_update_user_preferences, and preview the assembled prompt profile between question blocks.
```

### Source Intake

```text
Help me add a new source to Curate Mind.

Start by calling cm_get_project_profile so you understand the project. Then help me choose the right intake path for this source: article, YouTube, PDF, or already-clean markdown. Save local markdown for review first. Do not ingest until I confirm the file is reviewed.
```

### Deep Extract

```text
/cm-deep-extract <sourceId>
```

If slash commands are unavailable:

```text
Run the Curate Mind Deep Extract workflow on source <sourceId>. Use skills/cm-deep-extract/SKILL.md and pause for my review at each stage.
```

### Batch Extract

```text
/cm-batch-orchestrator
```

If slash commands are unavailable:

```text
Run the Curate Mind Batch Extract workflow. Use skills/cm-batch-orchestrator/SKILL.md. Show me the pending indexed sources before starting.
```

### Exploratory Query

```text
Use cm_search to explore this question across the corpus:

<question>

Synthesize the patterns, but treat this as exploration rather than a cited answer.
```

### Cited Query

```text
Use cm_ask to answer this question:

<question>

Start with Stance, then Evidence, then Source details where needed. Use the inline labels from the analyst pack.
```

## When To Use Claude

Claude is a good fit when you want a conversational Curate Mind workspace: intake, review, extraction, synthesis, and query work in one place.

Claude can also edit docs or code if you are using Claude Code. Ask it to inspect files first, make small changes, run checks, and stop before committing unless you explicitly ask for a commit.
