"""Convert a local PDF to markdown.

Usage notes:
- auto: best-effort mode, tries multiple extractors and picks the best result
- docling: good default for large visual reports when auto may time out
- docling_ocr: best for image-heavy or scanned PDFs
- pypdf: fastest for text-heavy PDFs, but may fail on visual/image PDFs
"""

from __future__ import annotations

import html
import io
import json
import re
import sys
from contextlib import redirect_stderr, redirect_stdout
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


PAGE_BREAK_SENTINEL = "[[PARAGRAPH_BREAK]]"


@dataclass
class ExtractionCandidate:
    method: str
    markdown: str
    cleanup_notes: list[str] = field(default_factory=list)
    quality_score: int = 0
    quality: str = "low"
    review_recommended: bool = True
    review_summary: str = ""
    review_focus: list[str] = field(default_factory=list)
    stats: dict[str, float | int] = field(default_factory=dict)


def _read_pdf_metadata(pdf_path: Path) -> dict[str, str]:
    """Best-effort metadata extraction. Falls back cleanly if unavailable."""
    try:
        from pypdf import PdfReader  # type: ignore
    except Exception:
        return {}

    try:
        reader = PdfReader(str(pdf_path))
        metadata = reader.metadata or {}
    except Exception:
        return {}

    title = _clean_metadata_value(metadata.get("/Title"))
    author = _clean_metadata_value(metadata.get("/Author"))

    extracted: dict[str, str] = {}
    if title:
        extracted["title"] = title
    if author:
        extracted["author"] = author
    return extracted


def _clean_metadata_value(value: Any) -> str | None:
    if value is None:
        return None

    cleaned = str(value).strip()
    if not cleaned:
        return None

    return cleaned


def _extract_docling_default(pdf_path: Path) -> str:
    from docling.document_converter import DocumentConverter

    converter = DocumentConverter()
    return _run_docling_conversion(converter, pdf_path)


def _extract_docling_ocr(pdf_path: Path) -> str:
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import (
        OcrMacOptions,
        PdfPipelineOptions,
        TableStructureOptions,
    )
    from docling.document_converter import DocumentConverter, PdfFormatOption

    pipeline_options = PdfPipelineOptions()
    pipeline_options.do_ocr = True
    pipeline_options.do_table_structure = True
    pipeline_options.table_structure_options = TableStructureOptions(
        do_cell_matching=True
    )
    pipeline_options.ocr_options = OcrMacOptions(force_full_page_ocr=True)

    converter = DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
        }
    )
    return _run_docling_conversion(converter, pdf_path)


def _run_docling_conversion(converter: Any, pdf_path: Path) -> str:
    """Suppress noisy progress output so stderr stays reserved for metadata JSON."""
    with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
        result = converter.convert(str(pdf_path))
    return result.document.export_to_markdown().strip()


def _extract_text_with_pypdf(pdf_path: Path) -> str:
    try:
        from pypdf import PdfReader  # type: ignore
    except Exception:
        return ""

    try:
        reader = PdfReader(str(pdf_path))
    except Exception:
        return ""

    raw_pages = [
        (page.extract_text() or "").splitlines()
        for page in reader.pages
    ]
    recurring_line_fingerprints = _find_recurring_page_lines(raw_pages)

    pages: list[str] = []
    for page_number, raw_lines in enumerate(raw_pages, start=1):
        filtered_lines = [
            line for line in raw_lines
            if not _should_drop_recurring_line(line, recurring_line_fingerprints)
        ]
        normalized = _normalize_pdf_lines(filtered_lines)
        if normalized:
            pages.append(f"## Page {page_number}\n\n{normalized}")

    return "\n\n".join(pages).strip()


def _normalize_pdf_text(text: str) -> str:
    return _normalize_pdf_lines(text.splitlines())


