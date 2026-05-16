# src

Source code for the Redline AI Contract Review application.

## Layout

- `backend/` — FastAPI application with SQLAlchemy models, Alembic migrations, PostgreSQL + pgvector runtime, and Pytest coverage
- `frontend/` — React 19 + Vite + Tailwind application with authenticated workspaces and Vitest coverage

## Backend Capabilities

**Authentication & Users:**
- Local email/password registration and login
- Google OAuth (server-side ID token verification)
- HttpOnly cookie sessions with CSRF token protection
- DB-backed request rate limiting on all auth endpoints (login, register, Google, password change, avatar upload)
- User avatar upload with server-side image processing (validation, center-crop, 256×256 WebP conversion)
- Token version revocation on password change

**Contract Management:**
- Project, contract/document, contract draft/document version CRUD
- Project membership and email invitation workflow
- DOCX upload with production parser (body, tables, header, footer, footnote, endnote surfaces)
- PDF upload with text-layer extraction (PyMuPDF) and OCR fallback (Tesseract)
- Legal numbering classification and quality diagnostics

**AI-Powered Features:**
- Deterministic compare runs and clause-level change items
- RAG-enhanced AI review draft generation (per-item and batch, with/without-RAG modes)
- Contract Q&A with attempt-driven streaming, grounded citations, session memory, metadata-intent routing, and cooperative cancel
- AI requirement extraction candidates with confirm/reject workflow
- AI summary generation and DOCX report export

**Support:**
- Human review status updates and comments
- Requirement ↔ test case mapping and impacted test calculation
- Project analytics and activity logs
- PostgreSQL + pgvector as default runtime; SQLite fixtures for automated tests

## Frontend Capabilities

**Authentication:**
- Login/register with local credentials or Google OAuth
- Account page with profile editing, password change, and avatar upload/remove
- Navbar profile dropdown with real avatar display

**Workspaces:**
- Project inventory with QuickStats (real document counts), search, and pending invitations
- Project workspace with contract, requirement, test case, team, and activity tabs
- Contract detail with draft history, upload (DOCX/PDF), parse, and compare setup
- Parser workspace with block inspection, surface tabs, AI requirement extraction
- Compare workspace with clause diff, AI review generation, and filter/pagination
- Review workspace with human review command, traceability links, and AI analysis
- Contract Q&A with streaming chat, session history, source evidence panel
- Traceability impact workspace
- Summary/export with AI summary, Markdown, and DOCX report
- Project analytics dashboard with charts

Run commands are documented in the root `README.md` and `docs/testing/reference-system-map.md`.
