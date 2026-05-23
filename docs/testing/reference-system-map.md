# Reference: System Map

This reference maps the Redline runtime, routes, API surface, environment
variables, and test coverage. Use it when validating a deployment, debugging a
workflow, or updating tests after a product change.

## Runtime Map

### Default Local Services

| Service | Default URL | Notes |
| --- | --- | --- |
| Frontend | `http://localhost:5173` | Vite dev server, Docker frontend service, or local `npm run dev` |
| Backend | `http://127.0.0.1:8000` | FastAPI API and Swagger UI |
| Swagger UI | `http://127.0.0.1:8000/docs` | Interactive API documentation |
| PostgreSQL | `127.0.0.1:5432` | Docker Compose `postgres` service with pgvector |

### Runtime Files

| Area | Path |
| --- | --- |
| Backend settings | `src/backend/app/core/config.py` |
| Backend entrypoint | `src/backend/app/main.py` |
| Frontend routes | `src/frontend/src/App.jsx` |
| Frontend API client | `src/frontend/src/lib/api.js` |
| Backend env template | `src/backend/.env.example` |
| Frontend env template | `src/frontend/.env.example` |
| Docker stack | `compose.yml` |

## Frontend Route Map

| Route | Page | Purpose |
| --- | --- | --- |
| `/login` | `AuthPage` | Local auth, registration, Google login |
| `/` | `LandingOrDashboard` | Landing page or authenticated project list |
| `/dashboard` | `ProjectListPage` | Project inventory, demo seed, pending invitations |
| `/account` | `AccountPage` | Profile, avatar, password management |
| `/contracts` | `WorkspaceGatewayPage` | Contract workspace gateway |
| `/parser` | `WorkspaceGatewayPage` | Parser workspace gateway |
| `/compare` | `WorkspaceGatewayPage` | Compare workspace gateway |
| `/review` | `WorkspaceGatewayPage` | Review workspace gateway |
| `/contract-q-a` | `WorkspaceGatewayPage` | Contract Q&A gateway |
| `/analytics` | `WorkspaceGatewayPage` | Analytics gateway |
| `/projects/:projectId` | `ProjectDetailPage` | Contracts, requirements, test cases, team, activity |
| `/projects/:projectId/analytics` | `ProjectAnalyticsPage` | Project metrics and charts |
| `/contracts/:contractId` | `ContractDetailPage` | Contract drafts, upload, parse, compare setup |
| `/contracts/:contractId/parser` | `ParserWorkspacePage` | Contract-facing parser workspace |
| `/contracts/:contractId/chat` | `ContractChatPage` | Grounded Contract Q&A |
| `/documents/:documentId` | `DocumentDetailPage` | Legacy/internal document workspace |
| `/documents/:documentId/parser` | `ParserWorkspacePage` | Legacy/internal parser workspace |
| `/compare-runs/:compareRunId` | `CompareScreenPage` | Compare queue and AI review batch generation |
| `/compare-runs/:compareRunId/review` | `ReviewPanelPage` | Human review workflow |
| `/compare-runs/:compareRunId/impact` | `TraceabilityImpactPage` | Requirement links, AI suggestions, impacted tests |
| `/compare-runs/:compareRunId/summary` | `SummaryExportPage` | Summary and export |

## Backend API Map

All product APIs except health are prefixed with `/api/v1`.

### Health

- `GET /health`

