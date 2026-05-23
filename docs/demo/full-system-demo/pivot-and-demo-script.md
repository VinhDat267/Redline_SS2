# Product Narrative and Demo Script

This document explains the product direction and gives a concise demo narrative
for Redline as an AI-assisted contract review system. Use it for live demos,
recorded walkthroughs, stakeholder reviews, and handoff conversations.

Suggested duration: 7-10 minutes.

## 1. Product Positioning

Redline is focused on contract review rather than generic document management.
The core workflow is:

```text
Project -> Contract -> Draft Upload -> Parse -> Compare
        -> AI Review -> Human Review -> Contract Q&A
        -> Summary / Export
```

The product does three things well:

1. It converts uploaded DOCX/PDF drafts into structured blocks.
2. It deterministically compares two drafts and shows clause-level changes.
3. It uses RAG to support AI review and contract Q&A with source evidence.

The important boundary is that AI is an assistance layer. It does not overwrite
parser output, compare output, final review status, or accepted traceability
links.

## 2. Why Contract Review

Contract review is a good fit for Redline because reviewers need both precision
and speed:

- They need to know exactly what changed between two drafts.
- They need risk-oriented explanations that stay grounded in the contract.
- They need citations so every AI answer can be checked against source text.
- They need human confirmation before anything becomes final review truth.

This narrower domain keeps the workflow understandable and useful. A reviewer
can upload an MSA or SOW, inspect added/removed/modified clauses, draft review
comments with AI help, and ask follow-up questions against the parsed contract.

## 3. Reused Foundation

The most important reused technical foundation is `DocumentBlock`.

After upload, the parser turns each draft into blocks with text, position,
section metadata, and stable identifiers. Those same blocks support:

- deterministic compare anchors;
- RAG retrieval chunks;
- Contract Q&A source citations;
- AI Review context;
- traceability and impact views.

This keeps the system coherent. Redline does not maintain one parser pipeline
for compare and another hidden pipeline for AI. The same parsed source blocks
flow through the review experience.

## 4. Demo Contract Families

The full-system demo uses vendor technology services contracts:

- Master Services Agreement (MSA): legal framework covering confidentiality,
  data security, subcontractors, IP, indemnification, liability, termination,
  audit, and governing law.
- Statement of Work (SOW): commercial delivery terms covering deliverables,
  milestones, acceptance, fees, service levels, change control, and exit
  obligations.
- Security and Data Processing Addendum: security/data processing terms used
  for PDF and OCR parser coverage.

Fixtures are generated from
`docs/demo/full-system-demo/source-contracts.md` by:

```powershell
docker compose run --rm --no-deps -v "${PWD}:/workspace" -w /workspace backend python docs/demo/full-system-demo/scripts/build_full_demo_fixtures.py
```

Generated files are written under `output/full-system-demo/fixtures/` and are
intended to be uploaded like normal user documents. The backend does not
hard-code special logic for these contracts.

## 5. Implementation Layers

Redline is implemented in layers:

1. Product workspace: projects, contracts, drafts, members, and review context.
2. Parser: DOCX/PDF parsing into `DocumentBlock` records with diagnostics.
3. Compare: deterministic added/removed/modified clause detection.
4. RAG: embeddings over parsed blocks stored in PostgreSQL + pgvector.
5. AI Review: provider-backed draft explanations and comments using changed
   clauses plus retrieved context.
6. Human Review: reviewer-owned status and comments.
7. Contract Q&A: authenticated streaming chat with attempts, retry, stop, and
   source evidence.
8. Summary/Export: review metrics, AI summary, Markdown export, and DOCX report
   export.

## 6. RAG Flow

The RAG pipeline is intentionally tied to parsed contract blocks:

1. The user uploads DOCX or PDF.
2. The parser creates `DocumentBlock` records.
3. Embeddings are generated for those blocks.
4. Vectors are stored in PostgreSQL with pgvector metadata.
5. Contract Q&A or AI Review embeds the query/change context.
6. The retriever selects relevant blocks for the active draft or compare item.
7. Weak evidence is filtered out.
8. The LLM receives the question/change plus source evidence and returns an
   answer or draft review.
9. The UI shows answer text and citations so the reviewer can inspect the
   source blocks.

If evidence is weak or provider configuration is unavailable, the system should
not pretend to have grounded certainty.

## 7. Primary Demo Flow

### Open Project and Contract

Open a review project, then open a contract workspace such as:

```text
Aster Cloud Master Services Agreement
```

Talking point:

```text
This contract workspace groups drafts, parse runs, compare runs, review
decisions, traceability links, and contract Q&A in one review context.
```

### Upload and Parse Drafts

Upload MSA v1 and MSA v2, then parse both drafts.

Talking point:

```text
The parser converts each draft into structured blocks. Those blocks are reused
for compare, AI review retrieval, and Q&A citations.
```

If opening the Parser Workspace, focus on:

- parse status;
- warning or failure diagnostics;
- page/block counts;
- whether the draft is reliable enough for compare and RAG.

### Run Compare

Run compare from v1 to v2 and select a high-signal clause such as liability,
security, IP, payment, or termination.

Talking point:

```text
This is deterministic compare truth. AI has not created these changes. Redline
is showing what changed between parsed source drafts.
```

### Generate AI Review

Generate AI Review for the selected change.

Talking point:

```text
AI Review drafts risk reasoning, suggested checks, and a review comment. It is
useful because it is grounded in the changed clause and retrieved contract
context, but the reviewer still owns the final decision.
```

### Confirm Human Review

Edit the draft comment if needed and set the review status.

Talking point:

```text
This is the human-in-the-loop boundary. Redline keeps the AI draft separate
from the reviewer-confirmed status and comment.
```

### Ask Contract Q&A

Ask a grounded question such as:

```text
Does the new draft still exclude confidentiality breaches from the liability cap?
```

Talking point:

```text
The answer should be judged together with its citations. The Source Evidence
panel is what makes the answer inspectable.
```

## 8. Short Answers for Stakeholders

**Is Redline making legal decisions?**

No. Redline helps reviewers identify changes, draft analysis, and inspect source
evidence. The human reviewer confirms final review status and comments.

**What makes the AI output trustworthy?**

The AI output is grounded in parsed contract blocks and shown with source
evidence. It is still a suggestion and must be reviewed.

**What happens if the AI provider is unavailable?**

Parser and Compare still work. Provider-backed AI Review and Q&A should be
treated as unavailable until configuration or quota issues are fixed.

**Can Redline parse PDFs after deploy?**

Yes, if the deployment image includes PyMuPDF and Tesseract. Text-layer PDF
works directly; scanned PDF depends on OCR availability and language packs.

**Why use object storage in deploys?**

Local disk is fine for development, but many hosting platforms have ephemeral
filesystems. Deployments should use S3-compatible object storage for uploaded
contracts and avatars.

## 9. Closing Narrative

Use this closing:

```text
Redline does not replace the reviewer. It gives the reviewer a structured
contract workspace: deterministic parse and compare, AI-assisted risk drafting,
human confirmation, and citation-backed Q&A.
```
