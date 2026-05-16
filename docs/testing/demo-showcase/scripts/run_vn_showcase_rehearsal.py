from __future__ import annotations

import argparse
import json
import time
import uuid
from pathlib import Path
from typing import Any

import httpx

from build_vn_showcase_fixtures import DEFAULT_OUTPUT_DIR as DEFAULT_FIXTURE_DIR
from build_vn_showcase_fixtures import DEFAULT_SOURCE, build_all_fixtures


REPO_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_RESULTS_DIR = REPO_ROOT / "output/demo-showcase"


FAMILY_FIXTURES = {
    "VN_NDA": {
        "contract_title": "VN Showcase NDA - Thoa thuan bao mat",
        "contract_type": "NDA",
        "source_label": "v1",
        "target_label": "v2",
        "source_file": "redline-vn-showcase-vn-nda-v1-thoa-thuan-bao-mat.docx",
        "target_file": "redline-vn-showcase-vn-nda-v2-thoa-thuan-bao-mat.docx",
        "ai_review_keywords": [
            ["pham vi thong tin bao mat", "nha thau phu"],
            ["phat trien doc lap", "ngoai le"],
            ["gioi han trach nhiem", "bao mat"],
            ["cham dut", "30 ngay"],
        ],
        "chat_questions": [
            "Thoi han bao mat trong ban moi la bao lau?",
            "Gioi han trach nhiem co ap dung cho vi pham bao mat khong?",
            "Ban moi co con ngoai le cho thong tin duoc phat trien doc lap khong?",
            "Ben nao co quyen cham dut thoa thuan va can bao truoc bao nhieu ngay?",
        ],
    },
    "VN_SOW": {
        "contract_title": "VN Showcase SOW - Hop dong dich vu trien khai",
        "contract_type": "SOW",
        "source_label": "v1",
        "target_label": "v2",
        "source_file": "redline-vn-showcase-vn-sow-v1-hop-dong-dich-vu-trien-khai.docx",
        "target_file": "redline-vn-showcase-vn-sow-v2-hop-dong-dich-vu-trien-khai.docx",
        "ai_review_keywords": [
            ["nghiem thu", "3 ngay"],
            ["thanh toan", "tra truoc"],
            ["so huu", "san pham"],
            ["lenh thay doi", "van ban"],
        ],
        "chat_questions": [
            "Co che nghiem thu trong ban moi thay doi nhu the nao?",
            "Khach Hang co phai thanh toan truoc khong?",
            "Ai so huu san pham duoc phat trien theo SOW moi?",
            "Nha Cung Cap co duoc tinh phi truoc khi co lenh thay doi bang van ban khong?",
        ],
    },
}


class RehearsalApi:
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
        return response.json()["data"]

    def authenticate(self, *, email: str, password: str, display_name: str) -> None:
        register_payload = {"email": email, "password": password, "display_name": display_name}
        response = self.client.post(f"{self.base_url}/api/v1/auth/register", json=register_payload)
        if response.status_code == 409:
            response = self.client.post(
                f"{self.base_url}/api/v1/auth/login",
                json={"email": email, "password": password},
            )
        if response.status_code >= 400:
            detail = _extract_error_detail(response)
            raise RuntimeError(f"authentication failed with {response.status_code}: {detail}")
        self.csrf_token = response.json()["data"]["csrf_token"]

    def stream_attempt(self, stream_endpoint: str) -> dict[str, Any]:
        headers = {"Accept": "text/event-stream"}
        if self.csrf_token is not None:
            headers["X-CSRF-Token"] = self.csrf_token
        events: list[dict[str, Any]] = []
        answer_parts: list[str] = []
        citations: list[dict[str, Any]] = []
        done_payload: dict[str, Any] | None = None
        with self.client.stream("POST", f"{self.base_url}{stream_endpoint}", headers=headers) as response:
            if response.status_code >= 400:
                detail = response.read().decode("utf-8", errors="replace")[:500]
                raise RuntimeError(f"POST {stream_endpoint} failed with {response.status_code}: {detail}")
            for event in parse_sse_events(response.iter_lines()):
                events.append(event)
                payload = event["data"]
                if event["event"] == "delta":
                    answer_parts.append(str(payload.get("content") or ""))
                elif event["event"] == "citations":
                    citations = [item for item in payload.get("citations", []) if isinstance(item, dict)]
                elif event["event"] == "done":
                    done_payload = payload

        assistant_message = done_payload.get("assistant_message") if done_payload else None
        if isinstance(assistant_message, dict):
            answer = str(assistant_message.get("content") or "".join(answer_parts))
            citations = [item for item in assistant_message.get("citations", citations) if isinstance(item, dict)]
        else:
            answer = "".join(answer_parts)
        return {
            "events": events,
            "event_types": [event["event"] for event in events],
            "answer": answer,
            "citations": citations,
            "assistant_message": assistant_message,
            "done_payload": done_payload,
        }


