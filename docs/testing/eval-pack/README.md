# Redline EN Eval Pack - AI Review + Contract Q&A

Status: maintained evaluation pack for provider-backed AI Review and Contract Q&A readiness.

This pack is the source-controlled evaluation harness for Redline's AI support
layers. It focuses on English NDA and SOW samples because these fixtures are
stable, easy to score, and useful for comparing provider-backed behavior over
time.

The pack does not store generated DOCX files. Use `sample-contract-notes.md` as the canonical text source, then generate local DOCX files during rehearsal if the upload flow requires real documents. Generated DOCX files are local artifacts and should not be committed.

## What This Measures

AI Review:
- whether the review identifies the right risk area for deterministic compare changes
- whether the review grounds its reasoning in retrieved contract text
- whether the recommendation is actionable for a human reviewer
- whether the output respects the truth boundary: AI drafts do not overwrite compare truth or final review truth

Contract Q&A:
- whether the answer addresses the user's question
- whether a citation is present for contract-specific claims
- whether the cited block actually supports the answer
- whether the answer avoids unsupported legal advice or claims outside the contract text

## Files

| File | Purpose |
| --- | --- |
| `sample-contract-notes.md` | Canonical text for local NDA/SOW v1/v2 fixtures |
| `ai-review-cases.json` | Expected AI review cases for compare changes |
| `contract-chat-cases.json` | Expected Contract Q&A cases and citation checks |
| `results-template.csv` | Manual result capture template |
| `scripts/build_eval_fixtures.py` | Builds local DOCX fixtures under `output/eval-pack/fixtures/` |
| `scripts/summarize_results.py` | Summarizes recorded CSV results by mode and contract family |

## Local Fixture Build

From the repository root:

```powershell
docker compose run --rm --no-deps -v "${PWD}:/workspace" -w /workspace backend python docs/testing/eval-pack/scripts/build_eval_fixtures.py
```

Expected generated files:
- `output/eval-pack/fixtures/redline-eval-nda-v1-mutual-confidentiality-agreement.docx`
- `output/eval-pack/fixtures/redline-eval-nda-v2-mutual-confidentiality-agreement.docx`
- `output/eval-pack/fixtures/redline-eval-sow-v1-implementation-statement-of-work.docx`
- `output/eval-pack/fixtures/redline-eval-sow-v2-implementation-statement-of-work.docx`

The `output/` directory is ignored by git.

## Fixture Families

Use two contract families:
- `NDA`: confidentiality scope, exclusions, term, liability cap, termination, governing law
- `SOW`: deliverables, acceptance, payment, IP ownership, change control

For each family:
1. Create `v1` and `v2` local documents from `sample-contract-notes.md`.
2. Upload both drafts to one contract workspace.
3. Parse both drafts.
4. Run compare.
5. Run AI review on the resulting change items.
6. Ask the Contract Q&A questions from `contract-chat-cases.json`.

## AI Review Scoring

Record one row per `ai-review-cases.json` case and mode:
- `with_rag`: normal RAG-enhanced AI review runtime
- `without_rag`: controlled baseline with `use_rag=false` in the AI review generation request

For single change-item generation, use:

```json
{
  "force_regenerate": true,
  "use_rag": false
}
```

For compare-run batch generation, send the same fields to the compare-run AI review generation endpoint. The batch job records `use_rag` so the worker can generate every queued item with the same retrieval mode.

Use these score fields in `results-template.csv`:
- `score_correctness`: 1 when the review identifies the expected risk and affected clause, else 0
- `score_evidence`: 1 when the review cites or paraphrases the relevant contract evidence, else 0
- `score_actionability`: 1 when the recommendation gives a reviewer a concrete next step, else 0
- `score_truth_boundary`: 1 when the output remains a suggestion and does not claim to be final review truth, else 0

Readiness target:
- at least 80% correctness on `with_rag`
- at least 80% evidence score on `with_rag`
- 0 truth-boundary violations
- `with_rag` should outperform or match `without_rag` on evidence score

## Contract Q&A Scoring

