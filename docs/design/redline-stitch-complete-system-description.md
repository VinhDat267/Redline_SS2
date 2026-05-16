# Redline Complete System Description For Stitch

## How Stitch Should Use This File

Use this Markdown file as the full product and interface description for designing Redline.

Redline is not a generic AI chatbot, not a simple document upload app, and not a marketing site. It is a serious legal SaaS workspace for AI-assisted contract review. The design should focus on authenticated product screens, operational workflows, contract evidence, clause-level comparison, review queues, and grounded contract Q&A.

The UI should look like a polished B2B legal operations product:

- precise
- restrained
- data dense but readable
- trust focused
- designed for repeated work
- evidence driven
- status driven
- suitable for legal, procurement, business, and project teams

Do not design it as a consumer chat app. Contract Q&A is important, but it is only one workspace inside a larger contract review system.

## Product Name

Redline

## Product Category

AI Contract Review Platform

## One Sentence Description

Redline helps teams upload contract drafts, parse DOCX/PDF files, compare drafts clause by clause, generate grounded AI risk review suggestions, confirm human review decisions, ask citation-backed questions about the contract, and summarize the review outcome.

## Core Product Goal

The system exists to make contract review faster and more reliable while preserving legal traceability.

It should help users answer:

- What changed between two contract drafts?
- Which clause changes matter most?
- What risks might each change create?
- What evidence supports an AI explanation?
- What should a human reviewer confirm?
- What does the current contract say about a topic?
- Which parsed source clause supports the answer?
- Is the uploaded file reliable enough for Compare and RAG?

## Current North Star

The core delivery focus is:

```text
Compare + RAG-enhanced AI Review + Contract Q&A
```

The complete workflow is:

```text
Workspace
-> Project
-> Contract
-> Contract Draft Upload
-> Parser Quality Gate
-> Draft Compare
-> RAG-enhanced AI Review
-> Human Review
-> Contract Q&A
-> Summary / Export / Analytics
```

Parser workspace, analytics, traceability, summary/export, and activity log are support surfaces. They should be available, but Compare and Contract Q&A should feel like the two main product entry points.

## Product Philosophy

Redline uses AI, but AI must not become the system of record.

The system is built on these boundaries:

1. Parser truth is deterministic.
2. Compare truth is deterministic.
3. AI review is a suggestion layer.
4. Contract Q&A must be grounded in parsed contract content.
5. Final review decisions belong to the human reviewer.

The UI should constantly reinforce this:

- Show parser status before allowing Compare/RAG.
- Show source evidence for AI and Q&A.
- Label AI output as suggestion/draft.
- Keep human review controls visually authoritative.
- Show warning and failure states clearly.

## Primary Users

### Legal Reviewer

The Legal Reviewer is the main operator for clause-level review.

Responsibilities:

- Review changed clauses.
- Inspect diff evidence.
- Evaluate AI risk suggestions.
- Confirm final status.
- Add review comments.
- Assign ownership.

Design needs:

- Fast scanning of clause changes.
- Clear diff viewer.
- Risk/status badges.
- Evidence and citations always nearby.
- Batch review support.
- Edit/accept/reject AI suggestions.

### Business Owner

The Business Owner wants plain-language understanding of commercial impact.

Responsibilities:

- Understand payment, liability, SLA, term, termination, scope, and obligation changes.
- Ask focused questions about the contract.
- Check whether business terms changed.

Design needs:

- Plain-language summaries.
- Contract Q&A with citations.
- Risk and actionability labels.
- Low-friction evidence inspection.

### Procurement / Contract Manager

The Procurement or Contract Manager coordinates contract versions and negotiation status.

Responsibilities:

- Upload drafts.
- Track versions.
- Compare drafts.
- Coordinate review completion.
- Export/share summary.

Design needs:

- Version timeline.
- Draft readiness.
- Review progress.
- Negotiation summary.
- Clear file state and parse quality.

### Project Lead

The Project Lead needs visibility across a project.

Responsibilities:

- Track contracts under review.
- Track team activity.
- See status and analytics.
- Prepare demo/report output.

Design needs:

- Project dashboard.
- Contract inventory.
- Activity log.
- Review health metrics.
- Compact analytics.

