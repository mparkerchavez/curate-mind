# Curate Mind Assistant Guides

You only need one AI assistant to use Curate Mind.

Curate Mind is built around an MCP-connected assistant. MCP stands for Model Context Protocol: it is the connection that lets an AI assistant call Curate Mind tools such as `cm_add_source`, `cm_fetch_url`, `cm_search`, and `cm_ask`, then follow workflow instructions such as `cm-deep-extract` or `cm-batch-orchestrator`.

You do not need to prompt with exact tool names during normal use. The easiest pattern is to ask for the workflow:

```text
Let's start ingestion for new files in folder <folder path>.
```

or:

```text
Ask my Curate Mind research base: <question>.
```

The assistant should translate that plain-English request into the right tool calls.

Curate Mind includes a `cm-workflow-router` skill for this. When you are not sure which exact workflow to ask for, start with the router:

```text
Use the Curate Mind workflow router. I want to: <plain-English goal>.
```

Once the MCP server is connected, a single assistant can operate the full workflow:

1. Set up the project profile and writing preferences.
2. Capture articles, YouTube transcripts, PDFs, or reviewed markdown.
3. Review source files before they enter Convex.
4. Ingest reviewed sources.
5. Run Deep Extract or Batch Extract.
6. Query the research foundation with exploratory or cited questions.
7. Help maintain the repo docs, setup files, and code.

Claude, Codex, and other MCP-compatible assistants can all be used. You do not need both Claude and Codex subscriptions. The important requirement is that the assistant can see and call the Curate Mind MCP tools.

## Start Here

- [Common workflows](common-workflows.md) gives assistant-neutral prompts for daily Curate Mind work.
- [Using Claude](using-claude.md) covers Claude Desktop, Claude Code, skills, slash commands, and Claude Dispatch/mobile capture.
- [Using Codex](using-codex.md) covers using Codex with this repo for setup, docs, code maintenance, commits, ChatGPT mobile access, and Curate Mind workflows when MCP is configured.

If you are setting up Curate Mind for the first time, read the main [setup guide](../setup-guide.md) first. If you want an assistant to walk you through setup, open [citizen developer setup](../citizen-developer-setup.md) and paste it into your chosen assistant.

## What An MCP-Connected Assistant Does

An MCP-connected assistant is your operating surface for Curate Mind. Instead of clicking through a dashboard, you ask the assistant to call tools.

For example:

```text
Use cm_fetch_url to fetch this article for review: <URL>
```

The assistant calls the tool, the tool saves markdown into `sources/`, and you review that file before ingestion.

The assistant can also run higher-level workflow instructions by following the project skills in `skills/`. Start with `cm-workflow-router` when your request is broad or plain-English. Use the dedicated skills when you already know the stage: Deep Extract, Batch Extract, Batch Review, or Evidence Linking. Some products expose these as slash commands. Others may need you to paste the relevant prompt or ask the assistant to read the `SKILL.md` file.

The MCP server also supports toolsets. `pipeline` is the default and covers normal curator work. `daily` is smaller for intake and questions. `admin` exposes repair tools only when explicitly needed. See [MCP tool inventory](../mcp-tool-inventory.md).

## One Assistant Is Enough

Use the assistant you already have if it can connect to the MCP server.

- Use Claude alone if Claude is your MCP host.
- Use Codex alone if Codex is connected to the repo and the Curate Mind MCP tools.
- Use another MCP-compatible app if it can launch the local MCP server and pass the required environment variables.

You can add a second assistant later for convenience, but Curate Mind does not require a split where one assistant "does research" and another "maintains the system." That division can be useful for some people, but it is not part of the method.

## Mobile Capture Depends On Provider

Mobile capture is provider-specific. Claude Dispatch is a Claude feature: it lets you use the Claude mobile app to ask the Claude environment connected to your running computer to create markdown files locally in `sources/`.

Codex has a similar pattern through the ChatGPT mobile app. If your Codex workspace is available from ChatGPT mobile and has this repo plus the Curate Mind MCP tools configured, you can ask Codex from your phone to run the same intake prompts and create markdown files in the repo's `sources/` folder.

In both cases, the phone is just the capture surface. The file should be created by the assistant environment that has access to your Curate Mind repo and MCP server.
