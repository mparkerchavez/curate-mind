# Common Assistant Workflows

These workflows are assistant-neutral. Use them with Claude, Codex, or another MCP-compatible assistant that can see the Curate Mind MCP tools.

Each workflow includes a copy-paste prompt and a done check. Replace placeholders such as `<URL>` or `<file path>` with your real values.

## Set Up Project Profile

Use this after the MCP server is connected and before serious extraction begins. The project profile tells Curate Mind what you are researching, who the research is for, what time horizon matters, and how Secondary Capture should behave.

Paste:

```text
Help me set up my Curate Mind project profile.

First call cm_get_project_profile and cm_get_user_preferences. If setup is not complete, interview me one question at a time. Save approved answers with cm_update_project_profile and cm_update_user_preferences. Use cm_preview_prompt_profile between question blocks so I can check what will guide extraction and writing.
```

Done when:

- `cm_get_project_profile` shows the project name, domain, audience, time horizon, and Secondary Capture settings.
- `cm_get_user_preferences` shows your writing preferences.
- `cm_preview_prompt_profile` reflects the project you actually want to curate.

For a full first-run interview, use the pasteable prompt above and have the assistant ask one question at a time before saving approved profile and style updates.

## Set Up Source Intake

Use this when you want article, YouTube, PDF, or manual markdown intake working.

Paste:

```text
Help me set up and test Curate Mind source intake.

Confirm the repo path, MCP connection, and available tools. Then ask which source types I want to use: web articles, YouTube videos, PDFs, already-clean markdown, or provider-specific mobile capture. Test only the paths I choose. If a dependency is missing, explain what it is for and give me the exact command or setting to fix it.
```

Done when:

- Your assistant can see `cm_add_source`, `cm_fetch_url`, `cm_fetch_youtube`, `cm_extract_pdf`, and `cm_review_queue`.
- Required keys are present for the intake paths you use.
- At least one test source lands in `sources/` or one reviewed markdown source is ingested.

For the full source intake setup prompt, use the [source intake setup prompt](../../prompts/setup_source_intake.md). For details about each intake path, read the [source intake guide](../source-intake-guide.md).

Mobile capture depends on your assistant provider:

- Claude Dispatch is specific to Claude. It lets you use Claude Mobile to ask the Claude environment connected to your already-running computer to call Curate Mind intake tools and create markdown locally in `sources/`.
- Codex can offer a similar phone-to-workspace path through the ChatGPT mobile app. Use it when your Codex workspace has access to this repo and the Curate Mind MCP tools.

Either way, review the generated markdown before ingestion.

## Capture Article

Use this for web pages, articles, newsletters, or blog posts. It requires `SUPADATA_API_KEY`.

Paste:

```text
Use cm_fetch_url to fetch this article for review: <URL>
```

Done when:

- The tool returns a markdown file path under `sources/`.
- You open the file, remove obvious scraper noise, and fill any `[verify]` metadata fields.

Next prompt:

```text
Use cm_add_source with reviewed=true to ingest this reviewed file: <file path>
```

## Capture YouTube Transcript

Use this for YouTube videos with transcripts. It requires `SUPADATA_API_KEY`.

Paste:

```text
Use cm_fetch_youtube to fetch this YouTube transcript for review: <URL>
```

Done when:

- The tool returns a transcript markdown file under `sources/`.
- You review the transcript, fix obvious metadata gaps, and remove unrelated transcript artifacts if needed.

Next prompt:

```text
Use cm_add_source with reviewed=true to ingest this reviewed transcript: <file path>
```

## Extract PDF

Use this for local PDF files. PDF extraction runs on your machine and may require Python dependencies from `mcp/requirements.txt`.

Paste:

```text
Use cm_extract_pdf on this local PDF for review: <absolute path to PDF>
```

For scanned or image-heavy PDFs, try:

```text
Use cm_extract_pdf with method=docling_ocr on this local PDF: <absolute path to PDF>
```

Done when:

