# Full Demo Manual Test Checklist

Use this before recording or presenting the demo. Mark each line while testing.

## Environment

- [ ] PostgreSQL container is running.
- [ ] Backend starts on `http://127.0.0.1:8000`.
- [ ] Frontend starts on `http://127.0.0.1:5173`.
- [ ] `REDLINE_AI_GEMINI_API_KEY` is set in `src/backend/.env`.
- [ ] `REDLINE_AI_PRIMARY_PROVIDER=gemini`.
- [ ] `REDLINE_RAG_EMBEDDING_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai`.
- [ ] `REDLINE_RAG_EMBEDDING_MODEL=gemini-embedding-2`.
- [ ] `.\.venv\Scripts\python -m app.rag_admin health --strict` passes from `src/backend`.
- [ ] `.\.venv\Scripts\python -m app.parser_admin pdf-ocr-health --strict` passes if scanned PDF OCR will be shown.

## Fixture Build

- [ ] `build_full_demo_fixtures.py` completes.
- [ ] MSA v1/v2 DOCX files exist.
- [ ] SOW v1/v2 DOCX files exist.
- [ ] Security addendum text PDF exists.
- [ ] Security addendum scanned PDF exists.

## MSA Demo Flow

- [ ] Create/open project `MedNova Vendor Review`.
- [ ] Create/open contract `Aster Cloud Master Services Agreement`.
- [ ] Upload MSA v1.
- [ ] Upload MSA v2.
- [ ] Parse v1 successfully.
- [ ] Parse v2 successfully.
- [ ] Open Parser Workspace and confirm body surfaces and structured schedule text are readable.
- [ ] Run compare v1 -> v2.
- [ ] Compare run opens.
- [ ] Clause-change list contains confidentiality, data security, IP, liability, and termination changes.
- [ ] Select liability change.
- [ ] AI Review generation completes.
- [ ] AI Review explanation identifies cap reduction and carve-out removal.
- [ ] Open Review Workspace.
- [ ] Human review status/comment can be edited and saved.

## Contract Q&A Flow

- [ ] Open Contract Q&A.
- [ ] Ask `Does the new draft still exclude confidentiality breaches from the liability cap?`
- [ ] Answer cites source evidence.
- [ ] Source Evidence panel shows the liability clause.
- [ ] Ask `What is this document?`
- [ ] Answer uses metadata and does not cite unrelated blocks.
- [ ] Ask session-memory prompt pair.
- [ ] Chat recalls the user's name.
- [ ] Ask unrelated prompt `What is the cafeteria lunch menu?`
- [ ] Chat refuses with insufficient grounded evidence.
- [ ] Stop/Retry works on a long question.

## SOW Demo Flow

- [ ] Create/open contract `Aster Cloud Implementation SOW`.
- [ ] Upload SOW v1/v2.
- [ ] Parse both drafts.
- [ ] Run compare.
- [ ] Acceptance/payment/IP/change-control changes are visible.
- [ ] Contract Q&A answers SOW prompts with citations.

## PDF Parser Flow

- [ ] Upload text-layer PDF security addendum.
- [ ] Parse succeeds.
- [ ] Parser Workspace shows `Pages`.
- [ ] Contract Q&A can answer covered-data prompt.
- [ ] Upload scanned PDF if OCR health passed.
- [ ] OCR parse succeeds or fails with clear diagnostics.

## No-Go Conditions

Stop or switch to recorded evidence if:

- [ ] RAG health is red.
- [ ] Both DOCX parses fail.
- [ ] Compare cannot be created.
- [ ] Contract Q&A produces uncited grounded answers.
- [ ] Frontend has blocking layout overlap in the main demo path.
