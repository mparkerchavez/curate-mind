"""Smoke tests for PDF extraction quality scoring heuristics.

These tests use small synthetic markdown samples so parser-quality regressions
can be caught without running slow PDF conversions.
"""

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path
from typing import Any


def _load_extract_pdf_module() -> Any:
    module_path = Path(__file__).with_name("extract_pdf.py")
    spec = importlib.util.spec_from_file_location("extract_pdf", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load {module_path}")

    module = importlib.util.module_from_spec(spec)
    sys.modules["extract_pdf"] = module
    spec.loader.exec_module(module)
    return module


extract_pdf = _load_extract_pdf_module()


class PdfScoringTests(unittest.TestCase):
    def score(
        self,
        markdown: str,
        *,
        page_count: int = 6,
        file_size_mb: float = 1.0,
    ) -> tuple[int, str, list[str], dict[str, float | int]]:
        score, quality, _review, _summary, focus, stats = extract_pdf._score_candidate(
            markdown,
            page_count=page_count,
            file_size_mb=file_size_mb,
        )
        return score, quality, focus, stats

    def test_clean_structured_markdown_scores_high(self) -> None:
        paragraphs = [
            (
                "This report explains how teams adopted AI systems with clear operating "
                f"models, measurable workflow changes, and governance practice {index}. "
            )
            for index in range(75)
        ]
        markdown = (
            "# Report\n\n## Executive Summary\n\n"
            + " ".join(paragraphs[:25])
            + "\n\n## Findings\n\n"
            + " ".join(paragraphs[25:50])
            + "\n\n## Implications\n\n"
            + " ".join(paragraphs[50:])
        )

        score, quality, focus, stats = self.score(markdown, page_count=4)

        self.assertEqual(quality, "high")
        self.assertGreaterEqual(score, 85)
        self.assertEqual(focus, [])
        self.assertGreater(stats["markdownHeadingCount"], 0)

    def test_low_page_density_is_low_coverage(self) -> None:
        markdown = "# Thin Extract\n\n" + "Only a tiny amount of text was extracted. " * 20

        score, quality, focus, stats = self.score(
            markdown,
            page_count=30,
            file_size_mb=8.0,
        )

        self.assertEqual(quality, "low")
        self.assertLess(score, 55)
        self.assertIn("low extraction coverage", focus)
        self.assertLess(stats["wordsPerPage"], 80)

    def test_letter_spaced_output_is_flagged_as_garbled(self) -> None:
        artifact = "S u r v e y f i e l d e d a c r o s s M a r k e t t e a m s. "
        markdown = "# Garbled Extract\n\n" + "\n".join([artifact] * 120)

        score, quality, focus, stats = self.score(markdown, page_count=3)

        self.assertEqual(quality, "low")
        self.assertLess(score, 55)
        self.assertIn("text artifacts", focus)
        self.assertIn("possible garbled text", focus)
        self.assertGreater(stats["letterSpacedRuns"], 10)
        self.assertGreater(stats["singleLetterWordRatio"], 0.05)

    def test_flattened_long_text_is_penalized(self) -> None:
        paragraph = (
            "The source includes useful narrative, but this extracted version has no "
            "section headings, table structure, or page boundaries for the curator to skim. "
        )
        markdown = paragraph * 90

        score, quality, focus, stats = self.score(markdown, page_count=8)

        self.assertLess(score, 85)
        self.assertIn("flattened structure", focus)
        self.assertEqual(stats["markdownHeadingCount"], 0)

    def test_sparse_tables_are_review_focus(self) -> None:
        markdown = """
# Chart Report

## Results

| Metric | Q1 | Q2 | Q3 |
| --- | --- | --- | --- |
|  | 12% |  | 9% |
| + |  | - |  |

The narrative text around the chart is readable and should still be reviewed.
""" + "The report explains the implications for operators and researchers. " * 40

        _score, _quality, focus, stats = self.score(markdown, page_count=4)

        self.assertIn("tables/charts", focus)
        self.assertGreaterEqual(stats["sparseTableCount"], 1)

    def test_academic_markdown_recommends_docling_comparison(self) -> None:
        markdown = """
# The AI Layoff Trap

## Abstract

This paper studies automation incentives in a competitive task-based model.
Keywords: artificial intelligence, automation, labor displacement.

## 1 Introduction

Acemoglu and Restrepo (2018) provide the baseline task model. Autor et al. (2024)
study displacement patterns, while Brynjolfsson et al. (2025a) examine early labor
market impacts.

## 3 Equilibrium

Proposition 1 shows that each firm chooses an automation rate above the cooperative
optimum. Table 1 reports equilibrium wedges and Figure 2 illustrates the result.

| N | alpha | welfare |
| --- | --- | --- |
| 2 | 0.4 | 10 |
| 4 | 0.7 | 8 |

## References

Acemoglu, D. and Restrepo, P. (2018). Artificial intelligence, automation and work.
""" + "The model uses lambda, alpha, and summation notation throughout. " * 40

        _score, _quality, _focus, stats = self.score(markdown, page_count=8)

        self.assertGreaterEqual(stats["academicSignalCount"], 3)
        self.assertTrue(extract_pdf._should_compare_docling(markdown, stats))

    def test_plain_report_does_not_recommend_docling_comparison(self) -> None:
        markdown = """
# Business Spending Report

## Overview

This report summarizes spending patterns across software, travel, payroll, and
professional services categories.

## Findings

Teams increased software purchasing while reducing office expenses. The report
contains narrative findings but no academic apparatus.
""" + "Operators used the findings to compare budgeting pressure across teams. " * 80

        _score, quality, _focus, stats = self.score(markdown, page_count=6)

        self.assertIn(quality, {"medium", "high"})
        self.assertLess(stats["academicSignalCount"], 3)
        self.assertFalse(extract_pdf._should_compare_docling(markdown, stats))


if __name__ == "__main__":
    unittest.main()