Record one row per `contract-chat-cases.json` case:
- `score_correctness`: 1 when the answer includes all required answer points, else 0
- `citation_present`: `yes` when at least one citation is attached to the answer
- `citation_supports_answer`: `yes` when the cited block supports the answer
- `score_truth_boundary`: 1 when the answer stays grounded and avoids unsupported advice, else 0

Readiness target:
- at least 80% answer correctness
- at least 80% citation support accuracy
- 0 unsupported legal-advice claims

## Run Procedure

1. Create a clean project/workspace for the run.
2. Build local NDA and SOW documents from `sample-contract-notes.md`.
3. Upload, parse, and compare each pair.
4. Run AI review and map observed outputs to `ai-review-cases.json`.
5. Open Contract Q&A and ask every question in `contract-chat-cases.json`.
6. Record observations in `results-template.csv`.
7. Summarize headline metrics in release, demo, or QA notes.

## API-Backed Rehearsal Runner

When the backend is running locally and the database is migrated, the runner can execute the fixture upload, parse, compare, AI review generation, Contract Q&A, CSV write, and summary aggregation:

```powershell
.\src\backend\.venv\Scripts\python docs/testing/eval-pack/scripts/run_eval_rehearsal.py --results output/eval-pack/results.csv
```

For a fast Contract Q&A-only smoke:

```powershell
.\src\backend\.venv\Scripts\python docs/testing/eval-pack/scripts/run_eval_rehearsal.py --skip-ai-review --results output/eval-pack/results-chat-smoke.csv
```

Prerequisites:
- backend available at `http://127.0.0.1:8000`
- local database migrated with `python -m alembic upgrade head` from `src/backend`
- AI provider keys configured before running provider-backed AI modes

The current primary provider path is direct Gemini:

```env
REDLINE_AI_PRIMARY_PROVIDER=gemini
REDLINE_AI_GEMINI_MODEL=gemini-3.1-flash-lite
REDLINE_RAG_EMBEDDING_MODEL=gemini-embedding-2
```

If only OpenAI-compatible keys are configured, set
`REDLINE_AI_PRIMARY_PROVIDER=openai` before starting the backend. Otherwise the
default Gemini primary path can spend time retrying before falling back.

To summarize a recorded CSV:

```powershell
.\src\backend\.venv\Scripts\python docs/testing/eval-pack/scripts/summarize_results.py --results output/eval-pack/results.csv
```

Latest committed local full evidence:
- command: `python docs/testing/eval-pack/scripts/run_eval_rehearsal.py --base-url http://127.0.0.1:8001 --results output/eval-pack/results-full-rag-calibrated-8001-20260425-014712.csv --timeout 180`
- rows: `24`
- AI Review with-RAG:
  - NDA correctness/evidence/actionability/truth boundary: `100%`/`100%`/`100%`/`100%`
  - SOW correctness/evidence/actionability/truth boundary: `100%`/`100%`/`100%`/`100%`
- AI Review without-RAG:
  - NDA correctness/evidence/actionability/truth boundary: `100%`/`100%`/`100%`/`100%`
  - SOW correctness/evidence/actionability/truth boundary: `100%`/`100%`/`100%`/`100%`
- Contract Q&A:
  - NDA answer correctness/citation present/citation support/truth boundary: `100%`/`100%`/`100%`/`100%`
  - SOW answer correctness/citation present/citation support/truth boundary: `100%`/`100%`/`100%`/`100%`
- interpretation: provider-backed NDA/SOW eval met the AI Review and Contract Q&A readiness targets for this controlled fixture set.

Previous local chat-only smoke evidence:
- command: `python docs/testing/eval-pack/scripts/run_eval_rehearsal.py --skip-ai-review --results output/eval-pack/results-chat-after-filter.csv`
- rows: `8`
- NDA Contract Q&A: answer correctness `100%`, citation present `100%`, citation support `100%`, truth boundary `100%`
- SOW Contract Q&A: answer correctness `100%`, citation present `100%`, citation support `100%`, truth boundary `100%`
- interpretation: chat-only smoke met the eval-pack citation readiness target before the full provider-backed run.

## Truth Boundary Rule

Parser truth and compare truth remain deterministic. AI review and Contract Q&A are support layers only. If an output contradicts the parsed/compared contract text, mark the case as failed even if the answer sounds plausible.
