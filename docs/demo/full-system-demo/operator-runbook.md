# Full Demo Operator Runbook

Use this runbook before a live or recorded demo. It assumes the current Redline
runtime: PostgreSQL + pgvector, FastAPI backend, Vite frontend, persistent local
upload storage in Docker, and direct Gemini for provider-backed AI/RAG.

## 1. Prerequisites

Required:

- Docker Desktop
- Git
- Tesseract inside the backend container, provided by the Docker image

Optional but recommended:

- Google AI Studio Gemini API key for AI Review, Contract Q&A synthesis, AI
  summary, and embeddings.
- Google OAuth Web Client ID if Google login will be demonstrated.

## 2. Configure Local Env

From repository root:

```powershell
Copy-Item src/backend/.env.example src/backend/.env
Copy-Item src/frontend/.env.example src/frontend/.env
```

For provider-backed AI/RAG, set this in `src/backend/.env`:

```env
REDLINE_AI_GEMINI_API_KEY=your-gemini-api-key
REDLINE_AI_GEMINI_MODEL=gemini-3.1-flash-lite
REDLINE_RAG_EMBEDDING_MODEL=gemini-embedding-2
```

For local Docker demos, upload files are stored in the named Docker volume
`redline_uploads`. Do not configure object storage unless you are testing a
deploy-like environment.

## 3. Start Full Stack

From repository root:

```powershell
docker compose up --build -d
```

Open:

- Frontend: `http://localhost:5173`
- Backend Swagger UI: `http://localhost:8000/docs`
- Health: `http://localhost:8000/health`

Seed demo users:

```powershell
docker compose exec backend python -m app.seed
```

## 4. Health Checks

Run these from repository root:

```powershell
docker compose exec backend python -m app.parser_admin pdf-ocr-health --strict
docker compose exec backend python -m app.rag_admin health --strict
```

Expected PDF/OCR health:

- Tesseract executable found.
- English and Vietnamese language data are available.

Expected RAG health when Gemini is configured:

- `healthy=true`
- `embedding_provider_ok=true`
- `embedding_dimensions_ok=true`
- `pgvector_dimensions_ok=true`
- no stale blocks for already embedded demo data.

If RAG health fails because no Gemini key is configured, keep the demo on Parser
and Compare or add a valid key and restart the backend container.

## 5. Build Demo Fixtures

The backend Docker image intentionally contains only backend application code,
not repository docs. Build demo fixtures from the host by bind-mounting the
repository into a one-off backend container:

```powershell
docker compose run --rm --no-deps -v "${PWD}:/workspace" -w /workspace backend python docs/demo/full-system-demo/scripts/build_full_demo_fixtures.py
```

If you are developing with a local backend virtual environment, this command is
also valid:

```powershell
.\src\backend\.venv\Scripts\python docs/demo/full-system-demo/scripts/build_full_demo_fixtures.py
```

If the backend virtual environment is not installed, create it from
`src/backend` first:

```powershell
cd src/backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -e .[dev]
cd ..\..
```

Confirm these generated files exist under `output/full-system-demo/fixtures/`:

- MSA v1 DOCX
- MSA v2 DOCX
- SOW v1 DOCX
- SOW v2 DOCX
- Security Addendum text PDF
- Security Addendum scanned PDF

## 6. Browser Setup

Recommended:

- Use one clean browser profile.
- Keep browser dev tools closed during the walkthrough unless debugging.
- Log in before the demo starts.
- Keep these docs open in another window:
  - `presenter-script.md`
  - `qa-prompts-and-expected-results.md`
  - `manual-test-checklist.md`

Demo accounts after seeding:

| Email | Password |
| --- | --- |
| `vinh@example.com` | `redline123` |
| `my@example.com` | `redline123` |
| `ly@example.com` | `redline123` |

## 7. Primary Demo Path

Use this order:

1. Project list.
2. Project detail.
3. Contract detail.
4. Upload and parse MSA drafts.
5. Parser Workspace.
6. Compare Workspace.
7. AI Review draft generation.
8. Review Workspace and human decision.
9. Traceability link review or AI link suggestion.
10. Contract Q&A with Source Evidence.
11. Summary / Export.
12. Optional SOW repeat for commercial-risk scenario.
13. Optional PDF/OCR parser smoke.

## 8. Fallbacks

If Gemini is unavailable:

1. Confirm `REDLINE_AI_GEMINI_API_KEY` is set in `src/backend/.env`.
2. Restart backend: `docker compose up --build -d backend`.
3. Rerun RAG health.
4. If still unavailable, demo deterministic Parser and Compare only.

If Contract Q&A is slow:

1. Click Stop.
2. Show the stopped attempt state.
3. Click Retry.
4. Use a shorter prompt such as `What is the liability cap?`.

If parse is slow:

1. Wait for DOCX parse first.
2. Keep scanned PDF OCR optional.
3. Explain that OCR is heavier and quality-gated.

If compare does not appear:

1. Confirm both drafts have parse status `parsed` or `parsed_with_warnings`.
2. Open Parser Workspace for diagnostics.
3. Reparse after fixing environment issues.

## 9. No-Go Conditions

Pause or switch to recorded evidence if:

- Backend is not reachable at `http://localhost:8000`.
- Frontend is not reachable at `http://localhost:5173`.
- Login fails for all accounts.
- Both draft parses fail.
- Compare run cannot be created after successful parse.
- Contract Q&A returns uncited answers for document-grounded questions.
- RAG health is red and cannot be restored quickly.

## 10. Shutdown

Stop containers:

```powershell
docker compose down
```

Keep volumes for future demos. Remove volumes only when you intentionally want
a clean database and upload store:

```powershell
docker compose down -v
```
