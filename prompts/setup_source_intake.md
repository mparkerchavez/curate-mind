# Setup Source Intake

Use this prompt after the basic Curate Mind setup is complete. It is written for an AI assistant helping a citizen developer.

---

You are helping me set up and test Curate Mind source intake.

## Where we are

Curate Mind is already cloned locally or mostly set up. The MCP server should be connected to my AI assistant, and Convex should be configured. This chat is specifically for source intake: articles, YouTube videos, PDFs, manual markdown, and optional Claude Dispatch capture.

## What happens in this chat

Guide me through intake setup one step at a time. Ask one question at a time, explain what each dependency is for in plain language, run or give exact commands when needed, and stop to fix errors before moving on.

## What comes next

After intake is working, the next step is to fetch or create real source files, review them in `sources/`, ingest them with `cm_add_source reviewed=true`, and run `cm-deep-extract` or `cm-batch-orchestrator`.

---

## Step 1: Confirm the repo and MCP server

1. Confirm we are in the Curate Mind repo root.
2. Run `pwd` and verify it matches `CURATE_MIND_PATH`.
3. Confirm the MCP server is built:

```bash
cd mcp
npm run build
cd ..
```

4. Ask me which AI assistant I am using: Claude Desktop, Claude Code, Codex, or another MCP-compatible app.
5. Confirm that the assistant can see Curate Mind tools such as `cm_add_source`, `cm_fetch_url`, `cm_fetch_youtube`, `cm_extract_pdf`, and `cm_review_queue`.

## Step 2: Ask which intake paths I want

Ask me:

"Which source types do you want to set up today: web articles, YouTube videos, PDFs, already-clean markdown, or Claude Dispatch/mobile capture?"

Use my answer to decide which checks to run. Do not force me to set up everything.

## Step 3: Web and YouTube intake

If I want web articles or YouTube videos:

1. Explain that both tools use Supadata:
   - `cm_fetch_url` turns public web pages into markdown.
   - `cm_fetch_youtube` pulls YouTube transcripts into markdown.
2. Check that `SUPADATA_API_KEY` is present in `.env.local`.
3. Confirm the same key is available to the MCP server environment used by my assistant.
4. If the key is missing, walk me to create one at `https://supadata.ai`, then add it to `.env.local` and the MCP config.
5. Rebuild or restart the MCP server if needed.

Test only with a URL I provide. Ask:

"Do you have a test article URL or YouTube URL you want to try?"

Then call the appropriate tool:

```text
Use cm_fetch_url to fetch this article for review: <URL>
```

or:

```text
Use cm_fetch_youtube to fetch this YouTube transcript for review: <URL>
```

Confirm that the tool returns a markdown file path in `sources/`.

## Step 4: PDF intake

If I want PDF intake:

1. Explain that PDF extraction runs locally on my machine.
2. Explain the three extraction paths:
   - `pypdf`: fast, local, best for simple text PDFs.
   - `docling`: IBM's local library for visual or mixed-layout PDFs.
   - `docling_ocr`: Docling OCR for scanned files, slower.
3. Install the Python dependencies from the repo root:

```bash
python3 -m pip install -r mcp/requirements.txt
```

4. If the command fails, show me the full error and explain it in plain language. Try the most likely fix first.
5. Ask me for an absolute path to a test PDF.
6. Test:

```text
Use cm_extract_pdf on this local PDF for review: <absolute path to PDF>
```

Confirm that the tool returns a markdown file path in `sources/` and preserves the original PDF path for later `cm_add_source`.

## Step 5: Manual markdown intake

If I want already-clean markdown, or if another intake path fails:

1. Ask me for a markdown file path.
2. Confirm the file exists.
3. Tell me that because the file is already reviewed, the ingestion tool needs `reviewed=true`.
4. Test:

```text
Use cm_add_source with reviewed=true to ingest this markdown file: <file path>
```

If required fields are missing, help me add a metadata header or pass the missing values to the tool.

## Step 6: Review queue

After any fetch or PDF extraction succeeds, run:

```text
Use cm_review_queue to show pending source files.
```

Explain that files in the review queue are local markdown files waiting for human cleanup before they go into Convex.

## Step 7: Claude Dispatch or mobile capture

If I want Dispatch/mobile capture:

1. Explain that Dispatch is not a separate Curate Mind service. It is a way to ask Claude to call the same MCP tools from a quick-capture surface.
2. Confirm that the Dispatch workflow can reach the same Claude/MCP environment that has Curate Mind connected.
3. Test with a URL I provide:

```text
Use cm_fetch_url to fetch this article for review: <URL>
```

or:

```text
Use cm_fetch_youtube to fetch this YouTube transcript for review: <URL>
```

4. Confirm the markdown landed in `sources/`.
5. Remind me that I still need to review the file later and ingest it with `cm_add_source reviewed=true`.

## Step 8: Closing summary

End by summarizing:

- Which intake paths are working.
- Which dependencies were installed or skipped.
- Where new markdown files land.
- The exact next command or prompt I should use to ingest the reviewed file.

Use this closing wording:

"Source intake is set up. Your capture tools create local markdown first; Convex only gets the source after you review it and call `cm_add_source reviewed=true`. The next step is to review one pending file in `sources/`, ingest it, then run extraction."
