# Using Codex With Curate Mind

Codex can support Curate Mind by itself when it has the repo open and the Curate Mind MCP tools are configured.

You do not need Claude to use Curate Mind with Codex. Claude-specific conveniences such as Claude Desktop skills or Dispatch are optional workflow surfaces, not required parts of the Curate Mind method.

## What Codex Is Good At

Codex is especially useful for repo-aware work:

- Installing dependencies and running setup commands.
- Reading and updating docs.
- Maintaining MCP server code, Convex functions, and frontend files.
- Running checks before a commit.
- Creating intentional commits and pull requests when you ask.

When Codex is also connected to the Curate Mind MCP server, it can run the research workflow too:

- Project profile setup.
- Source intake.
- Review queue checks.
- Source ingestion.
- Deep Extract or Batch Extract by following the `skills/` instructions.
- Exploratory and cited questions through `cm_search` and `cm_ask`.

## Setup Expectations

Codex needs two kinds of context:

1. **Repo context:** open the Curate Mind repo so Codex can read files, run commands, and make edits.
2. **MCP context:** configure the Curate Mind MCP server so Codex can see tools such as `cm_add_source`, `cm_search`, and `cm_ask`.

If Codex can read the repo but cannot see the MCP tools, it can still help with setup, docs, code, and command troubleshooting. It cannot operate the Curate Mind database workflow until the MCP connection is available.

Use the main [setup guide](../setup-guide.md) for the underlying commands. Use [citizen-developer-setup.md](../citizen-developer-setup.md) if you want Codex to walk you through setup in plain language.

## ChatGPT Mobile Capture

Codex has a mobile capture path through the ChatGPT mobile app. If your Codex workspace is available from ChatGPT mobile, and that workspace has this repo plus the Curate Mind MCP tools configured, you can use your phone to kick off source intake.

This is similar in spirit to Claude Dispatch, but it is Codex-specific. The phone is the capture surface. Codex still needs access to the Curate Mind repo and MCP server so it can create markdown files locally in `sources/`.

Example mobile prompt:

```text
Use cm_fetch_url to fetch this article for review: <URL>
```

or:

```text
Use cm_fetch_youtube to fetch this YouTube transcript for review: <URL>
```

Later, from Codex or another MCP-connected assistant, review the generated markdown and ingest it:

```text
Use cm_add_source with reviewed=true to ingest this reviewed file: <file path>
```

## Working With Project Skills

The workflow instructions live in `skills/`:

- `skills/cm-deep-extract/SKILL.md`
- `skills/cm-batch-orchestrator/SKILL.md`
- `skills/cm-curator-review/SKILL.md`
- `skills/cm-evidence-linker/SKILL.md`

Codex may not expose these as slash commands. That is fine. Ask Codex to read the relevant `SKILL.md` file and follow it.

Example:

```text
Run Deep Extract for source <sourceId>. Read skills/cm-deep-extract/SKILL.md first and follow that workflow. Use the Curate Mind MCP tools for database operations.
```

## Example Prompts

### Setup And Verification

```text
Inspect this Curate Mind repo and help me finish setup.

Start by reading README.md, docs/setup-guide.md, and docs/citizen-developer-setup.md. Then check whether dependencies are installed, whether the MCP server builds, and whether the expected environment variables are documented. Explain each step in plain language and ask before handling secrets.
```

### Source Intake

```text
Help me add a source to Curate Mind using the MCP tools.

First call cm_get_project_profile. Then ask me what kind of source I have: article, YouTube, PDF, or already-clean markdown. Use the appropriate intake tool, save local markdown for review first, and do not call cm_add_source until I confirm reviewed=true is appropriate.
```

### PDF Intake

```text
Use cm_extract_pdf on this local PDF for review: <absolute path to PDF>

After extraction, tell me which markdown file to review, which metadata fields need verification, and the exact cm_add_source prompt to use after I clean it up.
```

### Deep Extract

```text
Run the Curate Mind Deep Extract workflow on source <sourceId>.

Read skills/cm-deep-extract/SKILL.md before starting. Present the Extract, Secondary Capture, Enrich, and Review stages in order and wait for my approval at the checkpoints described in the skill.
```

### Batch Extract

```text
Run the Curate Mind Batch Extract workflow.

Read skills/cm-batch-orchestrator/SKILL.md before starting. Show me the pending indexed sources and your proposed batch before processing anything.
```

### Exploratory Query

```text
Use cm_search to explore this question:

<question>

Give me patterns and possible signals. Do not turn this into a cited analyst answer.
```

### Cited Query

```text
Use cm_ask to answer this question:

<question>

Use Stance first, Evidence next, and Source details only where needed. Include the analyst-pack labels for substantive claims.
```

### Docs Update

```text
Update the Curate Mind docs for this change: <describe change>.

Inspect the existing docs first. Make the smallest clear edit. Run npm run agents:check afterward. Show me a concise diff summary and stop before committing.
```

### Code Maintenance

```text
Help me make this Curate Mind code change: <describe change>.

First inspect the relevant files and explain what you found. Then implement the smallest safe change, run the relevant checks, and show me the result. Do not commit unless I ask.
```

### Commit

```text
Review the current git diff, summarize exactly what changed, and suggest a commit message. If the diff only contains the intended changes, commit it.
```

## Practical Guardrails

- Ask Codex to inspect files before editing.
- Tell Codex to run `npm run agents:check` after changes that could affect `CLAUDE.md` or `AGENTS.md`.
- Tell Codex to stop before committing unless you are ready for a commit.
- Never paste API keys into a public issue, pull request, or committed file.
- Keep `.env.local` local and uncommitted.