def _extract_error_detail(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return response.text[:500]
    return str(payload.get("detail", payload))[:500]


def parse_sse_events(lines: Any) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    event_name: str | None = None
    data_lines: list[str] = []

    def flush() -> None:
        nonlocal event_name, data_lines
        if event_name is None and not data_lines:
            return
        raw_data = "\n".join(data_lines)
        events.append(
            {
                "event": event_name or "message",
                "data": json.loads(raw_data) if raw_data else {},
            }
        )
        event_name = None
        data_lines = []

    for line in lines:
        if isinstance(line, bytes):
            line = line.decode("utf-8")
        if line == "":
            flush()
        elif line.startswith("event:"):
            event_name = line.removeprefix("event:").strip()
        elif line.startswith("data:"):
            data_lines.append(line.removeprefix("data:").strip())
    flush()
    return events


def create_project(api: RehearsalApi, *, run_id: str) -> dict[str, Any]:
    return api.request(
        "POST",
        "/projects",
        json={"name": f"VN Showcase Rehearsal {run_id}", "description": "Automated VN D4 demo rehearsal."},
    )


def upload_contract_draft(api: RehearsalApi, *, contract_id: int, draft_label: str, file_path: Path) -> dict[str, Any]:
    with file_path.open("rb") as handle:
        return api.request(
            "POST",
            f"/contracts/{contract_id}/drafts",
            data={"draft_label": draft_label, "notes": f"VN showcase fixture {draft_label}"},
            files={
                "file": (
                    file_path.name,
                    handle,
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                )
            },
        )


def create_contract_workspace(
    api: RehearsalApi,
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
            "description": f"{family} Vietnamese showcase fixture pair.",
        },
    )
    source_draft = upload_contract_draft(
        api,
        contract_id=contract["id"],
        draft_label=str(config["source_label"]),
        file_path=fixture_dir / str(config["source_file"]),
    )
    target_draft = upload_contract_draft(
        api,
        contract_id=contract["id"],
        draft_label=str(config["target_label"]),
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


def select_ai_review_changes(
    clause_changes: list[dict[str, Any]],
    keyword_groups: list[list[str]],
    *,
    limit: int,
) -> list[dict[str, Any]]:
    selected: list[dict[str, Any]] = []
    seen_ids: set[int] = set()
    for keywords in keyword_groups:
        best_change = None
        best_score = 0
        for change in clause_changes:
            change_id = int(change["id"])
            if change_id in seen_ids:
                continue
            haystack = " ".join(
                str(change.get(field) or "")
                for field in ("clause_title", "old_text", "new_text", "summary")
            ).lower()
            score = sum(1 for keyword in keywords if keyword.lower() in haystack)
            if score > best_score:
                best_change = change
                best_score = score
        if best_change is not None:
            selected.append(best_change)
            seen_ids.add(int(best_change["id"]))
        if len(selected) >= limit:
            break
    if len(selected) < limit:
        for change in clause_changes:
            change_id = int(change["id"])
            if change_id not in seen_ids:
                selected.append(change)
                seen_ids.add(change_id)
            if len(selected) >= limit:
                break
    return selected


def run_ai_reviews(
    api: RehearsalApi,
    *,
    clause_changes: list[dict[str, Any]],
    keyword_groups: list[list[str]],
    limit: int,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for change in select_ai_review_changes(clause_changes, keyword_groups, limit=limit):
        payload = api.request(
            "POST",
            f"/change-items/{change['id']}/ai-review-draft/generate",
            json={"force_regenerate": True, "use_rag": True},
        )
        draft = payload["ai_review_draft"]
        rows.append(
            {
                "clause_change_id": change["id"],
                "clause_title": change.get("clause_title"),
                "change_type": change.get("change_type"),
                "generation_status": draft.get("generation_status"),
                "provider_used": draft.get("provider_used"),
                "risk_level": draft.get("risk_level"),
                "has_explanation": bool(str(draft.get("explanation") or "").strip()),
                "has_draft_comment": bool(str(draft.get("draft_comment") or "").strip()),
                "error_message": draft.get("error_message"),
            }
        )
    return rows


def run_chat_attempts(
    api: RehearsalApi,
    *,
    contract_id: int,
    draft_id: int,
    family: str,
    questions: list[str],
) -> dict[str, Any]:
    session = api.request(
        "POST",
        f"/contracts/{contract_id}/chat/sessions",
        json={"draft_id": draft_id, "title": f"{family} VN rehearsal Q&A"},
    )
    exchanges: list[dict[str, Any]] = []
    for question in questions:
        attempt_payload = api.request(
            "POST",
            f"/contracts/{contract_id}/chat/sessions/{session['id']}/attempts",
            json={
                "query": question,
                "draft_id": draft_id,
                "client_request_id": f"vn-rehearsal-{uuid.uuid4()}",
            },
        )
        attempt = attempt_payload["attempt"]
        stream = api.stream_attempt(str(attempt_payload["stream_endpoint"]))
        final_attempt = api.request(
            "GET",
            f"/contracts/{contract_id}/chat/sessions/{session['id']}/attempts/{attempt['id']}",
        )
        assistant_message = stream.get("assistant_message") or {}
        exchanges.append(
            {
                "question": question,
                "attempt_id": attempt["id"],
                "attempt_status": final_attempt.get("status"),
                "provider_used": final_attempt.get("provider_used") or assistant_message.get("provider_used"),
                "event_types": stream["event_types"],
                "answer_length": len(stream["answer"]),
                "citation_count": len(stream["citations"]),
                "assistant_message_id": assistant_message.get("id"),
                "citation_samples": [
                    {
                        "block_id": citation.get("block_id"),
                        "section_title": citation.get("section_title"),
                        "surface_type": citation.get("surface_type"),
                        "content": str(citation.get("content") or "")[:300],
                    }
                    for citation in stream["citations"][:2]
                ],
            }
        )
    return {"session": session, "exchanges": exchanges}


def build_rehearsal_summary(evidence: dict[str, Any]) -> dict[str, Any]:
    families = evidence["families"]
    return {
        "families": list(families),
        "total_clause_changes": sum(item["clause_change_count"] for item in families.values()),
        "ai_reviews_generated": sum(
            1
            for item in families.values()
            for review in item["ai_reviews"]
            if review["generation_status"] == "generated"
        ),
        "ai_reviews_total": sum(len(item["ai_reviews"]) for item in families.values()),
        "chat_attempts_done": sum(
            1
            for item in families.values()
            for exchange in item["chat_exchanges"]
            if exchange["attempt_status"] == "done"
        ),
        "chat_attempts_total": sum(len(item["chat_exchanges"]) for item in families.values()),
        "chat_attempts_with_citations": sum(
            1
            for item in families.values()
            for exchange in item["chat_exchanges"]
            if exchange["citation_count"] > 0
        ),
    }


def write_evidence(path: Path, evidence: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(evidence, indent=2, ensure_ascii=False), encoding="utf-8")


def main() -> int:
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    parser = argparse.ArgumentParser(description="Run the Redline VN showcase D4 rehearsal against a local backend.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="Backend origin without /api/v1")
    parser.add_argument("--email", default=None, help="Rehearsal user email; defaults to a timestamped address")
    parser.add_argument("--password", default="RedlineVnDemo123!", help="Rehearsal user password")
    parser.add_argument("--display-name", default="Redline VN Demo Runner")
    parser.add_argument("--families", nargs="+", choices=sorted(FAMILY_FIXTURES), default=sorted(FAMILY_FIXTURES))
    parser.add_argument("--fixture-source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--fixture-dir", type=Path, default=DEFAULT_FIXTURE_DIR)
    parser.add_argument("--results", type=Path, default=DEFAULT_RESULTS_DIR / f"vn-rehearsal-{timestamp}.json")
    parser.add_argument("--timeout", type=float, default=180.0)
    parser.add_argument("--max-ai-review-per-family", type=int, default=2)
    parser.add_argument("--chat-prompts-per-family", type=int, default=2)
    args = parser.parse_args()

    run_id = timestamp
    email = args.email or f"redline.vn-demo+{timestamp}@example.com"
    build_all_fixtures(args.fixture_source, args.fixture_dir)

    evidence: dict[str, Any] = {
        "run_id": run_id,
        "date": time.strftime("%Y-%m-%d"),
        "base_url": args.base_url,
        "email": email,
        "families": {},
    }

    api = RehearsalApi(args.base_url, timeout=args.timeout)
    try:
        api.authenticate(email=email, password=args.password, display_name=args.display_name)
        project = create_project(api, run_id=run_id)
        evidence["project"] = {"id": project["id"], "name": project["name"]}
        for family in args.families:
            config = FAMILY_FIXTURES[family]
            workspace = create_contract_workspace(
                api,
                project_id=project["id"],
                family=family,
                fixture_dir=args.fixture_dir,
            )
            ai_reviews = run_ai_reviews(
                api,
                clause_changes=workspace["clause_changes"],
                keyword_groups=config["ai_review_keywords"],
                limit=args.max_ai_review_per_family,
            )
            questions = config["chat_questions"][: args.chat_prompts_per_family]
            chat = run_chat_attempts(
                api,
                contract_id=workspace["contract"]["id"],
                draft_id=workspace["target_draft"]["id"],
                family=family,
                questions=questions,
            )
            evidence["families"][family] = {
                "contract_id": workspace["contract"]["id"],
                "source_draft_id": workspace["source_draft"]["id"],
                "target_draft_id": workspace["target_draft"]["id"],
                "compare_run_id": workspace["compare_run"]["id"],
                "clause_change_count": len(workspace["clause_changes"]),
                "ai_reviews": ai_reviews,
                "chat_session_id": chat["session"]["id"],
                "chat_exchanges": chat["exchanges"],
            }
    finally:
        api.close()

    evidence["summary"] = build_rehearsal_summary(evidence)
    write_evidence(args.results, evidence)
    print(f"Wrote VN rehearsal evidence to {args.results}")
    print(json.dumps(evidence["summary"], indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
