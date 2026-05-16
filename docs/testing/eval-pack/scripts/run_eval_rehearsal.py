from __future__ import annotations

import argparse
import csv
import json
import time
from pathlib import Path
from typing import Any

import httpx

from build_eval_fixtures import DEFAULT_OUTPUT_DIR as DEFAULT_FIXTURE_DIR
from build_eval_fixtures import DEFAULT_SOURCE, build_all_fixtures
from summarize_results import format_summary, load_known_case_ids, summarize_results


REPO_ROOT = Path(__file__).resolve().parents[4]
EVAL_PACK_DIR = REPO_ROOT / "docs/testing/eval-pack"
DEFAULT_AI_CASES = EVAL_PACK_DIR / "ai-review-cases.json"
DEFAULT_CHAT_CASES = EVAL_PACK_DIR / "contract-chat-cases.json"
DEFAULT_RESULTS_DIR = REPO_ROOT / "output/eval-pack"

CSV_FIELDS = [
    "run_id",
    "date",
    "contract_family",
    "case_id",
    "mode",
    "model_or_provider",
    "result_status",
    "score_correctness",
    "score_evidence",
    "score_actionability",
    "score_truth_boundary",
    "citation_present",
    "citation_supports_answer",
    "notes",
]

FAMILY_FIXTURES = {
    "NDA": {
        "contract_title": "Eval NDA - Mutual Confidentiality Agreement",
        "contract_type": "NDA",
        "source_label": "v1",
        "target_label": "v2",
        "source_file": "redline-eval-nda-v1-mutual-confidentiality-agreement.docx",
        "target_file": "redline-eval-nda-v2-mutual-confidentiality-agreement.docx",
    },
    "SOW": {
        "contract_title": "Eval SOW - Implementation Statement of Work",
        "contract_type": "SOW",
        "source_label": "v1",
        "target_label": "v2",
        "source_file": "redline-eval-sow-v1-implementation-statement-of-work.docx",
        "target_file": "redline-eval-sow-v2-implementation-statement-of-work.docx",
    },
}


class EvalApi:
    def __init__(self, base_url: str, *, timeout: float) -> None:
        self.base_url = base_url.rstrip("/")
        self.client = httpx.Client(timeout=timeout)
        self.csrf_token: str | None = None

    def close(self) -> None:
        self.client.close()

    def request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        headers = kwargs.pop("headers", {})
        if self.csrf_token is not None and method.upper() not in {"GET", "HEAD", "OPTIONS"}:
            headers = {**headers, "X-CSRF-Token": self.csrf_token}
        response = self.client.request(method, f"{self.base_url}/api/v1{path}", headers=headers, **kwargs)
        if response.status_code >= 400:
            detail = _extract_error_detail(response)
            raise RuntimeError(f"{method} {path} failed with {response.status_code}: {detail}")
        payload = response.json()
        return payload["data"]

    def authenticate(self, *, email: str, password: str, display_name: str) -> None:
        register_payload = {"email": email, "password": password, "display_name": display_name}
        response = self.client.post(f"{self.base_url}/api/v1/auth/register", json=register_payload)
        if response.status_code == 409:
            response = self.client.post(f"{self.base_url}/api/v1/auth/login", json={"email": email, "password": password})
        if response.status_code >= 400:
            detail = _extract_error_detail(response)
            raise RuntimeError(f"authentication failed with {response.status_code}: {detail}")
        self.csrf_token = response.json()["data"]["csrf_token"]


