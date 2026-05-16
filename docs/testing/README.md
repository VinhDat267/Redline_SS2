# Redline Testing Documentation Pack

Bộ tài liệu testing là source of truth cho việc demo, smoke test, manual regression, và handoff QA của Redline.

Cập nhật: 2026-05-15.

## Related Packs

| Pack | Location | Purpose |
|------|----------|---------|
| EN Eval Pack | `eval-pack/README.md` | AI Review + Contract Q&A evaluation harness (measured readiness) |
| VN Demo Showcase | `demo-showcase/README.md` | Vietnamese D4 demo fixtures, freeze checklist, handoff notes |
| Full System Demo | `../../demo/full-system-demo/README.md` | Realistic MSA/SOW demo kit with presenter script |

## Audience

- **Technical lead / main developer:** chạy full rehearsal và regression có bằng chứng
- **QA / testing support:** checklist rõ ràng theo feature, không phải tự suy luận từ code
- **Presenter / document owner:** luồng demo từ đầu đến cuối, có ghi rõ kết quả mong đợi

## Scope Coverage

### Đã cover

| Category | Features |
|----------|----------|
| Auth | Local register/login, Google OAuth, cookie/CSRF sessions, rate limiting, token revocation |
| User | Profile update, avatar upload/remove, password change |
| Project | CRUD, membership, email invitations, pending invitation flow |
| Contract/Document | CRUD, DOCX upload, PDF upload |
| Parser | DOCX body/header/footer/footnote/endnote/table, PDF text-layer + OCR fallback, legal numbering, quality diagnostics |
| Compare | Deterministic clause diff, change items |
| AI Review | RAG-enhanced batch/per-item generation, with/without-RAG modes |
| Review | Human review status, comments |
| Contract Q&A | Attempt-driven streaming, grounded citations, session memory, cancel/retry |
| Traceability | Requirement ↔ test case mapping, impacted test calculation |
| Summary/Export | AI summary, Markdown export, DOCX report |
| Analytics | Project-level statistics, review status |
| Activity Log | Project activity tracking |
| Demo Seed | Seed flow for demo workspace |

### Không cover

- Semantic compare (beyond deterministic block diff)
- Auto traceability mapping bằng AI
- Full OOXML rendering
- Enterprise RBAC / notifications / realtime collaboration

## Cách đọc

1. `tutorial-redline-e2e-full-pass.md` — Tutorial: full pass có hướng dẫn từng bước
2. `how-to-run-full-regression.md` — How-to: manual regression / smoke / evidence
3. `reference-feature-test-matrix.md` — Reference: test cases, expected results, automated coverage
4. `reference-system-map.md` — Reference: commands, ports, routes, statuses, fixtures
5. `explanation-testing-model-and-truth-boundaries.md` — Explanation: tại sao test theo thứ tự này

## Diataxis Map

| File | Type | Mục đích |
|------|------|----------|
| `tutorial-redline-e2e-full-pass.md` | Tutorial | Chạy một full pass có hướng dẫn từng bước |
| `how-to-run-full-regression.md` | How-to | Chạy manual regression / smoke / evidence collection |
| `reference-feature-test-matrix.md` | Reference | Danh sách test case, expected result, automated coverage |
| `reference-system-map.md` | Reference | Commands, ports, routes, statuses, fixtures, API map |
| `explanation-testing-model-and-truth-boundaries.md` | Explanation | Giải thích tại sao phải test theo thứ tự này |

## Automated Test Baselines

| Suite | Count | Framework | Notes |
|-------|-------|-----------|-------|
| Backend | **211 passed** | Pytest | SQLite fixtures, covers auth, projects, documents, compare, AI, chat, avatar |
| Frontend | **102 passed** (18 files) | Vitest | Covers routes, auth context, all page workspaces, avatar upload |
| Frontend build | Passes | Vite | Existing chunk-size warning only |

## Suggested Fixture Set

- Legal contract eval pack:
  - `docs/testing/eval-pack/sample-contract-notes.md`
  - `docs/testing/eval-pack/ai-review-cases.json`
  - `docs/testing/eval-pack/contract-chat-cases.json`
- VN demo showcase:
  - `docs/testing/demo-showcase/vn-sample-contract-notes.md`
  - `docs/testing/demo-showcase/d4-demo-script.md`
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

- Nếu muốn test full feature set, phải có AI keys hợp lệ; nếu không, đánh dấu các case AI là `blocked by env`
- Nếu compare bị khóa, kiểm tra `active_parse_run_id` trước khi nghĩ là bug UI
- Nếu invitation không xuất hiện ở account thứ hai, kiểm tra email đăng ký có trùng email được mời hay không
- Nếu summary chưa cho export final, kiểm tra số item đang `open` / `in_review`
- Nếu avatar upload bị reject, kiểm tra file size (<5MB) và content type (JPEG/PNG/WebP/GIF)