def _normalize_pdf_lines(lines: list[str]) -> str:
    normalized_lines = [_normalize_pdf_line(line) for line in lines]
    cleaned_lines = [line for line in normalized_lines if line]
    cleaned_lines = _dedupe_repeated_lines(cleaned_lines)
    if not cleaned_lines:
        return ""

    blocks: list[str] = []
    current_block: list[str] = []

    for line in cleaned_lines:
        if line == PAGE_BREAK_SENTINEL:
            if current_block:
                blocks.append(" ".join(current_block).strip())
                current_block = []
            continue

        current_block.append(line)

    if current_block:
        blocks.append(" ".join(current_block).strip())

    return "\n\n".join(block for block in blocks if block).strip()


def _dedupe_repeated_lines(lines: list[str]) -> list[str]:
    deduped: list[str] = []
    seen_counts: dict[str, int] = {}

    for line in lines:
        if line == PAGE_BREAK_SENTINEL:
            deduped.append(line)
            continue

        normalized = re.sub(r"\s+", " ", line).strip().lower()
        count = seen_counts.get(normalized, 0)
        if count > 0 and len(normalized) >= 25:
            continue

        seen_counts[normalized] = count + 1
        deduped.append(line)

    return deduped


def _find_recurring_page_lines(raw_pages: list[list[str]]) -> set[str]:
    counts: dict[str, int] = {}

    for page_lines in raw_pages:
        seen_on_page: set[str] = set()
        for line in page_lines:
            fingerprint = _line_fingerprint(line)
            if not fingerprint:
                continue
            seen_on_page.add(fingerprint)

        for fingerprint in seen_on_page:
            counts[fingerprint] = counts.get(fingerprint, 0) + 1

    return {
        fingerprint
        for fingerprint, count in counts.items()
        if count >= 3
    }


def _should_drop_recurring_line(line: str, recurring_line_fingerprints: set[str]) -> bool:
    fingerprint = _line_fingerprint(line)
    if not fingerprint:
        return False

    return fingerprint in recurring_line_fingerprints


def _line_fingerprint(line: str) -> str | None:
    stripped = re.sub(r"\s+", " ", line).strip()
    if not stripped:
        return None

    without_page_prefix = re.sub(r"^\d{1,3}\s*", "", stripped)
    fingerprint = without_page_prefix.strip(" -–—•·")
    if len(fingerprint) < 12 or len(fingerprint) > 90:
        return None

    if re.fullmatch(r"[\d\s%→•·-]+", fingerprint):
        return None

    return fingerprint.lower()


def _normalize_pdf_line(line: str) -> str:
    stripped = line.strip()
    if not stripped:
        return PAGE_BREAK_SENTINEL

    if _is_mostly_letter_spaced(stripped):
        stripped = _collapse_letter_spaced_text(stripped)

    return re.sub(r"\s+", " ", stripped).strip()


def _is_mostly_letter_spaced(line: str) -> bool:
    tokens = line.split()
    if len(tokens) < 4:
        return False

    single_char_tokens = sum(
        1 for token in tokens if len(token) == 1 and any(char.isalpha() for char in token)
    )
    return single_char_tokens / len(tokens) >= 0.6


def _collapse_letter_spaced_text(line: str) -> str:
    sentinel = "<<<WORD_BREAK>>>"
    collapsed = re.sub(r"\s{2,}", sentinel, line)
    collapsed = re.sub(r"(?<=\b\w) (?=\w\b)", "", collapsed)
    collapsed = collapsed.replace(sentinel, " ")
    return collapsed