### Parser / QA User

The Parser or QA User checks whether a DOCX/PDF file was ingested reliably.

Responsibilities:

- Inspect parser output.
- Check parse warnings.
- Review OCR diagnostics.
- Confirm whether Compare/RAG can be trusted.

Design needs:

- Parser workspace.
- Surface/page navigation.
- Diagnostics panel.
- Coverage quality result.
- OCR status, confidence, language, and page evidence.

## Main Domain Vocabulary

Use these user-facing labels in the UI:

- Workspace
- Project
- Contract
- Contract Draft
- Draft Version
- Parse Run
- Parser Quality
- Parser Workspace
- Clause
- Clause Block
- Compare Run
- Clause Change
- Added Clause
- Removed Clause
- Modified Clause
- AI Clause Risk Analysis
- AI Review Draft
- Human Review
- Review Status
- Review Comment
- Contract Q&A
- Chat Session
- Chat Attempt
- Citation
- Source Evidence
- Negotiation Summary
- Analytics
- Activity
- Obligation
- Compliance Check

Avoid exposing internal names like `Document`, `DocumentVersion`, or `ChangeItem` unless designing internal admin/debug screens.

## System Capabilities

### Authentication

The system has account-based access.

Capabilities:

- Login.
- Register.
- Validate stored session against backend.
- Clear stale/invalid session.
- Logout.
- Sync logout across browser tabs.
- Protected authenticated routes.

Screens/states:

- Login form.
- Registration form.
- Loading session state.
- Invalid session redirect.
- Logout action in user menu.

Design direction:

- Keep authentication professional and minimal.
- Do not make it the product hero.
- The authenticated workspace is the main experience.

### Workspace Dashboard

The dashboard is the authenticated landing area.

Purpose:

- Give users a high-level operational view.
- Let users quickly enter projects/contracts.
- Surface review activity and readiness.

Suggested content:

- Recent projects.
- Active contracts.
- Drafts awaiting parse.
- Compare runs in progress.
- Clause changes needing review.
- Recent Contract Q&A activity.
- Review status summary.

Useful metrics:

- Contracts under review.
- Parsed drafts.
- Compare runs.
- Open clause changes.
- High-risk changes.
- AI reviews generated.
- Human reviews confirmed.

Primary actions:

- Create project.
- Open project.
- Open contract.
- Continue review.

### Project Workspace

A project groups contracts, people, activity, and support artifacts.

Capabilities:

- Create project.
- Edit project.
- Delete project.
- View project contracts.
- Manage members/invitations.
- View activity log.
- View analytics.
- Manage support inventories such as obligations and compliance checks.

Suggested tabs:

- Overview
- Contracts
- Team
- Activity
- Analytics
- Obligations
- Compliance Checks

Primary project screen layout:

- Page header with project name, description, status chips, and primary action.
- Main content area with contract inventory as the primary section.
- Secondary panels for activity and analytics.

Contract inventory row should show:

- Contract title.
- Contract type.
- Last updated.
- Number of drafts.
- Latest parser status.
- Compare readiness.
- Open review count.
- Last activity.
- Primary action: Open contract.

### Contract Workspace

A contract is the central object users review.

Capabilities:

- View contract metadata.
- Edit contract metadata.
- Delete contract.
- Upload contract drafts.
- View draft list.
- Parse drafts.
- Open Parser Workspace.
- Select source/target drafts for compare.
- Launch compare run.
- Open Contract Q&A.

Supported draft file types:

- DOCX.
- PDF with text layer.
- Scanned/image PDF through OCR fallback.

Draft list should show:

- Version label.
- File name.
- File type.
- Upload time.
- Parse status.
- Warning count.
- Active parse run.
- Compare readiness.
- Actions:
  - Parse
  - Open parser
  - Edit version metadata
  - Delete version
  - Use as source
  - Use as target

Important contract states:

- No drafts uploaded.
- Draft uploaded but not parsed.
- Draft parsing.
- Draft parsed.
- Draft parsed with warnings.
- Draft parse failed.
- Enough parsed drafts for compare.
- No compare-ready drafts.

Design direction:

- The page should feel like a contract control center.
- Draft readiness should be visible at a glance.
- Upload should be a clear drawer/modal workflow.
- Compare and Q&A should be obvious next actions.

### Contract Draft Upload

The upload workflow accepts DOCX and PDF files.

Capabilities:

- Upload DOCX.
- Upload PDF.
- Enter version label.
- Enter notes.
- Client-side reject unsupported file types.
- Refresh draft inventory after upload.

File validation:

- Allow `.docx`.
- Allow `.pdf`.
- Block unsupported files before calling upload endpoint.

Upload states:

- Empty file selection.
- File selected.
- Uploading.
- Upload success.
- Upload error.
- Unsupported file type.

Design details:

- Use clear file-type copy: "Upload DOCX or PDF contract draft".
- Show accepted file formats.
- Show next step: "Parse this draft before Compare/RAG".

### Parser Runtime

Parser Runtime converts uploaded contract drafts into canonical contract blocks.

Supported input:

- DOCX.
- PDF text layer.
- Scanned/image PDF using OCR fallback.

DOCX parser supports:

- Body text.
- Headings.
- Paragraphs.
- List items.
- Tables.
- Headers.
- Footers.
- Footnotes.
- Endnotes.
- Legal numbering such as `1.`, `1.1`, `Article`, `Section`, `Clause`.
- Diagnostics for unsupported content.

PDF parser supports:

- Native text-layer extraction first.
- Page-based parser surfaces.
- OCR fallback with Tesseract if text layer is unreliable.
- English + Vietnamese OCR.
- OCR confidence diagnostics.
- Page-level extraction mode.
- Quality policy for pass/warn/fail.

Parser quality policy:

- Pass: safe for Compare/RAG.
- Warn: usable, but user should inspect diagnostics.
- Fail: not reliable; do not set active parse truth; block Compare/RAG.

Parser diagnostics can include:

- Unsupported DOCX textbox/drawing content.
- DOCX comments.
- DOCX tracked revisions.
- DOCX content controls.
- DOCX unsupported fields.
- DOCX images.
- PDF OCR used.
- PDF OCR low confidence.
- PDF text-layer unreliable.
- PDF material page missing reliable text.
- PDF table-like content detected.

### Parser Workspace

Parser Workspace is the QA and transparency surface for parsed drafts.

Purpose:

- Show what the system extracted from a draft.
- Show parser quality.
- Show whether the draft can be trusted for Compare/RAG.
- Let users inspect warnings and surfaces/pages.

Major UI areas:

1. Header summary
   - Contract name.
   - Draft version.
   - File type.
   - Parse status.
   - Parser version.
   - Warning count.
   - Compare readiness.

2. Quality summary
   - Policy result: pass/warn/fail.
   - Coverage score.
   - Diagnostic count.
   - OCR mode if PDF.
   - Failed/warning pages if any.

3. Surface navigation
   - Body.
   - Tables.
   - Headers.
   - Footers.
   - Footnotes.
   - Endnotes.
   - Pages for PDF.

4. Parsed content preview
   - Blocks.
   - Headings.
   - Paragraphs.
   - List items.
   - Table rows.
   - PDF page content.

5. Diagnostics panel
   - Severity.
   - Code.
   - Message.
   - Source part/page.
   - OCR metadata.
   - Text samples.
   - Policy impact.

Example diagnostic rows for design:

| Severity | Code | Message | Source | Metadata | Policy impact |
| --- | --- | --- | --- | --- | --- |
| warning | docx_unsupported_textbox | Text inside a DOCX textbox was detected but is not part of parser truth. | `word/document.xml`, drawing textbox | Sample: "Special renewal carve-out" | Compare allowed with warning; reviewer should inspect source file. |
| info | pdf_ocr_used | Native PDF text layer was unreliable; OCR fallback was used for this page. | PDF page 4 | Mode: OCR, DPI: 300, language: `eng+vie`, confidence: 91% | Compare allowed if all OCR gates pass. |
| warning | pdf_ocr_low_confidence | OCR confidence is below the warning threshold on a material page. | PDF page 7 | Confidence: 73%, low-confidence token share: 18% | Compare allowed with warning only if retained token and page coverage gates pass. |
| warning | pdf_table_like_content | Table-like PDF content was flattened into paragraph blocks. | PDF page 9 | Pattern: aligned columns, repeated numeric cells | Compare/RAG allowed, but results around pricing/SLA tables should be treated as limited. |

