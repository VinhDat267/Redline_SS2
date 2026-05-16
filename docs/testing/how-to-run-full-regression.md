# How-to: Run Full Regression

Tai lieu nay la recipe de chay manual regression day du sau moi thay doi lon hoac truoc demo / handoff.

## Muc tieu
- chay theo thu tu toi uu de giam false alarm
- biet chinh xac buoc nao la blocker cho buoc sau
- thu duoc evidence co the dua vao journal, slide, hoac bug log

## Chon mode regression

### 1. Smoke
Dung khi can xac nhan nhanh he thong van song.
- register / login
- create project
- create document
- upload 1 DOCX
- parse 1 version
- open parser workspace

### 2. Full functional regression
Dung truoc demo, commit lon, hoac sau thay doi parser / compare / AI.
- chay tron bo theo `tutorial-redline-e2e-full-pass.md`
- ghi evidence cho tung module

### 3. Full regression khong AI
Dung khi env AI chua san sang.
- van chay auth / CRUD / parser / compare / review / traceability / export co ban
- danh dau cac case AI la `blocked by env`

## Pre-flight checklist
- [ ] backend start duoc tai `127.0.0.1:8000`
- [ ] frontend start duoc tai `127.0.0.1:5173`
- [ ] `alembic upgrade head` da chay
- [ ] database dang tro toi file dung muc dich test
- [ ] co san fixture files
- [ ] neu test AI: env keys da set
- [ ] neu test invitation: chua dung email reviewer truoc khi tao invite pending

## Start commands

### Backend
```powershell
cd src/backend
.\.venv\Scripts\python -m alembic upgrade head
.\.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### Frontend
```powershell
cd src/frontend
npm run dev
```

## Regression order de xuat
1. auth
2. project CRUD
3. invitation flow
4. document / version CRUD
5. parser workspace
6. AI requirement extraction
7. compare
8. AI review batch jobs
9. review workspace
10. traceability / impact
11. summary / export
12. analytics
13. activity log
14. optional automated suites

Thu tu nay quan trong vi:
- compare phu thuoc parser truth active
- review phu thuoc compare run
- traceability phu thuoc review/change item detail
- summary phu thuoc compare + review + impact
- analytics / activity la signal cuoi, khong phai gate cho core flow

## Evidence can thu

### Evidence toi thieu
- screenshot `Project List`
- screenshot `Parser Workspace`
- screenshot `Compare Workspace`
- screenshot `Review Workspace`
- screenshot `Traceability / Impact`
- screenshot `Summary / Export`
- screenshot `Project Analytics`

### Evidence nen co them
- file DOCX export
- file Markdown export
- so luong compare items
- so luong AI drafts generated
- warning summary trong parser

## Cac cach reset environment an toan

### Cach 1 - dung database file rieng cho regression
Khuyen nghi nhat:
```env
REDLINE_DATABASE_URL=sqlite:///C:/temp/redline-regression.db
```
Chay backend tren DB rieng thay vi dung chung `src/backend/data/redline.db`.

### Cach 2 - seed nhanh tren account moi
Neu chi can co workspace demo nhanh:
- dang nhap
- vao `Project List`
- bam `Seed Demo Data`

### Khong khuyen nghi
- xoa DB dung chung neu ban chua chac worktree / session khac co dang dung no

## Cac gate pass/fail

### Gate A - parser readiness
Pass khi:
- version co `parse_status` la `parsed` hoac `parsed_with_warnings`
- co `active_parse_run_id`

Fail khi:
- `parse_status = failed`
- compare UI van mo duoc du version khong co `active_parse_run_id`

### Gate B - compare readiness
Pass khi:
- tao compare run thanh cong
- queue load duoc
- item selection hoat dong

Fail khi:
- queue rong bat thuong
- body/header/footer/notes bi tron anchor sai

### Gate C - review readiness
Pass khi:
- save review decision thanh cong
- comment thanh cong
- regenerate AI thanh cong hoac fail co message ro rang

### Gate D - traceability readiness
Pass khi:
- link/unlink requirement thanh cong
- map/unmap test case thanh cong
- impacted tests hien theo requirement dung

### Gate E - export readiness
Pass khi:
- AI summary draft sinh duoc
- markdown export hoat dong
- DOCX export hoat dong

## Troubleshooting nhanh

### `401 Unauthorized`
- login lai
- kiem tra session cookie `redline_session` va CSRF token trong frontend session state
- kiem tra backend URL trong `VITE_API_BASE_URL`

### Invitation khong xuat hien o account thu hai
- kiem tra email register co trung email invite
- kiem tra owner da tao `pending invitation`, khong phai add thang vao active member

### Compare bi khoa du da parse
- kiem tra version co `active_parse_run_id`
- mo `Parser Workspace` va re-parse version do

### Parser warning xuat hien
- warning khong dong nghia bug
- voi fixture `v2` parser, warning `merged cell normalization` va `PAGE field normalization` la expected

### AI batch khong chay
- kiem tra worker co dang bat (`REDLINE_AI_BATCH_WORKER_ENABLED`, default la `true`)
- kiem tra backend log xem AI provider co key hay khong
- neu worker tat, queue se tao job nhung khong tien tiep

### Summary draft khong generate
- kiem tra env AI
- kiem tra compare run va change items load duoc
- kiem tra backend error detail

## Sau khi chay xong
1. ghi ket qua vao bug log / journal
2. danh dau case `pass`, `fail`, `blocked`
3. neu co loi, uu tien ghi ro:
   - fixture dang dung
   - account dang dung
   - page route
   - expected vs actual
   - screenshot / export file lien quan

## Optional automated verification

### Backend
```powershell
cd src/backend
.\.venv\Scripts\python -m pytest tests -q
```

### Frontend
```powershell
cd src/frontend
npm run test -- --run
npm run build
```