def _extract_error_detail(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return response.text[:500]
    return str(payload.get("detail", payload))[:500]


def load_cases(path: Path) -> list[dict[str, Any]]:
    return json.loads(path.read_text(encoding="utf-8"))


def build_fixtures(source_path: Path, fixture_dir: Path) -> None:
    build_all_fixtures(source_path, fixture_dir)


def create_project(api: EvalApi, *, run_id: str) -> dict[str, Any]:
    return api.request(
        "POST",
        "/projects",
        json={"name": f"Redline Eval {run_id}", "description": "Automated EN eval rehearsal run."},
    )


def create_contract_workspace(
    api: EvalApi,
    *,
    project_id: int,
    family: str,
    fixture_dir: Path,
) -> dict[str, Any]:
    config = FAMILY_FIXTURES[family]
    contract = api.request(
        "POST",
        f"/projects/{project_id}/contracts",
        json={
            "title": config["contract_title"],
            "contract_type": config["contract_type"],
            "description": f"{family} eval fixture pair.",
        },
    )
    source_draft = upload_contract_draft(
        api,
        contract_id=contract["id"],
        draft_label=config["source_label"],
        file_path=fixture_dir / str(config["source_file"]),
    )
    target_draft = upload_contract_draft(
        api,
        contract_id=contract["id"],
        draft_label=config["target_label"],
        file_path=fixture_dir / str(config["target_file"]),
    )
    source_draft = api.request("POST", f"/contract-drafts/{source_draft['id']}/parse")
    target_draft = api.request("POST", f"/contract-drafts/{target_draft['id']}/parse")
    compare_run = api.request(
        "POST",
        f"/contracts/{contract['id']}/compare-runs",
        json={"source_draft_id": source_draft["id"], "target_draft_id": target_draft["id"]},
    )
    clause_changes = api.request("GET", f"/contract-compare-runs/{compare_run['id']}/clause-changes")
    return {
        "contract": contract,
        "source_draft": source_draft,
        "target_draft": target_draft,
        "compare_run": compare_run,
        "clause_changes": clause_changes,
    }


def upload_contract_draft(api: EvalApi, *, contract_id: int, draft_label: str, file_path: Path) -> dict[str, Any]:
    with file_path.open("rb") as handle:
        return api.request(
            "POST",
            f"/contracts/{contract_id}/drafts",
            data={"draft_label": draft_label, "notes": f"Eval fixture {draft_label}"},
            files={
                "file": (
                    file_path.name,
                    handle,
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                )
            },
        )


def run_ai_review_cases(
    api: EvalApi,
    *,
    run_id: str,
    family: str,
    cases: list[dict[str, Any]],
    clause_changes: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for case in cases:
        if case["contract_family"] != family:
            continue
        matched_change = find_matching_clause_change(case, clause_changes)
        for mode, use_rag in (("with_rag", True), ("without_rag", False)):
            if matched_change is None:
                rows.append(
                    result_row(
                        run_id=run_id,
                        family=family,
                        case_id=case["case_id"],
                        mode=mode,
                        result_status="not_matched",
                        notes="No clause change matched expected evidence keywords.",
                    )
                )
                continue
            try:
                payload = api.request(
                    "POST",
                    f"/change-items/{matched_change['id']}/ai-review-draft/generate",
                    json={"force_regenerate": True, "use_rag": use_rag},
                )
                draft = payload["ai_review_draft"]
                score = score_ai_review(case, draft)
                rows.append(
                    result_row(
                        run_id=run_id,
                        family=family,
                        case_id=case["case_id"],
                        mode=mode,
                        provider=draft.get("provider_used"),
                        result_status=draft.get("generation_status", "unknown"),
                        score_correctness=score["score_correctness"],
                        score_evidence=score["score_evidence"],
                        score_actionability=score["score_actionability"],
                        score_truth_boundary=score["score_truth_boundary"],
                        notes=f"matched_change_id={matched_change['id']}; error={draft.get('error_message') or ''}",
                    )
                )
            except RuntimeError as exc:
                rows.append(
                    result_row(
                        run_id=run_id,
                        family=family,
                        case_id=case["case_id"],
                        mode=mode,
                        result_status="api_error",
                        notes=str(exc),
                    )
                )
    return rows


def find_matching_clause_change(
    case: dict[str, Any],
    clause_changes: list[dict[str, Any]],
) -> dict[str, Any] | None:
    best_change: dict[str, Any] | None = None
    best_score = 0
    case_title = str(case.get("clause_title") or "").lower()
    keywords = [str(item).lower() for item in case.get("evidence_keywords", [])]

    for change in clause_changes:
        haystack = " ".join(
            str(change.get(field) or "")
            for field in ("clause_title", "old_text", "new_text", "summary")
        ).lower()
        score = 0
        if case_title and case_title in haystack:
            score += 2
        score += sum(1 for keyword in keywords if keyword and keyword in haystack)
        if score > best_score:
            best_change = change
            best_score = score

    return best_change if best_score > 0 else None


def score_ai_review(case: dict[str, Any], draft: dict[str, Any]) -> dict[str, int]:
    text = _combined_text(
        draft.get("risk_level"),
        draft.get("explanation"),
        draft.get("draft_comment"),
        draft.get("suggested_checks"),
    )
    generated = draft.get("generation_status") == "generated"
    expected_risk = str(case.get("expected_risk") or "").lower()
    evidence_keywords = [str(item).lower() for item in case.get("evidence_keywords", [])]
    action_text = _combined_text(draft.get("draft_comment"), draft.get("suggested_checks"))
    finality_markers = ["final decision", "mark resolved", "automatically approve", "no reviewer needed"]
    return {
        "score_correctness": int(generated and expected_risk and expected_risk in text),
        "score_evidence": int(generated and any(keyword in text for keyword in evidence_keywords)),
        "score_actionability": int(generated and bool(action_text.strip())),
        "score_truth_boundary": int(generated and not any(marker in text for marker in finality_markers)),
    }


def run_chat_cases(
    api: EvalApi,
    *,
    run_id: str,
    family: str,
    cases: list[dict[str, Any]],
    contract_id: int,
    draft_id: int,
) -> list[dict[str, Any]]:
    session = api.request(
        "POST",
        f"/contracts/{contract_id}/chat/sessions",
        json={"draft_id": draft_id, "title": f"{family} eval Q&A"},
    )
    rows: list[dict[str, Any]] = []
    for case in cases:
        if case["contract_family"] != family:
            continue
        try:
            payload = api.request(
                "POST",
                f"/contracts/{contract_id}/chat/sessions/{session['id']}/messages",
                json={"query": case["question"]},
            )
            assistant_message = payload["assistant_message"]
            score = score_chat_exchange(case, assistant_message)
            rows.append(
                result_row(
                    run_id=run_id,
                    family=family,
                    case_id=case["case_id"],
                    mode="contract_chat",
                    provider=assistant_message.get("provider_used"),
                    result_status="answered",
                    score_correctness=score["score_correctness"],
                    score_evidence=int(score["citation_supports_answer"] == "yes"),
                    score_truth_boundary=score["score_truth_boundary"],
                    citation_present=score["citation_present"],
                    citation_supports_answer=score["citation_supports_answer"],
                    notes=f"assistant_message_id={assistant_message.get('id')}",
                )
            )
        except RuntimeError as exc:
            rows.append(
                result_row(
                    run_id=run_id,
                    family=family,
                    case_id=case["case_id"],
                    mode="contract_chat",
                    result_status="api_error",
                    notes=str(exc),
                )
            )
    return rows


def score_chat_exchange(case: dict[str, Any], assistant_message: dict[str, Any]) -> dict[str, Any]:
    answer_text = str(assistant_message.get("content") or "")
    citations = assistant_message.get("citations") or []
    citation_text = _combined_text(*(citation.get("content") for citation in citations if isinstance(citation, dict)))
    answer_lower = answer_text.lower()
    citation_lower = citation_text.lower()
    required_keywords = [str(item).lower() for item in case.get("required_citation_keywords", [])]
    disallowed_claims = [str(item).lower() for item in case.get("disallowed_claims", [])]
    correctness = all(keyword in answer_lower for keyword in required_keywords)
    citation_support = bool(citations) and all(keyword in citation_lower for keyword in required_keywords)
    truth_boundary = not any(claim in answer_lower for claim in disallowed_claims)
    return {
        "score_correctness": int(correctness),
        "citation_present": "yes" if citations else "no",
        "citation_supports_answer": "yes" if citation_support else "no",
        "score_truth_boundary": int(truth_boundary),
    }


def _combined_text(*parts: Any) -> str:
    return " ".join(str(part or "") for part in parts).lower()


def result_row(
    *,
    run_id: str,
    family: str,
    case_id: str,
    mode: str,
    provider: str | None = None,
    result_status: str,
    score_correctness: int | str = "",
    score_evidence: int | str = "",
    score_actionability: int | str = "",
    score_truth_boundary: int | str = "",
    citation_present: str = "",
    citation_supports_answer: str = "",
    notes: str = "",
) -> dict[str, Any]:
    return {
        "run_id": run_id,
        "date": time.strftime("%Y-%m-%d"),
        "contract_family": family,
        "case_id": case_id,
        "mode": mode,
        "model_or_provider": provider or "",
        "result_status": result_status,
        "score_correctness": score_correctness,
        "score_evidence": score_evidence,
        "score_actionability": score_actionability,
        "score_truth_boundary": score_truth_boundary,
        "citation_present": citation_present,
        "citation_supports_answer": citation_supports_answer,
        "notes": notes,
    }


def write_results(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    parser = argparse.ArgumentParser(description="Run the Redline EN eval rehearsal against a local backend.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="Backend origin without /api/v1")
    parser.add_argument("--email", default=None, help="Eval user email; defaults to a timestamped address")
    parser.add_argument("--password", default="RedlineEval123!", help="Eval user password")
    parser.add_argument("--display-name", default="Redline Eval Runner")
    parser.add_argument("--families", nargs="+", choices=sorted(FAMILY_FIXTURES), default=sorted(FAMILY_FIXTURES))
    parser.add_argument("--fixture-source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--fixture-dir", type=Path, default=DEFAULT_FIXTURE_DIR)
    parser.add_argument("--ai-cases", type=Path, default=DEFAULT_AI_CASES)
    parser.add_argument("--chat-cases", type=Path, default=DEFAULT_CHAT_CASES)
    parser.add_argument("--results", type=Path, default=DEFAULT_RESULTS_DIR / f"results-{timestamp}.csv")
    parser.add_argument("--timeout", type=float, default=120.0)
    parser.add_argument("--skip-ai-review", action="store_true")
    parser.add_argument("--skip-chat", action="store_true")
    args = parser.parse_args()

    run_id = timestamp
    email = args.email or f"redline.eval+{timestamp}@example.com"
    ai_cases = load_cases(args.ai_cases)
    chat_cases = load_cases(args.chat_cases)
    build_fixtures(args.fixture_source, args.fixture_dir)

    api = EvalApi(args.base_url, timeout=args.timeout)
    rows: list[dict[str, Any]] = []
    try:
        api.authenticate(email=email, password=args.password, display_name=args.display_name)
        project = create_project(api, run_id=run_id)
        for family in args.families:
            workspace = create_contract_workspace(
                api,
                project_id=project["id"],
                family=family,
                fixture_dir=args.fixture_dir,
            )
            if not args.skip_ai_review:
                rows.extend(
                    run_ai_review_cases(
                        api,
                        run_id=run_id,
                        family=family,
                        cases=ai_cases,
                        clause_changes=workspace["clause_changes"],
                    )
                )
            if not args.skip_chat:
                rows.extend(
                    run_chat_cases(
                        api,
                        run_id=run_id,
                        family=family,
                        cases=chat_cases,
                        contract_id=workspace["contract"]["id"],
                        draft_id=workspace["target_draft"]["id"],
                    )
                )
    finally:
        api.close()

    write_results(args.results, rows)
    known_case_ids = load_known_case_ids(args.ai_cases, args.chat_cases)
    buckets, warnings = summarize_results(args.results, known_case_ids)
    print(f"Wrote {len(rows)} result rows to {args.results}")
    print(format_summary(buckets, warnings))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