Parser Workspace should not require the user to read raw JSON.

Design direction:

- Use tabs or segmented controls for surfaces.
- Use clear diagnostics cards or table rows.
- Use status badges for pass/warn/fail.
- Make "Compare blocked" visually explicit when parser quality fails.

### Compare Engine

Compare is deterministic and explainable.

Purpose:

- Compare two parsed contract drafts.
- Produce clause-level changes.
- Show exactly what was added, removed, or modified.

Inputs:

- Source draft.
- Target draft.
- Both drafts must have valid active parse runs.

Outputs:

- Compare run.
- Clause change list.
- Change type.
- Source/target text.
- Diff visualization.
- Review state.

Change types:

- Added.
- Removed.
- Modified.

Compare states:

- Need two parsed drafts.
- Compare setup ready.
- Compare running.
- Compare complete.
- Compare failed.
- No changes found.
- Changes available.

Design direction:

- Compare should be one of the strongest screens.
- Use a three-pane workbench:
  - left: change queue/filter
  - center: diff/content
  - right: AI review and human review controls
- Keep diff legible and legal-document-like.
- Make source/target draft selection clear.

### Clause Change Queue

The clause change queue helps users navigate review work.

Each row/card should show:

- Change type.
- Clause heading or section.
- Short excerpt.
- Risk level if AI review exists.
- Review status.
- Assignee.
- Comment count.
- AI review status.

Filters:

- Change type.
- Risk level.
- Review status.
- Assignee.
- AI review availability.
- Search text.

Queue states:

- Empty.
- Loading.
- Filtered empty.
- Selected item.
- Pagination.

### Inline Diff Viewer

The diff viewer shows precise text changes.

Needs:

- Added text highlight.
- Removed text highlight.
- Modified text comparison.
- Source draft label.
- Target draft label.
- Clause heading.
- Surface/source anchor if available.

Design direction:

- Avoid overly colorful diff noise.
- Use accessible colors.
- Keep enough whitespace for long legal text.
- Support paragraph-level scanning.

### RAG-Enhanced AI Review

AI Review explains clause risk using parsed contract context.

Purpose:

- Help reviewers understand why a clause change may matter.
- Suggest review action.
- Provide a draft comment.
- Provide suggested checks.

Generated fields:

- Explanation.
- Risk level.
- Suggested assignee.
- Recommended review status.
- Draft review comment.
- Suggested checks.
- Supporting evidence/context.
- Provider/model metadata if useful.

AI review states:

- Not generated.
- Generating.
- Generated.
- Failed.
- Regenerating.
- Batch job queued.
- Batch job running.
- Batch job complete.

Important UX rule:

AI Review must be visually labeled as a suggestion.
The human review section must be the authoritative final decision area.

Design direction:

- AI panel can be on the right side of Compare/Review.
- Use label such as "AI Draft" or "AI Suggestion".
- Show confidence/grounding/citation indicators where available.
- Provide Regenerate action.
- Provide Apply to Review or Copy to Comment action if useful.

### Human Review

Human Review captures the confirmed decision.

Purpose:

- Let a reviewer confirm status, owner, and comment.

Fields:

- Review status.
- Assignee.
- Summary/comment.
- Risk acknowledgement.
- Saved timestamp.

Current implementation statuses:

- `open` - needs reviewer attention.
- `in_review` - reviewer is actively evaluating or negotiating the clause.
- `resolved` - reviewer has confirmed the review decision.

Future legal design language such as Accepted, Rejected, Needs negotiation, Approved with comment, or Deferred can appear as visual copy only if it maps back to one of the current implementation statuses.

Actions:

- Save review.
- Add comment.
- Clear assignee.
- Clear summary.
- Navigate to next change.

Design direction:

- Human fields should be clearer and more final than AI fields.
- Show saved state.
- Keep comments audit-friendly.

### Contract Q&A