### Auth and Account

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/google`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `PATCH /api/v1/auth/me`
- `POST /api/v1/auth/me/password`
- `POST /api/v1/auth/me/avatar`
- `DELETE /api/v1/auth/me/avatar`
- `POST /api/v1/auth/project-invitations/{invitation_id}/accept`

### Demo

- `POST /api/v1/demo/seed`

### Projects, Team, Analytics, Activity

- `GET /api/v1/projects`
- `POST /api/v1/projects`
- `GET /api/v1/projects/{project_id}`
- `PATCH /api/v1/projects/{project_id}`
- `DELETE /api/v1/projects/{project_id}`
- `GET /api/v1/projects/{project_id}/members`
- `POST /api/v1/projects/{project_id}/members`
- `PATCH /api/v1/projects/{project_id}/members/{member_id}`
- `DELETE /api/v1/projects/{project_id}/members/{member_id}`
- `GET /api/v1/projects/{project_id}/invitations`
- `DELETE /api/v1/projects/{project_id}/invitations/{invitation_id}`
- `GET /api/v1/projects/{project_id}/analytics`
- `GET /api/v1/projects/{project_id}/activity-logs`

### Contract Facade

These are the preferred product-facing routes.

- `GET /api/v1/projects/{project_id}/contracts`
- `POST /api/v1/projects/{project_id}/contracts`
- `GET /api/v1/contracts/{contract_id}`
- `PATCH /api/v1/contracts/{contract_id}`
- `DELETE /api/v1/contracts/{contract_id}`
- `GET /api/v1/contracts/{contract_id}/drafts`
- `POST /api/v1/contracts/{contract_id}/drafts`
- `GET /api/v1/contract-drafts/{draft_id}`
- `PATCH /api/v1/contract-drafts/{draft_id}`
- `DELETE /api/v1/contract-drafts/{draft_id}`
- `POST /api/v1/contract-drafts/{draft_id}/parse`
- `POST /api/v1/contracts/{contract_id}/compare-runs`
- `GET /api/v1/contracts/{contract_id}/compare-runs`
- `GET /api/v1/contract-compare-runs/{compare_run_id}`
- `GET /api/v1/contract-compare-runs/{compare_run_id}/clause-changes`

### Contract Q&A

Chat sessions are scoped to one parsed draft by default. A session can also
include `compare_run_id`; in that mode the target draft remains the active
attempt draft, while answers are grounded in deterministic `ChangeItem` data
from the selected compare run.

- `POST /api/v1/contracts/{contract_id}/chat/sessions`
- `GET /api/v1/contracts/{contract_id}/chat/sessions`
- `GET /api/v1/contracts/{contract_id}/chat/sessions/{chat_session_id}/messages`
- `POST /api/v1/contracts/{contract_id}/chat/sessions/{chat_session_id}/messages`
- `POST /api/v1/contracts/{contract_id}/chat/sessions/{chat_session_id}/messages/stream`
- `POST /api/v1/contracts/{contract_id}/chat/sessions/{chat_session_id}/attempts`
- `GET /api/v1/contracts/{contract_id}/chat/sessions/{chat_session_id}/attempts/{attempt_id}`
- `POST /api/v1/contracts/{contract_id}/chat/sessions/{chat_session_id}/attempts/{attempt_id}/cancel`
- `POST /api/v1/contracts/{contract_id}/chat/sessions/{chat_session_id}/attempts/{attempt_id}/stream`

### Internal/Legacy Document Routes

These routes remain supported because the internal model names are still
`Document` and `DocumentVersion`.

- `GET /api/v1/projects/{project_id}/documents`
- `POST /api/v1/projects/{project_id}/documents`
- `GET /api/v1/documents/{document_id}`
- `PATCH /api/v1/documents/{document_id}`
- `DELETE /api/v1/documents/{document_id}`
- `GET /api/v1/documents/{document_id}/versions`
- `POST /api/v1/documents/{document_id}/versions`
- `GET /api/v1/documents/{document_id}/parser-workspace`
- `GET /api/v1/document-versions/{version_id}`
- `PATCH /api/v1/document-versions/{version_id}`
- `DELETE /api/v1/document-versions/{version_id}`
- `POST /api/v1/document-versions/{version_id}/parse`
- `GET /api/v1/document-versions/{version_id}/parser-surfaces/{surface_id}`

### AI Requirement Extraction

- `GET /api/v1/document-versions/{version_id}/requirement-candidates`
- `POST /api/v1/document-versions/{version_id}/requirement-candidates/generate`
- `POST /api/v1/requirement-candidates/{candidate_id}/accept`
- `POST /api/v1/requirement-candidates/{candidate_id}/reject`

### Compare, AI Review, Summary, Export

- `POST /api/v1/documents/{document_id}/compare-runs`
- `GET /api/v1/compare-runs/{compare_run_id}`
- `GET /api/v1/compare-runs/{compare_run_id}/change-items`
- `POST /api/v1/compare-runs/{compare_run_id}/ai-review-drafts/generate`
- `GET /api/v1/ai-batch-jobs/{job_id}`
- `GET /api/v1/ai-batch-jobs/{job_id}/items`
- `POST /api/v1/compare-runs/{compare_run_id}/ai-summary-drafts/generate`
- `GET /api/v1/compare-runs/{compare_run_id}/export/docx`

### Change Items, Review, Traceability

- `GET /api/v1/change-items/{change_item_id}`
- `PATCH /api/v1/change-items/{change_item_id}`
- `POST /api/v1/change-items/{change_item_id}/comments`
- `POST /api/v1/change-items/{change_item_id}/ai-review-draft/generate`
- `POST /api/v1/change-items/{change_item_id}/suggest-links`
- `POST /api/v1/change-items/{change_item_id}/requirement-links`
- `POST /api/v1/change-items/{change_item_id}/requirement-links/ai-suggested`
- `DELETE /api/v1/change-items/{change_item_id}/requirement-links/{requirement_id}`

### Requirements, Test Cases, Mappings

- `GET /api/v1/projects/{project_id}/requirements`
- `POST /api/v1/projects/{project_id}/requirements`
- `GET /api/v1/requirements/{requirement_id}`
- `PATCH /api/v1/requirements/{requirement_id}`
- `DELETE /api/v1/requirements/{requirement_id}`
- `GET /api/v1/projects/{project_id}/test-cases`
- `POST /api/v1/projects/{project_id}/test-cases`
- `GET /api/v1/test-cases/{test_case_id}`
- `PATCH /api/v1/test-cases/{test_case_id}`
- `DELETE /api/v1/test-cases/{test_case_id}`
- `GET /api/v1/requirements/{requirement_id}/test-case-mappings`
- `POST /api/v1/requirements/{requirement_id}/test-case-mappings`
- `DELETE /api/v1/requirements/{requirement_id}/test-case-mappings/{test_case_id}`

## Status and Enum Map

| Entity | Values |
| --- | --- |
| Draft parse status | `pending`, `parsed`, `parsed_with_warnings`, `failed` |
| Compare run status | `pending`, `running`, `completed`, `completed_with_warnings`, `failed` |
| Change type | `added`, `removed`, `modified` |
| Review status | `open`, `in_review`, `resolved` |
| Surface type | `body`, `header`, `footer`, `footnote`, `endnote`, `page` |
| AI review draft | `pending`, `generated`, `failed` |
| Requirement candidate | `pending`, `accepted`, `rejected` |
| Invitation | `pending`, `accepted`, `revoked` |

## Truth Boundaries

- Parser truth lives in `DocumentVersion.active_parse_run_id` and related parse tables.
- Compare truth lives in `CompareRun` and `ChangeItem`.
- Human review truth lives in `ChangeItem.review_status`, `assignee_user_id`, `summary`, and `ReviewComment`.
- Requirement/test traceability truth is created by user-confirmed links and mappings.
- AI Review, AI requirement extraction, AI traceability suggestions, and Contract Q&A are support layers.
- Compare-scoped Contract Q&A may explain compare truth, but it must not create or overwrite compare truth.
- Summary/export is derived output, not an independent truth source.

## Environment Variables

| Variable | Default | Role |
| --- | --- | --- |
| `REDLINE_DATABASE_URL` | PostgreSQL local URL | Runtime database |
| `REDLINE_UPLOADS_DIR` | `src/backend/uploads` | Local upload directory |
| `REDLINE_UPLOAD_STORAGE_BACKEND` | `local` | `local`, `persistent-local`, `ephemeral-demo`, or `object` |
| `REDLINE_OBJECT_STORAGE_*` | empty | S3-compatible storage settings for deployments |
| `REDLINE_AUTH_SECRET` | local dev secret | Signs auth sessions; replace outside local dev |
| `REDLINE_AUTH_COOKIE_SAMESITE` | `lax` | Auth cookie SameSite policy |
| `REDLINE_CORS_ORIGINS` | localhost origins | Cookie-authenticated browser origins |
| `REDLINE_GOOGLE_CLIENT_ID` | empty | Google OAuth Web Client ID |
| `REDLINE_AI_PRIMARY_PROVIDER` | `gemini` | Primary LLM provider |
| `REDLINE_AI_GEMINI_API_KEY` | empty | Gemini API key |
| `REDLINE_AI_GEMINI_MODEL` | `gemini-3.1-flash-lite` | Primary Gemini model |
| `REDLINE_RAG_EMBEDDING_PROVIDER` | `local-hash` unless env overrides | Embedding provider |
| `REDLINE_RAG_EMBEDDING_MODEL` | `gemini-embedding-2` | Gemini embedding model |
| `REDLINE_RAG_EMBEDDING_DIMENSIONS` | `3072` | pgvector embedding dimension |
| `REDLINE_CONTRACT_CHAT_STREAMING_ENABLED` | `true` | Backend streaming kill switch |
| `VITE_API_BASE_URL` | `http://127.0.0.1:8000` | Frontend API target |
| `VITE_GOOGLE_CLIENT_ID` | empty | Google login client ID |
| `VITE_CONTRACT_CHAT_STREAMING_ENABLED` | `true` | Frontend streaming kill switch |

