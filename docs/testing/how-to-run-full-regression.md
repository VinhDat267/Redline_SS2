# How-to: Run Full Regression

Use this runbook before a release, deployment, major parser/compare/AI change,
or live demo. It complements `tutorial-redline-e2e-full-pass.md` with a compact
operator checklist.

## Regression Modes

| Mode | Use When | Coverage |
| --- | --- | --- |
| Smoke | Need a quick liveness check | auth, project, contract, one upload, parse, parser workspace |
| Full functional regression | Preparing a release or demo | full browser workflow from auth to export |
| Full regression without AI | AI key/quota unavailable | deterministic parser/compare/review/traceability/export, AI marked `blocked by env` |
| Docker smoke | Validating local installation | compose build/start, health, OCR, RAG |

## Pre-flight Checklist

- [ ] `docker compose up --build -d` starts all services.
- [ ] Backend health returns `200`: `http://127.0.0.1:8000/health`.
- [ ] Frontend returns `200`: `http://127.0.0.1:5173`.
- [ ] Database migrations are current.
- [ ] Demo users are seeded or fresh test accounts are ready.
- [ ] Fixture files exist under `output/full-system-demo/fixtures/`.
- [ ] If testing AI, `REDLINE_AI_GEMINI_API_KEY` is set.
- [ ] If testing Google login, Google OAuth origins include the frontend URL.
- [ ] If testing deploy-like upload persistence, object storage env vars are set.

## Start Commands

### Docker Full Stack

```powershell
Copy-Item src/backend/.env.example src/backend/.env
Copy-Item src/frontend/.env.example src/frontend/.env
docker compose up --build -d
docker compose exec backend python -m app.seed
```

### Health Checks

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/health
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5173
docker compose exec backend python -m app.parser_admin pdf-ocr-health --strict
docker compose exec backend python -m app.rag_admin health --strict
```

### Local Dev Backend/Frontend

Use this only when developing outside Docker:

```powershell
docker compose up -d postgres
cd src/backend
.\.venv\Scripts\python -m alembic upgrade head
.\.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

```powershell
cd src/frontend
npm run dev
```

## Suggested Regression Order

1. Auth and account page.
2. Project CRUD.
3. Invitation flow.
4. Contract CRUD.
5. Draft upload and metadata.
6. Parser workspace.
7. PDF text-layer and OCR smoke, if needed.
8. Compare run.
9. AI Review batch.
10. Human review.
11. Traceability and impacted tests.
12. Contract Q&A.
13. Summary/export.
14. Analytics and activity log.
15. Automated suites.

This order follows the data dependencies:

- compare depends on active parser truth;
- review depends on compare run and change items;
- traceability depends on change items and requirements;
- Contract Q&A depends on parsed blocks and embeddings;
- summary/analytics depend on completed workflow data.

## Evidence to Capture

Minimum useful evidence:

- Project inventory.
- Contract workspace with drafts.
- Parser workspace after parse.
- Compare workspace with selected clause change.
- Review workspace after save.
- Traceability / Impact after mapping.
- Contract Q&A with Source Evidence panel.
- Summary / Export.
- Project Analytics.

Additional evidence:

- exported Markdown and DOCX report;
- compare run ID;
- number of change items;
- number of AI drafts generated;
- provider/fallback metadata;
- OCR/RAG health command output.

## Pass/Fail Gates

### Gate A - Parser Readiness

Pass:

- parse status is `parsed` or `parsed_with_warnings`;
- `active_parse_run_id` exists;
- diagnostics are visible.

Fail:

- parser fails on supported DOCX/PDF without clear diagnostic;
- compare unlocks for a draft without active parser truth.

### Gate B - Compare Readiness

Pass:

- compare run completes;
- queue loads real change items;
- selected diff has correct source/target context.

Fail:

- queue is unexpectedly empty;
- body/header/footer/page changes are mixed incorrectly;
- table row changes lose row context.

### Gate C - Review Readiness

Pass:

- status/assignee/summary save correctly;
- comments persist;
- AI regenerate succeeds or fails with readable error.

### Gate D - Traceability Readiness

Pass:

- manual link/unlink works;
- AI suggestions require explicit accept;
- impacted tests reflect confirmed mappings.

### Gate E - Contract Q&A Readiness

Pass:

- grounded answers include citations;
- source evidence supports answer;
- unsupported questions avoid unsupported legal claims;
- Stop/Retry works without stuck attempts.

### Gate F - Export Readiness

Pass:

- summary can be generated or manually edited;
- Markdown export works;
- DOCX export works;
- pending/open review state is visible.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `401 Unauthorized` | Login again; verify cookie session and CSRF flow. |
| `Failed to fetch` | Backend health, `VITE_API_BASE_URL`, CORS origins. |
| Invitation missing | Register/login with the exact invited email. |
| Compare locked after parse | Check draft has `active_parse_run_id`; reparse if needed. |
| AI batch stuck | Check `REDLINE_AI_BATCH_WORKER_ENABLED=true` and backend logs. |
| AI provider error | Check Gemini API key/quota/model. |
| Contract Q&A has no citation | Check parse/RAG health and active draft blocks. |
| PDF OCR fails | Check Tesseract path and `eng+vie` language packs. |
| Export blocked | Resolve or review open/in-review change items if final export is expected. |

## Automated Verification

### Backend

```powershell
cd src/backend
.\.venv\Scripts\python -m pytest tests -q
.\.venv\Scripts\python -m alembic check
```

Expected baseline: `274 passed` and no migration drift.

### Frontend

```powershell
cd src/frontend
npm run test -- --run
npm run build
npm audit
```

Expected baseline: `116 passed`, build succeeds, `0 vulnerabilities`.

## Result Recording

For every failed or blocked case, record:

- environment mode: Docker/local/deploy;
- account;
- route;
- fixture;
- action performed;
- expected vs actual behavior;
- logs/screenshots/export files;
- classification: `bug`, `environment`, `blocked by AI`, or `needs investigation`.
