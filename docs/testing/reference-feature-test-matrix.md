# Reference: Feature Test Matrix

Use this as the canonical feature checklist. Each case includes:
- precondition;
- action to test;
- expected result;
- related automated coverage.

## Result legend
- `pass`: ket qua dung nhu expected
- `fail`: sai ket qua, can bug log
- `blocked`: khong test duoc vi env / du lieu / AI key
- `n/a`: khong nam trong scope cua buoi test hien tai

## Auth va session

- [ ] `AUTH-01` Register + login
  - Preconditions: chua co account cho email test
  - Steps: dang ky account moi, sau do dang xuat va dang nhap lai
  - Expected: redirect vao `Project List`, khong hien `[object Object]`, khong `401`
  - Automated: `src/backend/tests/test_auth_api.py::test_register_login_and_session_flow`; `src/frontend/src/pages/AuthPage.test.jsx`

- [ ] `AUTH-02` Client-side validation
  - Preconditions: trang `Sign up`
  - Steps: thu password qua ngan
  - Expected: frontend chan request som, hien message de doc duoc
  - Automated: `src/frontend/src/pages/AuthPage.test.jsx`

- [ ] `AUTH-03` Pending invitation surfaces in session
  - Preconditions: da tao pending invitation cho mot email chua register
  - Steps: dang ky / login bang dung email do
  - Expected: `Project List` hien `Pending Invitations`
  - Automated: `src/backend/tests/test_auth_api.py::test_register_and_login_surface_pending_project_invitations_until_acceptance`

- [ ] `AUTH-04` Demo seed
  - Preconditions: da login
  - Steps: bam `Seed Demo Data`
  - Expected: tao workspace demo that, project list refresh
  - Automated: `src/backend/tests/test_auth_api.py::test_demo_seed_creates_live_workspace_data`

## Project va invitation

- [ ] `PROJ-01` Create project
  - Preconditions: da login
  - Steps: tao project moi tu `Project List`
  - Expected: project moi xuat hien trong inventory va mo duoc workspace
  - Automated: `src/backend/tests/test_projects_api.py::test_project_crud_flow`; `src/frontend/src/pages/ProjectListPage.test.jsx::creates a project and navigates to the new workspace`

- [ ] `PROJ-02` Update project
  - Preconditions: da co project
  - Steps: edit name / description
  - Expected: inventory refresh, data moi hien dung
  - Automated: `src/backend/tests/test_projects_api.py::test_project_crud_flow`; `src/frontend/src/pages/ProjectListPage.test.jsx::updates a project from the project list and refreshes the live inventory`

- [ ] `PROJ-03` Delete project
  - Preconditions: da co project co the xoa
  - Steps: delete sau confirm
  - Expected: project bi xoa khoi inventory
  - Automated: `src/backend/tests/test_projects_api.py::test_project_crud_flow`; `src/frontend/src/pages/ProjectListPage.test.jsx::deletes a project after confirmation and removes it from the list`

- [ ] `INV-01` Create pending invitation
  - Preconditions: owner dang o `Project Detail -> Team`; email target chua co account
  - Steps: them member bang email moi
  - Expected: tao `Pending Invitations`, khong tao ghost user
  - Automated: `src/backend/tests/test_projects_api.py::test_create_project_member_creates_pending_invitation_for_unknown_email`; `src/frontend/src/pages/ProjectDetailPage.test.jsx::surfaces active members separately from pending invitations and supports invite revoke`

- [ ] `INV-02` Accept invitation
  - Preconditions: account target da register bang dung email invite
  - Steps: vao `Project List`, bam `Accept Invitation`
  - Expected: project xuat hien trong list, invitation bien mat khoi pending
  - Automated: `src/backend/tests/test_auth_api.py::test_register_and_login_surface_pending_project_invitations_until_acceptance`; frontend flow trong `src/frontend/src/pages/ProjectListPage.jsx`

