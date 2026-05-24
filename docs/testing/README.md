# Redline Testing Documentation Pack

This pack is the source of truth for Redline smoke tests, manual regression,
AI evaluation, demo rehearsal, and release-readiness checks.

Updated: 2026-05-23.

## Related Packs

| Pack | Location | Purpose |
|------|----------|---------|
| EN Eval Pack | `eval-pack/README.md` | AI Review + Contract Q&A evaluation harness (measured readiness) |
| VN Demo Showcase | `demo-showcase/README.md` | Vietnamese showcase fixtures and historical rehearsal evidence |
| Full System Demo | `../demo/full-system-demo/README.md` | Realistic MSA/SOW demo kit with presenter script |

## Audience

- **Engineering / operations:** run full regression with clear evidence
- **QA / testing:** execute feature checklists without reading source code
- **Demo owner:** rehearse the end-to-end workflow with expected results and fallback paths

## Scope Coverage

### Đã cover

| Category | Features |
|----------|----------|
| Auth | Local register/login, Google OAuth, cookie/CSRF sessions, rate limiting, token revocation |
| User | Profile update, avatar upload/remove, password change |
| Project | CRUD, membership, email invitations, pending invitation flow |
| Contract/Document | Contract facade, legacy document internals, DOCX upload, PDF upload |
| Parser | DOCX body/header/footer/footnote/endnote/table, PDF text-layer + OCR fallback, legal numbering, quality diagnostics |
| Compare | Deterministic clause diff, change items |
| AI Review | RAG-enhanced batch/per-item generation, with/without-RAG modes |
| Review | Human review status, comments |
| Contract Q&A | Attempt-driven streaming, draft/compare scopes, grounded citations, session memory, cancel/retry |
| Traceability | Requirement links, AI link suggestions, requirement-test case mapping, impacted test calculation |
| Summary/Export | AI summary, Markdown export, DOCX report |
| Analytics | Project-level statistics, review status |
| Activity Log | Project activity tracking |
| Demo Seed | Seed flow for demo workspace |

### Không cover

- Semantic compare beyond deterministic block diff
- Fully autonomous traceability mapping without user confirmation
- Full OOXML rendering
- Enterprise RBAC / notifications / realtime collaboration

## How to Read This Pack

1. `tutorial-redline-e2e-full-pass.md` - end-to-end browser workflow
2. `how-to-run-full-regression.md` - compact operator checklist
3. `reference-feature-test-matrix.md` - feature cases, expected results, automated coverage
4. `reference-system-map.md` - commands, ports, routes, statuses, fixtures
5. `explanation-testing-model-and-truth-boundaries.md` - truth boundaries and regression ordering

## Diataxis Map

| File | Type | Purpose |
|------|------|----------|
| `tutorial-redline-e2e-full-pass.md` | Tutorial | Guided full product workflow |
| `how-to-run-full-regression.md` | How-to | Manual regression, smoke checks, evidence collection |
| `reference-feature-test-matrix.md` | Reference | Test cases, expected results, automated coverage |
| `reference-system-map.md` | Reference | Commands, ports, routes, statuses, fixtures, API map |
| `explanation-testing-model-and-truth-boundaries.md` | Explanation | Why the workflow is tested in this order |

## Automated Test Baselines

| Suite | Count | Framework | Notes |
|-------|-------|-----------|-------|
| Backend | **268 passed** | Pytest | SQLite fixtures, covers auth, projects, documents, compare, AI, chat, avatar |
| Frontend | **116 passed** (19 files) | Vitest | Covers routes, auth context, all page workspaces, avatar upload, compare-scoped Q&A |
| Frontend build | Passes | Vite | Existing chunk-size warning only |

## Suggested Fixture Set

- Legal contract eval pack:
  - `docs/testing/eval-pack/sample-contract-notes.md`
  - `docs/testing/eval-pack/ai-review-cases.json`
  - `docs/testing/eval-pack/contract-chat-cases.json`
- VN demo showcase:
  - `docs/testing/demo-showcase/vn-sample-contract-notes.md`
  - `docs/testing/demo-showcase/demo-script.md`
- Full system demo:
  - `docs/demo/full-system-demo/source-contracts.md`
  - `docs/demo/full-system-demo/scripts/build_full_demo_fixtures.py`

## Evidence Sources

- Project overview and quickstart: `../../README.md`
- System map and testing references: `reference-system-map.md`, `reference-feature-test-matrix.md`
- Frontend routes: `src/frontend/src/App.jsx`
- Frontend tests: `src/frontend/src/pages/*.test.jsx`, `src/frontend/src/auth/*.test.jsx`
- Backend routes: `src/backend/app/api/routes/*.py`
- Backend tests: `src/backend/tests/*.py`

## Quick Rules

- Full AI validation requires a valid `REDLINE_AI_GEMINI_API_KEY`; otherwise mark AI cases `blocked by env`.
- If compare is locked, check `active_parse_run_id` before treating it as a UI bug.
- If an invitation does not appear, confirm the second account uses the exact invited email.
- If final export is blocked, check whether any change item is still `open` or `in_review`.
- If avatar upload is rejected, check file size and content type (JPEG/PNG/WebP/GIF).