- The tool creates a `verify_*.md` wrapper in `sources/`.
- The original PDF path is preserved for ingestion.
- You fill required metadata fields such as publisher, author, published date, and canonical URL.
- You rename the markdown file to remove the `verify_` prefix.

Next prompt:

```text
Use cm_add_source with reviewed=true, filePath="<markdown file path>", and originalFilePath="<PDF file path>".
```

## Review Queue

Use this to see which local markdown files are waiting for review.

Paste:

```text
Use cm_review_queue to show me pending source files.
```

Done when:

- You can see which files are pending and which have already been ingested.
- You choose one pending file to review next.

## Ingest Reviewed Source

Use this only after you have reviewed the markdown file. Ingestion creates a source record in Convex with status `indexed`.

Paste:

```text
Use cm_add_source with reviewed=true to ingest this reviewed file: <file path>
```

For PDFs, include the original file:

```text
Use cm_add_source with reviewed=true, filePath="<markdown file path>", and originalFilePath="<PDF file path>".
```

Done when:

- The assistant reports a source identifier.
- The source status is `indexed`.
- The file no longer appears as pending in `cm_review_queue`.

## Run Deep Extract

Use Deep Extract for one important source when you want to review extraction quality stage by stage.

Paste:

```text
Run the Curate Mind Deep Extract workflow on this source: <sourceId>

Use the instructions in skills/cm-deep-extract/SKILL.md. Present each stage for my review before saving or moving on.
```

Done when:

- Extract saves atomic data points with verbatim anchors.
- Secondary Capture runs if enabled for your project.
- Enrich adds tags, confidence, extraction notes, and related links.
- Review resolves flagged items.
- The source is marked extracted.

## Run Batch Extract

Use Batch Extract when you have multiple indexed sources ready to process.

Paste:

```text
Run the Curate Mind Batch Extract workflow for the pending indexed sources.

Use the instructions in skills/cm-batch-orchestrator/SKILL.md. Before starting, show me the batch size, which sources will be processed, and what review checkpoints I should expect.
```

Done when:

- The assistant confirms the source list before processing.
- Each source completes Extract, optional Secondary Capture, Enrich, and Review by exception.
- The assistant summarizes processed sources, flagged items, and any follow-up needed.

## Ask Exploratory Questions With cm_search

Use `cm_search` when you are exploring signals and patterns. It searches broadly across data points, positions, observations, and mental models.

Paste:

```text
Use cm_search to explore this question across the Curate Mind corpus:

<question>

Synthesize the patterns you see, but do not present this as a cited analyst answer.
```

Good for:

- "What signals are emerging?"
- "What patterns do you see?"
- "Challenge this idea against the corpus."
- "What should I investigate next?"

Done when:

- You get a synthesis of likely patterns.
- The assistant is clear that the answer is exploratory, not a formal cited position.

## Ask Cited Questions With cm_ask

Use `cm_ask` when you want a rigorous answer traceable to positions, observations, mental models, and evidence.

Paste:

```text
Use cm_ask to answer this Curate Mind question:

<question>

Use the response-band shape: Stance first, Evidence next, Source details when needed. Include inline labels from the analyst pack such as [P1], [O1], [M1], and [E1] for substantive claims.
```

Good for:

- "What is my position on this topic?"
- "What does the research show?"
- "Write the brief."
- "Give me a cited answer."

Done when:

- The answer starts from current positions rather than raw search results.
- Substantive claims carry analyst-pack labels.
- The assistant does not construct source URLs manually.

## Update Docs Or Code Safely

Use this when changing Curate Mind itself.

Paste:

```text
Help me update Curate Mind safely.

First inspect the relevant files and show me what you found. Then make the smallest change that satisfies the request. Preserve existing behavior unless I explicitly ask for a refactor. After editing, run the relevant checks, including npm run agents:check if CLAUDE.md or AGENTS.md might be affected. Show me a concise diff summary and stop before committing unless I ask you to commit.
```

Done when:

- The assistant reads the relevant files before editing.
- The change is scoped to the request.
- Relevant checks pass or the assistant shows the full error and explains next steps.
- You see a summary of changed files and what each change does.
