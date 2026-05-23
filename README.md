# Redline

Redline is an AI-powered Contract Review application for `62FIT3SS2 - Special Subject 2`, focused on deterministic compare, RAG-enhanced AI review, and grounded contract Q&A.

```text
Project → Contract → DOCX/PDF Draft Upload → Parse → Compare
→ RAG-Enhanced AI Review → Human Review → Contract Q&A
→ Summary / Export → Analytics
```

## Current Status

Updated: 2026-05-23

The application is fully functional with production deployments on Heroku (backend) and Vercel (frontend).

**Stack:**

- **Backend:** FastAPI, SQLAlchemy, Alembic, PostgreSQL + pgvector, Pillow (avatar processing)
- **Frontend:** React 19, Vite, Tailwind CSS, Recharts
- **Auth:** HttpOnly cookie sessions, CSRF tokens, Google OAuth, DB-backed rate limiting
- **AI/RAG:** Direct Gemini or OpenAI-compatible providers, Gemini embeddings (3072-dim), pgvector retrieval

**Test suite:**

- Backend: **265 passed** (Pytest, SQLite fixtures)
- Frontend: **111 passed** (Vitest, 19 test files)
- Frontend build: passes (Vite chunk-size warning only)

**Core truth boundaries:**

- Parser and compare truth are **deterministic** — AI never overrides them.
- AI Review and Contract Q&A are **suggestion/support layers** only.
- Human-confirmed review status and requirement/test-case mappings are the **final workflow truth**.

## Project Structure

```text
RedlineSS2/
├── docs/               # Project documentation, testing pack, demo kits
│   ├── demo/           # Full system demo kit (MedNova/Aster Cloud)
│   ├── design/         # Stitch design system description
│   └── testing/        # Testing pack, eval harness, VN showcase
├── src/
│   ├── backend/        # FastAPI + SQLAlchemy + Alembic
│   └── frontend/       # React + Vite + Tailwind
└── README.md           # This file
```

## Quickstart

### Prerequisites

- Docker (for the full local stack or PostgreSQL + pgvector only)
- Python 3.12 recommended; backend package supports Python 3.11+
- Node.js 18+ with npm

### Full Docker Stack

Use this path when you want PostgreSQL, backend, and frontend to run from Docker:

```powershell
Copy-Item src/backend/.env.example src/backend/.env
Copy-Item src/frontend/.env.example src/frontend/.env
# Optional: fill REDLINE_AI_GEMINI_API_KEY for real AI Review / Contract Q&A synthesis.
# Optional: fill REDLINE_GOOGLE_CLIENT_ID and VITE_GOOGLE_CLIENT_ID for Google login.
docker compose up --build
```

Open:

- Frontend: `http://localhost:5173`
- Backend Swagger UI: `http://localhost:8000/docs`

The Docker stack reads `src/backend/.env` and `src/frontend/.env`, then overrides container-specific values such as `REDLINE_DATABASE_URL`, upload paths, CORS, and Tesseract paths. To seed demo data:

```powershell
docker compose exec backend python -m app.seed
```

If you use Google login locally, the Google OAuth Web Client must allow `http://localhost:5173` as an authorized JavaScript origin.

### Local Backend

```powershell
docker compose up -d postgres
cd src/backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -e .[dev]
Copy-Item .env.example .env
# Optional: fill REDLINE_AI_GEMINI_API_KEY in .env for real Gemini AI/RAG features.
.\.venv\Scripts\python -m alembic upgrade head
.\.venv\Scripts\python -m app.seed
.\.venv\Scripts\python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Swagger UI: `http://127.0.0.1:8000/docs`

The backend always loads `src/backend/.env` by absolute path, so settings stay consistent regardless of working directory. RAG runtime uses PostgreSQL + pgvector via `compose.yml`; run Alembic after starting Docker so the `vector` extension exists.

### Local Frontend

```powershell
cd src/frontend
npm install
npm run dev
```

Dev server: `http://localhost:5173`

## Verification