- [ ] `INV-03` Revoke invitation
  - Preconditions: project co pending invitation
  - Steps: owner revoke invitation
  - Expected: invitation bi xoa khoi list pending
  - Automated: `src/frontend/src/pages/ProjectDetailPage.test.jsx::surfaces active members separately from pending invitations and supports invite revoke`

## Contract, draft, requirement, test case inventory

- [ ] `DOC-01` Create contract/document
  - Preconditions: da vao `Project Detail`
  - Steps: tao contract moi
  - Expected: contract xuat hien trong inventory va mo duoc Contract Workspace
  - Automated: `src/backend/tests/test_documents_api.py::test_document_crud_flow`; `src/frontend/src/pages/ProjectDetailPage.test.jsx::creates a document from the project workspace and refreshes the inventory`

- [ ] `DOC-02` Update document metadata
  - Preconditions: da co document
  - Steps: edit title / type / description
  - Expected: workspace refresh voi data moi
  - Automated: `src/backend/tests/test_documents_api.py::test_document_crud_flow`; `src/frontend/src/pages/ProjectDetailPage.test.jsx::updates a document from the project workspace and refreshes the inventory`; `src/frontend/src/pages/DocumentDetailPage.test.jsx::updates document metadata from the live document workspace`

- [ ] `DOC-03` Delete document
  - Preconditions: document khong can giu lai
  - Steps: delete sau confirm
  - Expected: document bien khoi inventory
  - Automated: `src/frontend/src/pages/ProjectDetailPage.test.jsx::deletes a document after confirmation and removes it from the project inventory`

- [ ] `REQ-01` Requirement CRUD
  - Preconditions: da o `Project Detail`
  - Steps: tao, sua, xoa requirement
  - Expected: inventory refresh dung
  - Automated: `src/backend/tests/test_requirements_api.py`; `src/frontend/src/pages/ProjectDetailPage.test.jsx::manages requirement inventory from the project workspace`

- [ ] `TC-01` Test case CRUD
  - Preconditions: da o `Project Detail`
  - Steps: tao, sua, xoa test case
  - Expected: inventory refresh dung
  - Automated: `src/backend/tests/test_test_cases_api.py`; `src/frontend/src/pages/ProjectDetailPage.test.jsx::manages test case inventory from the project workspace`

- [ ] `ACT-01` Activity log
  - Preconditions: da tao mot vai action trong project
  - Steps: mo tab `Activity`
  - Expected: thay event tao document, upload, parse, compare, review neu da co
  - Automated: `src/backend/tests/test_activity_logs_api.py`; frontend flow trong `src/frontend/src/pages/ProjectDetailPage.test.jsx`

## Version va parser workspace

- [ ] `VER-01` Upload DOCX/PDF draft
  - Preconditions: da o Contract Workspace hoac Document Detail
  - Steps: upload file `.docx` hoac `.pdf` hop le
  - Expected: draft/version moi xuat hien trong contract workspace
  - Automated: `src/backend/tests/test_documents_api.py::test_document_version_crud_flow`; `src/frontend/src/pages/DocumentDetailPage.test.jsx::uploads a DOCX version and refreshes the live version inventory`

- [ ] `VER-02` Block unsupported upload
  - Preconditions: da o form upload version
  - Steps: chon file khong phai `.docx` hoac `.pdf`
  - Expected: frontend chan request
  - Automated: `src/frontend/src/pages/DocumentDetailPage.test.jsx::blocks unsupported uploads before calling the upload endpoint`

- [ ] `VER-03` Version metadata CRUD
  - Preconditions: da co version
  - Steps: doi `version_label`, notes; xoa version
  - Expected: inventory refresh, compare readiness cap nhat
  - Automated: `src/backend/tests/test_documents_api.py::test_update_document_version_allows_version_label_changes`; `src/backend/tests/test_documents_api.py::test_update_document_version_rejects_duplicate_version_label`; `src/frontend/src/pages/DocumentDetailPage.test.jsx::updates version metadata and refreshes the live version inventory`; `src/frontend/src/pages/DocumentDetailPage.test.jsx::deletes a version and refreshes compare readiness from the live inventory`

