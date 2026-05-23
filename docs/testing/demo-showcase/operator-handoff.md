# Demo Showcase Operator Handoff

Status: operator notes for running the lightweight Vietnamese showcase.

Audience:

- Presenter: runs the UI and explains the product story.
- Technical lead: starts services and verifies RAG/LLM health.
- QA/support: watches for no-go conditions and keeps fallback notes ready.

## Demo Promise

Use this one-line framing:

```text
Redline turns contract drafts into explainable clause changes, AI risk
suggestions, and citation-grounded contract Q&A.
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
| Direct Gemini | Google Gemini API | AI Review, Contract Q&A synthesis, and embeddings |
| Backend | `http://localhost:8000` | FastAPI app |
| Frontend | `http://localhost:5173` | Vite app |

Expected model config:

| Variable | Expected local value |
| --- | --- |
| `REDLINE_AI_PRIMARY_PROVIDER` | `gemini` |
| `REDLINE_AI_GEMINI_MODEL` | `gemini-3.1-flash-lite` |
| `REDLINE_RAG_EMBEDDING_MODEL` | `gemini-embedding-2` |
| `REDLINE_RAG_EMBEDDING_DIMENSIONS` | `3072` |

## Start Sequence

From repo root:

```powershell
docker compose up --build -d
docker compose exec backend python -m app.seed
```

Confirm the Gemini key is configured in `src/backend/.env` if the demo includes
provider-backed AI/RAG:

```powershell
Select-String -Path src/backend/.env -Pattern "REDLINE_AI_GEMINI_API_KEY="
```

Run health checks:

```powershell
docker compose exec backend python -m app.rag_admin health --strict
docker compose exec backend python -m app.parser_admin pdf-ocr-health --strict
```

Build VN fixtures from the host:

```powershell
docker compose run --rm --no-deps -v "${PWD}:/workspace" -w /workspace backend python docs/testing/demo-showcase/scripts/build_vn_showcase_fixtures.py
```

## Primary Demo Path

Open:

```text
http://localhost:5173
```

Recommended demo data:

- Use `VN NDA` when you want a simple confidentiality story.
- Use `VN SOW` when you want commercial impact: acceptance, payment, IP, change
  control.

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

If Gemini is unavailable:

1. Confirm `REDLINE_AI_GEMINI_API_KEY` is set in `src/backend/.env`.
2. Restart backend: `docker compose up --build -d backend`.
3. Rerun `docker compose exec backend python -m app.rag_admin health --strict`.
4. If still unavailable, demo deterministic Parser and Compare only.

If embedding provider falls back to `local-hash`:

1. Do not call the run provider-backed.
2. Fix Gemini configuration first.
3. Re-embed stale blocks only after provider health is restored:

```powershell
docker compose exec backend python -m app.rag_admin reembed --limit 25
docker compose exec backend python -m app.rag_admin health --strict
```

If Contract Q&A stream is slow:

1. Show Stop.
2. Explain terminal attempt semantics.
3. Click Retry.
4. If retry is still slow, use a shorter prompt or switch to deterministic
   compare/review flows.

## Evidence Pack

Current source-controlled docs:

- `docs/testing/eval-pack/README.md`
- `docs/testing/demo-showcase/README.md`
- `docs/testing/demo-showcase/demo-script.md`
- `docs/testing/demo-showcase/release-freeze-checklist.md`
- `docs/testing/demo-showcase/operator-handoff.md`
- `docs/testing/demo-showcase/vn-rehearsal-evidence.md`

Ignored local artifacts:

- `output/demo-showcase/fixtures/`
- `output/demo-showcase/vn-rehearsal-*.json`
- `output/playwright_test/`

## Presenter Boundaries

Say:

```text
AI helps draft review reasoning and answer grounded questions, but it does not
approve the contract.
```

Do not say:

```text
AI decides whether the clause is acceptable.
```

Say:

```text
Compare is deterministic, and citations let the reviewer inspect source
evidence.
```

Do not say:

```text
The chatbot knows the contract independently.
```

## Final Handoff Checklist

- [ ] Services started in the start sequence above.
- [ ] RAG strict health is green when provider-backed AI is being shown.
- [ ] VN fixtures exist under `output/demo-showcase/fixtures/`.
- [ ] Browser can access `http://localhost:5173`.
- [ ] Demo account can log in.
- [ ] Presenter has `demo-script.md` open.
- [ ] QA has `vn-rehearsal-evidence.md` open if historical evidence is needed.
- [ ] Team agrees not to show support surfaces as core product unless asked.