Contract Q&A answers questions about the selected parsed contract draft.

It is grounded by retrieval over parsed `DocumentBlock` content.

Capabilities:

- Create chat session.
- Ask contract-specific question.
- Stream answer.
- Stop an active stream.
- Retry stopped or failed answer.
- Restore stopped partial answer from local browser state.
- Fall back to JSON chat route if streaming is disabled.
- Show answer citations.
- Inspect source evidence.

Important rules:

- It must not answer freeform without contract grounding.
- It should cite source blocks/pages.
- The evidence panel should let users verify claims.

Q&A states:

- No parsed draft available.
- Chat ready.
- Session selected.
- Answer streaming.
- Stop requested.
- Stopped partial answer.
- Failed attempt.
- Retry available.
- Answer complete.
- Citations available.
- No relevant context found.

Suggested layout:

- Left panel: chat sessions and draft context.
- Center: conversation.
- Bottom: composer.
- Right panel: Source Evidence.

Message design:

- User question bubble.
- Assistant answer with citation chips.
- Streaming indicator.
- Stop button while streaming.
- Retry button for stopped/failed attempts.
- Status badges: Ready, Answering, Stopped, Failed.

Source Evidence panel should show:

- Citation number.
- Contract draft version.
- Surface type or PDF page.
- Block key or anchor.
- Clause heading.
- Extracted text.
- Relevance or retrieval score if useful.

Sample questions:

- What changed in payment terms?
- What is the termination notice period?
- Which obligations changed for the vendor?
- Are there any liability cap changes?
- Which clauses mention SLA or service credits?
- Does this contract include a confidentiality survival period?
- What does the current draft say about governing law?

### Summary / Export

Summary and export are support surfaces.

Purpose:

- Package review outcome for reporting, negotiation, or presentation.

Content:

- Compare run summary.
- Key clause changes.
- High-risk items.
- AI review highlights.
- Human review decisions.
- Open issues.
- Suggested next steps.

Design direction:

- Report-like page.
- Clear sections.
- Export-ready layout.
- Not the primary landing screen.

### Analytics

Analytics gives project-level visibility.

Possible metrics:

- Contracts under review.
- Parsed drafts.
- Compare runs.
- Clause changes by type.
- Clause changes by risk.
- Review status distribution.
- AI review generation count.
- Contract Q&A usage.
- Activity over time.

Design direction:

- Compact operational dashboard.
- Use simple charts.
- Avoid decorative business intelligence overload.

### Traceability / Obligations / Compliance Support

These are support surfaces inherited from earlier Redline capabilities.

Purpose:

- Connect changed clauses to obligations and compliance checks.
- Show impact on requirements/test cases if needed.

Capabilities:

- Obligation inventory.
- Compliance check inventory.
- Requirement/test mapping.
- Impact view from clause changes.

Design direction:

- Keep secondary in navigation.
- It should not visually compete with Compare or Contract Q&A.

### Activity Log

Activity log supports transparency.

Events may include:

- Project created.
- Contract created.
- Draft uploaded.
- Draft parsed.
- Parse failed.
- Compare run created.
- AI review generated.
- Review saved.
- Chat session created.
- Summary generated.

Design direction:

- Compact timeline.
- Useful for project overview.
- Not a major hero section.

## Required Screens

Stitch should design the following screens as a connected product.

### Primary Stitch Output

Prioritize these five screens for the first design output:

1. Contract Detail.
2. Compare Workspace.
3. Review Workspace.
4. Contract Q&A.
5. Parser Workspace.

Secondary/support screens may be lighter and should not dilute the primary flow:

- Summary / Export.
- Project analytics.
- Traceability / Impact.
- Activity log.
- Authentication and project list.

### 1. Authentication Screen

Required elements:

- Product name.
- Login form.
- Register option.
- Error message area.
- Loading/auth bootstrap state.

Tone:

- Serious.
- Minimal.
- Trustworthy.

### 2. Workspace Dashboard

Required elements:

- App shell.
- Topbar.
- Sidebar or navigation rail.
- Recent projects.
- Active contracts.
- Review metrics.
- Activity snapshot.
- Primary action to create/open project.

### 3. Project Detail Screen

