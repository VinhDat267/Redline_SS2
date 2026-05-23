# Demo Showcase Release Freeze Checklist

Status: freeze target for Compare, RAG AI Review, and Contract Q&A.

Freeze rule: after this checklist is accepted, only blocker fixes, demo-script
corrections, verification evidence, and small copy polish should enter the
demo path. New product features are out unless they unblock the demo.

## Frozen Scope

These are the accepted story pillars:

- [x] Contract workspace with contract drafts.
- [x] DOCX upload and parse.
- [x] PDF text parsing and OCR fallback when Tesseract is available.
- [x] Deterministic compare between two contract drafts.
- [x] Clause-change queue for reviewer inspection.
- [x] RAG-enhanced AI Review draft on selected clause changes.
- [x] Human reviewer remains final decision owner.
- [x] Requirement links and AI-suggested traceability links require user
  confirmation before becoming truth.
- [x] Contract Q&A over the current parsed draft.
- [x] Attempt-driven authenticated streaming for Contract Q&A.
- [x] Citation panel/source evidence for Q&A answers.
- [x] JSON chat fallback remains only a kill switch.

## Explicitly Out Of Scope

Do not add these unless a blocker proves they are required:

- [x] Autonomous legal approval.
- [x] Playbook review as a separate product pillar.
- [x] Cross-contract search.
- [x] Realtime collaboration.
- [x] Notifications.
- [x] Complex RBAC.
- [x] Celery/Redis worker architecture.
- [x] Global internal domain rename.

## Truth Boundaries

These boundaries must be preserved in demo and report wording:

- [x] Parser output is source text truth.
- [x] Compare output is deterministic compare truth.
- [x] AI Review is a suggestion layer only.
- [x] Contract Q&A must be grounded in parsed/retrieved contract blocks.
- [x] Citations point to `DocumentBlock` evidence.
- [x] Human reviewer owns final review status and comments.
- [x] AI-suggested traceability links are not final until accepted by the user.
- [x] AI must not overwrite compare truth, final review truth, or traceability
  truth.

## Runtime Gates

Before the demo can be treated as ready:

- [x] PostgreSQL + pgvector starts through Docker Compose.
- [x] Backend, frontend, and database can run through `docker compose up --build`.
- [x] Alembic is at head.
- [x] `python -m app.rag_admin health --strict` returns healthy when Gemini is
  configured.
- [x] Direct Gemini LLM configuration is supported by backend settings.
- [x] Direct Gemini embedding configuration uses `gemini-embedding-2`.
- [x] Gemini embeddings remain 3072-dimensional for pgvector compatibility.
- [x] Backend serves FastAPI at `http://localhost:8000`.
- [x] Frontend serves Vite at `http://localhost:5173`.
- [x] Contract chat streaming env is enabled for the primary demo path.

## Evidence Gates

Required evidence:

- [x] Backend test suite passes.
- [x] Frontend test suite passes.
- [x] Frontend production build passes.
- [x] Alembic schema drift check passes.
- [x] Docker full-stack smoke passes.
- [x] PDF/OCR health passes in the Docker backend image.
- [x] RAG health passes when Gemini is configured.

Optional showcase evidence:

- [x] EN provider-backed eval pack for AI Review and Contract Q&A.
- [x] VN showcase API rehearsal.
- [x] VN showcase UI smoke.

## Final Demo Checklist

Run this before a recorded or live demo:

- [ ] Confirm `REDLINE_AI_GEMINI_API_KEY` is set in `src/backend/.env` if
  provider-backed AI is shown.
- [ ] Run `docker compose up --build -d`.
- [ ] Run `docker compose exec backend python -m app.seed`.
- [ ] Run `docker compose exec backend python -m app.rag_admin health --strict`.
- [ ] Run `docker compose exec backend python -m app.parser_admin pdf-ocr-health --strict`.
- [ ] Build VN fixtures with
  `docker compose run --rm --no-deps -v "${PWD}:/workspace" -w /workspace backend python docs/testing/demo-showcase/scripts/build_vn_showcase_fixtures.py`.
- [ ] Open `docs/testing/demo-showcase/operator-handoff.md`.
- [ ] Use one clean browser profile or a known demo account.
- [ ] Avoid legacy `/documents` routes unless asked.
- [ ] Keep the narrative on Compare + RAG AI Review + Contract Q&A.

## No-Go Conditions

Pause the demo or switch to recorded evidence if any of these happen:

- [ ] Backend or frontend is unreachable.
- [ ] Login fails for all accounts.
- [ ] RAG health reports `embedding_provider_ok=false` while provider-backed AI
  is being presented.
- [ ] RAG health reports stale blocks for the target demo data.
- [ ] Contract Q&A falls back to uncited answers.
- [ ] Compare cannot be created after both drafts are parsed.
- [ ] AI Review generation fails for selected changes.
- [ ] Frontend redirects authenticated demo routes back to `/login`.

## Allowed Changes After Freeze

Allowed:

- Fix blockers found by the no-go list.
- Update demo wording or screenshots.
- Repair local environment setup instructions.
- Fix small UI overlap/readability issues on priority pages.
- Update evidence after rerunning the same rehearsal.

Not allowed:

- Add new routes.
- Add new product pillars.
- Rework architecture.
- Rename internals globally.
- Expand the showcase into a measured benchmark.