- [ ] `PAR-01` Parse pending version
  - Preconditions: version moi upload, chua parse
  - Steps: mo `Parser Workspace`, bam `Parse`
  - Expected: `parse_status` thanh `parsed` hoac `parsed_with_warnings`
  - Automated: `src/backend/tests/test_documents_api.py::test_document_version_parse_flow`; `src/frontend/src/pages/ParserWorkspacePage.test.jsx::parses a pending version directly from the workspace`

- [ ] `PAR-02` Parser failure handling
  - Preconditions: co fixture parser fail hoac mock environment phu hop
  - Steps: gay parse failure
  - Expected: `parse_status = failed`; active parse run truoc do van duoc giu neu re-parse fail
  - Automated: `src/backend/tests/test_documents_api.py::test_document_version_parse_failure_marks_failed`; `src/backend/tests/test_document_parser.py::test_failed_reparse_keeps_previous_active_parse_run`

- [ ] `PAR-03` Surface coverage
  - Preconditions: dung fixture parser coverage
  - Steps: review `Body`, `Header`, `Footer`, `Footnote`, `Endnote`, tables
  - Expected: parser truth hien du surface, metadata, warnings
  - Automated: `src/backend/tests/test_document_parser.py`; `test_document_parser_structured_tables.py`; `test_document_parser_header_footer.py`; `test_document_parser_notes.py`; `src/frontend/src/pages/ParserWorkspacePage.test.jsx::renders parsed preview, warnings, and header surface switching`

- [ ] `PAR-04` Compare readiness guard
  - Preconditions: co 2 version, mot version thieu `active_parse_run_id`
  - Steps: mo compare setup
  - Expected: UI khoa compare, huong dan re-parse
  - Automated: `src/frontend/src/pages/DocumentDetailPage.test.jsx::keeps compare locked when versions look parsed but have no active parse run`

- [ ] `PAR-05` Version-specific parser entry
  - Preconditions: document co nhieu versions
  - Steps: mo parser workspace tu version row hoac query `version_id`
  - Expected: workspace ton trong version duoc chon
  - Automated: `src/frontend/src/pages/DocumentDetailPage.test.jsx::opens parser workspace directly from a version row instead of relying on the page header`; `src/frontend/src/pages/ParserWorkspacePage.test.jsx::honors the version query parameter when opening parser workspace from a version-specific entry point`

- [ ] `PAR-06` Contract parser facade route
  - Preconditions: contract co draft
  - Steps: mo parser tu `/contracts/:contractId/parser`
  - Expected: back/compare links giu contract context, khong nhay ve legacy document route
  - Automated: `src/frontend/src/pages/ParserWorkspacePage.test.jsx::keeps contract facade links when opened from a contract parser route`

## AI requirement extraction

- [ ] `AIREQ-01` Generate candidates
  - Preconditions: version da parse xong
  - Steps: bam `Extract Requirements with AI`
  - Expected: candidate list load, co summary `pending/accepted/rejected`, co provider metadata neu AI chay duoc
  - Automated: `src/backend/tests/test_requirement_candidates_api.py::test_generate_requirement_candidates_persists_ai_suggestions`; `src/frontend/src/pages/ParserWorkspacePage.test.jsx::generates, accepts, and rejects AI requirement candidates`

- [ ] `AIREQ-02` Accept / reject candidate
  - Preconditions: candidate dang `pending`
  - Steps: accept 1 candidate, reject 1 candidate
  - Expected: accept tao hoac reuse requirement truth; reject khong tao truth
  - Automated: `src/backend/tests/test_requirement_candidates_api.py::test_accept_and_reject_requirement_candidates_update_truth_safely`