Required elements:

- Project header.
- Project metadata.
- Contracts tab.
- Team/invitations tab.
- Activity tab.
- Analytics/support tabs.
- Contract inventory table.
- Create contract action.

### 4. Contract Detail Screen

Required elements:

- Contract header.
- Draft list.
- Upload draft action.
- Parse actions.
- Compare setup.
- Q&A entry.
- Parser workspace links.
- Draft readiness status.

### 5. Upload Draft Drawer / Modal

Required elements:

- File picker.
- Accepted formats: DOCX/PDF.
- Version label.
- Notes.
- Upload button.
- Validation error.
- Upload progress.

### 6. Parser Workspace Screen

Required elements:

- Draft/version selector.
- Parse run summary.
- Coverage pass/warn/fail.
- Warning count.
- Diagnostics panel.
- Surface/page tabs.
- Parsed content preview.
- Compare readiness callout.
- OCR summary for PDF.

### 7. Compare Setup Screen Or Section

Required elements:

- Source draft selector.
- Target draft selector.
- Draft parse status.
- Create compare run button.
- Readiness validation.

### 8. Compare Workspace Screen

Compare Workspace is the main diff inspection route. It should show deterministic compare truth, AI draft intelligence, and entry links into focused review and support routes. It should not look like a second human-review product.

Required elements:

- Compare run header.
- Source/target draft labels.
- Clause change queue.
- Filters.
- Inline diff viewer.
- Selected change metadata.
- AI review panel.
- Links to Review Workspace, Traceability / Impact, and Summary / Export.

### 9. Review Workspace Screen

Review Workspace is a focused route/state of the selected Compare Run. It is where the reviewer writes the human-confirmed status, assignee, summary, and comments for one selected clause change.

Required elements:

- Review queue.
- Selected clause change.
- AI draft.
- Human status form.
- Assignee.
- Review comment.
- Save action.
- Navigation next/previous.

### 10. Contract Q&A Screen

Required elements:

- Contract and draft context.
- Chat session list.
- Conversation.
- Composer.
- Streaming answer state.
- Stop button.
- Retry button.
- Citation chips.
- Source Evidence panel.

### 11. Source Evidence Panel

Required elements:

- Citation list.
- Surface/page source.
- Clause/block excerpt.
- Draft version.
- Evidence text.
- Link back to parser/compare context if possible.

### 12. Summary / Export Screen

Required elements:

- Negotiation summary.
- High-risk changes.
- Review decisions.
- Open items.
- Export/copy action.

### 13. Analytics Screen

Required elements:

- Project metrics.
- Review progress.
- Risk distribution.
- Change type distribution.
- Activity trend.

### 14. Empty / Loading / Error States

Required across the app:

- No project.
- No contract.
- No drafts.
- No parsed drafts.
- Parse failed.
- Compare blocked.
- AI generation failed.
- Chat no context.
- Streaming stopped.
- Upload unsupported file type.

## App Shell And Navigation

Suggested global layout:

- Topbar:
  - Redline wordmark.
  - Current workspace/project context.
  - Search or quick switcher if needed.
  - User profile menu.

- Sidebar or navigation rail:
  - Dashboard.
  - Projects.
  - Contracts.
  - Compare.
  - Contract Q&A.
  - Analytics.

- Context tabs inside project/contract:
  - Overview.
  - Drafts.
  - Parser.
  - Compare.
  - Review.
  - Q&A.
  - Summary.

Navigation priority:

1. Contracts.
2. Compare.
3. Contract Q&A.
4. Review.
5. Parser.
6. Summary.
7. Analytics.
8. Support/Traceability.

## Visual Design Requirements

The app should feel like legal operations software.

Recommended visual qualities:

- Neutral background.
- Clear panel boundaries.
- Compact tables.
- High information density.
- Subtle status colors.
- Accessible contrast.
- Clear typography.
- Minimal ornamentation.
- No decorative gradient blobs or unrelated illustrations.
- No huge marketing hero inside authenticated app.

Color system:

- Neutral: base surfaces, borders, text.
- Blue or teal: primary action / information.
- Green: ready, pass, accepted.
- Amber: warning, needs review.
- Red: fail, high risk, blocked.
- Purple should not dominate the product.
- Beige/brown should not dominate the product.

