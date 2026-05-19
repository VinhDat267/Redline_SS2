# Reference: System Map

Tai lieu nay tong hop cac thong tin "dictionary" de nguoi test mo dung route, dung fixture, va hieu cac status trong Redline.

## Runtime map

### Frontend
- default URL: `http://127.0.0.1:5173`
- API base mac dinh: `http://127.0.0.1:8000`
- file tham chieu: `src/frontend/src/lib/api.js`

### Backend
- default URL: `http://127.0.0.1:8000`
- Swagger UI: `http://127.0.0.1:8000/docs`
- config: `src/backend/app/core/config.py`
- app entry: `src/backend/app/main.py`

### Database
- default SQLite path: `src/backend/data/redline.db`
- env override: `REDLINE_DATABASE_URL`

## Frontend route map
| Route | Page | Muc dich |
| --- | --- | --- |
| `/login` | AuthPage | register / login |
| `/` | ProjectListPage | project inventory, seed demo, pending invitations |
| `/projects/:projectId` | ProjectDetailPage | document inventory, team, requirements, test cases, activity |
| `/projects/:projectId/analytics` | ProjectAnalyticsPage | charts va aggregate analytics |
| `/documents/:documentId` | DocumentDetailPage | version inventory, upload, compare setup |
| `/documents/:documentId/parser` | ParserWorkspacePage | parser truth va AI requirement extraction |
| `/compare-runs/:compareRunId` | CompareScreenPage | compare queue, selected change, AI batch |
| `/compare-runs/:compareRunId/review` | ReviewPanelPage | review decision, AI signals, comments |
| `/compare-runs/:compareRunId/impact` | TraceabilityImpactPage | requirement link, impacted tests, mappings |
| `/compare-runs/:compareRunId/summary` | SummaryExportPage | AI summary, export markdown/docx |

## Backend API map

### Auth
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/google`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `PATCH /api/v1/auth/me`
- `POST /api/v1/auth/me/password`
- `POST /api/v1/auth/project-invitations/{invitation_id}/accept`

### Demo
- `POST /api/v1/demo/seed`

### Projects / team / analytics / activity
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

### Documents / versions / parser
- `GET /api/v1/projects/{project_id}/documents`
- `POST /api/v1/projects/{project_id}/documents`
- `GET /api/v1/documents/{document_id}`
- `PATCH /api/v1/documents/{document_id}`
- `DELETE /api/v1/documents/{document_id}`
- `GET /api/v1/documents/{document_id}/versions`
- `POST /api/v1/documents/{document_id}/versions`
- `GET /api/v1/document-versions/{version_id}`
- `PATCH /api/v1/document-versions/{version_id}`
- `DELETE /api/v1/document-versions/{version_id}`
- `POST /api/v1/document-versions/{version_id}/parse`
- `GET /api/v1/documents/{document_id}/parser-workspace`
- `GET /api/v1/document-versions/{version_id}/parser-surfaces/{surface_id}`

### AI requirement extraction
- `GET /api/v1/document-versions/{version_id}/requirement-candidates`
- `POST /api/v1/document-versions/{version_id}/requirement-candidates/generate`
- `POST /api/v1/requirement-candidates/{candidate_id}/accept`
- `POST /api/v1/requirement-candidates/{candidate_id}/reject`

### Compare / AI batch / summary / export
- `POST /api/v1/documents/{document_id}/compare-runs`
- `GET /api/v1/compare-runs/{compare_run_id}`
- `GET /api/v1/compare-runs/{compare_run_id}/change-items`
- `POST /api/v1/compare-runs/{compare_run_id}/ai-review-drafts/generate`
- `GET /api/v1/ai-batch-jobs/{job_id}`
- `GET /api/v1/ai-batch-jobs/{job_id}/items`
- `POST /api/v1/compare-runs/{compare_run_id}/ai-summary-drafts/generate`
- `GET /api/v1/compare-runs/{compare_run_id}/export/docx`

### Change items / review / traceability
- `GET /api/v1/change-items/{change_item_id}`
- `PATCH /api/v1/change-items/{change_item_id}`
- `POST /api/v1/change-items/{change_item_id}/comments`
- `POST /api/v1/change-items/{change_item_id}/ai-review-draft/generate`
- `POST /api/v1/change-items/{change_item_id}/requirement-links`
- `DELETE /api/v1/change-items/{change_item_id}/requirement-links/{requirement_id}`

### Requirements / test cases / mappings
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

## Status va enum map

### Document version parse status
- `pending`
- `parsed`
- `parsed_with_warnings`
- `failed`

### Compare run status
- `pending`
- `running`
- `completed`
- `completed_with_warnings`
- `failed`

### Change item
- `change_type`: `added`, `removed`, `modified`
- `review_status`: `open`, `in_review`, `resolved`
- `surface_type`: `body`, `header`, `footer`, `footnote`, `endnote`

### AI review draft
- `generation_status`: `pending`, `generated`, `failed`
- `recommended_review_status`: chi hop le voi `open`, `in_review`

### Requirement candidate
- `pending`
- `accepted`
- `rejected`

### Invitation
- `pending`
- `accepted`
- `revoked`

## Truth boundaries can nho khi test
- parser truth active nam o `DocumentVersion.active_parse_run_id`
- compare truth nam o `CompareRun` + `ChangeItem`
- review truth da confirm nam o `ChangeItem.review_status`, `assignee_user_id`, `summary`, va `ReviewComment`
- AI chi duoc ghi vao `AIReviewDraft` va `AIRequirementCandidate`
- summary/export la derived output, khong phai entity truth doc lap

## Env variables can biet
| Variable | Mac dinh | Vai tro |
| --- | --- | --- |
| `REDLINE_DATABASE_URL` | SQLite local | doi DB khi test |
| `REDLINE_UPLOADS_DIR` | `src/backend/uploads` | noi luu file upload |
| `REDLINE_AUTH_SECRET` | local dev secret | ky auth session |
| `REDLINE_AUTH_COOKIE_SAMESITE` | `lax` | SameSite policy cho auth cookie |
| `REDLINE_AI_GEMINI_API_KEY` | none | AI primary |
| `REDLINE_AI_GEMINI_MODEL` | `gemini-3.1-flash-lite` | model primary |
| `REDLINE_AI_OPENAI_API_KEY` | none | AI fallback |
| `REDLINE_AI_OPENAI_MODEL` | `gpt-4.1-mini` | model fallback |
| `REDLINE_AI_OPENAI_BASE_URL` | none | OpenAI-compatible endpoint |
| `REDLINE_AI_BATCH_WORKER_ENABLED` | `true` | bat / tat batch worker |
| `VITE_API_BASE_URL` | `http://127.0.0.1:8000` | frontend API target |