- [ ] `AIREQ-03` Guard unparsed version
  - Preconditions: version chua parse
  - Steps: goi extraction
  - Expected: request bi tu choi
  - Automated: `src/backend/tests/test_requirement_candidates_api.py::test_generate_requirement_candidates_requires_parsed_version`

## Compare workspace va AI batch jobs

- [ ] `CMP-01` Create compare run
  - Preconditions: 2 version compare-ready
  - Steps: `Launch Compare`
  - Expected: tao compare run that, queue co du lieu
  - Automated: `src/backend/tests/test_compare_api.py::test_create_compare_run_builds_change_items_from_two_parsed_versions`; `src/frontend/src/pages/DocumentDetailPage.test.jsx::creates a compare run from two parsed versions`

- [ ] `CMP-02` Compare correctness for text / header / table
  - Preconditions: fixture co body insert, header change, table row change
  - Steps: tao compare run va inspect item
  - Expected: exact matches giu duoc sau insertion, header khong tron vao body, structured row diff hien duoc
  - Automated: `src/backend/tests/test_compare_api.py::test_compare_preserves_later_exact_matches_when_target_inserts_midstream_paragraph`; `...::test_compare_keeps_header_changes_partitioned_away_from_body_content`; `...::test_compare_aligns_table_rows_by_requirement_key_and_exposes_structured_diff`

- [ ] `CMP-03` Compare warning / failure lifecycle
  - Preconditions: co fixture table alignment fallback hoac engine error
  - Steps: tao compare run
  - Expected: `completed_with_warnings` hoac `failed` duoc persist ro rang
  - Automated: `src/backend/tests/test_compare_api.py::test_compare_marks_warning_status_when_table_alignment_has_to_fallback`; `...::test_compare_run_persists_failed_status_when_engine_raises_after_run_creation`

- [ ] `CMP-04` Queue filter va pagination
  - Preconditions: compare run co nhieu item
  - Steps: tim kiem, loc theo `change_type`, `review_status`, AI status, doi page
  - Expected: selected item van duoc giu logic hop ly
  - Automated: `src/frontend/src/pages/CompareScreenPage.test.jsx::filters and paginates the compare queue while keeping the selected item visible`

- [ ] `AIBATCH-01` Batch AI generate
  - Preconditions: compare run da tao; env AI hop le
  - Steps: bam `Generate AI Drafts`
  - Expected: tao job ngay, UI poll progress, queue refresh sau khi xong
  - Automated: `src/backend/tests/test_ai_batch_jobs_api.py::test_batch_generate_endpoint_creates_job_immediately_without_generating_drafts`; `src/backend/tests/test_ai_batch_worker.py::test_process_next_batch_job_updates_drafts_and_job_counts`; `src/frontend/src/pages/CompareScreenPage.test.jsx::creates an ai batch job, polls progress, and refreshes the queue when the job completes`

- [ ] `AIBATCH-02` Resume active job sau reload
  - Preconditions: compare run dang co active batch job
  - Steps: reload Compare Workspace
  - Expected: UI resume polling thay vi mat state
  - Automated: `src/backend/tests/test_ai_batch_jobs_api.py::test_compare_run_detail_exposes_active_ai_batch_job`; `src/frontend/src/pages/CompareScreenPage.test.jsx::resumes polling when the compare run already has an active ai batch job`

## Review workspace

- [ ] `REV-01` Save review decision
  - Preconditions: compare run co item
  - Steps: dat `review_status`, `assignee`, `summary`, bam save
  - Expected: confirmed review data duoc luu
  - Automated: `src/backend/tests/test_change_items_api.py::test_patch_change_item_updates_review_status_and_assignee`; `src/frontend/src/pages/ReviewPanelPage.test.jsx::shows empty ai state, saves review status, and adds a comment`

- [ ] `REV-02` Clear assignee va summary
  - Preconditions: item da co assignee / summary
  - Steps: clear 2 field do roi save
  - Expected: backend nhan `null`, state duoc clear that
  - Automated: `src/backend/tests/test_change_items_api.py::test_patch_change_item_can_clear_assignee_and_summary`; `src/frontend/src/pages/ReviewPanelPage.test.jsx::sends null values when the reviewer clears assignee and summary`

