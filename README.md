# Redline

Redline is an AI-powered contract review platform for legal and commercial
teams. It helps reviewers upload contract drafts, parse them into structured
blocks, compare revisions, generate RAG-assisted review suggestions, and ask
grounded contract questions with source citations.

```text
Project -> Contract -> Draft Upload -> Parse -> Compare
        -> AI Review -> Human Review -> Contract Q&A
        -> Summary / Export -> Analytics
```

## Table of Contents

- [Project Status](#project-status)
- [Core Workflow](#core-workflow)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [Repository Layout](#repository-layout)
- [Quickstart with Docker](#quickstart-with-docker)
- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [Verification](#verification)
- [Demo Data](#demo-data)
- [Deployment Notes](#deployment-notes)
- [Troubleshooting](#troubleshooting)
- [Documentation Map](#documentation-map)

## Project Status

Updated: 2026-05-23

The system is deployable as a full-stack web application and has been verified
on the Docker path expected for local installation and review.

Latest verified baseline:

| Area | Result |
| --- | --- |
| Backend test suite | `274 passed` |
| Frontend test suite | `116 passed` across 19 files |
| Frontend production build | Passes, with Vite chunk-size warning only |
| Alembic schema check | No new upgrade operations detected |
| Docker full stack | Backend, frontend, and PostgreSQL start successfully |
| PDF OCR health | Healthy with `eng+vie` Tesseract languages |
| RAG health | Healthy with PostgreSQL + pgvector, 3072 dimensions |
| NPM audit | `0 vulnerabilities` |

## Core Workflow

1. Create a project for a review engagement.
2. Create a contract workspace inside the project.
3. Upload two DOCX or PDF drafts.
4. Parse drafts into deterministic document blocks and surfaces.
5. Compare parsed drafts to detect added, removed, and modified clauses.
6. Generate RAG-enhanced AI review suggestions for clause changes.
7. Confirm human review status and comments.
8. Ask contract questions against one parsed draft or a selected compare run,
   with grounded citations.
9. Export summary reports and inspect analytics.

## Key Features

| Area | Capabilities |
| --- | --- |
| Authentication | Local email/password, Google OAuth, HttpOnly cookie sessions, CSRF protection, DB-backed rate limiting |
| Account Management | Profile update, password change, avatar upload/remove with 256x256 WebP processing |
| Contract Management | Project, contract, draft, member, invitation, requirement, and test case workflows |
| Parser | DOCX body/header/footer/footnote/endnote/table parsing; PDF text-layer parsing; OCR fallback with Tesseract |
| Compare | Deterministic clause-level diff between parsed drafts |
| AI Review | Per-item and batched AI review draft generation with RAG context |
| Contract Q&A | Attempt-driven streaming chat, single-draft and compare-run scopes, LLM synthesis when configured, grounded citations, source evidence panel, cancel/retry |
| Traceability | Requirement links, test-case mappings, impacted test calculation, AI link suggestions |
| Summary / Export | AI summary, Markdown export, DOCX report export |
| Analytics | Project-level metrics and review status charts |

## Truth Boundaries

Redline deliberately separates deterministic truth from AI assistance:

- Parser truth: structured blocks produced from uploaded drafts.
- Compare truth: deterministic added, removed, and modified clause changes.
- AI Review truth: draft suggestions only.
- Human review truth: reviewer-confirmed status and comments.
- Contract Q&A truth: answer text plus citations to parsed source blocks or
  deterministic compare changes.

AI never overwrites parser truth, compare truth, or human-confirmed review
truth.

## Architecture

```text
Browser / React Vite
        |
        | Cookie auth + CSRF + JSON/SSE
        v
FastAPI backend
        |
        +-- PostgreSQL + pgvector
        |     - users, projects, contracts, drafts
        |     - parse runs, blocks, compare runs
        |     - review drafts, chat sessions, embeddings
        |
        +-- Upload storage
        |     - local / persistent-local for development
        |     - object storage for deploys
        |
        +-- Parser services
        |     - python-docx for DOCX
        |     - PyMuPDF + Tesseract for PDF/OCR
        |
        +-- AI/RAG services
              - Gemini or OpenAI-compatible LLM provider
              - Gemini embeddings or local hash fallback
              - pgvector retrieval
```

## Technology Stack

| Layer | Tools |
| --- | --- |
| Backend | Python 3.11+, FastAPI, SQLAlchemy, Alembic, Gunicorn/Uvicorn |
| Database | PostgreSQL 17, pgvector |
| Parser | python-docx, PyMuPDF, pytesseract, Tesseract OCR |
| Storage | Local disk, persistent Docker volume, S3-compatible object storage |
| Frontend | React 19, Vite 7, Tailwind CSS 4, Recharts, lucide-react |
| Testing | Pytest, Vitest, Docker Compose smoke checks |
| AI/RAG | Direct Gemini, OpenAI-compatible provider support, Gemini embeddings |

## Repository Layout

```text
redline/
|-- README.md
|-- compose.yml
|-- docs/
|   |-- demo/full-system-demo/
|   `-- testing/
`-- src/
    |-- backend/
    |   |-- app/
    |   |-- alembic/
    |   |-- tests/
    |   |-- Dockerfile
    |   |-- pyproject.toml
    |   `-- .env.example
    `-- frontend/
        |-- src/
        |-- public/
        |-- Dockerfile
        |-- package.json
        |-- package-lock.json
        `-- .env.example
```

## Quickstart with Docker

This is the recommended path for local operators and reviewers. It starts PostgreSQL,
backend, and frontend from one command.

### Prerequisites

- Docker Desktop
- Git
- Optional: a Gemini API key for real provider-backed AI features
- Optional: a Google OAuth Web Client ID for Google login

### 1. Create local env files

From the repository root:

```powershell
Copy-Item src/backend/.env.example src/backend/.env
Copy-Item src/frontend/.env.example src/frontend/.env
```

The app can run locally without Google OAuth. Provider-backed AI features need
`REDLINE_AI_GEMINI_API_KEY`; deterministic parser/compare/profile workflows do
not.

### 2. Start the full stack

```powershell
docker compose up --build
```

Open:

- Frontend: `http://localhost:5173`
- Backend Swagger UI: `http://localhost:8000/docs`
- Backend health: `http://localhost:8000/health`

### 3. Seed demo users

In a second terminal:

```powershell
docker compose exec backend python -m app.seed
```

Demo login:

| Email | Password |
| --- | --- |
| `vinh@example.com` | `redline123` |
| `my@example.com` | `redline123` |
| `ly@example.com` | `redline123` |

You can also create a new account from the UI.

## Local Development

Use this path when developing without running backend/frontend inside Docker.
PostgreSQL still runs from Docker.

### Backend

```powershell
docker compose up -d postgres
cd src/backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -e .[dev]
Copy-Item .env.example .env
.\.venv\Scripts\python -m alembic upgrade head
.\.venv\Scripts\python -m app.seed
.\.venv\Scripts\python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend

```powershell
cd src/frontend
npm install
npm run dev
```

Frontend URL: `http://localhost:5173`

## Environment Variables

### Backend

Backend configuration lives in `src/backend/.env`. Use
`src/backend/.env.example` as the template.

| Variable | Required for local run | Notes |
| --- | --- | --- |
| `REDLINE_DATABASE_URL` | Yes | PostgreSQL URL. Docker Compose overrides this for containers. |
| `REDLINE_AUTH_SECRET` | Recommended | Use a unique random value outside local demos. |
| `REDLINE_CORS_ORIGINS` | Yes | Browser origins allowed to call the API with cookies. |
| `REDLINE_UPLOAD_STORAGE_BACKEND` | Yes | `local`, `persistent-local`, `ephemeral-demo`, or `object`. |
| `REDLINE_AI_GEMINI_API_KEY` | Optional | Enables provider-backed AI Review, AI Summary, AI suggestions, and LLM synthesis. |
| `REDLINE_AI_GEMINI_MODEL` | Optional | Defaults to `gemini-3.1-flash-lite`. |
| `REDLINE_RAG_EMBEDDING_MODEL` | Optional | Defaults to `gemini-embedding-2`. |
| `REDLINE_GOOGLE_CLIENT_ID` | Optional | Required only for Google login. |
| `REDLINE_OBJECT_STORAGE_*` | Deploy only | Required when `REDLINE_UPLOAD_STORAGE_BACKEND=object`. |

Generate an auth secret:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

### Frontend

Frontend configuration lives in `src/frontend/.env`. Use
`src/frontend/.env.example` as the template.

| Variable | Required | Notes |
| --- | --- | --- |
| `VITE_API_BASE_URL` | Yes | Backend API base URL. Local default: `http://127.0.0.1:8000`. |
| `VITE_GOOGLE_CLIENT_ID` | Optional | Must match `REDLINE_GOOGLE_CLIENT_ID` for Google login. |
| `VITE_CONTRACT_CHAT_STREAMING_ENABLED` | Optional | Set `false` to use JSON fallback for Contract Q&A. |

## Verification

Run these commands before release, deployment, or demo.

### Backend tests

```powershell
cd src/backend
.\.venv\Scripts\python -m pytest tests -q
```

Expected baseline: `274 passed`.

### Frontend tests

```powershell
cd src/frontend
npm run test -- --run
```

Expected baseline: `116 passed`.

### Frontend production build

```powershell
cd src/frontend
npm run build
```

The build passes. A Vite chunk-size warning is expected and does not block the
demo.

### Dependency audit

```powershell
cd src/frontend
npm audit
```

Expected baseline: `0 vulnerabilities`.

### Database migration check

```powershell
cd src/backend
.\.venv\Scripts\python -m alembic check
```

Expected baseline: `No new upgrade operations detected.`

### Docker smoke checks

```powershell
docker compose up --build -d
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/health
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5173
docker compose exec backend python -m app.parser_admin pdf-ocr-health --strict
docker compose exec backend python -m app.rag_admin health --strict
```

## Demo Data

Seed simple demo users:

```powershell
docker compose exec backend python -m app.seed
```

Build realistic contract fixtures:

```powershell
.\src\backend\.venv\Scripts\python docs/demo/full-system-demo/scripts/build_full_demo_fixtures.py
```

Generated files are written to `output/full-system-demo/fixtures/` and are
ignored by git.

Recommended demo documents:

- MSA v1 and MSA v2 for legal clause compare.
- SOW v1 and SOW v2 for delivery/commercial impact.
- Security Addendum PDF for PDF text-layer and OCR parser checks.

See `docs/demo/full-system-demo/README.md` for the full runbook.

## Deployment Notes

### Frontend on Vercel

- Deploy from `src/frontend`.
- Set `VITE_API_BASE_URL` to the public backend URL.
- Set `VITE_GOOGLE_CLIENT_ID` only if Google login is enabled.

### Backend on Heroku

- Deploy `src/backend` as the app root, or push it through a backend subtree
  workflow.
- Set `REDLINE_ENVIRONMENT=production`.
- Set `REDLINE_AUTH_SECRET` to a unique secure value.
- Set `REDLINE_CORS_ORIGINS` to the exact HTTPS frontend origin.
- Do not use wildcard CORS with cookie authentication.

### Upload Storage in Deployments

Local Docker uses persistent Docker volume storage. Heroku dynos use ephemeral
filesystem, so production deployments should use object storage:

```text
REDLINE_UPLOAD_STORAGE_BACKEND=object
REDLINE_OBJECT_STORAGE_BUCKET=...
REDLINE_OBJECT_STORAGE_ENDPOINT=...
REDLINE_OBJECT_STORAGE_REGION=...
REDLINE_OBJECT_STORAGE_ACCESS_KEY_ID=...
REDLINE_OBJECT_STORAGE_SECRET_ACCESS_KEY=...
```

Cloudflare R2, Supabase Storage, or any S3-compatible bucket can be used.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Failed to fetch` in the frontend | Backend not running, wrong `VITE_API_BASE_URL`, or CORS mismatch | Check backend health and frontend `.env`. |
| Google login button says unavailable | Missing frontend or backend Google client ID | Set both `VITE_GOOGLE_CLIENT_ID` and `REDLINE_GOOGLE_CLIENT_ID`. |
| Google token rejected | OAuth origin mismatch | Add `http://localhost:5173` or your deployed frontend origin in Google Cloud Console. |
| AI review fails or returns provider error | Missing/invalid Gemini API key or quota limit | Set `REDLINE_AI_GEMINI_API_KEY` and check provider quota. |
| PDF OCR fails | Tesseract or language packs missing | Use Docker path, or install `eng` and `vie` language packs locally. |
| Uploaded files disappear after deploy restart | Ephemeral filesystem | Use `REDLINE_UPLOAD_STORAGE_BACKEND=object`. |
| Alembic migration fails locally | PostgreSQL/pgvector is not running | Start `docker compose up -d postgres`, then rerun Alembic. |
| Frontend build warns about chunk size | Large app bundle | Warning only; build still succeeds. |

## Documentation Map

| Document | Purpose |
| --- | --- |
| `docs/demo/full-system-demo/README.md` | Realistic end-to-end demo kit |
| `docs/testing/README.md` | Testing pack and regression procedures |
| `docs/testing/tutorial-redline-e2e-full-pass.md` | Manual full-pass tutorial |
| `docs/testing/reference-system-map.md` | Ports, commands, routes, and fixture map |
| `docs/testing/how-to-run-full-regression.md` | Comprehensive automated and manual regression suite guide |
| `docs/testing/explanation-testing-model-and-truth-boundaries.md` | Deep dive into data integrity and AI integration limits |

## Team

| Member | Role |
| --- | --- |
| Dat Vinh | Technical lead and main developer |
| My | Business analysis, UX, and testing support |
| Ly | Documentation, tracking, and QA support |

## License

This repository does not currently declare an open-source license.
