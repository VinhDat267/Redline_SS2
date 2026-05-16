# Contract Q&A Prompts And Expected Results

Use this file during manual demo rehearsal. Do not require exact wording from the AI; verify that the answer is grounded, cites relevant evidence, and respects the truth boundary.

## MSA Prompts

| Prompt | Expected answer direction | Evidence to inspect |
| --- | --- | --- |
| `What changed in the liability cap between the two MSA drafts?` | Revised draft reduces the cap from fees paid in the prior 12 months to fees paid in the prior 3 months and removes/weakens carve-outs. | `9. Limitation of Liability` |
| `Does the new draft still exclude confidentiality breaches from the liability cap?` | No. Revised draft applies the cap to all claims except unpaid fees and payment obligations; confidentiality is no longer carved out. | `9. Limitation of Liability`, `4. Confidential Information` |
| `Who owns the custom deliverables in the revised MSA?` | Aster owns platform, tools, know-how, connectors, and reusable components; MedNova receives a limited internal license to configured deliverables. | `7. Intellectual Property` |
| `What is the breach notification deadline in the revised MSA?` | Aster must notify within 10 business days after confirming a security incident. | `5. Data Security and Incident Response` |
| `Can Aster use subcontractors without MedNova approval?` | Revised draft allows subcontractors with notice and responsibility for their acts; it removes prior written approval requirement. | `6. Subcontractors` |
| `What is this document?` | Should answer from metadata: the contract title/draft, not random retrieved clauses. | No citation required if metadata answer. |
| `My name is Nguyen Dat Vinh.` then `What is my name?` | Should recall the name from session memory. | No document citation required. |

## SOW Prompts

| Prompt | Expected answer direction | Evidence to inspect |
| --- | --- | --- |
| `How did acceptance change in the revised SOW?` | Acceptance window shrinks from 10 business days with written defect details to 3 business days, and silence is deemed acceptance. | `4. Acceptance Procedure` |
| `Does the revised SOW require payment before project start?` | Yes. Revised SOW requires 50% upfront before kickoff, then shorter payment terms. | `5. Fees and Payment Schedule` |
| `Who owns integration adapters in the revised SOW?` | Aster retains ownership of reusable adapters and grants MedNova a limited internal license. | `7. Intellectual Property and Reusable Components` |
| `Can Aster bill out-of-scope work before a signed change order?` | Revised SOW permits billing on time-and-materials if Aster reasonably believes the request is outside scope, even before signed change order. | `8. Change Control` |
| `What service credits are available if uptime is missed?` | Revised SOW makes service credits sole and exclusive remedy and caps monthly credits at 5% of affected monthly fees. | `6. Service Levels and Support` |

## PDF/OCR Prompts

Use these after uploading and parsing the security addendum PDF.

| Prompt | Expected answer direction | Evidence to inspect |
| --- | --- | --- |
| `What personal data categories are covered by the security addendum?` | Patient registration, appointment history, contact details, insurance references, staff accounts, audit logs, and support tickets. | `2. Covered Data` |
| `What is the Vietnamese breach notification clause?` | The Vietnamese section requires notice without undue delay and escalation to MedNova's security contact. | `7. Vietnamese Operational Notice` |

## Quality Checks

For a good Q&A answer:

- It cites the relevant source evidence for contract-grounded questions.
- It does not cite evidence for pure session-memory answers.
- It uses metadata for document identity questions.
- It says there is not enough grounded evidence when the prompt is unrelated, for example:

```text
What is the cafeteria lunch menu?
```

Expected result:

```text
The parsed contract draft does not contain enough grounded evidence to answer that question.
```