- [ ] `REV-03` Comment workflow
  - Preconditions: dang o Review Workspace
  - Steps: them comment
  - Expected: comment xuat hien trong history
  - Automated: `src/backend/tests/test_change_items_api.py::test_post_change_item_comment_persists_review_discussion`; `src/frontend/src/pages/ReviewPanelPage.test.jsx::shows empty ai state, saves review status, and adds a comment`

- [ ] `REV-04` Regenerate AI draft
  - Preconditions: env AI hop le hoac da co mock support
  - Steps: bam `Regenerate AI Draft`
  - Expected: AI metadata update; neu fail thi khong mat draft cu
  - Automated: `src/backend/tests/test_ai_review_drafts_api.py::test_regenerate_keeps_previous_draft_when_new_attempt_fails`; `src/frontend/src/pages/ReviewPanelPage.test.jsx::renders generated ai draft metadata and allows regenerate`

- [ ] `REV-05` Queue navigation
  - Preconditions: co nhieu item trong compare run
  - Steps: loc, phan trang, chuyen selected item trong review queue
  - Expected: khong can quay lai compare page de tiep tuc review
  - Automated: `src/frontend/src/pages/ReviewPanelPage.test.jsx::filters, paginates, and navigates the review queue without leaving the workspace`

## Traceability va impact

- [ ] `TRACE-01` Link / unlink requirement
  - Preconditions: project da co requirements
  - Steps: link requirement vao change item, sau do unlink
  - Expected: `linked_requirements` cap nhat dung, impact chain refresh
  - Automated: backend route `src/backend/app/api/routes/change_items.py`; frontend flow `src/frontend/src/pages/TraceabilityImpactPage.jsx`

- [ ] `TRACE-02` Requirement -> test case mapping CRUD
  - Preconditions: project da co requirement va test case
  - Steps: tao mapping va xoa mapping
  - Expected: active mappings hien dung requirement dang chon
  - Automated: `src/backend/tests/test_requirement_test_case_mappings_api.py`; `src/frontend/src/pages/TraceabilityImpactPage.test.jsx::renders active mappings under the correct linked requirement`

- [ ] `TRACE-03` Impacted test aggregate
  - Preconditions: change item da linked requirement va requirement da map test case
  - Steps: mo `Traceability / Impact`
  - Expected: impacted tests hien tu manual mappings, khong do AI tu suy
  - Automated: `src/backend/tests/test_change_items_api.py::test_change_item_detail_returns_requirement_specific_test_mappings`; `src/frontend/src/pages/TraceabilityImpactPage.test.jsx::renders linked requirements and impacted tests from live change item detail`

- [ ] `TRACE-04` AI suggested requirement links
  - Preconditions: compare run co change item va project co requirements
  - Steps: generate AI suggestions, accept mot suggestion, dismiss/ignore suggestion khac
  - Expected: AI suggestion khong tao truth cho den khi user accept; accepted link dung token server-issued
  - Automated: `src/frontend/src/pages/TraceabilityImpactPage.test.jsx::accepts AI suggested links through the dedicated tokenized endpoint`; `src/backend/tests/test_change_items_api.py`

## Contract Q&A

- [ ] `CHAT-01` Streaming grounded answer
  - Preconditions: contract co parsed active draft va RAG health OK
  - Steps: hoi cau hoi contract-specific trong `/contracts/:contractId/chat`
  - Expected: answer co citation va Source Evidence support answer
  - Automated: `src/frontend/src/pages/ContractChatPage.test.jsx::creates a contract chat session and renders grounded answer citations`

- [ ] `CHAT-02` Stop / retry
  - Preconditions: stream dang active
  - Steps: stop stream, retry cung bubble
  - Expected: attempt cu terminal, retry tao attempt moi, session khong bi ket
  - Automated: `src/frontend/src/pages/ContractChatPage.test.jsx::stops an active stream and retries in the same answer bubble`