```powershell
# Backend tests (SQLite fixtures)
cd src/backend
.\.venv\Scripts\python -m pytest tests -q

# Frontend tests
cd src/frontend
npm run test -- --run

# Frontend production build
npm run build

# RAG embedding health (requires running PostgreSQL)
cd src/backend
.\.venv\Scripts\python -m app.rag_admin health --strict
```

For manual end-to-end rehearsal, see `docs/testing/tutorial-redline-e2e-full-pass.md`.

## Deploy Notes

- **Vercel frontend:** deploy from `src/frontend` with `VITE_API_BASE_URL` pointing to the Heroku backend URL.
- **Heroku backend:** backend deploy files live under `src/backend/`; deploy that directory as the app root, or push it with a subtree workflow.
- **Uploads:** Heroku dynos use ephemeral disk. For real deployments set `REDLINE_UPLOAD_STORAGE_BACKEND=object` and configure `REDLINE_OBJECT_STORAGE_*` for an S3-compatible bucket. Use `ephemeral-demo` only for short demo deployments, because uploaded contracts and avatars can disappear after dyno restart/redeploy.
- **Object storage vars:** set `REDLINE_OBJECT_STORAGE_BUCKET`, `REDLINE_OBJECT_STORAGE_ACCESS_KEY_ID`, `REDLINE_OBJECT_STORAGE_SECRET_ACCESS_KEY`, and usually `REDLINE_OBJECT_STORAGE_ENDPOINT` + `REDLINE_OBJECT_STORAGE_REGION`. Set `REDLINE_OBJECT_STORAGE_PUBLIC_BASE_URL` when avatar files should be served through a public bucket/CDN URL.
- **CORS:** set `REDLINE_CORS_ORIGINS` on Heroku to the exact Vercel frontend origin.

## Main Routes

| Route | Purpose |
|-------|---------|
| `/` | Project inventory, starter seed, pending invitations |
| `/account` | User profile, avatar upload, password management |
| `/projects/:projectId` | Contract, requirement, test case, team, activity workspace |
| `/projects/:projectId/analytics` | Project analytics dashboard |
| `/contracts/:contractId` | Contract draft inventory, DOCX/PDF upload, compare setup |
| `/contracts/:contractId/chat` | Grounded contract Q&A workspace |
| `/documents/:documentId` | Document version inventory and metadata |
| `/documents/:documentId/parser` | Parser workspace and AI requirement extraction |
| `/compare-runs/:compareRunId` | Compare workspace and AI review batch generation |
| `/compare-runs/:compareRunId/review` | Human review workspace |
| `/compare-runs/:compareRunId/impact` | Traceability and affected test impact |
| `/compare-runs/:compareRunId/summary` | AI summary, Markdown export, DOCX report export |

## Key Features

- **Auth:** Local email/password + Google OAuth, HttpOnly cookie sessions, CSRF protection, DB-backed rate limiting on all auth endpoints, avatar upload with server-side image processing (256×256 WebP)
- **Parser:** DOCX body/header/footer/footnote/endnote/table surfaces, PDF text-layer + OCR fallback (Tesseract), legal numbering classification
- **Compare:** Deterministic clause-level diff between two parsed drafts
- **AI Review:** RAG-enhanced per-item and batch generation, with/without-RAG controlled baseline
- **Contract Q&A:** Attempt-driven streaming chat with grounded citations, session memory, metadata-intent routing, cooperative cancel/retry
- **Traceability:** Requirement ↔ test case mapping, impacted test calculation from clause changes
- **Summary/Export:** AI-generated summary, Markdown export, DOCX report
- **Analytics:** Project-level statistics, document breakdown, review status charts

## Repository Guide

| Document | Purpose |
|----------|---------|
| `docs/demo/full-system-demo/README.md` | Realistic end-to-end demo kit |
| `docs/testing/README.md` | Testing pack and regression procedures |
| `docs/design/` | Current visual/product design reference |

## Team

- **Dat Vinh** — Technical lead and main developer
- **My** — Business analysis, UX, and testing support
- **Ly** — Documentation, tracking, and QA support
