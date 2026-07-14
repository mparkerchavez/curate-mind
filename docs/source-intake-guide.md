# Curate Mind Source Intake Guide

This guide explains how to get research sources into Curate Mind after the MCP server is connected to your AI assistant.

Curate Mind uses a review-first workflow:

1. Capture or create a markdown file.
2. Review the markdown in `sources/` and clean up obvious noise.
3. Ingest the reviewed file with `cm_add_source` and `reviewed=true`.
4. Run `cm-deep-extract` or `cm-batch-orchestrator` to process it.

For normal use, you can ask through the workflow router instead of naming tools:

```text
Use the Curate Mind workflow router. Let's start ingestion for new files in folder <folder path>.
```

The review step matters because extracted data points are designed to be durable. It is better to remove navigation junk, scraper artifacts, or transcript errors before the source enters Convex.

## Intake Options

| Source type | Tool | What it needs | What it creates |
|-------------|------|---------------|-----------------|
| Already-clean markdown or pasted text | `cm_add_source` | Convex, OpenAI, and a reviewed source | A source record in Convex |
| Article or web page | `cm_fetch_url` | Supadata API key | A markdown file in `sources/` |
| YouTube video | `cm_fetch_youtube` | Supadata API key | A transcript markdown file in `sources/` |
| Local PDF | `cm_extract_pdf` | Python plus the pinned parser stack in `mcp/requirements.txt` | A markdown wrapper in `sources/`, with the original PDF path preserved for ingestion |
| Mobile or quick capture | Claude Dispatch or Codex through ChatGPT mobile, depending on your assistant provider | Same MCP setup as the running assistant workspace | A markdown file in `sources/` for later review |

## Week Folders

Source folders under `sources/{YYYY-MM}/{YYYY-MM-DD_to_DD}/` represent the week a source was **captured** (downloaded or fetched), not the week it was processed or ingested. By default `cm_extract_pdf`, `cm_fetch_url`, and `cm_fetch_youtube` file their output by whatever week is current when they run. For `cm_fetch_url` and `cm_fetch_youtube` that is correct: the fetch action is the capture. For `cm_extract_pdf` it is not, because the PDF was downloaded to disk earlier, when the curator saved it; if intake happens later than capture (a PDF sits around for a week or two before extraction, for example), the wrapper markdown and original PDF would otherwise land in the wrong week folder.

**Preferred fix — pass `capturedAt`.** When you know a PDF was downloaded before the week you are extracting in, pass `capturedAt` (the download date in `YYYY-MM-DD`) to `cm_extract_pdf`. The markdown wrapper and the `Captured:` metadata line are then filed into that capture week's folder directly, creating it if needed, and today's week folder is left untouched. (The tool references the original PDF by path in place; it does not move or copy the PDF, so keep the PDF wherever the curator saved it.) Omit `capturedAt` for the common case where the PDF is extracted the same week it was downloaded.

**Manual fallback — only if you already extracted without `capturedAt`.** If a source was extracted into the wrong week folder before you realized it was captured earlier, move the wrapper markdown and the original PDF back into the capture week's folder, and update `review-status.json` in both the capture week and the processing week so each tracker matches what's actually sitting in that folder. Otherwise an already-ingested source can look unprocessed the next time you scan its real capture week, or look like new work in the week it happened to be extracted.

## Vendor and Local Dependencies

**Supadata** powers web and YouTube intake.

Use it when you want Curate Mind to turn links into markdown:

- `cm_fetch_url` for articles, blog posts, newsletters, and public web pages.
- `cm_fetch_youtube` for YouTube transcripts.

Set `SUPADATA_API_KEY` in `.env.local` and in the MCP server environment for your assistant. If you only add markdown files manually, you can skip Supadata.

**PDF extraction** runs locally on your machine.

`cm_extract_pdf` chooses among four extraction paths:

- `liteparse`: fast, local, layout-preserving extraction. This is the first parser in `auto` for most clean, born-digital PDFs with selectable text.
- `docling`: local IBM Docling extraction with OCR disabled. This is used when LiteParse looks weak, academic, math-heavy, or table-heavy.
- `docling_ocr`: Docling with RapidOCR through `onnxruntime`. This is the slow OCR path for scanned or image-heavy PDFs.
- `pypdf`: lightweight emergency fallback. It is useful when stronger local parsers fail, but it can flatten or garble layout.