- [ ] `CHAT-03` JSON fallback
  - Preconditions: streaming disabled bang env frontend/backend
  - Steps: gui message chat
  - Expected: JSON path tra answer/citations, UI khong phu thuoc SSE
  - Automated: `src/frontend/src/pages/ContractChatPage.test.jsx::uses JSON chat fallback when streaming is disabled by env`

## Summary / export / analytics

- [ ] `SUM-01` Generate AI summary
  - Preconditions: compare run da co review data; env AI hop le
  - Steps: bam `Generate AI Summary`
  - Expected: summary draft sinh thanh cong, editor cap nhat
  - Automated: `src/backend/tests/test_ai_summary_api.py::test_generate_compare_run_ai_summary`; frontend flow trong `src/frontend/src/pages/SummaryExportPage.jsx`

- [ ] `SUM-02` Export Markdown
  - Preconditions: da co summary draft
  - Steps: bam `Export Markdown`
  - Expected: tai file `.md`
  - Automated: frontend flow trong `src/frontend/src/pages/SummaryExportPage.jsx`

- [ ] `SUM-03` Export DOCX
  - Preconditions: compare run ton tai; summary draft optional
  - Steps: bam `Export DOCX`
  - Expected: tai file report `.docx`, summary text duoc chen neu cung cap
  - Automated: `src/backend/tests/test_export_docx_api.py`; frontend flow trong `src/frontend/src/pages/SummaryExportPage.jsx`

- [ ] `SUM-04` Summary workspace readiness signal
  - Preconditions: compare run con item `open` hoac `in_review`
  - Steps: mo `Summary / Export`
  - Expected: `Review pending` cho den khi khong con item active
  - Automated: `src/frontend/src/pages/SummaryExportPage.test.jsx`

- [ ] `AN-01` Project analytics
  - Preconditions: project da co compare run va review data
  - Steps: mo `Analytics`
  - Expected: thay total changes, review progress, compare runs, AI metrics, per-document breakdown
  - Automated: `src/backend/tests/test_analytics_api.py`; `src/frontend/src/pages/ProjectAnalyticsPage.test.jsx`

## Security / isolation

- [ ] `SEC-01` Project membership isolation
  - Preconditions: co 2 users, mot user khong thuoc project
  - Steps: user ngoai project goi project/document/compare routes
  - Expected: bi tu choi truy cap
  - Automated: `src/backend/tests/test_projects_api.py::test_projects_are_scoped_to_membership_and_creator_is_added_as_owner`; `src/backend/tests/test_documents_api.py::test_document_routes_require_project_membership`; `src/backend/tests/test_compare_api.py::test_compare_routes_require_project_membership`; `src/backend/tests/test_requirements_api.py::test_requirement_routes_require_project_membership`; `src/backend/tests/test_requirement_test_case_mappings_api.py::test_requirement_test_case_mapping_routes_require_project_membership`

- [ ] `SEC-02` Auth rate limiting
  - Preconditions: auth DB available
  - Steps: repeat password login/google/register/password-change/avatar upload beyond limits
  - Expected: returns rate-limit response without leaking plaintext email in bucket keys
  - Automated: `src/backend/tests/test_auth_api.py`

- [ ] `SEC-03` Upload storage abstraction
  - Preconditions: local or object storage configured
  - Steps: upload contract draft/avatar, parse/read/delete where applicable
  - Expected: no path traversal, object/local cleanup works, parser can read object-backed uploads
  - Automated: `src/backend/tests/test_upload_storage.py`, `src/backend/tests/test_avatar_api.py`

## Completion rule
Mot full regression pass duoc xem la xong khi:
- tat ca case canonic trong buoi test da co ket qua
- moi case `fail` deu co note bug ro rang
- moi case `blocked` deu ghi ro ly do env hoac du lieu
