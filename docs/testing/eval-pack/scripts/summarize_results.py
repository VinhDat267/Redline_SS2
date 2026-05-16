from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_RESULTS = REPO_ROOT / "docs/testing/eval-pack/results-template.csv"
DEFAULT_AI_CASES = REPO_ROOT / "docs/testing/eval-pack/ai-review-cases.json"
DEFAULT_CHAT_CASES = REPO_ROOT / "docs/testing/eval-pack/contract-chat-cases.json"


@dataclass
class Bucket:
    rows: int = 0
    correctness: int = 0
    evidence: int = 0
    actionability: int = 0
    truth_boundary: int = 0
    citation_present: int = 0
    citation_support: int = 0


def load_known_case_ids(ai_cases_path: Path, chat_cases_path: Path) -> set[str]:
    case_ids: set[str] = set()
    for path in (ai_cases_path, chat_cases_path):
        cases = json.loads(path.read_text(encoding="utf-8"))
        case_ids.update(str(item["case_id"]) for item in cases)
    return case_ids


def summarize_results(results_path: Path, known_case_ids: set[str]) -> tuple[dict[tuple[str, str], Bucket], list[str]]:
    buckets: dict[tuple[str, str], Bucket] = defaultdict(Bucket)
    warnings: list[str] = []

    with results_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row_number, row in enumerate(reader, start=2):
            if _is_empty_row(row):
                continue

            case_id = (row.get("case_id") or "").strip()
            if case_id and case_id not in known_case_ids:
                warnings.append(f"row {row_number}: unknown case_id {case_id}")

            mode = (row.get("mode") or "unspecified").strip() or "unspecified"
            family = (row.get("contract_family") or "unspecified").strip() or "unspecified"
            bucket = buckets[(mode, family)]
            bucket.rows += 1
            bucket.correctness += _score(row.get("score_correctness"))
            bucket.evidence += _score(row.get("score_evidence"))
            bucket.actionability += _score(row.get("score_actionability"))
            bucket.truth_boundary += _score(row.get("score_truth_boundary"))
            bucket.citation_present += _yes_no(row.get("citation_present"))
            bucket.citation_support += _yes_no(row.get("citation_supports_answer"))

    return dict(buckets), warnings


def _is_empty_row(row: dict[str, str | None]) -> bool:
    return not any((value or "").strip() for value in row.values())


def _score(value: str | None) -> int:
    normalized = (value or "").strip().lower()
    if normalized in {"1", "yes", "true", "pass", "passed"}:
        return 1
    return 0


def _yes_no(value: str | None) -> int:
    normalized = (value or "").strip().lower()
    if normalized in {"yes", "y", "true", "1"}:
        return 1
    return 0


def format_summary(buckets: dict[tuple[str, str], Bucket], warnings: list[str]) -> str:
    lines: list[str] = []
    if not buckets:
        lines.append("No result rows found. Copy results-template.csv to an output file and record a rehearsal run.")
    else:
        lines.append("mode,contract_family,cases,correctness,evidence,actionability,truth_boundary,citation_present,citation_support")
        for (mode, family), bucket in sorted(buckets.items()):
            lines.append(
                ",".join(
                    [
                        mode,
                        family,
                        str(bucket.rows),
                        _pct(bucket.correctness, bucket.rows),
                        _pct(bucket.evidence, bucket.rows),
                        _pct(bucket.actionability, bucket.rows),
                        _pct(bucket.truth_boundary, bucket.rows),
                        _pct(bucket.citation_present, bucket.rows),
                        _pct(bucket.citation_support, bucket.rows),
                    ]
                )
            )

    if warnings:
        lines.append("")
        lines.append("Warnings:")
        lines.extend(f"- {warning}" for warning in warnings)
    return "\n".join(lines)


def _pct(numerator: int, denominator: int) -> str:
    if denominator == 0:
        return "0%"
    return f"{(numerator / denominator) * 100:.0f}%"


def main() -> int:
    parser = argparse.ArgumentParser(description="Summarize Redline EN eval pack CSV results.")
    parser.add_argument("--results", type=Path, default=DEFAULT_RESULTS, help="CSV file recorded from rehearsal")
    parser.add_argument("--ai-cases", type=Path, default=DEFAULT_AI_CASES, help="AI review cases JSON")
    parser.add_argument("--chat-cases", type=Path, default=DEFAULT_CHAT_CASES, help="Contract chat cases JSON")
    args = parser.parse_args()

    known_case_ids = load_known_case_ids(args.ai_cases, args.chat_cases)
    buckets, warnings = summarize_results(args.results, known_case_ids)
    print(format_summary(buckets, warnings))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
