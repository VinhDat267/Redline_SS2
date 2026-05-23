# Explanation: Testing Model and Truth Boundaries

This document explains how to reason about Redline during testing. The main
risk in regression is confusing deterministic truth with AI support output.

## 1. Redline is not an autonomous legal decision system

Redline's core value is:

- parser truth for DOCX/PDF contract drafts;
- deterministic compare truth;
- AI at the review-intelligence layer;
- human-confirmed review truth.

Vi vay, khi test compare:
- uu tien tinh on dinh, explainable, va partition dung
- do not expect AI to repair deterministic compare results;
- do not treat different AI wording as a bug if the schema and truth boundary are valid.

## 2. Thu tu truth trong he thong

### Contract draft / document version truth

File upload creates a `DocumentVersion` behind the contract facade. This is
only source material until parsing succeeds.

### Parser truth
Sau khi parse, he thong persist `DocumentParseRun`, `DocumentSurface`, `DocumentBlock`, `DocumentTable*`.
Gate quan trong nhat la:
- `DocumentVersion.active_parse_run_id`

Neu field nay khong ton tai, UI compare phai khoa. Day la behavior dung, khong phai bug.

### Compare truth
Compare doc 2 parse snapshots da khoa vao `CompareRun`.
Meaning:
- compare khong nen doc parser truth "active hien tai" sau nay
- change items phai co context surface / section / row ro rang

### Review truth
Review truth that chi nam o:
- `ChangeItem.review_status`
- `ChangeItem.assignee_user_id`
- `ChangeItem.summary`
- `ReviewComment`

AI draft co the de xuat, nhung khong duoc xem la final decision.

### Traceability truth

Traceability truth exists when:

- user links `ChangeItem` -> `Requirement`;
- user maps `Requirement` -> `TestCase`;
- user explicitly accepts an AI suggested requirement link.

AI may suggest links, but it must not silently create final mapping truth.

### Summary / export truth
Summary la derived output.
Dieu nay co 2 he qua khi test:
1. draft summary co the thay doi sau moi lan regenerate
2. export can dung compare + review + impact context hien tai, khong can co entity rieng de "reopen summary session"

## 3. Tai sao regression phai chay theo thu tu parser -> compare -> review -> traceability -> summary

Neu parser chua on:
- compare co the khoa hoac sai anchor

Neu compare chua on:
- review queue sai
- AI review context sai

Neu review chua on:
- summary va analytics se mat y nghia

Neu traceability chua on:
- impacted tests trong summary se khong day du

Vi vay, regression order trong pack nay khong phai thu tuc hanh chinh; no phan anh phu thuoc that cua data flow.

## 4. Warning nao la expected, warning nao la bug

### Expected warning

Warnings can be expected for complex contract fixtures, especially:

- merged cell normalization;
- header auto field normalization (`PAGE`);
- OCR quality diagnostics;
- unsupported DOCX elements that are detected but not persisted as parser truth.

Day khong phai regression neu:
- parser van xong
- warning count hien ro
- compare va inspect panel van dung

### Bug that
Can mo bug neu:
- parser warning lam mat active parse run hop le
- compare unlock du version khong co parser truth active
- change item body bi map sang header/footer sai
- requirement mapping cua requirement A lai hien duoi requirement B
- AI writes final requirement/traceability/review truth without user confirmation
- user ngoai project truy cap duoc route cua project

## 5. Cac loai ket qua "khac du kien" nhung chua chac la bug

### AI text khac wording
Neu provider khac, fallback khac, hoac AI generate lai ra wording khac nhung schema hop le thi day chua chac la bug.

### Confidence khong on dinh giua cac lan chay
Confidence la derived AI output. Chi nen mo bug neu:
- value nam ngoai bien hop le
- payload khong parse duoc
- UI / backend xu ly sai state

### Summary wording khac giua hai lan generate
Tuong tu AI draft. Manual review can tap trung vao:
- draft co du context khong
- export co hoat dong khong
- UI co xu ly loi va state ro rang khong

## 6. Cac gate test quan trong nhat cua Redline

### Gate 1 - Compare readiness
Khong co `active_parse_run_id` thi khong compare.

### Gate 2 - AI suggestion boundary
AI khong duoc overwrite compare truth, review truth, hoac traceability truth.

### Gate 3 - Requirement-specific impacted tests
Impacted tests phai gan voi requirement dang linked va mapped, khong phai mot union mo ho.

### Gate 4 - Grounded Contract Q&A
Contract Q&A answers must cite parsed blocks for contract-specific claims and
avoid unsupported legal advice when evidence is missing.

### Gate 5 - End-to-end continuity
Nguoi dung phai di duoc tu:
- project
- contract
- draft
- parser
- compare
- review
- traceability
- Contract Q&A
- summary/export

Neu luong nay dut o giua, day la regression nghiem trong cho final demo cho du unit test co van xanh.

## 7. Cach doc dashboard va activity cho dung
Analytics va activity log la signal quan sat sau cung.
Chung rat huu ich de:
- xac nhan thao tac da duoc ghi nhan
- tong hop compare / review health
- trinh bay trong demo

Nhung chung khong phai source of truth so cap. Neu analytics sai, ban van phai quay nguoc lai check `CompareRun`, `ChangeItem`, `AIReviewDraft`, va mappings truoc.