Typography:

- Use a professional sans-serif.
- Keep headings compact.
- Use monospace only for technical IDs, block keys, or diagnostics.
- Contract text should be readable and paragraph-oriented.

Cards and panels:

- Use cards for repeated items, diagnostics, and modals.
- Do not nest cards inside cards.
- Avoid oversized rounded cards.
- Keep border radius modest.

## Component Inventory

Stitch should include designs for:

- App shell.
- Sidebar.
- Topbar.
- Breadcrumbs.
- Page headers.
- Tabs.
- Segmented controls.
- Status badges.
- Risk badges.
- Version selectors.
- File upload drawer.
- Confirmation dialog.
- Toast notifications.
- Empty states.
- Error banners.
- Data tables.
- Filter toolbar.
- Search input.
- Pagination.
- Compare diff viewer.
- Clause change row/card.
- AI suggestion panel.
- Human review form.
- Comment composer.
- Chat session list.
- Chat message.
- Streaming answer indicator.
- Stop/retry controls.
- Citation chip.
- Source evidence panel.
- Parser surface tabs.
- Parser diagnostics table/card.
- OCR quality summary.
- Analytics stat cards.
- Compact charts.

## Status And Badge Language

Parser statuses:

- Not parsed.
- Parsing.
- Parsed.
- Parsed with warnings.
- Failed.

Coverage statuses:

- Pass.
- Warn.
- Fail.

Compare readiness:

- Ready for compare.
- Needs parsed drafts.
- Blocked by parser failure.

AI review statuses:

- Not generated.
- Generating.
- Generated.
- Failed.
- Regenerating.

Chat statuses:

- Ready.
- Answering.
- Stopped.
- Failed.
- Done.

Risk levels:

- Low.
- Medium.
- High.
- Critical if needed.

Review statuses:

- `open`.
- `in_review`.
- `resolved`.

Future labels such as Accepted, Needs negotiation, Rejected, or Deferred are design language only unless the backend/API status model is expanded.

## Business Workflows

### Workflow A: New Contract Review

1. User opens a project.
2. User creates or opens a contract.
3. User uploads draft v1 and draft v2.
4. User parses both drafts.
5. System shows parser quality.
6. User creates compare run.
7. System shows clause changes.
8. User reviews highest-risk changes first.
9. User generates AI review.
10. User confirms human review status and comments.
11. User asks Contract Q&A questions.
12. User exports or reviews summary.

### Workflow B: Parser Quality Check

1. User uploads DOCX/PDF.
2. User parses draft.
3. Parser returns pass/warn/fail.
4. User opens Parser Workspace.
5. User inspects surfaces/pages.
6. User inspects diagnostics.
7. If pass/warn, user proceeds to Compare.
8. If fail, user replaces or fixes source file.

### Workflow C: Contract Q&A

1. User opens contract.
2. User opens Q&A.
3. User asks question.
4. System streams answer.
5. User stops if needed.
6. User retries if failed/stopped.
7. User opens Source Evidence.
8. User verifies answer against cited clause.

### Workflow D: Human Review

1. User opens compare run.
2. User selects clause change.
3. User reads diff.
4. User reads AI suggestion.
5. User edits or ignores AI suggestion.
6. User confirms status.
7. User assigns owner.
8. User saves comment.
9. User moves to next change.

## Data Model For Design Understanding

The UI does not need to expose every technical model, but Stitch should understand the relationships.

Main relationships:

- Project contains many Contracts.
- Contract contains many Contract Drafts.
- Contract Draft has one active Parse Run when parsed.
- Parse Run contains parsed surfaces/pages and blocks.
- Parsed blocks are used by Compare and RAG retrieval.
- Compare Run compares two parsed drafts.
- Compare Run contains many Clause Changes.
- Clause Change may have one AI Review Draft.
- Clause Change may have human review status/comments.
- Contract has Chat Sessions.
- Chat Session has messages and attempts.
- Assistant answers have citations back to parsed blocks.

## Technical Capabilities To Reflect In UI

Backend:

