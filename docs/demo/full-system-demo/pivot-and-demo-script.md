# Script Pivot Redline Sang AI Contract Review

Mục tiêu: dùng để trình bày trực tiếp với thầy/cô sau khi hệ thống pivot từ review tài liệu chung sang AI Contract Review.

Thời lượng gợi ý: 7-10 phút.

Nguyên tắc nói: không kể dài dòng. Nói rõ **em làm gì**, **em làm như thế nào**, **vì sao hợp lý**, và **demo được gì**.

## 1. Mở Đầu: Em Đã Pivot Cái Gì?

Nói:

```text
Tuần trước em demo Redline như một hệ thống quản lý version tài liệu, parse tài liệu, compare thay đổi và hỗ trợ review bằng AI.

Sau đó em pivot hệ thống sang AI Contract Review. Nghĩa là thay vì review tài liệu chung chung, Redline bây giờ tập trung vào review hợp đồng: upload các bản nháp hợp đồng, parse, compare điều khoản thay đổi, dùng RAG để hỗ trợ AI Review, sau đó cho người dùng hỏi đáp hợp đồng bằng Contract Q&A có citation.
```

Nói thẳng ý chính:

```text
Pivot này không phải làm lại từ đầu. Em giữ lại nền tảng cũ: project, upload, parser, chunk tài liệu, compare engine, review workflow, database và AI service.

Phần em đổi là product direction và workflow: từ document review chung sang contract review có RAG, citation và human review boundary rõ ràng.
```

Một câu chốt:

```text
Hiện tại Redline làm 3 việc chính: so sánh hai bản nháp hợp đồng, dùng RAG để gợi ý review rủi ro, và cho người dùng chat với hợp đồng dựa trên source evidence.
```

## 2. Vì Sao Em Pivot Sang Contract?

Nói:

```text
Em pivot vì bài toán review tài liệu chung quá rộng. Khi demo sẽ khó nói rõ user là ai, họ cần quyết định gì và AI giúp họ ở đâu.

Contract review cụ thể hơn. Người dùng cần so sánh bản nháp hợp đồng, xem điều khoản nào thay đổi, đánh giá rủi ro, viết comment đàm phán và kiểm chứng lại nguồn.
```

Nói theo 4 ý ngắn:

```text
Thứ nhất, contract review rất hợp với compare. Người review cần biết điều khoản nào được thêm, xóa hoặc sửa.

Thứ hai, contract review rất hợp với RAG. AI không được trả lời chung chung, mà phải dựa vào nội dung hợp đồng đã parse và có citation.

Thứ ba, contract review cần human-in-the-loop. AI chỉ gợi ý, người review mới là người xác nhận cuối cùng.

Thứ tư, demo dễ hiểu hơn. Em có thể đưa một hợp đồng vendor, cho thấy bản v2 thay đổi liability, security, IP, payment hoặc termination như thế nào.
```

Nếu thầy hỏi đây có phải đổi scope không:

```text
Dạ có, đây là product pivot. Nhưng em không mở rộng vô tội vạ. Em thu hẹp domain từ review tài liệu chung sang review hợp đồng, và reuse phần lớn nền tảng kỹ thuật đã có.
```

## 3. Em Reuse Gì Từ Hệ Thống Cũ?

Nói:

```text
Em reuse các phần đã có: project workspace, upload file, parser, DocumentBlock, versioning, compare engine, review workflow, authentication, database và AI provider adapter.
```

Điểm quan trọng nhất:

```text
Phần quan trọng nhất được reuse là DocumentBlock.

Trước pivot, DocumentBlock là chunk tài liệu để parse và compare. Sau pivot, em dùng chính DocumentBlock làm chunk cho RAG.

Vì vậy hệ thống không có hai pipeline riêng biệt. Cùng một block vừa là anchor cho deterministic compare, vừa là source evidence cho Contract Q&A và AI Review.
```

Kết quả:

```text
Nhờ reuse như vậy, pivot không phải rewrite toàn bộ backend. Em chỉ mở rộng foundation cũ theo hướng contract và RAG.
```