def _clean_markdown(markdown: str) -> tuple[str, list[str]]:
    notes: list[str] = []
    cleaned = html.unescape(markdown.replace("\r\n", "\n")).strip()
    if not cleaned:
        return "", notes

    cleaned, changed = _strip_image_placeholders(cleaned)
    if changed:
        notes.append("removed image placeholders")

    cleaned, changed = _fix_pdf_artifacts(cleaned)
    if changed:
        notes.append("fixed PDF glyph and ligature artifacts")

    cleaned, changed = _normalize_checkbox_bullets(cleaned)
    if changed:
        notes.append("normalized checkbox bullets")

    cleaned, changed = _normalize_spacing(cleaned)
    if changed:
        notes.append("normalized spacing and punctuation")

    cleaned, changed = _insert_missing_spaces(cleaned)
    if changed:
        notes.append("inserted missing spaces around headings")

    cleaned, changed = _remove_noise_paragraphs(cleaned)
    if changed:
        notes.append("removed noise-only paragraphs")

    cleaned, changed = _remove_duplicate_sentences(cleaned)
    if changed:
        notes.append("removed duplicate sentences")

    cleaned, changed = _remove_duplicate_paragraphs(cleaned)
    if changed:
        notes.append("removed duplicate paragraphs")

    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
    return cleaned, notes


def _strip_image_placeholders(markdown: str) -> tuple[str, bool]:
    cleaned = re.sub(r"(?m)^\s*<!-- image -->\s*\n?", "", markdown)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip(), cleaned.strip() != markdown.strip()


def _normalize_checkbox_bullets(markdown: str) -> tuple[str, bool]:
    cleaned = re.sub(r"(?m)^-\s*\[\s\]\s+", "- ", markdown)
    return cleaned, cleaned != markdown


def _fix_pdf_artifacts(markdown: str) -> tuple[str, bool]:
    cleaned = markdown
    replacements = [
        (r"/f_", "f"),
        (r"/hyphen\.case", "-"),
        (r"/endash\.case", "-"),
        (r"/emspace", ""),
        (r"\bMc\s+Kinsey\b", "McKinsey"),
        (r"\bAIDB\b", "AIDB"),
        (r"(\d)4(?=[A-Za-z])", r"\1 - "),
        (r"([A-Za-z])4([A-Za-z])", r"\1 - \2"),
        (r"(\d)3(?=[A-Za-z])", r"\1 - "),
        (r"(?m)^-\s+-", "-"),
    ]
    for pattern, replacement in replacements:
        cleaned = re.sub(pattern, replacement, cleaned)

    cleaned = re.sub(r"\b([A-Z])\s+I\b", r"\1I", cleaned)
    cleaned = re.sub(r"\bAI\s+Daily\s+Brief_AI\b", "AI Daily Brief: AI", cleaned)
    cleaned = re.sub(r"\s+-\s+-\s+", " - ", cleaned)
    return cleaned, cleaned != markdown


def _normalize_spacing(markdown: str) -> tuple[str, bool]:
    cleaned = markdown
    replacements = [
        (r"[ \t]+", " "),
        (r" *([,.;:%?!])", r"\1"),
        (r"([(\[{]) ", r"\1"),
        (r" ([)\]}])", r"\1"),
        (r"(\w)\s+([’'])\s+(s|re|ve|ll|d|m|t)\b", r"\1\2\3"),
        (r"\b([A-Za-z]+)\s*-\s*([A-Za-z]+)\b", r"\1-\2"),
        (r"([a-z])\s+([A-Z]{2,}\b)", r"\1 \2"),
        (r"(?<!\n)\n(?!\n)(?=[a-z])", " "),
    ]
    for pattern, replacement in replacements:
        cleaned = re.sub(pattern, replacement, cleaned)

    cleaned = re.sub(r"(?m)^[ \t]+", "", cleaned)
    cleaned = re.sub(r"[ \t]+\n", "\n", cleaned)
    return cleaned.strip(), cleaned.strip() != markdown.strip()


def _insert_missing_spaces(markdown: str) -> tuple[str, bool]:
    cleaned = markdown
    cleaned = re.sub(r"(?<=\d)(?=[A-Z][a-z])", " ", cleaned)
    cleaned = re.sub(r"(?<=[a-z])(?=[A-Z][a-z])", " ", cleaned)
    cleaned = re.sub(r"\b([A-Za-z]{2,})(\d{1,2}\b)", r"\1 \2", cleaned)
    return cleaned, cleaned != markdown