Install the Python dependencies from the repo root:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r mcp/requirements.txt
```

The MCP uses `.venv/bin/python3` automatically when that file exists. The parser versions in `mcp/requirements.txt` are pinned on purpose: unpinned Docling/docling-core combinations have broken imports, OCR behavior, and the golden PDF eval. Curate Mind also avoids macOS Vision OCR through `ocrmac` because it became unreliable in this environment and returned image placeholders instead of text; the OCR path now uses RapidOCR.

If `docling` installation fails, you can still use manual markdown intake and may be able to use the faster `liteparse` or `pypdf` paths if those installed successfully.

## PDF Parser Behavior

For normal PDF intake, start with `auto`:

```text
Use cm_extract_pdf on this local PDF for review: <absolute path to PDF>
```

`auto` is an adaptive chain:

1. Try LiteParse first and stop early when quality is clearly sufficient.
2. Run normal Docling when the PDF looks academic, math-heavy, table-heavy, mixed-layout, or when LiteParse quality is not strong enough.
3. Run Docling OCR only when non-OCR extraction is weak and the file is not too large for automatic OCR.
4. Try pypdf only as a low-priority fallback when stronger parsers fail or score poorly.

The OCR path is intentionally conservative. OCR can be slow and can produce noisy text, so `auto` skips OCR for PDFs over 60 pages or 30 MB. If you know a large PDF is scanned and you are willing to wait, request OCR directly:

```text
Use cm_extract_pdf with method=docling_ocr on this local PDF: <absolute path to PDF>
```

Expect parser quality to vary by PDF type:

- Clean reports with selectable text usually do best with LiteParse.
- Academic papers, equations, references, and dense tables often need Docling.
- Scanned or image-heavy files need OCR and may take several minutes.
- Charts, diagrams, and visual evidence may still need curator notes because text extraction does not fully understand visuals.
- pypdf is a recovery option, not the preferred parser for ingestion quality.

## Daily Use

### Web Article

Paste this into your AI assistant:

```text
Use cm_fetch_url to fetch this article for review: <URL>
```

The tool saves a markdown file under `sources/YYYY-MM/YYYY-MM-DD_to_DD/` and tells you the file path. Open that file, clean up obvious noise, fill any `[verify]` metadata fields, then paste:

```text
Use cm_add_source with reviewed=true to ingest this reviewed file: <file path>
```

### YouTube Video

Paste this into your AI assistant:

```text
Use cm_fetch_youtube to fetch this YouTube transcript for review: <URL>
```

Review the transcript markdown, fix obvious metadata gaps, then ingest:

```text
Use cm_add_source with reviewed=true to ingest this reviewed transcript: <file path>
```

### PDF

Use an absolute file path to the PDF:

```text
Use cm_extract_pdf on this local PDF for review: <absolute path to PDF>
```

The tool saves a markdown wrapper and returns the original PDF path. Review the markdown, fill in metadata such as publisher, author, published date, and canonical URL, then ingest both the markdown and original PDF:

```text
Use cm_add_source with reviewed=true, filePath="<markdown file path>", and originalFilePath="<PDF file path>".
```

For hard PDFs, you can ask for a specific extraction method:

```text
Use cm_extract_pdf with method=docling_ocr on this local PDF: <absolute path to PDF>
```

For side-by-side testing, ask for a specific parser:

```text
Use cm_extract_pdf with method=liteparse on this local PDF: <absolute path to PDF>
Use cm_extract_pdf with method=pypdf on this local PDF: <absolute path to PDF>
Use cm_extract_pdf with method=docling on this local PDF: <absolute path to PDF>
```

For a repeatable local comparison that does not ingest anything, run:

```bash
.venv/bin/python mcp/scripts/evaluate_pdf_parsers.py \
  "/absolute/path/to/report.pdf" \
  --methods liteparse,pypdf,docling,auto