## 4. Hợp Đồng Demo Là Loại Gì Và Dùng Template Nào?

Nói thẳng:

```text
Hợp đồng em dùng để demo là hợp đồng vendor technology services. Cụ thể là MedNova Clinics Group thuê Aster Cloud Solutions triển khai nền tảng cloud cho appointment, digital intake, analytics và integration.
```

Phân loại hợp đồng:

```text
Trong demo có 3 loại tài liệu hợp đồng.

Loại 1 là Master Services Agreement, viết tắt là MSA. Đây là hợp đồng khung giữa khách hàng và vendor. Nó quy định các điều khoản pháp lý chính như confidentiality, data security, subcontractors, intellectual property, indemnification, limitation of liability, termination, audit và governing law.

Loại 2 là Statement of Work, viết tắt là SOW. Đây là phụ lục công việc cho một dự án triển khai cụ thể. Nó quy định deliverables, milestones, acceptance procedure, fees, service levels, change control và exit package.

Loại 3 là Security and Data Processing Addendum. Đây là phụ lục bảo mật và xử lý dữ liệu. Nó dùng để demo PDF parser và OCR fallback, đồng thời thể hiện nhóm điều khoản về covered data, processing instructions, security safeguards, incident notification, return and deletion.
```

Các template đang dùng:

```text
Em không dùng template hợp đồng giả quá đơn giản. Em tạo bộ template demo thực tế hơn gồm:

1. MSA v1: baseline legal position, tức bản nháp cân bằng và bảo vệ khách hàng hơn.
2. MSA v2: bản vendor-favorable, tức vendor sửa các điều khoản theo hướng có lợi cho vendor.
3. SOW v1: baseline commercial delivery terms, tức bản SOW với acceptance, payment, IP và change control tương đối chặt.
4. SOW v2: bản vendor-favorable, thay đổi acceptance window, payment schedule, IP ownership và change-control protection.
5. Security Addendum text PDF: dùng để test PDF có text layer.
6. Security Addendum scanned PDF: dùng để test OCR fallback cho PDF scan ảnh.
```

Triển khai template trong hệ thống:

```text
Về mặt code, các template này được lưu dưới dạng source text trong docs/demo/full-system-demo/source-contracts.md.

Sau đó em có script build_full_demo_fixtures.py để generate ra file DOCX và PDF thật. Script này tạo MSA v1/v2, SOW v1/v2, Security Addendum text PDF và Security Addendum scanned PDF vào thư mục output/full-system-demo/fixtures.

Khi demo, em upload các file generated này như contract drafts bình thường. Hệ thống không hard-code logic riêng cho MSA hay SOW. Parser vẫn đọc DOCX/PDF generic, chuyển thành DocumentBlock, rồi compare và RAG dùng các DocumentBlock đó.
```

Điểm cần nhấn mạnh:

```text
Template ở đây là demo contract fixture, không phải rule engine pháp lý hard-code. Điều đó có nghĩa là hệ thống không chỉ chạy được đúng một mẫu hợp đồng cố định. Nó xử lý theo pipeline chung: upload tài liệu, parse thành block, compare block, embedding block, retrieve evidence và sinh AI Review/Q&A.
```

Câu trả lời cực ngắn nếu thầy hỏi:

```text
Demo của em dùng vendor technology services contract, gồm MSA, SOW và Security/Data Processing Addendum. Em triển khai template bằng cách viết source contract text, generate ra DOCX/PDF fixture thật, rồi upload vào hệ thống như contract draft bình thường. Backend không hard-code từng template; nó parse generic thành DocumentBlock để compare và RAG.
```

## 5. Em Đã Triển Khai Pivot Như Thế Nào?

Nói:

```text
Em triển khai theo từng lớp, không rewrite một lần.
```

Trình bày trực tiếp:

```text
Lớp 1: Em đổi product language trên UI sang contract: Project, Contract, Contract Draft, Clause Change, AI Review, Human Review và Contract Q&A.

Lớp 2: Em giữ parser và compare làm source of truth. Parser tạo DocumentBlock. Compare dùng DocumentBlock để phát hiện added, removed và modified clauses. Phần này deterministic, không phụ thuộc AI.

Lớp 3: Em thêm RAG lên trên DocumentBlock. Sau khi parse, hệ thống embedding các block và lưu vector vào PostgreSQL pgvector.

Lớp 4: Em dùng RAG cho AI Review. Khi reviewer chọn một clause change, backend lấy changed clause và retrieved evidence để AI draft risk explanation, suggested checks và review comment.

Lớp 5: Em làm Contract Q&A. Mỗi contract có chat session, message, attempt streaming, Stop, Retry, session memory và Source Evidence panel.

Lớp 6: Em refactor frontend thành contract workspace. Các màn chính là Contract Detail, Parser Workspace, Compare Workspace, Review Workspace và Contract Q&A.
```

Nói rõ boundary:

```text
AI không ghi đè parser truth, compare truth hoặc human review truth. AI chỉ nằm ở tầng hỗ trợ phân tích.
```

## 6. Phần RAG: Em Tích Hợp Như Thế Nào?

Nói thẳng vào vấn đề:

```text
Hệ thống cũ đã có chunk tài liệu rồi. Trong code, chunk đó là DocumentBlock. Vì vậy khi thêm RAG, em không làm lại parser mới. Em lấy DocumentBlock làm knowledge unit cho RAG.
```

Pipeline RAG:

```text
Bước 1: User upload DOCX hoặc PDF. Backend parse tài liệu thành các DocumentBlock. Mỗi block có text, vị trí, section title, block key và draft id.

Bước 2: Em gọi embedding model để biến text của mỗi DocumentBlock thành vector. Hiện tại embedding đi qua 9Router theo chuẩn OpenAI-compatible, dùng Gemini embedding.

Bước 3: Em lưu vector đó vào PostgreSQL bằng pgvector, kèm metadata như provider, model và dimension.

Bước 4: Khi user hỏi trong Contract Q&A, backend embedding câu hỏi, rồi query pgvector để tìm các DocumentBlock gần nghĩa nhất trong active contract draft.

Bước 5: Em lọc evidence yếu. Nếu vector search trả về block nhưng score không đủ tốt, hệ thống không cố trả lời. Nó báo là không đủ grounded evidence.

Bước 6: Nếu evidence đủ tốt, backend đưa câu hỏi, lịch sử chat gần nhất, contract metadata và evidence blocks vào LLM. LLM trả lời, frontend hiển thị câu trả lời và citation ở panel Source Evidence.
```

Nói ngắn về AI Review:

```text
RAG không chỉ dùng cho chat. Em cũng dùng nó cho AI Review. Khi có một clause change, hệ thống retrieve thêm các block liên quan để AI phân tích rủi ro tốt hơn.
```

Câu chốt phần RAG:

```text
Tóm lại, em gắn RAG trực tiếp lên DocumentBlock có sẵn: parse ra block, embedding block, lưu pgvector, retrieve block theo câu hỏi hoặc clause change, lọc evidence yếu, rồi đưa evidence vào LLM để trả lời hoặc draft review có citation.
```

Câu cực ngắn nếu thầy hỏi nhanh:

```text
Vì hệ thống cũ đã có chunk DocumentBlock, em tích hợp RAG bằng cách embedding các block đó, lưu vào pgvector, retrieve theo câu hỏi, lọc evidence yếu, rồi cho LLM trả lời dựa trên evidence và citation. Em không làm pipeline tài liệu riêng.
```

## 7. Hệ Thống Hiện Có Chức Năng Gì?

Nói:

```text
Hiện tại hệ thống có thể demo một workflow contract review từ đầu đến cuối.
```

Liệt kê nhanh:

