# D4 Demo Handoff

Status: operator notes for running the Redline D4 demo.

Audience:

- Presenter: runs the UI and explains the product story.
- Technical lead: starts services and verifies RAG/LLM health.
- QA/support: watches for no-go conditions and keeps fallback artifacts ready.

## Demo Promise

Use this one-line framing:

```text
Redline turns contract drafts into explainable clause changes, AI risk suggestions, and citation-grounded contract Q&A.
```

Keep the promise narrow:

- Compare is deterministic.
- AI Review is draft support.
- Human review is final.
- Contract Q&A is useful only when it shows source evidence.

## Local Runtime

Required local services:

| Service | URL / Port | Purpose |
| --- | --- | --- |
| PostgreSQL + pgvector | Docker `redline-pgvector` | Main runtime database and vectors |
| 9Router | `http://localhost:20128/v1` | OpenAI-compatible chat and embedding proxy |
| Backend | `http://127.0.0.1:8000` | FastAPI app |
| Frontend | `http://127.0.0.1:5173` | Vite app |

Expected model config:

| Variable | Expected local value |
| --- | --- |
| `REDLINE_AI_OPENAI_BASE_URL` | `http://localhost:20128/v1` |
| `REDLINE_AI_OPENAI_MODEL` | `cx/gpt-5.5` |
| `REDLINE_RAG_EMBEDDING_PROVIDER` | `openai_compatible` |
| `REDLINE_RAG_EMBEDDING_BASE_URL` | `http://localhost:20128/v1` |
| `REDLINE_RAG_EMBEDDING_MODEL` | `gemini/gemini-embedding-2-preview` |
| `REDLINE_RAG_EMBEDDING_DIMENSIONS` | `3072` |

## Start Sequence

From repo root:

```powershell
docker compose up -d postgres
```

Start or confirm 9Router:

```powershell
9router --no-browser --skip-update
```

If 9Router opens an interface picker, choose a background/tray or Web UI mode that keeps `http://localhost:20128` listening.

Backend:

```powershell
cd src/backend
python -m alembic upgrade head
python -m app.rag_admin health --strict
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Frontend:

```powershell
cd src/frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

Build VN fixtures from repo root:

```powershell
python docs/testing/demo-showcase/scripts/build_vn_showcase_fixtures.py
```

## Pre-Demo Health Checks

Run these before the live walkthrough:

```powershell
Invoke-RestMethod http://localhost:20128/v1/models
```

Confirm the response includes:

- `cx/gpt-5.5`
- `gemini/gemini-embedding-2-preview`

Then from `src/backend`:

```powershell
python -m app.rag_admin health --strict
```

Required result:

- `healthy=true`
- `embedding_provider_ok=true`
- `configured_provider=openai-compatible:gemini/gemini-embedding-2-preview`
- `embedding_dimensions_ok=true`
- `pgvector_dimensions_ok=true`
- `stale_block_count=0`

If provider smoke fails, do not present RAG as provider-backed. Restart 9Router and rerun health.

## Primary Demo Path

Open:

```text
http://127.0.0.1:5173
```

Recommended demo data:

- Use `VN NDA` when you want a simple confidentiality story.
- Use `VN SOW` when you want commercial impact: acceptance, payment, IP, change control.

Walkthrough:

1. Open or create a project.
2. Create a contract workspace.
3. Upload v1 and v2 DOCX files from `output/demo-showcase/fixtures/`.
4. Parse both drafts.
5. Run compare.
6. Show a high-signal clause change.
7. Generate RAG AI Review.
8. State that the reviewer owns the final decision.
9. Open Contract Q&A.
10. Ask one grounded question.
11. Open `Source Evidence`.
12. Close on deterministic compare + AI support + human confirmation.

## Best VN Demo Questions

NDA:

```text
Gioi han trach nhiem co ap dung cho vi pham bao mat khong?
Ban moi co con ngoai le cho thong tin duoc phat trien doc lap khong?
Thoi han bao mat trong ban moi la bao lau?
```

SOW:

```text
Ai so huu san pham duoc phat trien theo SOW moi?
Nha Cung Cap co duoc tinh phi truoc khi co lenh thay doi bang van ban khong?
Khach Hang co phai thanh toan truoc khong?
```

## High-Signal Clauses

VN NDA:

- `1. Muc dich va pham vi su dung`
- `2. Ngoai le doi voi Thong Tin Bao Mat`
- `3. Thoi han bao mat`
- `4. Gioi han trach nhiem`
- `5. Cham dut`

VN SOW:

- `2. Nghiem thu`
- `3. Thanh toan`
- `4. Quyen so huu tri tue`
- `5. Kiem soat thay doi`

## Fallbacks

If 9Router is down:

1. Restart 9Router.
2. Rerun `Invoke-RestMethod http://localhost:20128/v1/models`.
3. Rerun `python -m app.rag_admin health --strict`.
4. If still down, switch to recorded evidence in `docs/testing/demo-showcase/vn-rehearsal-evidence.md`.

If embedding provider falls back to `local-hash`:

1. Do not call the run provider-backed.
2. Fix 9Router first.
3. Re-embed stale blocks only after provider health is restored:

```powershell
python -m app.rag_admin reembed --limit 25
python -m app.rag_admin health --strict
```

If AI Review generation is slow:

1. Use an already generated AI Review draft from rehearsal data if available.
2. Explain that Compare remains deterministic and AI is an assistive layer.
3. Keep the demo moving to Contract Q&A citations.

If Contract Q&A stream is slow:

1. Show Stop.
2. Explain terminal attempt semantics.
3. Click Retry.
4. If retry is still slow, switch to `vn-rehearsal-evidence.md` and screenshots under ignored `output/playwright/`.

If the UI route redirects to login:

1. Log in again.
2. Confirm backend is still running.
3. Confirm `VITE_API_BASE_URL` points at `http://127.0.0.1:8000` if a custom env is used.

## Evidence Pack

Source-controlled:

- `docs/testing/eval-pack/README.md`
- `docs/testing/demo-showcase/README.md`
- `docs/testing/demo-showcase/d4-demo-script.md`
- `docs/testing/demo-showcase/d4-feature-freeze-checklist.md`
- `docs/testing/demo-showcase/d4-demo-handoff.md`
- `docs/testing/demo-showcase/vn-rehearsal-evidence.md`

Ignored local artifacts:

- `output/demo-showcase/fixtures/`
- `output/demo-showcase/vn-rehearsal-*.json`
- `output/playwright/vn-*-auth.png`
- `output/playwright/vn-ui-smoke-summary.json`

## Presenter Boundaries

Say:

```text
AI helps draft review reasoning and answer grounded questions, but it does not approve the contract.
```

Do not say:

```text
AI decides whether the clause is acceptable.
```

Say:

```text
Compare is deterministic, and citations let the reviewer inspect source evidence.
```

Do not say:

```text
The chatbot knows the contract independently.
```

## Final Handoff Checklist

- [ ] Services started in the start sequence above.
- [ ] RAG strict health is green.
- [ ] VN fixtures exist under `output/demo-showcase/fixtures/`.
- [ ] Browser can access `http://127.0.0.1:5173`.
- [ ] Demo account can log in.
- [ ] Presenter has `d4-demo-script.md` open.
- [ ] QA has `vn-rehearsal-evidence.md` open.
- [ ] Team agrees not to show support surfaces as core product unless asked.