```

The eval writes side-by-side markdown outputs and a summary under `tmp/pdf-parser-eval/`.

For parser maintenance, there are two repeatable checks:

```bash
npm --prefix mcp run test:pdf-scoring
```

This is a fast smoke test for the scoring heuristics. It uses synthetic markdown examples and does not run PDF parsers.

```bash
npm --prefix mcp run eval:pdf-golden
```

This is the slower golden PDF comparison. It runs representative PDFs through `liteparse`, `pypdf`, `docling`, and `auto`, then checks expected parser outcomes from `mcp/scripts/pdf_parser_golden_set.json`.

The golden config is tracked, but the PDFs it references live under `sources/`, which is gitignored because those files are personal or licensed research material. Maintainers should keep a local copy of the golden PDFs at the configured paths. Open source contributors can still use the same eval script with their own PDFs, or create a local golden config with representative files they are allowed to store.

Before changing parser versions or parser-routing behavior:

1. Create a branch and update `mcp/requirements.txt` or `mcp/scripts/extract_pdf.py`.
2. Run `npm --prefix mcp run test:pdf-scoring`.
3. Run `npm --prefix mcp run eval:pdf-golden` if you have the maintainer golden PDFs.
4. If you do not have the maintainer PDFs, run `evaluate_pdf_parsers.py` against several of your own PDFs: one clean report, one academic/table-heavy PDF, and one scanned or image-heavy PDF.
5. Inspect `tmp/pdf-parser-eval/*/summary.md` and spot-check the generated markdown before accepting the change.

Do not upgrade to the newest Docling release just because it is available. The current pins were kept because a newer Docling stack failed the golden eval. Treat the golden eval as the safety check for parser upgrades.

### Already-Clean Markdown

If you already have a clean markdown file, skip the fetch step:

```text
Use cm_add_source with reviewed=true to ingest this markdown file: <file path>
```

### Review Queue

To see what is waiting for review:

```text
Use cm_review_queue to show me pending source files.
```

## Mobile Capture Workflows

Mobile capture is provider-specific. The phone is the capture surface, but the markdown file should be created by the assistant environment that has access to your Curate Mind repo and MCP server.

### Claude Dispatch

Claude Dispatch is specific to Claude. If your Claude setup supports Dispatch from Claude Mobile, use it as a quick capture path:

1. Send the article or YouTube URL to Claude Dispatch.
2. Ask it to use `cm_fetch_url` or `cm_fetch_youtube`.
3. Let the MCP tool run through the Claude environment connected to your already-running computer.
4. Later, review the markdown file in `sources/`.
5. Ingest it with `cm_add_source reviewed=true`.

Dispatch is not a separate Curate Mind service. It is another way to ask Claude to call the same MCP tools and create local markdown files on the machine where Curate Mind is already running.

### Codex Through ChatGPT Mobile

Codex has a similar mobile pattern through the ChatGPT mobile app. If your Codex workspace is available from ChatGPT mobile and has this repo plus the Curate Mind MCP tools configured:

1. Send the article or YouTube URL to Codex from ChatGPT mobile.
2. Ask it to use `cm_fetch_url` or `cm_fetch_youtube`.
3. Let Codex create the markdown file in this repo's `sources/` folder.
4. Later, review the markdown file.
5. Ingest it with `cm_add_source reviewed=true`.

This is not Claude Dispatch. It is the Codex equivalent workflow for users whose primary assistant is Codex.

## What Happens After Ingestion

`cm_add_source` creates a source record in Convex with status `indexed`. That means the source is in the database but has not yet been extracted into data points.

To process one important source interactively:

```text
Run cm-deep-extract on this source: <sourceId>
```

To process a batch of indexed sources:

```text
Use the Curate Mind workflow router. Run batch extraction on the pending indexed sources.
```

## Troubleshooting

- **Supadata errors:** Confirm `SUPADATA_API_KEY` is set in `.env.local` and in the MCP server environment your assistant uses.
- **File path errors:** Use absolute paths for PDFs and files outside the repo.
- **Nothing appears in `sources/`:** Confirm `CURATE_MIND_PATH` points to the repo root.
- **PDF extraction fails:** Install Python dependencies with `python3 -m pip install -r mcp/requirements.txt`, then retry. If a scanned PDF still fails, paste or save the important text manually and ingest it with `cm_add_source`.
- **`cm_add_source` refuses to ingest:** Review the file first, fill required metadata, remove any `verify_` filename prefix, and pass `reviewed=true`.
