# Redline D4 Demo Script

Status: rehearsal script for Compare + RAG AI Review + Contract Q&A.

## Demo Goal

Show Redline as an AI Contract Review workflow where deterministic compare remains the source of truth and AI helps the reviewer understand risk faster.

One-line framing:

```text
Redline turns contract drafts into explainable clause changes, AI risk suggestions, and citation-grounded contract Q&A.
```

## Preflight

Backend:

```powershell
docker compose up -d postgres
cd src/backend
python -m alembic upgrade head
python -m app.rag_admin health --strict
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend:

```powershell
cd src/frontend
npm run dev
```

VN fixture build:

```powershell
python docs/testing/demo-showcase/scripts/build_vn_showcase_fixtures.py
```

## Demo Flow

### 1. Open Workspace

Talking point:

```text
We start from a contract workspace, not a generic document tool. The current delivery focus is contract draft comparison, AI review, and grounded Q&A.
```

Action:

- Create/open a project.
- Create a `Contract` for `VN NDA - Thoa thuan bao mat` or `VN SOW - Hop dong dich vu trien khai`.

### 2. Upload Drafts

Action:

- Upload v1 and v2 DOCX files from `output/demo-showcase/fixtures/`.
- Parse both drafts.

Talking point:

```text
The parser creates DocumentBlocks. Those blocks are reused as compare anchors and as RAG retrieval chunks, so citations later point back to parsed contract text.
```

### 3. Run Compare

Action:

- Create a compare run from v1 to v2.
- Open the compare page and select a high-signal clause change.

Best NDA clauses:

- `Gioi han trach nhiem`
- `Ngoai le doi voi Thong Tin Bao Mat`
- `Cham dut`

Best SOW clauses:

- `Nghiem thu`
- `Thanh toan`
- `Quyen so huu tri tue`
- `Kiem soat thay doi`

Talking point:

```text
This is deterministic compare truth. AI does not create or overwrite these changed clauses.
```

### 4. Generate RAG AI Review

Action:

- Generate AI Review for selected clause changes.
- Show explanation, risk level, draft comment, and suggested checks.

Talking point:

```text
AI Review is a suggestion layer. It uses retrieved contract context, but the reviewer still confirms final review status and comments.
```

Evidence line:

```text
Our provider-backed NDA/SOW eval pack now reaches 100% for AI Review correctness, evidence, actionability, and truth-boundary checks on the controlled sample set.
```

### 5. Human Review Boundary

Action:

- Edit or confirm one AI draft comment.
- Change the review status manually.

Talking point:

```text
The human reviewer owns the final status. Redline keeps traceability between deterministic compare, AI suggestion, and human decision.
```

### 6. Contract Q&A

Action:

- Open Contract Q&A for the same contract.
- Ask one or two questions from `README.md`.
- Open `Source Evidence`.

Suggested NDA questions:

```text
Gioi han trach nhiem co ap dung cho vi pham bao mat khong?
Ban moi co con ngoai le cho thong tin duoc phat trien doc lap khong?
```

Suggested SOW questions:

```text
Ai so huu san pham duoc phat trien theo SOW moi?
Nha Cung Cap co duoc tinh phi truoc khi co lenh thay doi bang van ban khong?
```

Talking point:

```text
The answer is useful only because it is grounded. The citation panel lets the reviewer inspect the exact parsed block behind the answer.
```

### 7. Stop/Retry Streaming

Optional action:

- Ask a longer question.
- Click Stop while streaming.
- Retry the same question.

Talking point:

```text
Contract Q&A uses attempt-driven streaming. Stop produces a terminal attempt and Retry creates a new attempt, so the UI can recover without corrupting the previous answer.
```

## Closing Slide Narrative

Use this closing:

```text
The core value is not autonomous legal approval. The core value is faster review with grounded evidence: deterministic compare, AI risk draft, human confirmation, and citation-backed Q&A.
```

## Avoid During Demo

- Do not present analytics as the main product.
- Do not spend time on legacy `/documents` routes unless asked.
- Do not describe AI output as final legal truth.
- Do not add new feature promises beyond D4.