def _remove_noise_paragraphs(markdown: str) -> tuple[str, bool]:
    paragraphs = [paragraph.strip() for paragraph in markdown.split("\n\n")]
    filtered: list[str] = []

    for paragraph in paragraphs:
        if not paragraph:
            continue

        if re.fullmatch(r"(## Page \d+|\d{1,3}|[→•·\-\s%]+)", paragraph):
            continue

        filtered.append(paragraph)

    cleaned = "\n\n".join(filtered).strip()
    return cleaned, cleaned != markdown.strip()


def _remove_duplicate_sentences(markdown: str) -> tuple[str, bool]:
    paragraphs = [paragraph.strip() for paragraph in markdown.split("\n\n")]
    cleaned_paragraphs: list[str] = []

    for paragraph in paragraphs:
        if paragraph.startswith("## "):
            cleaned_paragraphs.append(paragraph)
            continue

        sentences = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9“\"'])", paragraph)
        deduped_sentences: list[str] = []
        seen: set[str] = set()

        for sentence in sentences:
            stripped = sentence.strip()
            if not stripped:
                continue

            normalized = re.sub(r"\s+", " ", stripped).strip().lower()
            if normalized in seen and len(normalized) >= 40:
                continue

            seen.add(normalized)
            deduped_sentences.append(stripped)

        cleaned_paragraphs.append(" ".join(deduped_sentences).strip())

    cleaned = "\n\n".join(paragraph for paragraph in cleaned_paragraphs if paragraph).strip()
    return cleaned, cleaned != markdown.strip()


def _remove_duplicate_paragraphs(markdown: str) -> tuple[str, bool]:
    paragraphs = [paragraph.strip() for paragraph in markdown.split("\n\n")]
    deduped: list[str] = []
    seen: set[str] = set()

    for paragraph in paragraphs:
        if not paragraph:
            continue

        normalized = re.sub(r"\s+", " ", paragraph).strip().lower()
        if normalized in seen:
            continue

        seen.add(normalized)
        deduped.append(paragraph)

    cleaned = "\n\n".join(deduped).strip()
    return cleaned, cleaned != markdown.strip()


