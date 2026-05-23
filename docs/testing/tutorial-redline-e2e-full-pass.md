# Tutorial: Redline End-to-End Full Pass

This tutorial walks through a complete Redline workflow in the browser. It is
intended for QA, release validation, and live-demo rehearsal.

## Goal

By the end of the run, you should have validated:

- local or Google authentication;
- project and contract workspace creation;
- DOCX/PDF draft upload;
- parser truth and parser diagnostics;
- deterministic compare;
- AI Review batch generation;
- human review decisions and comments;
- traceability links and impacted tests;
- Contract Q&A with citations;
- summary/export;
- analytics and activity logging.

## Recommended Runtime

Use Docker for the most reproducible path:

```powershell
Copy-Item src/backend/.env.example src/backend/.env
Copy-Item src/frontend/.env.example src/frontend/.env
docker compose up --build -d
docker compose exec backend python -m app.seed
```

Open:

- frontend: `http://localhost:5173`
- backend docs: `http://localhost:8000/docs`

Provider-backed AI features require `REDLINE_AI_GEMINI_API_KEY` in
`src/backend/.env`. Without it, run the non-AI parts and mark AI cases as
`blocked by env`.

## Test Accounts

After seeding demo data, these accounts exist:

| Email | Password |
| --- | --- |
| `vinh@example.com` | `redline123` |
| `my@example.com` | `redline123` |
| `ly@example.com` | `redline123` |

You can also register fresh accounts from `/login`.

## Fixtures

For the main product demo, build realistic contract fixtures:

```powershell
docker compose run --rm --no-deps -v "${PWD}:/workspace" -w /workspace backend python docs/demo/full-system-demo/scripts/build_full_demo_fixtures.py
```

Generated fixtures are written to `output/full-system-demo/fixtures/`.

Use:

- `redline-full-demo-msa-v1-master-services-agreement.docx`
- `redline-full-demo-msa-v2-master-services-agreement.docx`
- `redline-full-demo-sow-v1-implementation-sow.docx`
- `redline-full-demo-sow-v2-implementation-sow.docx`
- `redline-full-demo-security-addendum-text.pdf`
- `redline-full-demo-security-addendum-scan.pdf`

## Phase 1 - Authentication

1. Open `http://localhost:5173/login`.
2. Sign in with `vinh@example.com` / `redline123`, or register a new account.
3. Confirm the authenticated project inventory loads.

Expected result:

- user lands on the project/dashboard view;
- no `401` loop;
- profile menu is visible;
- `/account` opens and shows profile controls.

## Phase 2 - Project and Team Setup

1. Create a project named `MedNova Vendor Review`.
2. Open the project workspace.
3. Create or invite a reviewer by email from the Team tab.
4. If testing invitations, sign out and register/login as the invited email.
5. Accept the pending invitation from the project inventory.

Expected result:

- project appears for the owner;
- pending invitation appears for the invited email;
- after acceptance, the reviewer appears under active members;
- activity log records project/team operations.

## Phase 3 - Contract Workspace

1. In the project workspace, create a contract named `Aster Cloud Master Services Agreement`.
2. Open the contract workspace.
3. Upload MSA v1 as draft `v1.0`.
4. Upload MSA v2 as draft `v2.0`.

Expected result:

- both drafts appear in draft history;
- DOCX/PDF-only validation is enforced;
- draft rows expose parse actions and parser links.

## Phase 4 - Parse Drafts

1. Open the parser workspace for `v1.0`.
2. Run Parse.
3. Repeat for `v2.0`.
4. Inspect body/table/header/footer/page surfaces where available.

Expected result:

- each draft reaches `parsed` or `parsed_with_warnings`;
- `active_parse_run_id` exists for each parsed draft;
- diagnostics/warnings are visible and do not block compare unless parse failed;
- compare setup remains locked for drafts without active parser truth.

Optional PDF parser smoke:

1. Upload `redline-full-demo-security-addendum-text.pdf`.
2. Parse it.
3. Upload `redline-full-demo-security-addendum-scan.pdf`.
4. Parse it to exercise OCR fallback.

## Phase 5 - Deterministic Compare

1. Return to the contract workspace.
2. Select source draft `v1.0`.
3. Select target draft `v2.0`.
4. Run compare.

Expected result:

- compare run opens;
- change queue contains added/removed/modified clause changes;
- selected change shows source and target text;
- compare result does not depend on AI.

## Phase 6 - AI Review Batch

1. In Compare Workspace, click Generate AI Drafts.
2. Watch the batch job progress.
3. Refresh the page while a job is active to verify polling resumes.

Expected result:

- job is created immediately;
- UI polls status instead of blocking;
- generated items show AI metadata;
- failed provider calls show readable errors without deleting compare truth.

If no AI key is configured, mark this phase as `blocked by env`.

## Phase 7 - Human Review

1. Open the Review route from a selected change.
2. Read AI analysis if available.
3. Set review status to `in_review`.
4. Assign a reviewer.
5. Add a summary and comment.
6. Save.
7. Mark at least one item `resolved`.

Expected result:

- AI draft and confirmed review data remain separate;
- review status, assignee, summary, and comment persist;
- clearing assignee/summary sends `null` and removes stale values;
- review queue filtering and pagination keep the selected item coherent.

## Phase 8 - Traceability and Impact

1. Open Traceability / Impact for a change item.
2. Link at least one requirement.
3. Create a requirement-to-test-case mapping.
4. Inspect impacted tests.
5. Unlink/delete a mapping to verify state refresh.

Expected result:

- linked requirements are scoped to the same project;
- impacted tests are derived from confirmed mappings;
- AI-suggested links require explicit user acceptance;
- stale selections clear after unlink/delete.

## Phase 9 - Contract Q&A

1. Open `/contracts/:contractId/chat`.
2. Ask: `What changed in the liability cap between the two MSA drafts?`
3. Ask: `Does the new draft still exclude confidentiality breaches from the liability cap?`
4. Open the Source Evidence panel.
5. Test Stop and Retry on a longer question.

Expected result:

- answer streams or falls back to JSON depending on config;
- contract-specific claims include citations;
- citations point to parsed source blocks;
- unsupported questions do not become unsupported legal advice;
- Stop/Retry does not leave the session stuck.

## Phase 10 - Summary and Export

1. Open Summary / Export.
2. Generate an AI summary if AI is configured.
3. Edit the summary text.
4. Export Markdown.
5. Export DOCX.

Expected result:

- summary uses compare/review/impact context;
- export readiness reflects open/in-review items;
- Markdown and DOCX exports complete;
- layout does not clip metrics or export controls.

## Phase 11 - Analytics and Activity

1. Return to the project workspace.
2. Open Activity.
3. Open Analytics.

Expected result:

- Activity contains create/upload/parse/compare/review events.
- Analytics shows project-level counts, change distribution, review progress, and document breakdown.

## Completion Criteria

A full pass is acceptable when:

- authentication and account page work;
- project/team/contract CRUD works;
- at least two drafts parse successfully;
- compare run produces real change items;
- human review and comments persist;
- traceability mappings and impacted tests are correct;
- Contract Q&A produces grounded answers when AI is configured;
- summary/export works;
- analytics/activity reflect the workflow.

If a phase fails, record:

- account used;
- route;
- fixture;
- expected vs actual behavior;
- screenshot/export artifact if useful;
- whether failure is a product bug, environment issue, or blocked AI provider.
