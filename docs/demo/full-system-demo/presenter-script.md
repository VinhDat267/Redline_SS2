# Full Demo Presenter Script

Target length: 12-15 minutes.

## Opening

Say:

```text
Redline is an AI Contract Review workspace. It compares contract drafts deterministically, helps reviewers understand clause risk with RAG-enhanced AI review, and lets reviewers ask citation-grounded questions about the current contract draft.
```

Then set the boundary:

```text
The AI does not approve the contract. Compare truth is deterministic, AI Review is a suggestion layer, and the human reviewer owns the final decision.
```

## 1. Project Workspace

Action:

- Open Project List.
- Create or open `MedNova Vendor Review`.

Talking point:

```text
The project groups the contract review work for one vendor negotiation. This keeps drafts, compare runs, review decisions, and Q&A in one legal workspace.
```

## 2. Contract Workspace

Action:

- Create/open `Aster Cloud Master Services Agreement`.
- Show Contract Detail.

Talking point:

```text
This workspace is centered on a contract, not a generic file. Every draft, parser run, compare run, and chat session is scoped to the contract.
```

## 3. Upload Drafts

Action:

- Upload `redline-full-demo-msa-v1-master-services-agreement.docx`.
- Upload `redline-full-demo-msa-v2-master-services-agreement.docx`.
- Parse both drafts.

Talking point:

```text
Parsing converts the contract into structured blocks. Those blocks are reused as compare anchors and as RAG retrieval chunks. This is why later answers can point back to source evidence.
```

If Parser Workspace is shown:

```text
Parser diagnostics matter because contract review depends on trustworthy text extraction. Failed quality gates should block compare and RAG rather than silently using incomplete text.
```

## 4. Run Compare

Action:

- Run compare from MSA v1 to MSA v2.
- Open Compare Workspace.
- Select `Limitation of Liability`, `Confidential Information`, or `Data Security and Incident Response`.

Talking point:

```text
This is deterministic compare truth. Redline identifies what changed before AI is involved.
```

High-signal explanation:

```text
In the revised draft, the liability cap becomes much more vendor-favorable. The cap is reduced and now applies to confidentiality and data-security claims that were previously carved out.
```

## 5. Generate RAG AI Review

Action:

- Click Generate AI Review for the selected clause.
- Show explanation, risk level, draft comment, and checks.

Talking point:

```text
The AI Review is grounded in retrieved contract context. It accelerates review by drafting risk reasoning and a comment, but it remains editable and non-final.
```

If asked about quality:

```text
The controlled eval pack checks correctness, evidence support, actionability, and truth-boundary behavior. The demo documents are designed to exercise the same boundaries with realistic clauses.
```

## 6. Human Review

Action:

- Open Review Workspace.
- Edit the review comment if needed.
- Set status to `in_review` or `resolved`.

Talking point:

```text
This is where the human reviewer takes ownership. AI helps draft the review, but the confirmed status and final comment are human-controlled.
```

## 7. Contract Q&A

Action:

- Open Contract Q&A.
- Ask: `Does the new draft still exclude confidentiality breaches from the liability cap?`
- Inspect Source Evidence.

Talking point:

```text
The answer is useful because it is grounded. The evidence panel shows the exact parsed blocks behind the answer.
```

Ask a metadata question:

```text
What is this document?
```

Talking point:

```text
Document identity questions are answered from contract metadata, not random vector hits.
```

Ask session-memory prompts:

```text
My name is Nguyen Dat Vinh.
What is my name?
```

Talking point:

```text
The chat session remembers conversational context, but document-grounded answers still require citations.
```

## 8. Optional Stop/Retry

Action:

- Ask a longer question.
- Click Stop while the response is streaming.
- Click Retry.

Talking point:

```text
Contract Q&A uses attempt-driven streaming. Stop creates a terminal attempt and Retry creates a clean superseding attempt, so the session can recover without corrupting the answer history.
```

## 9. Optional SOW Commercial Risk

Action:

- Create/open `Aster Cloud Implementation SOW`.
- Upload SOW v1/v2.
- Parse, compare, and select acceptance/payment/IP/change-control changes.

Talking point:

```text
The SOW shows commercial and delivery risk: deemed acceptance becomes shorter, payment moves upfront, IP ownership shifts, and change-control protection is weakened.
```

## 10. Optional PDF/OCR Parser

Action:

- Upload `redline-full-demo-security-addendum-text.pdf`.
- Parse and show `Pages` in Parser Workspace.
- If OCR is healthy, upload `redline-full-demo-security-addendum-scan.pdf`.

Talking point:

```text
PDF parsing starts with text-layer extraction and falls back to OCR for scanned pages. OCR is quality-gated because legal review should not silently rely on low-confidence text.
```

## Closing

Say:

```text
The core value is faster contract review with grounded evidence: deterministic compare, AI risk draft, human confirmation, and citation-backed Q&A.
```
