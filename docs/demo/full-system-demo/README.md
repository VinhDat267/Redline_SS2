# Redline Full System Demo Kit

Status: end-to-end demo package for a realistic contract-review walkthrough.

This kit is designed for a live or recorded Redline demo. It gives the presenter realistic contract drafts, a clear business story, expected clause changes, grounded Contract Q&A prompts, and operator checks. The goal is to demonstrate the full system without relying on toy text.

## Demo Story

Redline is used by a legal/commercial reviewer at `MedNova Clinics Group` to review a vendor contract from `Aster Cloud Solutions`.

The vendor provides a patient appointment, intake, analytics, and integration platform. The first draft is acceptable but conservative. The second draft introduces negotiation risk across confidentiality, personal data, acceptance, payment, intellectual property, liability, termination, and change control.

The demo shows this workflow:

```text
Project -> Contract Workspace -> Upload Drafts -> Parse -> Compare
-> RAG AI Review -> Human Review -> Contract Q&A -> Evidence Panel
```

## Generated Fixtures

Build the demo files from the repository root:

```powershell
docker compose run --rm --no-deps -v "${PWD}:/workspace" -w /workspace backend python docs/demo/full-system-demo/scripts/build_full_demo_fixtures.py
```

If you are developing with a local backend virtual environment, this command is
also valid:

```powershell
.\src\backend\.venv\Scripts\python docs/demo/full-system-demo/scripts/build_full_demo_fixtures.py
```

Expected output:

| Fixture | Type | Use |
| --- | --- | --- |
| `redline-full-demo-msa-v1-master-services-agreement.docx` | DOCX | Source draft for the MSA compare run |
| `redline-full-demo-msa-v2-master-services-agreement.docx` | DOCX | Target draft with vendor-favorable changes |
| `redline-full-demo-sow-v1-implementation-sow.docx` | DOCX | Source draft for the SOW compare run |
| `redline-full-demo-sow-v2-implementation-sow.docx` | DOCX | Target draft with payment, acceptance, IP, and change-control changes |
| `redline-full-demo-security-addendum-text.pdf` | PDF | Text-layer PDF parser smoke |
| `redline-full-demo-security-addendum-scan.pdf` | PDF | OCR fallback smoke for scanned-image PDF |

Generated files are written under `output/full-system-demo/fixtures/` and are intentionally ignored by git.

## Recommended Live Demo

Use the MSA first if the audience cares about legal risk. Use the SOW first if the audience cares about commercial delivery impact.

1. Create a project named `MedNova Vendor Review`.
2. Create a contract named `Aster Cloud Master Services Agreement`.
3. Upload `MSA v1` and `MSA v2`.
4. Parse both drafts.
5. Run compare from v1 to v2.
6. Select high-signal clause changes:
   - `4. Confidential Information`
   - `5. Data Security and Incident Response`
   - `7. Intellectual Property`
   - `9. Limitation of Liability`
   - `10. Termination and Exit Assistance`
7. Generate AI Review for one or more changes.
8. Open the Review route, edit the human review comment, and mark status as `in_review` or `resolved`.
9. Open Contract Q&A and ask grounded questions.
10. Inspect `Source Evidence` citations.
11. Upload the scanned PDF security addendum to show PDF/OCR parser readiness if the environment has Tesseract configured.

## Best Q&A Prompts

Use these prompts in Contract Q&A:

```text
What changed in the liability cap between the two MSA drafts?
Does the new draft still exclude confidentiality breaches from the liability cap?
Who owns the custom deliverables in the revised MSA?
What is the breach notification deadline in the revised MSA?
Can Aster use subcontractors without MedNova approval?
```

Session-memory prompt:

```text
My name is Nguyen Dat Vinh.
What is my name?
```

Document metadata prompts:

```text
What is this document?
What is the document title?
Which draft am I asking about?
```

SOW prompts:

```text
How did acceptance change in the revised SOW?
Does the revised SOW require payment before project start?
Who owns integration adapters in the revised SOW?
Can Aster bill out-of-scope work before a signed change order?
```

## Demo Boundaries

Say:

```text
Compare is deterministic. AI Review and Contract Q&A help the reviewer reason faster, but they do not replace legal judgment.
```

Do not say:

```text
The AI approves the contract or decides whether a clause is acceptable.
```

The system truth boundaries are:

- Parser truth: parsed contract blocks.
- Compare truth: deterministic clause/block differences.
- AI Review truth: draft suggestion only.
- Human review truth: reviewer-confirmed status and comment.
- Contract Q&A truth: grounded answer with citations to parsed blocks.

## Supporting Files

| File | Purpose |
| --- | --- |
| `source-contracts.md` | Source text used to generate realistic DOCX/PDF demo fixtures |
| `operator-runbook.md` | Service setup, health checks, fixture build, and fallback instructions |
| `presenter-script.md` | 12-15 minute speaking script and step-by-step UI flow |
| `pivot-and-demo-script.md` | Product narrative for explaining the contract-review direction and live demo flow |
| `qa-prompts-and-expected-results.md` | High-value questions, expected answer direction, and evidence to verify |
| `manual-test-checklist.md` | Full manual checklist for pre-demo verification |
| `scripts/build_full_demo_fixtures.py` | Fixture generator for DOCX, text PDF, and scanned PDF |
