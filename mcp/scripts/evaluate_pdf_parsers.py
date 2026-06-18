"""Compare Curate Mind PDF extraction methods without ingesting sources.

The script runs mcp/scripts/extract_pdf.py for each requested PDF/method,
writes side-by-side markdown outputs, and records lightweight quality/timing
metrics so parser changes can be evaluated on real project documents.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any


DEFAULT_METHODS = ["liteparse", "pypdf", "docling"]
QUALITY_RANK = {"low": 0, "medium": 1, "high": 2}


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run side-by-side PDF parser comparisons."
    )
    parser.add_argument(
        "pdfs",
        nargs="*",
        help="Absolute or relative PDF paths to evaluate.",
    )
    parser.add_argument(
        "--golden-config",
        help="JSON config with PDF paths and expected parser outcomes.",
    )
    parser.add_argument(
        "--check-expectations",
        action="store_true",
        help="Exit non-zero when golden-config expectations fail.",
    )
    parser.add_argument(
        "--methods",
        default=",".join(DEFAULT_METHODS),
        help="Comma-separated methods: liteparse,pypdf,docling,docling_ocr,auto",
    )
    parser.add_argument(
        "--out-dir",
        default="tmp/pdf-parser-eval",
        help="Directory for markdown outputs and summary files.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=300,
        help="Timeout in seconds for each method/PDF run.",
    )
    return parser.parse_args()


def _load_golden_config(path: str | None) -> dict[str, Any]:
    if not path:
        return {}

    config_path = Path(path).expanduser().resolve()
    parsed = json.loads(config_path.read_text(encoding="utf-8"))
    if not isinstance(parsed, dict):
        raise ValueError("Golden config must be a JSON object.")
    documents = parsed.get("documents")
    if not isinstance(documents, list) or not documents:
        raise ValueError("Golden config must include a non-empty documents array.")
    return parsed


def _documents_from_args(args: argparse.Namespace) -> list[dict[str, Any]]:
    config = _load_golden_config(args.golden_config)
    if config:
        docs: list[dict[str, Any]] = []
        base_dir = Path(args.golden_config).expanduser().resolve().parent
        for doc in config["documents"]:
            if not isinstance(doc, dict):
                raise ValueError("Each golden document must be an object.")
            path_value = doc.get("path")
            if not isinstance(path_value, str) or not path_value:
                raise ValueError("Each golden document must include a path.")
            path = Path(path_value).expanduser()
            if not path.is_absolute():
                path = (base_dir / path).resolve()
            docs.append({**doc, "path": str(path)})
        return docs

    if not args.pdfs:
        raise ValueError("Provide PDF paths or --golden-config.")

    return [{"id": Path(pdf).stem, "path": pdf} for pdf in args.pdfs]


def _metadata_from_stderr(stderr: str) -> dict[str, Any]:
    for line in reversed([line.strip() for line in stderr.splitlines() if line.strip()]):
        try:
            parsed = json.loads(line)
        except Exception:
            continue
        if isinstance(parsed, dict):
            return parsed
    return {}


def _word_count(text: str) -> int:
    return len(re.findall(r"\b[\w'-]+\b", text))


def _slug(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-")
    return cleaned or "pdf"


def _run_method(
    *,
    extractor: Path,
    pdf_path: Path,
    method: str,
    output_dir: Path,
    timeout: int,
    document: dict[str, Any],
) -> dict[str, Any]:
    started = time.perf_counter()
    completed = subprocess.run(
        [sys.executable, str(extractor), str(pdf_path), method],
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )
    elapsed = round(time.perf_counter() - started, 2)
    metadata = _metadata_from_stderr(completed.stderr)
    quality_stats = metadata.get("qualityStats")
    if not isinstance(quality_stats, dict):
        quality_stats = {}
    markdown = completed.stdout.strip()

    method_output = output_dir / f"{method}.md"
    if markdown:
        method_output.write_text(markdown + "\n", encoding="utf-8")

    return {
        "id": document.get("id") or pdf_path.stem,
        "category": document.get("category"),
        "pdf": str(pdf_path),
        "method": method,
        "ok": completed.returncode == 0 and bool(markdown),
        "seconds": elapsed,
        "wordCount": _word_count(markdown),
        "charCount": len(markdown),
        "quality": metadata.get("quality"),
        "qualityScore": metadata.get("qualityScore"),
        "wordsPerPage": quality_stats.get("wordsPerPage"),
        "letterSpacedRuns": quality_stats.get("letterSpacedRuns"),
        "shortLineRatio": quality_stats.get("shortLineRatio"),
        "extractionMethod": metadata.get("extractionMethod"),
        "reviewFocus": metadata.get("reviewFocus"),
        "recommendation": metadata.get("recommendation"),
        "qualityStats": quality_stats,
        "expectations": document.get("expectations") or {},
        "output": str(method_output) if markdown else None,
        "error": completed.stderr.strip() if completed.returncode != 0 else None,
    }


def _write_summary(
    output_root: Path,
    rows: list[dict[str, Any]],
    expectation_results: list[dict[str, Any]],
) -> None:
    (output_root / "summary.json").write_text(
        json.dumps(rows, indent=2) + "\n",
        encoding="utf-8",
    )

    lines = [
        "# PDF Parser Eval Summary",
        "",
        "| ID | PDF | Method | OK | Seconds | Words | Words/page | Quality | Score | Review focus |",
        "| --- | --- | --- | --- | ---: | ---: | ---: | --- | ---: | --- |",
    ]
    for row in rows:
        pdf_label = Path(row["pdf"]).name
        lines.append(
            "| "
            + " | ".join(
                [
                    str(row.get("id") or ""),
                    pdf_label,
                    row["method"],
                    "yes" if row["ok"] else "no",
                    str(row["seconds"]),
                    str(row["wordCount"]),
                    str(row.get("wordsPerPage") or ""),
                    str(row.get("quality") or ""),
                    str(row.get("qualityScore") or ""),
                    str(row.get("reviewFocus") or ""),
                ]
            )
            + " |"
        )

    if expectation_results:
        passed = sum(1 for result in expectation_results if result["ok"])
        failed = len(expectation_results) - passed
        lines.extend(
            [
                "",
                "## Expectation Checks",
                "",
                f"Passed: {passed}. Failed: {failed}.",
                "",
                "| ID | Check | OK | Detail |",
                "| --- | --- | --- | --- |",
            ]
        )
        for result in expectation_results:
            lines.append(
                "| "
                + " | ".join(
                    [
                        str(result["id"]),
                        str(result["check"]),
                        "yes" if result["ok"] else "no",
                        str(result["detail"]).replace("|", "\\|"),
                    ]
                )
                + " |"
            )

    (output_root / "summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def _check_expectations(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_doc: dict[str, dict[str, dict[str, Any]]] = {}
    expectations_by_doc: dict[str, dict[str, Any]] = {}

    for row in rows:
        doc_id = str(row.get("id") or Path(row["pdf"]).stem)
        by_doc.setdefault(doc_id, {})[row["method"]] = row
        expectations_by_doc.setdefault(doc_id, row.get("expectations") or {})

    results: list[dict[str, Any]] = []
    for doc_id, expectations in expectations_by_doc.items():
        if not expectations:
            continue
        rows_by_method = by_doc.get(doc_id, {})
        auto_row = rows_by_method.get("auto")
        auto_expectations = expectations.get("auto") or {}
        if isinstance(auto_expectations, dict) and auto_expectations:
            expected_method = auto_expectations.get("extractionMethod")
            if expected_method:
                actual = auto_row.get("extractionMethod") if auto_row else None
                _append_check(
                    results,
                    doc_id,
                    "auto.extractionMethod",
                    actual == expected_method,
                    f"expected {expected_method}, got {actual}",
                )

            min_quality = auto_expectations.get("minQuality")
            if min_quality:
                actual_quality = auto_row.get("quality") if auto_row else None
                _append_check(
                    results,
                    doc_id,
                    "auto.minQuality",
                    _quality_at_least(actual_quality, min_quality),
                    f"expected >= {min_quality}, got {actual_quality}",
                )

            min_words_per_page = auto_expectations.get("minWordsPerPage")
            if min_words_per_page is not None:
                actual_words_per_page = auto_row.get("wordsPerPage") if auto_row else None
                _append_check(
                    results,
                    doc_id,
                    "auto.minWordsPerPage",
                    _number_at_least(actual_words_per_page, min_words_per_page),
                    f"expected >= {min_words_per_page}, got {actual_words_per_page}",
                )

        method_expectations = expectations.get("methods") or {}
        if isinstance(method_expectations, dict):
            for method, checks in method_expectations.items():
                if not isinstance(checks, dict):
                    continue
                row = rows_by_method.get(method)

                expected_ok = checks.get("ok")
                if expected_ok is not None:
                    actual_ok = bool(row and row.get("ok"))
                    _append_check(
                        results,
                        doc_id,
                        f"{method}.ok",
                        actual_ok is bool(expected_ok),
                        f"expected {bool(expected_ok)}, got {actual_ok}",
                    )

                max_quality = checks.get("maxQuality")
                if max_quality:
                    actual_quality = row.get("quality") if row else None
                    _append_check(
                        results,
                        doc_id,
                        f"{method}.maxQuality",
                        _quality_at_most(actual_quality, max_quality),
                        f"expected <= {max_quality}, got {actual_quality}",
                    )

                min_quality = checks.get("minQuality")
                if min_quality:
                    actual_quality = row.get("quality") if row else None
                    _append_check(
                        results,
                        doc_id,
                        f"{method}.minQuality",
                        _quality_at_least(actual_quality, min_quality),
                        f"expected >= {min_quality}, got {actual_quality}",
                    )

        score_checks = expectations.get("scoreAtLeast") or []
        if isinstance(score_checks, list):
            for check in score_checks:
                if not isinstance(check, dict):
                    continue
                left = rows_by_method.get(str(check.get("left")))
                right = rows_by_method.get(str(check.get("right")))
                margin = int(check.get("margin", 0))
                left_score = _score_value(left)
                right_score = _score_value(right)
                ok = left_score >= right_score + margin
                _append_check(
                    results,
                    doc_id,
                    "scoreAtLeast",
                    ok,
                    f"{check.get('left')} {left_score} >= {check.get('right')} {right_score} + {margin}",
                )

    return results


def _append_check(
    results: list[dict[str, Any]],
    doc_id: str,
    check: str,
    ok: bool,
    detail: str,
) -> None:
    results.append({"id": doc_id, "check": check, "ok": ok, "detail": detail})


def _quality_at_least(actual: Any, expected_min: Any) -> bool:
    if actual not in QUALITY_RANK or expected_min not in QUALITY_RANK:
        return False
    return QUALITY_RANK[str(actual)] >= QUALITY_RANK[str(expected_min)]


def _quality_at_most(actual: Any, expected_max: Any) -> bool:
    if actual not in QUALITY_RANK or expected_max not in QUALITY_RANK:
        return False
    return QUALITY_RANK[str(actual)] <= QUALITY_RANK[str(expected_max)]


def _number_at_least(actual: Any, expected_min: Any) -> bool:
    try:
        return float(actual) >= float(expected_min)
    except Exception:
        return False


def _score_value(row: dict[str, Any] | None) -> int:
    if not row:
        return -1
    try:
        return int(row.get("qualityScore") or -1)
    except Exception:
        return -1


def main() -> int:
    args = _parse_args()
    try:
        documents = _documents_from_args(args)
    except Exception as exc:
        print(f"Error loading eval documents: {exc}", file=sys.stderr)
        return 1

    methods = [method.strip() for method in args.methods.split(",") if method.strip()]
    allowed = {"auto", "liteparse", "pypdf", "docling", "docling_ocr"}
    invalid = sorted(set(methods) - allowed)
    if invalid:
        print(f"Invalid methods: {', '.join(invalid)}", file=sys.stderr)
        return 1

    script_dir = Path(__file__).resolve().parent
    extractor = script_dir / "extract_pdf.py"
    output_root = (
        Path(args.out_dir)
        / datetime.now().strftime("%Y%m%d-%H%M%S")
    ).resolve()
    output_root.mkdir(parents=True, exist_ok=True)

    rows: list[dict[str, Any]] = []
    for document in documents:
        pdf_path = Path(str(document["path"])).expanduser().resolve()
        if not pdf_path.exists():
            rows.append({
                "id": document.get("id") or pdf_path.stem,
                "category": document.get("category"),
                "pdf": str(pdf_path),
                "method": "n/a",
                "ok": False,
                "seconds": 0,
                "wordCount": 0,
                "charCount": 0,
                "expectations": document.get("expectations") or {},
                "error": "PDF not found",
            })
            continue

        pdf_output_dir = output_root / _slug(pdf_path.stem)
        pdf_output_dir.mkdir(parents=True, exist_ok=True)
        for method in methods:
            try:
                rows.append(
                    _run_method(
                        extractor=extractor,
                        pdf_path=pdf_path,
                        method=method,
                        output_dir=pdf_output_dir,
                        timeout=args.timeout,
                        document=document,
                    )
                )
            except subprocess.TimeoutExpired:
                rows.append({
                    "id": document.get("id") or pdf_path.stem,
                    "category": document.get("category"),
                    "pdf": str(pdf_path),
                    "method": method,
                    "ok": False,
                    "seconds": args.timeout,
                    "wordCount": 0,
                    "charCount": 0,
                    "expectations": document.get("expectations") or {},
                    "error": f"Timed out after {args.timeout}s",
                })

    expectation_results = _check_expectations(rows)
    _write_summary(output_root, rows, expectation_results)
    print(f"Wrote parser eval outputs to: {output_root}")
    print(f"Summary: {output_root / 'summary.md'}")
    failed = [result for result in expectation_results if not result["ok"]]
    if failed and args.check_expectations:
        print(f"Expectation checks failed: {len(failed)}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