## Canonical fixture set

### Current legal demo fixtures
- `docs/demo/full-system-demo/source-contracts.md`
- `docs/demo/full-system-demo/scripts/build_full_demo_fixtures.py`
- `docs/testing/eval-pack/sample-contract-notes.md`
- `docs/testing/demo-showcase/vn-sample-contract-notes.md`

Legacy SRS parser fixtures were removed from the source tree after the product pivot to AI Contract Review.

## Automated suites

### Backend
```powershell
cd src/backend
.\.venv\Scripts\python -m pytest tests -q
```

### Frontend
```powershell
cd src/frontend
npm run test -- --run
npm run build
```

## Backend test file map
- auth / seed: `src/backend/tests/test_auth_api.py`
- projects / team: `src/backend/tests/test_projects_api.py`
- project activity log: `src/backend/tests/test_activity_logs_api.py`
- documents / versions: `src/backend/tests/test_documents_api.py`
- parser engine: `src/backend/tests/test_document_parser*.py`
- parser workspace: `src/backend/tests/test_parser_workspace_api.py`
- compare: `src/backend/tests/test_compare_api.py`
- change items / review: `src/backend/tests/test_change_items_api.py`
- AI review / batch jobs: `src/backend/tests/test_ai_review_drafts_api.py`, `test_ai_batch_jobs_api.py`, `test_ai_batch_worker.py`, `test_llm_adapter.py`
- AI summary / export / analytics: `test_ai_summary_api.py`, `test_export_docx_api.py`, `test_analytics_api.py`
- requirements / test cases / mappings: `test_requirements_api.py`, `test_test_cases_api.py`, `test_requirement_test_case_mappings_api.py`, `test_requirement_candidates_api.py`

## Frontend test file map
- auth: `src/frontend/src/pages/AuthPage.test.jsx`
- project list: `src/frontend/src/pages/ProjectListPage.test.jsx`
- project detail: `src/frontend/src/pages/ProjectDetailPage.test.jsx`
- document detail: `src/frontend/src/pages/DocumentDetailPage.test.jsx`
- parser workspace: `src/frontend/src/pages/ParserWorkspacePage.test.jsx`
- compare workspace: `src/frontend/src/pages/CompareScreenPage.test.jsx`
- review workspace: `src/frontend/src/pages/ReviewPanelPage.test.jsx`
- traceability: `src/frontend/src/pages/TraceabilityImpactPage.test.jsx`
- summary/export: `src/frontend/src/pages/SummaryExportPage.test.jsx`
- analytics: `src/frontend/src/pages/ProjectAnalyticsPage.test.jsx`