def _score_candidate(
    markdown: str,
) -> tuple[int, str, bool, str, list[str], dict[str, float | int]]:
    words = re.findall(r"\b[\w’'-]+\b", markdown)
    word_count = len(words)
    paragraphs = [
        paragraph.strip()
        for paragraph in markdown.split("\n\n")
        if paragraph.strip()
    ]
    image_count = markdown.count("<!-- image -->")
    page_heading_count = len(re.findall(r"(?m)^## Page \d+\s*$", markdown))
    checklist_count = len(re.findall(r"(?m)^-\s+\[\s\]\s+", markdown))
    duplicate_paragraphs = _count_duplicate_paragraphs(paragraphs)
    broken_word_patterns = len(
        re.findall(r"\b[a-z]{1,3}\s+[a-z]{1,3}\s+[a-z]{2,}\b", markdown)
    )
    title_case_headings = len(re.findall(r"(?m)^## [A-Z][^\n]{2,}$", markdown))
    table_count, sparse_table_count, dense_table_count = _analyze_markdown_tables(markdown)
    chart_like_lines = len(
        re.findall(r"(?m)^(?:\d{1,3}%|\d{1,3}\.\d+%|Q[1-4]|\d{2,4})\s*$", markdown)
    )

    score = 100
    if word_count < 400:
        score -= 40
    elif word_count < 1200:
        score -= 20

    score -= min(50, image_count * 5)
    score -= min(25, checklist_count * 2)
    score -= min(30, duplicate_paragraphs * 6)
    score -= min(35, broken_word_patterns // 4)
    score -= min(18, sparse_table_count * 6)
    score -= min(8, chart_like_lines // 6)
    score += min(8, title_case_headings)
    if page_heading_count > 0:
        score += 4
    if dense_table_count > 0 and sparse_table_count == 0:
        score += min(4, dense_table_count)

    score = max(0, min(100, score))

    if score >= 85:
        quality = "high"
    elif score >= 60:
        quality = "medium"
    else:
        quality = "low"

    review_focus: list[str] = []
    review_recommended = quality != "high"
    if sparse_table_count > 0:
        review_focus.append("tables/charts")
    if broken_word_patterns >= 12:
        review_focus.append("text artifacts")
    if duplicate_paragraphs > 0:
        review_focus.append("duplicate passages")

    if quality == "high":
        if "tables/charts" in review_focus:
            review_summary = (
                "Narrative text looks strong; skim tables/charts before pushing to Convex."
            )
        else:
            review_summary = "Likely ready after a quick skim."
    elif quality == "medium":
        if review_focus:
            review_summary = (
                "Skim "
                + " and ".join(review_focus)
                + " before pushing to Convex."
            )
        else:
            review_summary = "Skim the markdown before pushing to Convex."
    else:
        review_summary = (
            "Review recommended before pushing to Convex; extraction needs a closer check."
        )

    stats: dict[str, float | int] = {
        "wordCount": word_count,
        "imageCount": image_count,
        "checklistCount": checklist_count,
        "duplicateParagraphs": duplicate_paragraphs,
        "brokenWordPatterns": broken_word_patterns,
        "pageHeadingCount": page_heading_count,
        "titleCaseHeadings": title_case_headings,
        "tableCount": table_count,
        "sparseTableCount": sparse_table_count,
        "denseTableCount": dense_table_count,
        "chartLikeLines": chart_like_lines,
    }
    return score, quality, review_recommended, review_summary, review_focus, stats


def _analyze_markdown_tables(markdown: str) -> tuple[int, int, int]:
    lines = markdown.splitlines()
    table_blocks: list[list[str]] = []
    current_block: list[str] = []

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("|") and stripped.endswith("|"):
            current_block.append(stripped)
            continue

        if current_block:
            table_blocks.append(current_block)
            current_block = []

    if current_block:
        table_blocks.append(current_block)

    sparse_count = 0
    dense_count = 0

    for block in table_blocks:
        if len(block) < 2:
            continue

        cells: list[str] = []
        for row in block:
            row_cells = [cell.strip() for cell in row.strip("|").split("|")]
            if row_cells and all(re.fullmatch(r"[:\-\s]+", cell) for cell in row_cells):
                continue
            cells.extend(row_cells)

        if not cells:
            continue

        short_or_empty_cells = sum(
            1
            for cell in cells
            if not cell or len(cell) <= 2 or re.fullmatch(r"[\d.%+-]+", cell)
        )
        ratio = short_or_empty_cells / len(cells)
        if ratio >= 0.6:
            sparse_count += 1
        else:
            dense_count += 1

    return len(table_blocks), sparse_count, dense_count


def _count_duplicate_paragraphs(paragraphs: list[str]) -> int:
    counts: dict[str, int] = {}
    for paragraph in paragraphs:
        normalized = re.sub(r"\s+", " ", paragraph).strip().lower()
        counts[normalized] = counts.get(normalized, 0) + 1

    return sum(count - 1 for count in counts.values() if count > 1)


def _choose_best_candidate(candidates: list[ExtractionCandidate]) -> ExtractionCandidate:
    return max(
        candidates,
        key=lambda candidate: (
            candidate.quality_score,
            candidate.stats.get("wordCount", 0),
            -candidate.stats.get("brokenWordPatterns", 0),
        ),
    )


def _resolve_requested_methods(method: str) -> list[str]:
    if method == "auto":
        return ["docling", "docling_ocr", "pypdf"]

    return [method]


def _build_candidates(pdf_path: Path, requested_methods: list[str]) -> list[ExtractionCandidate]:
    candidates: list[ExtractionCandidate] = []

    extractors = {
        "docling": _extract_docling_default,
        "docling_ocr": _extract_docling_ocr,
        "pypdf": _extract_text_with_pypdf,
    }

    for method in requested_methods:
        extractor = extractors[method]
        try:
            raw_markdown = extractor(pdf_path).strip()
        except Exception:
            continue

        if not raw_markdown:
            continue

        cleaned_markdown, cleanup_notes = _clean_markdown(raw_markdown)
        if not cleaned_markdown:
            continue

        (
            score,
            quality,
            review_recommended,
            review_summary,
            review_focus,
            stats,
        ) = _score_candidate(cleaned_markdown)
        candidates.append(
            ExtractionCandidate(
                method=method,
                markdown=cleaned_markdown,
                cleanup_notes=cleanup_notes,
                quality_score=score,
                quality=quality,
                review_recommended=review_recommended,
                review_summary=review_summary,
                review_focus=review_focus,
                stats=stats,
            )
        )

    return candidates


def _format_candidate_scores(candidates: list[ExtractionCandidate]) -> str:
    ranked = sorted(
        candidates,
        key=lambda candidate: (
            candidate.quality_score,
            candidate.stats.get("wordCount", 0),
        ),
        reverse=True,
    )
    return ", ".join(
        f"{candidate.method}:{candidate.quality_score}"
        for candidate in ranked
    )


def main() -> int:
    if len(sys.argv) not in {2, 3}:
        print(
            "Usage: python3 mcp/scripts/extract_pdf.py /absolute/path/to/file.pdf [auto|pypdf|docling|docling_ocr]",
            file=sys.stderr,
        )
        return 1

    pdf_path = Path(sys.argv[1]).expanduser()
    requested_method = sys.argv[2].strip().lower() if len(sys.argv) == 3 else "auto"
    if requested_method not in {"auto", "pypdf", "docling", "docling_ocr"}:
        print(
            "Error: method must be one of auto, pypdf, docling, or docling_ocr.",
            file=sys.stderr,
        )
        return 1

    if not pdf_path.exists():
        print(f"Error: PDF not found: {pdf_path}", file=sys.stderr)
        return 1

    if not pdf_path.is_file():
        print(f"Error: Path is not a file: {pdf_path}", file=sys.stderr)
        return 1

    if pdf_path.suffix.lower() != ".pdf":
        print(f"Error: File must end with .pdf: {pdf_path}", file=sys.stderr)
        return 1

    requested_methods = _resolve_requested_methods(requested_method)
    if any(method in {"docling", "docling_ocr"} for method in requested_methods):
        try:
            import docling  # noqa: F401
        except Exception:
            print(
                "Error: Docling is not installed. Run: python3 -m pip install docling",
                file=sys.stderr,
            )
            return 1

    try:
        candidates = _build_candidates(pdf_path, requested_methods)
    except Exception as exc:
        print(f"Error converting PDF: {exc}", file=sys.stderr)
        return 1

    if not candidates:
        if requested_method != "auto":
            print(
                "Error converting PDF: requested method "
                f"'{requested_method}' did not produce usable markdown. "
                "Try method='auto' or 'docling_ocr' for this file.",
                file=sys.stderr,
            )
            return 1
        print(
            "Error converting PDF: no extraction strategy produced usable markdown.",
            file=sys.stderr,
        )
        return 1

    best_candidate = _choose_best_candidate(candidates)
    metadata = _read_pdf_metadata(pdf_path)
    metadata["requestedMethod"] = requested_method
    metadata["extractionMethod"] = best_candidate.method
    metadata["quality"] = best_candidate.quality
    metadata["qualityScore"] = str(best_candidate.quality_score)
    metadata["reviewRecommended"] = "yes" if best_candidate.review_recommended else "no"
    metadata["reviewSummary"] = best_candidate.review_summary
    metadata["reviewFocus"] = ", ".join(best_candidate.review_focus)
    metadata["cleanupApplied"] = ", ".join(best_candidate.cleanup_notes)
    metadata["candidateScores"] = _format_candidate_scores(candidates)
    print(json.dumps(metadata), file=sys.stderr)
    sys.stdout.write(best_candidate.markdown)
    if best_candidate.markdown and not best_candidate.markdown.endswith("\n"):
        sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
