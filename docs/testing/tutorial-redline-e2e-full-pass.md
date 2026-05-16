# Tutorial: Redline E2E Full Pass

Tai lieu nay huong dan mot buoi rehearsal tu dau den cuoi de test toan bo luong he thong Redline bang UI that.

## Muc tieu
Ket thuc tutorial, ban phai co du bang chung cho cac nhom tinh nang sau:
- auth va invitation
- project / document / version workflow
- parser truth
- AI requirement extraction
- deterministic compare
- AI review draft batch
- human review decision + comments
- traceability requirement -> test case
- AI summary + export
- analytics + activity log

## Audience
Nguoi moi vao project, QA support, hoac presenter can chay mot full walkthrough.

## Truoc khi bat dau

### 1. Khoi dong backend
```powershell
cd src/backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -e .[dev]
.\.venv\Scripts\python -m alembic upgrade head
.\.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 2. Khoi dong frontend
```powershell
cd src/frontend
npm install
npm run dev
```

### 3. Cau hinh de test AI day du
Them vao `src/backend/.env` neu ban muon chay het AI flow:
```env
REDLINE_AI_GEMINI_API_KEY=...
REDLINE_AI_OPENAI_API_KEY=...
REDLINE_AI_OPENAI_BASE_URL=... # chi neu dung OpenAI-compatible provider khac
```

### 4. Fixture dung trong tutorial
- current demo/eval sources:
  - `docs/demo/full-system-demo/source-contracts.md`
  - `docs/demo/full-system-demo/scripts/build_full_demo_fixtures.py`
  - `docs/testing/eval-pack/sample-contract-notes.md`

## Scenario va vai tro
- `Owner`: tao project, setup documents, upload, parse, compare
- `Reviewer`: chap nhan invitation, review change items, comment, traceability

De de theo doi, dung 2 email mau:
- `owner.redline@example.com`
- `reviewer.redline@example.com`

## Phase 1 - Dang ky owner va tao project
1. Mo `http://127.0.0.1:5173/login`
2. Chon `Sign up`
3. Tao account `owner.redline@example.com`
4. Sau login, ban phai thay `Project List`
5. Bam `Create Project`
6. Tao project:
   - Name: `Redline QA Full Pass`
   - Description: `Full feature regression workspace`

### Expected result
- Project moi xuat hien trong inventory
- Ban co the mo `Project Detail`
- Khong co loi `401`

## Phase 2 - Tao data setup trong project
Trong `Project Detail`, tao 2 document:

### Document A - core compare
- Title: `Redline Demo SRS`
- Type: `SRS`

### Document B - parser coverage
- Title: `Parser Coverage Fixture`
- Type: `SRS`

Tiep theo, trong cung project, tao toi thieu:

### Requirements
- `REQ-AUTH-001` - Secure login
- `REQ-SEC-002` - MFA for privileged users
- `REQ-LOG-003` - Audit logging

### Test cases
- `TC-AUTH-001` - Login with valid credentials
- `TC-SEC-002` - Enforce MFA for admin
- `TC-LOG-003` - Audit log entry after sign-in

### Expected result
- `Document Inventory` co 2 document
- `Requirement Inventory` va `Test Case Inventory` co du record
- `Activity Log` sau do phai co event create document / requirement / test case

## Phase 3 - Test invitation flow
1. Trong `Project Detail`, mo tab `Team`
2. Them member:
   - Email: `reviewer.redline@example.com`
   - Role: `reviewer` hoac role hien co trong form
3. Xac nhan ket qua la pending invitation
4. Dang xuat owner
5. Dang ky account moi bang dung email `reviewer.redline@example.com`
6. Sau login, tai `Project List`, phai thay card `Pending Invitations`
7. Bam `Accept Invitation`

### Expected result
- Trong owner account, `Project Detail -> Team`, reviewer hien trong `Active Members`
- `Pending Invitations` cua project giam hoac bien mat
- Trong reviewer account, project xuat hien trong `Project List`

## Phase 4 - Upload va parse parser coverage fixture
1. Dang nhap lai bang owner
2. Mo `Parser Coverage Fixture`
3. Tai `Version Inventory`, upload file:
   - label: `parser-v1`
   - file: DOCX/PDF generated from `docs/demo/full-system-demo/source-contracts.md` or another current legal contract fixture
4. Sau khi upload xong, bam `Parser Workspace` ngay tren version row
5. Bam `Parse`

### Expected result
- Version parse thanh cong
- `parse_status` expected: `parsed_with_warnings`
- Parser summary cho thay:
  - surface count > 0
  - warning count > 0
- Ban co the chuyen qua:
  - `Body`
  - `Header`
  - `Footer`
  - `Footnote`
  - `Endnote`
- Table metadata va row-level truth hien duoc trong inspect panel

