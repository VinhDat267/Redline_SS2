# D4 Feature Freeze Checklist

Status: freeze target for Compare + RAG AI Review + Contract Q&A.

Freeze rule: from this point, only blocker fixes, demo-script corrections, verification evidence, and small copy polish should enter D4. New product features are out unless they unblock the demo.

## Frozen Scope

These are the only D4 story pillars:

- [x] Contract workspace with contract drafts.
- [x] DOCX upload and parse.
- [x] Deterministic compare between two contract drafts.
- [x] Clause-change queue for reviewer inspection.
- [x] RAG-enhanced AI Review draft on selected clause changes.
- [x] Human reviewer remains final decision owner.
- [x] Contract Q&A over the current parsed draft.
- [x] Attempt-driven authenticated streaming for Contract Q&A.
- [x] Citation panel/source evidence for Q&A answers.
- [x] JSON chat fallback remains only a kill switch.

## Explicitly Out Of Scope

Do not add these before D4 demo unless a blocker proves they are required:

- [x] Risk Scanner as a separate feature.
- [x] Clause Library.
- [x] Playbook review.
- [x] Cross-contract search.
- [x] Full internal domain rename.
- [x] Semantic requirement/test-case auto-mapping.
- [x] Fully autonomous legal approval.
- [x] Realtime collaboration, notifications, or complex RBAC.
- [x] Celery/Redis worker architecture.
- [x] PDF parsing.

## Truth Boundaries

These boundaries must be preserved in demo and report wording:

- [x] Parser output is source text truth.
- [x] Compare output is deterministic compare truth.
- [x] AI Review is a suggestion layer only.
- [x] Contract Q&A must be grounded in parsed/retrieved contract blocks.
- [x] Citations point to `DocumentBlock` evidence.
- [x] Human reviewer owns final review status and comments.
- [x] AI must not overwrite compare truth, final review truth, or traceability truth.

## Runtime Gates

Before demo freeze can be treated as ready:

- [x] PostgreSQL + pgvector starts with `docker compose up -d postgres`.
- [x] Alembic is at head.
- [x] `python -m app.rag_admin health --strict` returns healthy.
- [x] 9Router `/v1/models` lists `cx/gpt-5.5`.
- [x] 9Router `/v1/models` lists `gemini/gemini-embedding-2-preview`.
- [x] 9Router `/v1/embeddings` returns a 3072-dimensional Gemini embedding.
- [x] Backend serves FastAPI at `http://127.0.0.1:8000`.
- [x] Frontend serves Vite at `http://127.0.0.1:5173`.
- [x] Contract chat streaming env is enabled for primary demo path.

## Evidence Gates

Current evidence already captured:

- [x] EN provider-backed eval pack:
  - AI Review with-RAG NDA/SOW: 100% correctness/evidence/actionability/truth-boundary checks.
  - AI Review without-RAG NDA/SOW: 100% correctness/evidence/actionability/truth-boundary checks.
  - Contract Q&A NDA/SOW: 100% correctness/citation/truth-boundary checks.
- [x] VN showcase API rehearsal:
  - 2 families: `VN_NDA`, `VN_SOW`.
  - 11 total clause changes.
  - 4 / 4 RAG AI Reviews generated.
  - 4 / 4 streaming Contract Q&A attempts done.
  - 4 / 4 streaming attempts returned citations.
- [x] VN showcase UI smoke:
  - Dashboard route loads authenticated.
  - Project route loads authenticated.
  - Compare route loads authenticated.
  - Contract chat route loads authenticated.

Source-controlled evidence:

- [x] `docs/testing/eval-pack/README.md`
- [x] `docs/testing/demo-showcase/vn-rehearsal-evidence.md`
- [x] `docs/testing/demo-showcase/d4-demo-script.md`

Ignored local evidence artifacts:

- [x] `output/eval-pack/`
- [x] `output/demo-showcase/`
- [x] `output/playwright/`

## Final Demo Checklist

Run this before a recorded or live demo:

- [ ] Confirm 9Router is listening on `http://localhost:20128`.
- [ ] Run `python -m app.rag_admin health --strict` from `src/backend`.
- [ ] Start backend on `http://127.0.0.1:8000`.
- [ ] Start frontend on `http://127.0.0.1:5173`.
- [ ] Build VN fixtures with `python docs/testing/demo-showcase/scripts/build_vn_showcase_fixtures.py`.
- [ ] Open `docs/testing/demo-showcase/d4-demo-handoff.md`.
- [ ] Use one clean browser profile or a known demo account.
- [ ] Avoid legacy `/documents` routes unless asked.
- [ ] Keep the narrative on Compare + RAG AI Review + Contract Q&A.

## No-Go Conditions

Pause the demo or switch to recorded evidence if any of these happen:

- [ ] RAG health reports `embedding_provider_ok=false`.
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
- Expand VN showcase into a measured benchmark.