```text
1. Đăng nhập.
2. Quản lý project.
3. Tạo contract workspace.
4. Upload contract drafts.
5. Parse DOCX và PDF.
6. OCR fallback cho scanned PDF nếu Tesseract sẵn sàng.
7. Parser Workspace để xem status, pages, diagnostics và coverage.
8. Compare hai draft để ra added, removed, modified clauses.
9. Generate RAG-enhanced AI Review cho từng clause change.
10. Human Review để người dùng xác nhận status và comment.
11. Contract Q&A có streaming answer, session memory, Stop, Retry và Source Evidence citation.
12. Metadata answer cho câu hỏi như "đây là tài liệu gì?".
```

Câu nhấn mạnh:

```text
Điểm chính là AI hỗ trợ người review, nhưng không thay thế truth layer của hệ thống.
```

## 8. Script Demo Từ Đầu Đến Cuối

### 8.1 Mở Project

Thao tác:

- Đăng nhập.
- Mở project `MedNova Vendor Review`.

Nói:

```text
Đây là project review hợp đồng với vendor. Project này gom các contract, draft, compare run, review decision và chat session.
```

### 8.2 Mở Contract Workspace

Thao tác:

- Mở contract `Aster Cloud Master Services Agreement`.

Nói:

```text
Đây là contract workspace. Em quản lý các bản nháp hợp đồng trong cùng một contract để có thể parse, compare, review và hỏi đáp.
```

### 8.3 Upload Và Parse Drafts

Thao tác:

- Upload MSA v1.
- Upload MSA v2.
- Parse cả hai draft.

Nói:

```text
Khi parse, hệ thống chuyển hợp đồng thành DocumentBlock. Các block này dùng cho compare và cũng dùng cho RAG.
```

Nếu mở Parser Workspace:

```text
Parser Workspace cho em biết tài liệu parse thành công hay không, có warning gì không, có đủ tin cậy để compare và RAG hay không.
```

### 8.4 Run Compare

Thao tác:

- Run compare v1 -> v2.
- Mở Compare Workspace.
- Chọn clause `Limitation of Liability` hoặc `Data Security`.

Nói:

```text
Đây là compare truth. AI chưa tham gia bước này. Hệ thống deterministic chỉ ra điều khoản nào được thêm, xóa hoặc sửa.
```

Ví dụ nói khi xem liability:

```text
Ở đây bản v2 thay đổi giới hạn trách nhiệm. Điều này có thể làm giảm trách nhiệm của vendor, nên reviewer cần xem kỹ.
```

### 8.5 Generate AI Review

Thao tác:

- Click Generate AI Review.
- Show risk, explanation, suggested checks và draft comment.

Nói:

```text
Ở bước này AI dùng changed clause và RAG evidence để draft phân tích rủi ro. Đây chỉ là suggestion, không phải quyết định cuối cùng.
```

### 8.6 Human Review

Thao tác:

- Mở Review Workspace.
- Chỉnh comment nếu cần.
- Set status `in_review` hoặc `resolved`.

Nói:

```text
Đây là phần human-in-the-loop. Reviewer đọc AI suggestion, chỉnh lại comment và xác nhận review status.
```

### 8.7 Contract Q&A

Thao tác:

- Mở Contract Q&A.
- Hỏi:

```text
Does the new draft still exclude confidentiality breaches from the liability cap?
```

Nói:

```text
Câu trả lời phải dựa trên parsed contract, không phải kiến thức chung của model. Vì vậy bên phải có Source Evidence để kiểm chứng.
```

Hỏi tiếp:

```text
What is this document?
```

Nói:

```text
Câu hỏi về tên hoặc loại tài liệu được trả lời từ contract metadata, không lấy bừa một block từ vector search.
```

Hỏi session memory:

```text
My name is Nguyễn Đạt Vinh.
What is my name?
```

Nói:

```text
Chat có session memory cho ngữ cảnh hội thoại. Nhưng nếu hỏi về hợp đồng thì vẫn phải dựa trên evidence của hợp đồng.
```

Hỏi câu ngoài tài liệu:

```text
What is the cafeteria lunch menu?
```

Nói:

```text
Nếu câu hỏi không có evidence trong hợp đồng, hành vi đúng là không hallucinate và báo không đủ grounded evidence.
```

### 8.8 Stop Và Retry

Thao tác:

- Hỏi một câu dài.
- Click Stop khi đang stream.
- Click Retry.

Nói:

```text
Contract Q&A dùng attempt-driven streaming. Stop đưa attempt hiện tại về trạng thái kết thúc, Retry tạo attempt mới. Nhờ vậy stream lỗi hoặc bị hủy không làm kẹt session.
```

### 8.9 PDF/OCR Nếu Cần

Thao tác:

- Upload PDF text-layer.
- Parse.
- Nếu OCR health sẵn sàng, upload scanned PDF.

Nói:

```text
PDF được xử lý bằng text extraction trước. Nếu là scanned PDF thì fallback sang OCR. OCR có quality gate để không dùng text kém chất lượng làm contract truth.
```

## 9. Kết Luận

Nói:

```text
Tóm lại, sau pivot Redline không còn là document review chung chung. Nó trở thành AI Contract Review workspace.

Em reuse nền tảng cũ, đặc biệt là DocumentBlock, rồi thêm RAG, Contract Q&A, AI Review và contract-focused UI.

Giá trị chính là reviewer thấy được điều khoản thay đổi, có AI hỗ trợ phân tích rủi ro, có chat với hợp đồng, và mọi câu trả lời quan trọng đều có evidence để kiểm chứng.
```

Câu kết:

```text
AI trong hệ thống này không thay người review quyết định. AI giúp review nhanh hơn, còn parser truth, compare truth và final review truth vẫn được tách rõ.
```

## 10. Câu Trả Lời Ngắn Khi Thầy Hỏi

### Em đã pivot cái gì?

```text
Em pivot từ document review chung sang AI Contract Review. Hệ thống bây giờ tập trung vào upload hợp đồng, parse, compare điều khoản, AI Review bằng RAG và Contract Q&A có citation.
```

### Em có làm lại từ đầu không?

```text
Không. Em reuse project, upload, parser, DocumentBlock, compare engine, review workflow, database và AI provider adapter. Em mở rộng lên hướng contract và RAG.
```

### Hợp đồng demo là hợp đồng gì?

```text
Đó là vendor technology services contract giữa MedNova Clinics Group và Aster Cloud Solutions. Bộ demo gồm MSA, SOW và Security/Data Processing Addendum.
```

### Template hợp đồng được triển khai như thế nào?

```text
Em viết source template trong source-contracts.md, sau đó dùng script build_full_demo_fixtures.py để generate DOCX/PDF fixture thật. Khi demo, các file này được upload như contract draft bình thường. Backend không hard-code MSA hay SOW, mà parse generic thành DocumentBlock để compare và RAG.
```

### RAG tích hợp vào đâu?

```text
RAG tích hợp trực tiếp vào DocumentBlock. Sau khi parse ra block, em embedding block, lưu vào pgvector, retrieve theo câu hỏi hoặc clause change, rồi đưa evidence vào LLM.
```

### Vì sao dùng RAG?

```text
Vì contract review cần câu trả lời có nguồn. RAG giúp AI trả lời dựa trên nội dung hợp đồng đã parse, có citation, giảm hallucination.
```

### AI có tự quyết định review không?

```text
Không. AI chỉ draft analysis và comment. Người review vẫn xác nhận final status và final comment.
```

### Khó nhất là gì?

```text
Khó nhất là grounding. Nếu parser thiếu nội dung hoặc retrieval lấy evidence yếu, AI có thể trả lời sai. Vì vậy em thêm parser diagnostics, evidence threshold, metadata routing, citation và human review boundary.
```

### Điểm demo quan trọng nhất là gì?

```text
Điểm quan trọng nhất là một workflow end-to-end: upload hai draft hợp đồng, parse, compare clause changes, generate RAG AI Review, human review, rồi hỏi đáp hợp đồng với Source Evidence.
```