- FastAPI.
- PostgreSQL + pgvector.
- SQLite test fallback.
- DOCX parser.
- PDF parser.
- Tesseract OCR.
- RAG retrieval.
- AI provider adapter.
- Streaming Contract Q&A.

Frontend:

- React + Vite + Tailwind.
- Authenticated app routes.
- Contract detail.
- Parser workspace.
- Compare workspace.
- Review workspace.
- Contract Q&A.
- Summary/export.
- Analytics.

Do not make the tech stack visually dominant. It is useful for understanding the product, not for UI copy.

## What Should Be Prominent

Make these prominent:

- Contract identity.
- Draft version.
- Parse status.
- Compare readiness.
- Clause change queue.
- Risk level.
- Human review status.
- Source evidence.
- Citation-backed Q&A.
- Review progress.

Make these secondary:

- Internal IDs.
- Raw parser JSON.
- Provider/model names.
- Technical diagnostics unless user is in Parser Workspace.
- Legacy requirement/test case features.

## Copywriting Guidance

Use copy like:

- "Compare contract drafts"
- "Review clause changes"
- "AI draft, pending human confirmation"
- "Grounded answer with source evidence"
- "Parser warning: inspect before compare"
- "Ready for Compare"
- "Blocked: parse quality failed"
- "Open Source Evidence"
- "Generate AI Review"
- "Save Human Review"

Avoid copy like:

- "AI has reviewed and approved this"
- "Autonomous legal decision"
- "Ask anything"
- "Magic contract analysis"
- "Guaranteed legal answer"

## Example Screen Content

### Example Contract

Contract name:

```text
Acme Services Agreement
```

Drafts:

```text
v1.0 - Customer draft - parsed
v1.1 - Vendor redline - parsed with warnings
```

Compare run:

```text
Compare v1.0 -> v1.1
17 clause changes
3 high risk
8 need review
```

Clause change examples:

```text
Modified - Payment Terms
Payment due date changed from 30 days to 15 days.

Modified - Limitation of Liability
Liability cap increased from fees paid in 12 months to 2x annual fees.

Removed - Independent Development
Independent development carve-out removed from confidentiality section.

Added - Service Credits
New SLA service credit table added.
```

Contract Q&A examples:

```text
Question: What changed in payment terms?
Answer: The target draft shortens the invoice payment period from 30 days to 15 days...
Citations: Payment Terms, Section 4.2
```

## Responsive Behavior

Desktop:

- Use workbench layouts.
- Multi-pane compare and Q&A are preferred.
- Tables and filters can be visible at once.

Tablet:

- Keep main workbench.
- Collapse secondary evidence panel into drawer.
- Use tabs for AI review/human review/source evidence.

Mobile:

- Focus on one task at a time.
- Use stacked layout.
- Keep primary actions sticky where useful.
- Source evidence can open as full-screen sheet.

## Accessibility Requirements

Design should support:

- Keyboard navigation.
- Clear focus states.
- Accessible status text.
- Color plus text/icon for risk/status.
- Sufficient contrast.
- Descriptive icon buttons.
- No text overlap in compact cards/tables.

## Out Of Scope For Current Product Design

Do not center the design around:

- Clause library.
- Playbook automation.
- Full autonomous review.
- Cross-contract search.
- Realtime collaborative editing.
- Complex enterprise RBAC.
- Billing/subscription.
- Public marketing site.
- Generic document storage.
- Generic chatbot.

Future sections can hint at extensibility, but the current design must prioritize:

```text
Contract drafts -> parser quality -> deterministic compare -> grounded AI review -> human review -> citation-backed Contract Q&A
```

## Final Design Intent

If Stitch generates only one coherent product concept from this file, it should be:

A legal contract review command center where teams upload DOCX/PDF contract drafts, verify parse quality, compare versions clause by clause, use grounded AI to draft risk analysis, confirm human review outcomes, and ask citation-backed questions about the active contract draft.

The strongest screens should be:

1. Contract Detail with draft readiness.
2. Compare Workspace with clause queue and diff.
3. Review Workspace with AI draft and human confirmation.
4. Contract Q&A with Source Evidence.
5. Parser Workspace with diagnostics and PDF OCR transparency.