## Phase 5 - Test AI requirement extraction
Van o `Parser Workspace` cua `parser-v1`:
1. Bam `Extract Requirements with AI`
2. Doi candidate list load xong
3. Xac nhan candidate summary co `pending`
4. Accept it nhat 1 candidate
5. Reject it nhat 1 candidate

### Expected result
- Candidate list hien:
  - `requirement_code`
  - `title`
  - `confidence`
  - `source_section`
  - provider / fallback metadata neu co
- Sau accept:
  - candidate chuyen sang `accepted`
  - requirement that duoc tao hoac reuse
- Sau reject:
  - candidate chuyen sang `rejected`
  - requirement truth khong bi tao boi reject action

## Phase 6 - Upload va parse core compare pair
1. Mo document contract demo hien tai
2. Upload 2 drafts tu full-system demo fixtures:
   - `v1.0` -> baseline contract draft
   - `v2.0` -> revised contract draft
3. Parse ca 2 versions bang `Parser Workspace`
4. Quay lai `Document Detail`

### Expected result
- Ca 2 version xuat hien trong `Version Inventory`
- Compare chi duoc mo khi version co `active_parse_run_id`
- Neu version nao parse fail thi compare van bi khoa

## Phase 7 - Tao compare run
1. Trong `Compare Versions`, chon:
   - Source: `v1.0`
   - Target: `v2.0`
2. Bam `Launch Compare`

### Expected result
- Mo sang `Compare Workspace`
- `Change Queue` co du lieu that
- Co the thay item `added`, `removed`, `modified`

## Phase 8 - Batch AI review drafts
1. Trong `Compare Workspace`, bam `Generate AI Drafts`
2. Theo doi job status, badges, va queue refresh
3. Neu refresh trang giua chung, trang van phai resume duoc polling tu active job

### Expected result
- Tao `AIBatchJob` ngay, khong block UI
- Queue hien trang thai AI theo tung item
- Sau khi job xong, majority item chuyen sang `generated`
- Theo benchmark rehearsal hien tai, cap fixture core da tung cho `11/11 generated`

## Phase 9 - Human review workspace
1. Chon 1 change item trong compare queue
2. Chuyen sang `Review Workspace`
3. Kiem tra `AI Review Signals`
4. Luu review decision:
   - review status: `in_review`
   - assignee: reviewer hoac owner
   - summary: mo ta ngan
5. Them 1 comment
6. Chon 1 item khac va dat `resolved`
7. O mot item bat ky, bam `Regenerate AI Draft`
8. Thu clear assignee va summary roi save lai

### Expected result
- AI draft va confirmed review data tach biet ro
- Save review update thanh cong
- Comment moi xuat hien trong history
- Clear `assignee` / `summary` gui `null` dung nghia, khong de stale data
- Review queue filter + pagination van giu duoc selected item

## Phase 10 - Traceability va impacted tests
1. Tu `Review Workspace`, mo `Traceability / Impact`
2. Link change item voi it nhat 1 requirement
3. Tao it nhat 1 mapping requirement -> test case
4. Kiem tra `Impacted Tests`
5. Thu unlink requirement hoac xoa mapping de xac nhan state cap nhat dung

### Expected result
- Requirement link xuat hien trong `Impact Chain`
- `Impacted Tests` chi hien test case map dung requirement dang linked
- Mapping manager khong duoc tron test case cua requirement khac

## Phase 11 - Summary / Export
1. Mo `Summary / Export`
2. Bam `Generate AI Summary`
3. Sua summary text trong editor
4. Thu `Export Markdown`
5. Thu `Export DOCX`

### Expected result
- Summary draft sinh tu compare + review + impact context
- `Ready to export` chi bat len khi khong con item `open` / `in_review`
- Export Markdown tao file `.md`
- Export DOCX tai file report `.docx`

## Phase 12 - Analytics va activity log
1. Quay lai `Project Detail`
2. Mo `Activity`
3. Mo `Analytics`

### Expected result
- `Activity Log` co event cho create, upload, parse, compare, review
- `Project Analytics` co:
  - total changes
  - review progress
  - compare runs
  - AI accuracy / confidence neu du du lieu
  - change type / review status charts
  - per-document breakdown

## Ket thuc tutorial
Ban xem nhu full pass thanh cong khi co du bang chung sau:
- 2 account login duoc
- invitation duoc accept
- parser coverage doc parse du tat ca surfaces canonic
- core compare pair tao compare run thanh cong
- AI requirement extraction co accept + reject
- AI review batch chay xong
- review decision + comments luu duoc
- traceability link + mapping hoat dong
- summary export ra file
- analytics va activity log co du lieu that

## Neu co buoc fail
Chuyen sang `how-to-run-full-regression.md` de dung nhanh checklist troubleshooting va cach danh dau `blocked`, `failed`, `needs-investigation`.
