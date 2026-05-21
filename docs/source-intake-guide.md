# Curate Mind Source Intake Guide

This guide explains how to get research sources into Curate Mind after the MCP server is connected to your AI assistant.

Curate Mind uses a review-first workflow:

1. Capture or create a markdown file.
2. Review the markdown in `sources/` and clean up obvious noise.
3. Ingest the reviewed file with `cm_add_source` and `reviewed=true`.
4. Run `cm-deep-extract` or `cm-batch-orchestrator` to process it.

The review step matters because extracted data points are designed to be durable. It is better to remove navigation junk, scraper artifacts, or transcript errors before the source enters Convex.

## Intake Options

| Source type | Tool | What it needs | What it creates |
|-------------|------|---------------|-----------------|
| Already-clean markdown or pasted text | `cm_add_source` | Convex, OpenAI, and a reviewed source | A source record in Convex |
| Article or web page | `cm_fetch_url` | Supadata API key | A markdown file in `sources/` |
| YouTube video | `cm_fetch_youtube` | Supadata API key | A transcript markdown file in `sources/` |
| Local PDF | `cm_extract_pdf` | Python plus `pypdf` and optionally `docling` | A markdown wrapper in `sources/`, with the original PDF path preserved for ingestion |
| Mobile or quick capture | Claude Dispatch, when available in your Claude workflow | Same MCP setup as the desktop assistant | A markdown file in `sources/` for later review |

## Vendor and Local Dependencies

**Supadata** powers web and YouTube intake.

Use it when you want Curate Mind to turn links into markdown:

- `cm_fetch_url` for articles, blog posts, newsletters, and public web pages.
- `cm_fetch_youtube` for YouTube transcripts.

Set `SUPADATA_API_KEY` in `.env.local` and in the MCP server environment for your assistant. If you only add markdown files manually, you can skip Supadata.

**PDF extraction** runs locally on your machine.

`cm_extract_pdf` chooses among three extraction paths:

- `pypdf`: fast, local, text-only extraction. Best for simple PDFs with selectable text.
- `docling`: local IBM Docling library. Better for visual or mixed-layout reports.
- `docling_ocr`: Docling with OCR. Slowest, but useful for scanned or image-heavy PDFs.

Install the Python dependencies from the repo root:

```bash
python3 -m pip install -r mcp/requirements.txt
```

If `docling` installation fails, you can still use manual markdown intake and may be able to use the faster `pypdf` path if `pypdf` installed successfully.

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

## Claude Dispatch Workflow

If your Claude setup supports Dispatch from mobile or another capture surface, use Dispatch as a quick capture path:

1. Send the article or YouTube URL to Claude Dispatch.
2. Ask it to use `cm_fetch_url` or `cm_fetch_youtube`.
3. Let the MCP tool run on your local machine.
4. Later, review the markdown file in `sources/`.
5. Ingest it with `cm_add_source reviewed=true`.

Dispatch is not a separate Curate Mind service. It is another way to ask your connected AI assistant to call the same MCP tools.

## What Happens After Ingestion

`cm_add_source` creates a source record in Convex with status `indexed`. That means the source is in the database but has not yet been extracted into data points.

To process one important source interactively:

```text
Run cm-deep-extract on this source: <sourceId>
```

To process a batch of indexed sources:

```text
Run cm-batch-orchestrator on the pending indexed sources.
```

## Troubleshooting

- **Supadata errors:** Confirm `SUPADATA_API_KEY` is set in `.env.local` and in the MCP server environment your assistant uses.
- **File path errors:** Use absolute paths for PDFs and files outside the repo.
- **Nothing appears in `sources/`:** Confirm `CURATE_MIND_PATH` points to the repo root.
- **PDF extraction fails:** Install Python dependencies with `python3 -m pip install -r mcp/requirements.txt`, then retry. If a scanned PDF still fails, paste or save the important text manually and ingest it with `cm_add_source`.
- **`cm_add_source` refuses to ingest:** Review the file first, fill required metadata, remove any `verify_` filename prefix, and pass `reviewed=true`.
