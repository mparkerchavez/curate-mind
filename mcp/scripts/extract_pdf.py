"""Convert a local PDF to markdown.

Usage notes:
- auto: best-effort mode, tries multiple extractors and picks the best result
- liteparse: fast local layout-preserving extraction for born-digital PDFs
- docling: good default for large visual reports when auto may time out
- docling_ocr: best for image-heavy or scanned PDFs
- pypdf: lightweight fallback for text-heavy PDFs, but may garble layout
"""

from __future__ import annotations

import html
import io
import json
import re
import shutil
import signal
import subprocess
import sys
import sysconfig
from contextlib import redirect_stderr, redirect_stdout
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


PAGE_BREAK_SENTINEL = "[[PARAGRAPH_BREAK]]"

# Per-method timeouts for the adaptive auto chain (seconds).
# Signal-based; process-level Node.js timeout is the hard backstop.
_METHOD_TIMEOUTS_SECONDS: dict[str, int] = {
    "liteparse": 60,
    "pypdf": 30,
    "docling": 90,
    "docling_ocr": 120,
}

# Auto-mode OCR gates: skip docling_ocr if either threshold is exceeded.
_OCR_PAGE_GATE = 60
_OCR_SIZE_GATE_MB = 30.0

# Fraction of pages that must have embedded images to disable LiteParse early-stop.
_IMAGES_FRACTION_THRESHOLD = 0.20

# File-size boundary that governs which LiteParse word-count threshold applies.
_LARGE_FILE_THRESHOLD_MB = 5.0

# Minimum word counts for LiteParse early-stop (fast exit before trying docling).
_LITEPARSE_WORD_THRESHOLD_LARGE_FILE = 1000
_LITEPARSE_WORD_THRESHOLD_SMALL_FILE = 500


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


class _MethodTimeoutError(Exception):
    """Raised when a per-method SIGALRM timeout fires inside _run_with_alarm."""


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


def _extract_liteparse_markdown(pdf_path: Path) -> str:
    lit_executable = _find_lit_executable()
    if lit_executable:
        completed = subprocess.run(
            [
                str(lit_executable),
                "parse",
                str(pdf_path),
                "--format",
                "markdown",
                "--no-ocr",
                "--image-mode",
                "off",
                "-q",
            ],
            capture_output=True,
            text=True,
            timeout=_METHOD_TIMEOUTS_SECONDS["liteparse"],
            check=False,
        )
        if completed.returncode != 0:
            raise RuntimeError(completed.stderr.strip() or "LiteParse failed")
        return completed.stdout.strip()

    try:
        from liteparse import LiteParse  # type: ignore
    except Exception as exc:
        raise RuntimeError(
            "LiteParse is not installed. Run: python3 -m pip install liteparse"
        ) from exc

    parser = LiteParse(output_format="markdown")
    result = parser.parse(str(pdf_path))
    text = getattr(result, "text", None)
    if isinstance(text, str):
        return text.strip()
    return str(result).strip()


def _find_lit_executable() -> Path | None:
    scripts_dir = sysconfig.get_path("scripts")
    candidates = [
        Path(sys.executable).with_name("lit"),
        Path(scripts_dir) / "lit" if scripts_dir else None,
    ]

    for candidate in candidates:
        if candidate and candidate.exists() and candidate.is_file():
            return candidate

    path_candidate = shutil.which("lit")
    if path_candidate:
        return Path(path_candidate)

    return None


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


def _run_with_alarm(fn: Any, pdf_path: Path, timeout_sec: int) -> str:
    """Call fn(pdf_path) with a SIGALRM per-method timeout.

    Falls back to an unconstrained call on platforms without SIGALRM (Windows).
    When the alarm fires inside a C extension the signal is deferred until
    Python regains control, so the actual cutoff may be slightly late.
    """
    if not hasattr(signal, "SIGALRM"):
        return fn(pdf_path)

    def _handler(signum: int, frame: Any) -> None:
        raise _MethodTimeoutError(f"timed out after {timeout_sec}s")

    old_handler = signal.signal(signal.SIGALRM, _handler)
    signal.alarm(timeout_sec)
    try:
        result = fn(pdf_path)
        signal.alarm(0)
        return result
    except _MethodTimeoutError:
        raise
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, old_handler)


