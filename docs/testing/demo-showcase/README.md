# Redline VN Demo Showcase

Status: lightweight Vietnamese demo pack for D4 rehearsal.

For the fuller live-demo package with realistic MSA/SOW contracts, PDF parser fixtures, presenter script, runbook, and manual checklist, use `docs/demo/full-system-demo/README.md`.

This folder is not an eval harness. The EN eval pack remains the source of measured readiness. The VN showcase exists to make the product demo feel closer to local contract-review usage while keeping the truth boundaries simple:

- Compare truth is deterministic.
- AI Review is a draft suggestion only.
- Contract Q&A must stay grounded in parsed contract blocks and citations.

## Files

| File | Purpose |
| --- | --- |
| `vn-sample-contract-notes.md` | Source text for VN NDA and VN SOW v1/v2 fixtures |
| `scripts/build_vn_showcase_fixtures.py` | Generates local DOCX files under `output/demo-showcase/fixtures/` |
| `scripts/run_vn_showcase_rehearsal.py` | Runs the VN showcase through API upload, parse, compare, RAG AI Review, and streaming Contract Q&A |
| `d4-demo-script.md` | Step-by-step D4 demo narrative and speaking notes |
| `d4-demo-handoff.md` | Operator handoff for local services, demo order, and fallbacks |
| `d4-feature-freeze-checklist.md` | D4 freeze gate and no-go checklist |
| `vn-rehearsal-evidence.md` | Latest captured local rehearsal evidence and screenshot artifact paths |

## Build Fixtures

From the repository root:

```powershell
python docs/testing/demo-showcase/scripts/build_vn_showcase_fixtures.py
```

Expected generated files:

- `output/demo-showcase/fixtures/redline-vn-showcase-vn-nda-v1-thoa-thuan-bao-mat.docx`
- `output/demo-showcase/fixtures/redline-vn-showcase-vn-nda-v2-thoa-thuan-bao-mat.docx`
- `output/demo-showcase/fixtures/redline-vn-showcase-vn-sow-v1-hop-dong-dich-vu-trien-khai.docx`
- `output/demo-showcase/fixtures/redline-vn-showcase-vn-sow-v2-hop-dong-dich-vu-trien-khai.docx`

The `output/` directory is ignored by git.

## Run Rehearsal

Start PostgreSQL, backend, frontend, and 9Router first. Then run:

```powershell
python docs/testing/demo-showcase/scripts/run_vn_showcase_rehearsal.py --base-url http://127.0.0.1:8000 --timeout 240
```

The runner writes ignored JSON evidence under `output/demo-showcase/`. Use `vn-rehearsal-evidence.md` for the latest captured result that is safe to commit.

## Demo Handoff

Use these files when preparing a live or recorded demo:

1. `d4-feature-freeze-checklist.md` - confirms what is frozen, what is out of scope, and which no-go conditions stop the demo.
2. `d4-demo-handoff.md` - exact local start sequence, health checks, route order, suggested questions, and fallback handling.
3. `d4-demo-script.md` - presenter talking points.
4. `vn-rehearsal-evidence.md` - captured evidence from the latest local rehearsal.

## Demo Contracts

Use two lightweight contract families:

- `VN NDA`: disclosure scope, independent-development exclusion, confidentiality term, liability cap, termination.
- `VN SOW`: acceptance, payment timing, IP ownership, change control.

For each family:

1. Create or open a project.
2. Create one contract workspace.
3. Upload v1 and v2 generated DOCX files as contract drafts.
4. Parse both drafts.
5. Run compare.
6. Generate RAG AI Review on the important clause changes.
7. Open Contract Q&A against the v2 draft and ask grounded questions.

## Suggested VN Q&A Prompts

NDA:

- `Thoi han bao mat trong ban moi la bao lau?`
- `Ban moi co con ngoai le cho thong tin duoc phat trien doc lap khong?`
- `Gioi han trach nhiem co ap dung cho vi pham bao mat khong?`
- `Ben nao co quyen cham dut thoa thuan va can bao truoc bao nhieu ngay?`

SOW:

- `Co che nghiem thu trong ban moi thay doi nhu the nao?`
- `Khach Hang co phai thanh toan truoc khong?`
- `Ai so huu san pham duoc phat trien theo SOW moi?`
- `Nha Cung Cap co duoc tinh phi truoc khi co lenh thay doi bang van ban khong?`

## Readiness Notes

- Keep this as a showcase, not a benchmark.
- If Vietnamese answers are awkward, use the citation panel to show the source block and explain that EN eval is the measured readiness path.
- Do not let support routes like analytics or legacy document pages take over the demo. The D4 story is Compare + RAG AI Review + Contract Q&A.