## Canonical Fixture Sets

| Fixture set | Source |
| --- | --- |
| Full system demo | `docs/demo/full-system-demo/source-contracts.md` |
| Full system fixture builder | `docs/demo/full-system-demo/scripts/build_full_demo_fixtures.py` |
| English eval pack | `docs/testing/eval-pack/sample-contract-notes.md` |
| Vietnamese showcase | `docs/testing/demo-showcase/vn-sample-contract-notes.md` |

Generated files belong under `output/` and are ignored by git.

## Automated Suites

### Backend

```powershell
cd src/backend
.\.venv\Scripts\python -m pytest tests -q
```

Expected baseline: `268 passed`.

### Frontend

```powershell
cd src/frontend
npm run test -- --run
npm run build
npm audit
```

Expected baseline: `112 passed`, build succeeds, `0 vulnerabilities`.

## Backend Test File Map

- auth/account: `src/backend/tests/test_auth_api.py`, `test_avatar_api.py`
- projects/team/activity: `test_projects_api.py`, `test_activity_logs_api.py`
- contracts/documents/uploads: `test_contracts_api.py`, `test_documents_api.py`, `test_upload_storage.py`
- parser: `test_document_parser*.py`, `test_document_pdf_parser.py`, `test_parser_workspace_api.py`
- compare/change items: `test_compare_api.py`, `test_change_items_api.py`
- AI review/batch/summary: `test_ai_review_drafts_api.py`, `test_ai_batch_jobs_api.py`, `test_ai_batch_worker.py`, `test_ai_summary_api.py`, `test_llm_adapter.py`
- Contract Q&A/RAG: `test_contracts_api.py`, `test_rag_service.py`, `test_rag_maintenance.py`
- requirements/test cases/mappings: `test_requirements_api.py`, `test_test_cases_api.py`, `test_requirement_test_case_mappings_api.py`, `test_requirement_candidates_api.py`
- export/analytics/schema/deploy config: `test_export_docx_api.py`, `test_analytics_api.py`, `test_schema_baseline.py`, `test_database_settings.py`, `test_deployment_config.py`

## Frontend Test File Map

- auth/session/account: `src/frontend/src/pages/AuthPage.test.jsx`, `src/frontend/src/auth/AuthContext.test.jsx`, `src/frontend/src/pages/AccountPage.test.jsx`
- shell/routes: `src/frontend/src/app-routes.test.jsx`, `src/frontend/src/components/ScreenFrame.test.jsx`
- project/contract/document: `ProjectListPage.test.jsx`, `ProjectDetailPage.test.jsx`, `ContractDetailPage.test.jsx`, `DocumentDetailPage.test.jsx`
- parser/compare/review: `ParserWorkspacePage.test.jsx`, `CompareScreenPage.test.jsx`, `ReviewPanelPage.test.jsx`
- traceability/summary/analytics/chat: `TraceabilityImpactPage.test.jsx`, `SummaryExportPage.test.jsx`, `ProjectAnalyticsPage.test.jsx`, `ContractChatPage.test.jsx`