def _get_pdf_info(pdf_path: Path) -> tuple[int, bool]:
    """Return (page_count, has_significant_images) in a single cheap pypdf pass.

    has_significant_images is True when more than _IMAGES_FRACTION_THRESHOLD of
    pages contain embedded image XObjects — used to suppress LiteParse early-stop
    in the adaptive auto chain so docling always runs on mixed-content PDFs.
    """
    try:
        from pypdf import PdfReader  # type: ignore

        reader = PdfReader(str(pdf_path))
        page_count = len(reader.pages)
        if page_count == 0:
            return 0, False
        pages_with_images = sum(1 for page in reader.pages if page.images)
        has_images = (pages_with_images / page_count) > _IMAGES_FRACTION_THRESHOLD
        return page_count, has_images
    except Exception:
        return 0, False


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


def _clean_markdown(
    markdown: str,
    *,
    preserve_layout_spacing: bool = False,
) -> tuple[str, list[str]]:
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

    if not preserve_layout_spacing:
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
    cleaned = re.sub(r"(?m)^\s*!\[[^\]]*\]\([^)]*\)\s*\n?", "", cleaned)
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
    *,
    page_count: int = 0,
    file_size_mb: float = 0.0,
) -> tuple[int, str, bool, str, list[str], dict[str, float | int]]:
    words = re.findall(r"\b[\w’'-]+\b", markdown)
    word_count = len(words)
    normalized_words = [word.strip("’'-").lower() for word in words if word.strip("’'-")]
    single_letter_word_count = sum(
        1 for word in normalized_words if len(word) == 1 and word.isalpha()
    )
    single_letter_word_ratio = (
        single_letter_word_count / len(normalized_words)
        if normalized_words
        else 0.0
    )
    paragraphs = [
        paragraph.strip()
        for paragraph in markdown.split("\n\n")
        if paragraph.strip()
    ]
    lines = [line.strip() for line in markdown.splitlines() if line.strip()]
    prose_lines = [
        line
        for line in lines
        if not line.startswith(("#", "|", "-", "*", ">", "<!--"))
    ]
    short_prose_lines = [
        line
        for line in prose_lines
        if len(line) <= 32 and len(re.findall(r"[A-Za-z]", line)) >= 3
    ]
    short_line_ratio = (
        len(short_prose_lines) / len(prose_lines)
        if prose_lines
        else 0.0
    )
    image_count = markdown.count("<!-- image -->") + len(
        re.findall(r"!\[[^\]]*\]\([^)]*\)", markdown)
    )
    page_heading_count = len(re.findall(r"(?m)^## Page \d+\s*$", markdown))
    markdown_heading_count = len(re.findall(r"(?m)^#{1,6}\s+\S", markdown))
    checklist_count = len(re.findall(r"(?m)^-\s+\[\s\]\s+", markdown))
    duplicate_paragraphs = _count_duplicate_paragraphs(paragraphs)
    broken_word_patterns = len(
        re.findall(r"\b[a-z]{1,3}\s+[a-z]{1,3}\s+[a-z]{2,}\b", markdown)
    )
    letter_spaced_runs = _count_letter_spaced_runs(markdown)
    title_case_headings = len(re.findall(r"(?m)^## [A-Z][^\n]{2,}$", markdown))
    table_count, sparse_table_count, dense_table_count = _analyze_markdown_tables(markdown)
    chart_like_lines = len(
        re.findall(r"(?m)^(?:\d{1,3}%|\d{1,3}\.\d+%|Q[1-4]|\d{2,4})\s*$", markdown)
    )
    suspected_ai_glyphs = len(re.findall(r"\bAl\b", markdown))
    spaced_brand_patterns = len(
        re.findall(
            r"\b(?:Mc\s+Kinsey|Open\s+AI|Micro\s+soft|Anthro\s+pic)\b",
            markdown,
            flags=re.IGNORECASE,
        )
    )
    hyphenation_breaks = len(re.findall(r"\b[A-Za-z]{3,}-\s+[a-z]{2,}", markdown))
    academic_signal_count = _count_academic_signals(markdown)
    table_figure_reference_count = len(
        re.findall(r"\b(?:Table|Figure|Fig\.|Lemma|Proposition|Theorem)\s+\d+", markdown)
    )
    math_symbol_count = len(re.findall(r"[αβγδεηλμσπ∑∏≤≥≔∈]|\\(?:alpha|beta|lambda|sum|frac|in)", markdown))
    words_per_page = word_count / page_count if page_count > 0 else 0.0
    low_density_for_pages = page_count >= 3 and words_per_page < 80
    very_low_density_for_pages = page_count >= 3 and words_per_page < 35
    low_density_for_size = file_size_mb >= 5.0 and word_count < 1000
    flattened_structure = (
        word_count >= 1200
        and markdown_heading_count < 3
        and table_count == 0
        and page_heading_count == 0
    )

    score = 100
    if word_count < 400:
        score -= 40
    elif word_count < 1200:
        score -= 20

    if very_low_density_for_pages:
        score -= 40
    elif low_density_for_pages:
        score -= 25
    if low_density_for_size:
        score -= 30

    score -= min(50, image_count * 5)
    score -= min(25, checklist_count * 2)
    score -= min(30, duplicate_paragraphs * 6)
    # This signal is intentionally weak: short-word runs can be normal English.
    # Stronger garble detection comes from letter-spaced runs and single-letter ratio.
    score -= min(8, broken_word_patterns // 20)
    score -= min(20, letter_spaced_runs * 2)
    score -= min(35, int(single_letter_word_ratio * 200))
    score -= min(18, int(short_line_ratio * 30))
    score -= min(18, sparse_table_count * 6)
    score -= min(8, chart_like_lines // 6)
    score -= min(18, suspected_ai_glyphs // 3)
    score -= min(12, spaced_brand_patterns * 3)
    score -= min(10, hyphenation_breaks * 2)
    if flattened_structure:
        score -= 18

    score += min(8, title_case_headings)
    if page_heading_count > 0:
        score += 4
    if dense_table_count > 0 and sparse_table_count == 0:
        score += min(4, dense_table_count)

    score = max(0, min(100, score))

    if score >= 85:
        quality = "high"
    elif score >= 55:
        quality = "medium"
    else:
        quality = "low"

    review_focus: list[str] = []
    review_recommended = quality != "high"
    if sparse_table_count > 0:
        review_focus.append("tables/charts")
    if letter_spaced_runs >= 6 or single_letter_word_ratio >= 0.025:
        review_focus.append("text artifacts")
    if (
        suspected_ai_glyphs >= 5
        or spaced_brand_patterns >= 2
        or hyphenation_breaks >= 4
        or letter_spaced_runs >= 10
        or single_letter_word_ratio >= 0.05
    ):
        review_focus.append("possible garbled text")
    if duplicate_paragraphs > 0:
        review_focus.append("duplicate passages")
    if low_density_for_pages or low_density_for_size:
        review_focus.append("low extraction coverage")
    if flattened_structure:
        review_focus.append("flattened structure")

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
        "pageCount": page_count,
        "fileSizeMb": round(file_size_mb, 2),
        "wordsPerPage": round(words_per_page, 2) if page_count > 0 else 0,
        "imageCount": image_count,
        "checklistCount": checklist_count,
        "duplicateParagraphs": duplicate_paragraphs,
        "brokenWordPatterns": broken_word_patterns,
        "letterSpacedRuns": letter_spaced_runs,
        "singleLetterWordRatio": round(single_letter_word_ratio, 4),
        "shortLineRatio": round(short_line_ratio, 4),
        "pageHeadingCount": page_heading_count,
        "markdownHeadingCount": markdown_heading_count,
        "titleCaseHeadings": title_case_headings,
        "tableCount": table_count,
        "sparseTableCount": sparse_table_count,
        "denseTableCount": dense_table_count,
        "chartLikeLines": chart_like_lines,
        "suspectedAiGlyphs": suspected_ai_glyphs,
        "spacedBrandPatterns": spaced_brand_patterns,
        "hyphenationBreaks": hyphenation_breaks,
        "academicSignalCount": academic_signal_count,
        "tableFigureReferenceCount": table_figure_reference_count,
        "mathSymbolCount": math_symbol_count,
    }
    return score, quality, review_recommended, review_summary, review_focus, stats


def _count_academic_signals(markdown: str) -> int:
    signals = 0
    checks = [
        r"(?im)^#{0,6}\s*abstract\s*$",
        r"(?im)^#{0,6}\s*references\s*$",
        r"(?im)^#{0,6}\s*appendix\b",
        r"\barxiv\b",
        r"\bdoi\s*:",
        r"\bet al\.",
        r"\bKeywords?\s*:",
        r"\bProposition\s+\d+",
        r"\bTheorem\s+\d+",
        r"\bLemma\s+\d+",
        r"\bProof\b",
    ]
    for pattern in checks:
        if re.search(pattern, markdown, flags=re.IGNORECASE):
            signals += 1

    author_year_citations = len(
        re.findall(r"\([A-Z][A-Za-z-]+(?:\s+et al\.)?,?\s+\d{4}[a-z]?\)", markdown)
    )
    if author_year_citations >= 5:
        signals += 1

    numeric_citations = len(re.findall(r"\[[0-9,\-\s]{1,20}\]", markdown))
    if numeric_citations >= 5:
        signals += 1

    return signals


def _should_compare_docling(markdown: str, stats: dict[str, float | int]) -> bool:
    academic_signals = int(stats.get("academicSignalCount", 0))
    table_count = int(stats.get("tableCount", 0))
    sparse_table_count = int(stats.get("sparseTableCount", 0))
    table_figure_references = int(stats.get("tableFigureReferenceCount", 0))
    math_symbol_count = int(stats.get("mathSymbolCount", 0))

    if academic_signals >= 3:
        return True

    if academic_signals >= 2 and (table_count > 0 or table_figure_references >= 3):
        return True

    if academic_signals >= 1 and (sparse_table_count > 0 or math_symbol_count >= 8):
        return True

    if table_count >= 3 and (table_figure_references >= 3 or math_symbol_count >= 8):
        return True

    return False


def _count_letter_spaced_runs(markdown: str) -> int:
    """Count likely OCR/parser artifacts like 'S urv e y' or 'M ark e t'."""
    count = 0
    for line in markdown.splitlines():
        tokens = re.findall(r"[A-Za-z]+", line)
        run: list[str] = []
        for token in tokens:
            if len(token) <= 4:
                run.append(token)
                continue

            if _looks_like_letter_spaced_run(run):
                count += 1
            run = []

        if _looks_like_letter_spaced_run(run):
            count += 1

    return count


def _looks_like_letter_spaced_run(tokens: list[str]) -> bool:
    if len(tokens) < 3:
        return False

    joined_len = sum(len(token) for token in tokens)
    average_len = joined_len / len(tokens)
    single_letter_tokens = sum(1 for token in tokens if len(token) == 1)
    return joined_len >= 5 and (
        single_letter_tokens >= 2
        or (single_letter_tokens >= 1 and average_len <= 2.2)
    )


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


def _build_candidates_adaptive(
    pdf_path: Path,
    file_size_mb: float,
    page_count: int,
    has_significant_images: bool,
) -> tuple[list[ExtractionCandidate], bool]:
    """Try LiteParse → Docling → Docling OCR, with pypdf as a low-priority fallback.

    Returns (candidates, ocr_skipped).  ocr_skipped is True when the page-count
    or file-size gate prevented docling_ocr from running.

    Early-stop rules:
    - liteparse: stop if quality is high, or if no significant images AND word count >= threshold AND quality != low,
      unless medium-quality academic/table-heavy signals suggest Docling is worth comparing.
    - docling: stop if quality != low, or if LiteParse already produced a non-low candidate.
    - docling_ocr: last resort, no early stop.
    - pypdf: emergency fallback when stronger parsers fail or all produce low quality.
    """
    skip_ocr = page_count > _OCR_PAGE_GATE or file_size_mb > _OCR_SIZE_GATE_MB
    word_threshold = (
        _LITEPARSE_WORD_THRESHOLD_LARGE_FILE
        if file_size_mb > _LARGE_FILE_THRESHOLD_MB
        else _LITEPARSE_WORD_THRESHOLD_SMALL_FILE
    )

    extractors: dict[str, Any] = {
        "liteparse": _extract_liteparse_markdown,
        "pypdf": _extract_text_with_pypdf,
        "docling": _extract_docling_default,
        "docling_ocr": _extract_docling_ocr,
    }

    candidates: list[ExtractionCandidate] = []
    primary_methods = ["liteparse", "docling", "docling_ocr"]

    for method in primary_methods:
        if method == "docling_ocr" and skip_ocr:
            continue
        if method == "docling_ocr" and any(
            candidate.quality != "low" for candidate in candidates
        ):
            break

        timeout_sec = _METHOD_TIMEOUTS_SECONDS[method]
        extractor = extractors[method]

        try:
            raw_markdown = _run_with_alarm(extractor, pdf_path, timeout_sec)
        except _MethodTimeoutError:
            continue
        except Exception:
            continue

        if not raw_markdown or not raw_markdown.strip():
            continue

        cleaned_markdown, cleanup_notes = _clean_markdown(
            raw_markdown.strip(),
            preserve_layout_spacing=method == "liteparse",
        )
        if not cleaned_markdown:
            continue

        (
            score,
            quality,
            review_recommended,
            review_summary,
            review_focus,
            stats,
        ) = _score_candidate(
            cleaned_markdown,
            page_count=page_count,
            file_size_mb=file_size_mb,
        )
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

        word_count = int(stats.get("wordCount", 0))

        if method == "liteparse":
            # Only stop at LiteParse when the file has no significant images and
            # the text layer is clearly sufficient. Mixed-content PDFs continue
            # to Docling so tables and image placeholders can be compared. Medium
            # academic/table-heavy PDFs also continue because Docling can preserve
            # paper structure better than LiteParse on this shape.
            needs_docling_comparison = (
                quality == "medium"
                and _should_compare_docling(cleaned_markdown, stats)
            )
            if quality == "high" or (
                not has_significant_images
                and word_count >= word_threshold
                and quality != "low"
                and not needs_docling_comparison
            ):
                break
        elif method == "docling":
            if quality != "low" or any(
                candidate.method == "liteparse" and candidate.quality != "low"
                for candidate in candidates
            ):
                break
        # docling_ocr: last resort, no early stop

    if not candidates or all(candidate.quality == "low" for candidate in candidates):
        try:
            raw_markdown = _run_with_alarm(
                extractors["pypdf"],
                pdf_path,
                _METHOD_TIMEOUTS_SECONDS["pypdf"],
            )
        except Exception:
            raw_markdown = ""

        if raw_markdown and raw_markdown.strip():
            cleaned_markdown, cleanup_notes = _clean_markdown(raw_markdown.strip())
            if cleaned_markdown:
                (
                    score,
                    quality,
                    review_recommended,
                    review_summary,
                    review_focus,
                    stats,
                ) = _score_candidate(
                    cleaned_markdown,
                    page_count=page_count,
                    file_size_mb=file_size_mb,
                )
                candidates.append(
                    ExtractionCandidate(
                        method="pypdf",
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

    return candidates, skip_ocr


def _resolve_requested_methods(method: str) -> list[str]:
    if method == "auto":
        return ["liteparse", "docling", "docling_ocr", "pypdf"]

    return [method]


def _build_candidates(
    pdf_path: Path,
    requested_methods: list[str],
    *,
    page_count: int = 0,
    file_size_mb: float = 0.0,
) -> list[ExtractionCandidate]:
    candidates: list[ExtractionCandidate] = []

    extractors = {
        "liteparse": _extract_liteparse_markdown,
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

        cleaned_markdown, cleanup_notes = _clean_markdown(
            raw_markdown,
            preserve_layout_spacing=method == "liteparse",
        )
        if not cleaned_markdown:
            continue

        (
            score,
            quality,
            review_recommended,
            review_summary,
            review_focus,
            stats,
        ) = _score_candidate(
            cleaned_markdown,
            page_count=page_count,
            file_size_mb=file_size_mb,
        )
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


def _compute_recommendation(
    quality: str,
    word_count: int,
    visual_heaviness: float,
    image_count: int,
    sparse_table_count: int,
    file_size_mb: float,
    page_count: int,
    ocr_skipped: bool,
) -> str:
    if word_count < 500 and file_size_mb > 5.0:
        return (
            "Very low word count for file size: content is likely in images or charts. "
            "Manual review recommended before ingesting."
        )

    if visual_heaviness > 0.005:
        if ocr_skipped:
            pages_label = f"{page_count}+ pages" if page_count > 0 else f"{file_size_mb:.0f}MB"
            return (
                f"Visual-heavy PDF ({pages_label}): OCR skipped in auto mode. "
                "Charts and graphs not captured; text narrative extracted. "
                "Use method=docling_ocr directly if full OCR is needed."
            )
        return (
            "Visual-heavy PDF: charts and graphs likely not fully captured. "
            "Text narrative extracted. Curator note recommended for visual content."
        )

    if image_count > 0 or sparse_table_count > 0:
        return (
            "Mixed-content PDF: text narrative captured. "
            "Charts and visual elements noted as placeholders. "
            "Curator note recommended to document visual evidence."
        )

    if quality == "high":
        return "Likely ready for ingestion after a quick skim."
    if quality == "medium":
        return "Skim before pushing to Convex."
    return "Review recommended: extraction quality is low."


def _build_parser_decision_note(
    *,
    requested_method: str,
    best_candidate: ExtractionCandidate,
    candidates: list[ExtractionCandidate],
    ocr_skipped: bool,
) -> str:
    if requested_method != "auto":
        return f"Used requested parser '{best_candidate.method}'."

    by_method = {candidate.method: candidate for candidate in candidates}

    if best_candidate.method == "liteparse":
        if len(candidates) == 1:
            return "Auto accepted LiteParse because quality was sufficient without running slower parsers."
        return (
            "Auto selected LiteParse after comparison because it had the strongest "
            f"score ({best_candidate.quality_score}/100)."
        )

    if best_candidate.method == "docling":
        liteparse = by_method.get("liteparse")
        if liteparse:
            academic_signals = int(liteparse.stats.get("academicSignalCount", 0))
            table_refs = int(liteparse.stats.get("tableFigureReferenceCount", 0))
            table_count = int(liteparse.stats.get("tableCount", 0))
            math_symbols = int(liteparse.stats.get("mathSymbolCount", 0))
            signal_bits: list[str] = []
            if academic_signals >= 3:
                signal_bits.append(f"{academic_signals} academic signals")
            if table_count > 0 or table_refs >= 3:
                signal_bits.append(f"{table_count} tables and {table_refs} table/figure references")
            if math_symbols >= 8:
                signal_bits.append(f"{math_symbols} math symbols")

            signal_summary = ", ".join(signal_bits) or "academic/table-heavy signals"
            return (
                "Auto compared Docling because LiteParse looked academic/table-heavy "
                f"({signal_summary}). Selected Docling because it scored "
                f"{best_candidate.quality_score}/100 versus LiteParse "
                f"{liteparse.quality_score}/100."
            )

        return (
            "Auto selected Docling because earlier parsers did not produce a stronger "
            f"candidate; Docling scored {best_candidate.quality_score}/100."
        )

    if best_candidate.method == "docling_ocr":
        liteparse = by_method.get("liteparse")
        docling = by_method.get("docling")
        prior_scores = ", ".join(
            f"{candidate.method}:{candidate.quality_score}"
            for candidate in candidates
            if candidate.method != "docling_ocr"
        )
        prior_detail = f" Earlier parser scores were {prior_scores}." if prior_scores else ""
        coverage_detail = ""
        for candidate in (liteparse, docling):
            if candidate and "low extraction coverage" in candidate.review_focus:
                coverage_detail = " Earlier parsers showed low extraction coverage."
                break
        return (
            "Auto selected Docling OCR because non-OCR extraction did not produce a "
            f"sufficiently strong candidate; OCR scored {best_candidate.quality_score}/100."
            f"{coverage_detail}{prior_detail}"
        )

    if best_candidate.method == "pypdf":
        if ocr_skipped:
            return (
                "Auto selected pypdf as an emergency fallback after stronger parsers "
                "failed or scored low; OCR was skipped by page-count or file-size gates."
            )
        return (
            "Auto selected pypdf as an emergency fallback after stronger parsers "
            "failed or scored low."
        )

    return f"Auto selected {best_candidate.method}."


def main() -> int:
    if len(sys.argv) not in {2, 3}:
        print(
            "Usage: python3 mcp/scripts/extract_pdf.py /absolute/path/to/file.pdf [auto|liteparse|pypdf|docling|docling_ocr]",
            file=sys.stderr,
        )
        return 1

    pdf_path = Path(sys.argv[1]).expanduser()
    requested_method = sys.argv[2].strip().lower() if len(sys.argv) == 3 else "auto"
    if requested_method not in {"auto", "liteparse", "pypdf", "docling", "docling_ocr"}:
        print(
            "Error: method must be one of auto, liteparse, pypdf, docling, or docling_ocr.",
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

    # For explicit single-method docling/docling_ocr calls, verify docling is
    # installed up-front so the error message is actionable.  For auto mode,
    # the adaptive chain handles a missing docling gracefully (falls back to
    # pypdf), so no early exit here.
    if requested_method in {"docling", "docling_ocr"}:
        try:
            import docling  # noqa: F401
        except Exception:
            print(
                "Error: Docling is not installed. Run: python3 -m pip install docling",
                file=sys.stderr,
            )
            return 1

    if requested_method == "liteparse" and not _find_lit_executable():
        try:
            import liteparse  # noqa: F401
        except Exception:
            print(
                "Error: LiteParse is not installed. Run: python3 -m pip install liteparse",
                file=sys.stderr,
            )
            return 1

    file_size_mb = pdf_path.stat().st_size / (1024 * 1024)
    page_count, has_significant_images = _get_pdf_info(pdf_path)

    try:
        if requested_method == "auto":
            candidates, ocr_skipped = _build_candidates_adaptive(
                pdf_path, file_size_mb, page_count, has_significant_images
            )
        else:
            ocr_skipped = False
            candidates = _build_candidates(
                pdf_path,
                [requested_method],
                page_count=page_count,
                file_size_mb=file_size_mb,
            )
    except Exception as exc:
        print(f"Error converting PDF: {exc}", file=sys.stderr)
        return 1

    if not candidates:
        if requested_method != "auto":
            print(
                "Error converting PDF: requested method "
                f"'{requested_method}' did not produce usable markdown. "
                "Try method='auto', 'liteparse', 'docling', or 'docling_ocr' for this file.",
                file=sys.stderr,
            )
            return 1
        print(
            "Error converting PDF: no extraction strategy produced usable markdown.",
            file=sys.stderr,
        )
        return 1

    best_candidate = _choose_best_candidate(candidates)
    word_count = int(best_candidate.stats.get("wordCount", 0))
    image_count = int(best_candidate.stats.get("imageCount", 0))
    sparse_table_count = int(best_candidate.stats.get("sparseTableCount", 0))
    visual_heaviness = round(file_size_mb / max(1, word_count), 4)
    extraction_failed = word_count < 500 and file_size_mb > 5.0
    recommendation = _compute_recommendation(
        quality=best_candidate.quality,
        word_count=word_count,
        visual_heaviness=visual_heaviness,
        image_count=image_count,
        sparse_table_count=sparse_table_count,
        file_size_mb=file_size_mb,
        page_count=page_count,
        ocr_skipped=ocr_skipped,
    )
    parser_decision_note = _build_parser_decision_note(
        requested_method=requested_method,
        best_candidate=best_candidate,
        candidates=candidates,
        ocr_skipped=ocr_skipped,
    )

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
    metadata["qualityStats"] = best_candidate.stats
    metadata["parserDecisionNote"] = parser_decision_note
    metadata["visualHeaviness"] = str(visual_heaviness)
    metadata["extractionFailed"] = "yes" if extraction_failed else "no"
    metadata["recommendation"] = recommendation
    print(json.dumps(metadata), file=sys.stderr)
    sys.stdout.write(best_candidate.markdown)
    if best_candidate.markdown and not best_candidate.markdown.endswith("\n"):
        sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
