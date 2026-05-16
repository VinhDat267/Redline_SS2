# VN Showcase Rehearsal Evidence - 2026-04-25

Status: passed for lightweight VN D4 showcase rehearsal.

This is not a benchmark. The EN eval pack remains the measured readiness source. This evidence only confirms the Vietnamese showcase can run end to end through the current local stack.

## Environment

- Backend: `http://127.0.0.1:8000`
- Frontend: `http://127.0.0.1:5173`
- 9Router: `http://localhost:20128/v1`
- Chat model config: `cx/gpt-5.5` through OpenAI-compatible 9Router
- Embedding model config: `gemini/gemini-embedding-2-preview` through OpenAI-compatible 9Router
- Vector store: PostgreSQL + pgvector

## Preflight

Commands and checks run before rehearsal:

```powershell
docker compose up -d postgres
python -m alembic upgrade head
python -m app.rag_admin health --strict
```

RAG health result:

- `healthy`: `true`
- provider smoke: `embedding_provider_ok=true`
- configured provider: `openai-compatible:gemini/gemini-embedding-2-preview`
- configured dimensions: `3072`
- pgvector dimensions: `3072`
- total blocks: `434`
- provider counts: `434` Gemini-backed blocks
- stale block count: `0`

Direct 9Router smoke:

- `GET /v1/models` listed `cx/gpt-5.5` and `gemini/gemini-embedding-2-preview`.
- `POST /v1/embeddings` with `gemini/gemini-embedding-2-preview` returned one 3072-dimensional embedding.

## API Rehearsal

Command:

```powershell
python docs/testing/demo-showcase/scripts/run_vn_showcase_rehearsal.py --base-url http://127.0.0.1:8000 --timeout 240 --max-ai-review-per-family 2 --chat-prompts-per-family 2
```

Ignored local evidence artifact:

- `output/demo-showcase/vn-rehearsal-20260425-093727.json`

Summary:

| Metric | Result |
| --- | ---: |
| Contract families | 2 |
| Total clause changes | 11 |
| AI reviews generated | 4 / 4 |
| Streaming chat attempts done | 4 / 4 |
| Streaming chat attempts with citations | 4 / 4 |

Family details:

| Family | Contract ID | Compare run ID | Clause changes | AI review result | Chat result |
| --- | ---: | ---: | ---: | --- | --- |
| `VN_NDA` | 21 | 19 | 6 | 2 / 2 generated | 2 / 2 done, citations `3 + 3` |
| `VN_SOW` | 22 | 20 | 5 | 2 / 2 generated | 2 / 2 done, citations `3 + 1` |

AI review clauses exercised:

- `VN_NDA`: `1. Muc dich va pham vi su dung`, `2. Ngoai le doi voi Thong Tin Bao Mat`
- `VN_SOW`: `2. Nghiem thu`, `3. Thanh toan`

Streaming Contract Q&A prompts exercised:

- `Thoi han bao mat trong ban moi la bao lau?`
- `Gioi han trach nhiem co ap dung cho vi pham bao mat khong?`
- `Co che nghiem thu trong ban moi thay doi nhu the nao?`
- `Khach Hang co phai thanh toan truoc khong?`

## UI Smoke

Playwright CLI smoke checked authenticated routes and captured screenshots under ignored `output/playwright/`.

Ignored local artifacts:

- `output/playwright/vn-ui-smoke-summary.json`
- `output/playwright/vn-dashboard-auth.png`
- `output/playwright/vn-project-auth.png`
- `output/playwright/vn-compare-auth.png`
- `output/playwright/vn-chat-auth.png`

Routes checked:

| Route | Expected text | Result |
| --- | --- | --- |
| `/dashboard` | `VN Showcase Rehearsal` | passed |
| `/projects/12` | `VN Showcase NDA` | passed |
| `/compare-runs/19` | `Muc dich` | passed |
| `/contracts/21/chat` | `Contract Q&A` | passed |

## Notes

- 9Router initially was not listening, so the first RAG health check correctly failed provider smoke and fell back to `local-hash`.
- Starting the installed 9Router CLI restored `/v1/models` and `/v1/embeddings`.
- The accepted evidence above was captured only after provider-backed RAG health returned healthy.
- Contract Q&A answers used the existing grounded local RAG synthesis path and returned persisted citations for every streamed attempt.
