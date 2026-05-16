# Full Demo Operator Runbook

Use this runbook before a live or recorded demo. It assumes the current Redline local runtime: PostgreSQL + pgvector, backend FastAPI, frontend Vite, and 9Router for OpenAI-compatible chat/embedding.

## 1. Start Infrastructure

From repository root:

```powershell
docker compose up -d postgres
```

Confirm 9Router is running:

```powershell
Invoke-RestMethod http://localhost:20128/v1/models
```

The model list should include:

- `cx/gpt-5.5`
- `gemini/gemini-embedding-2-preview`

## 2. Start Backend

From repository root:

```powershell
cd src/backend
.\.venv\Scripts\python -m alembic upgrade head
.\.venv\Scripts\python -m app.rag_admin health --strict
.\.venv\Scripts\python -m app.parser_admin pdf-ocr-health --strict
.\.venv\Scripts\python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Expected RAG health:

- `healthy=true`
- `embedding_provider_ok=true`
- `embedding_dimensions_ok=true`
- `stale_block_count=0` for already embedded demo data, or no stale blocks after fresh parse.

Expected PDF/OCR health:

- Tesseract executable found.
- Language packs include `eng` and `vie`.

If OCR health fails, skip the scanned PDF portion and still demo DOCX + text-layer PDF.

## 3. Start Frontend

In a second terminal:

```powershell
cd src/frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

Open:

```text
http://127.0.0.1:5173
```

## 4. Build Demo Fixtures

From repository root:

```powershell
.\src\backend\.venv\Scripts\python docs/demo/full-system-demo/scripts/build_full_demo_fixtures.py
```

Confirm these files exist under `output/full-system-demo/fixtures/`:

- MSA v1 DOCX
- MSA v2 DOCX
- SOW v1 DOCX
- SOW v2 DOCX
- Security Addendum text PDF
- Security Addendum scanned PDF

## 5. Browser Setup

Recommended:

- Use one clean browser profile.
- Keep dev tools closed during the live walkthrough unless debugging.
- Log in before the demo starts.
- Keep these docs open in another window:
  - `presenter-script.md`
  - `qa-prompts-and-expected-results.md`
  - `manual-test-checklist.md`

## 6. Primary Demo Path

Use this order:

1. Project List.
2. Project Detail.
3. Contract Detail.
4. Upload and parse MSA drafts.
5. Compare Workspace.
6. AI Review draft generation.
7. Review Workspace and human decision.
8. Contract Q&A with Source Evidence.
9. Optional SOW repeat for commercial-risk scenario.
10. Optional PDF/OCR parser smoke.

## 7. Fallbacks

If 9Router is down:

1. Restart 9Router.
2. Re-run `/v1/models`.
3. Re-run RAG health.
4. If still down, demo deterministic Compare and Parser only. Explain that provider-backed synthesis is unavailable in the local environment.

If Contract Q&A is slow:

1. Click Stop.
2. Show the stopped attempt state.
3. Click Retry.
4. If still slow, use a shorter prompt such as `What is the liability cap?`.

If parse is slow:

1. Wait for DOCX parse first; it should complete faster than OCR PDF.
2. Keep scanned PDF OCR as optional.
3. Explain that OCR is heavier and quality-gated.

If compare does not appear:

1. Confirm both drafts have parse status `parsed` or `parsed_with_warnings`.
2. If a draft failed parse, open Parser Workspace to show diagnostics.
3. Reparse after fixing environment issues.

## 8. Demo No-Go Conditions

Pause or switch to recorded evidence if:

- Backend is not reachable at `http://127.0.0.1:8000`.
- Frontend redirects repeatedly to login after successful auth.
- Both draft parses fail.
- Compare run cannot be created.
- Contract Q&A returns uncited answers for document-grounded questions.
- RAG health is red and cannot be restored quickly.
