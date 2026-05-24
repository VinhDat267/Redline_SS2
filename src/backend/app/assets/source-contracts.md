# Redline Full System Demo - Source Contracts

Status: source text for realistic generated demo fixtures.

Generated files should be created with `scripts/build_full_demo_fixtures.py` and written to `output/full-system-demo/fixtures/`.

## MSA_V1 - Master Services Agreement

### 1. Parties and Background

This Master Services Agreement is entered into by MedNova Clinics Group, Inc. ("MedNova") and Aster Cloud Solutions LLC ("Aster"). MedNova operates outpatient clinics and requires software implementation, integration, analytics, and support services. Aster provides cloud implementation and managed integration services for healthcare-adjacent operations.

### 2. Order Process and Scope

Services will be ordered through statements of work signed by both parties. Each statement of work must describe deliverables, milestones, acceptance criteria, fees, service levels, and project assumptions. Aster may not materially change the scope, staffing model, or delivery schedule without MedNova's written approval.

### 3. Regulatory and Compliance Responsibilities

Aster will perform the services in a professional manner and will comply with laws applicable to Aster's role as service provider. Aster will maintain policies for access control, secure development, incident response, data retention, and vendor management. If Aster processes personal data, it will process that data only for the documented business purpose stated in the applicable statement of work.

### 4. Confidential Information

Confidential Information includes business plans, pricing, patient workflow data, integration designs, security documentation, product roadmaps, credentials, non-public financial information, and any information marked or reasonably understood to be confidential. The receiving party may use Confidential Information only to perform or evaluate the services. The receiving party may disclose Confidential Information to employees, contractors, and advisers who need to know and are bound by confidentiality obligations at least as protective as this Agreement.

Confidential Information does not include information that is public through no fault of the receiving party, already known without duty of confidentiality, received from a third party without restriction, or independently developed without use of Confidential Information. Confidentiality obligations continue for five years after disclosure. Trade secrets remain protected for as long as they remain trade secrets under applicable law.

### 5. Data Security and Incident Response

Aster will maintain administrative, technical, and physical safeguards designed to protect MedNova data against unauthorized access, loss, alteration, and disclosure. Safeguards include unique user accounts, multi-factor authentication for administrative access, encryption in transit and at rest, least-privilege access, audit logging, vulnerability management, and annual security training.

Aster will notify MedNova without undue delay and no later than seventy-two hours after confirming a security incident affecting MedNova data. The notice must describe known facts, affected systems, categories of data involved, containment steps, and next updates. Aster will cooperate with MedNova's investigation, remediation, regulatory reporting, and customer communications.

| Control Area | Minimum Requirement | Evidence |
| --- | --- | --- |
| Access management | Unique accounts and MFA for administrative access | Access policy and sample audit log |
| Encryption | TLS 1.2+ in transit and AES-256 or equivalent at rest | Architecture diagram or security summary |
| Vulnerability management | Critical vulnerabilities remediated within 15 days | Vulnerability report summary |
| Logging | Security logs retained for at least 180 days | Logging policy |

### 6. Subcontractors

Aster may use subcontractors only with MedNova's prior written approval. Aster remains responsible for subcontractor acts and omissions. Aster must ensure each approved subcontractor is bound by written obligations covering confidentiality, security, data processing, and audit support at least as protective as this Agreement.

### 7. Intellectual Property

MedNova owns all custom deliverables specifically created for MedNova under a statement of work after payment of applicable fees. Aster retains ownership of pre-existing materials, generic know-how, templates, tools, libraries, connectors, and platform technology. To the extent Aster pre-existing materials are embedded in a deliverable, Aster grants MedNova a perpetual, non-exclusive, royalty-free license to use those materials as part of the deliverable for MedNova's internal business purposes.

### 8. Indemnification

Aster will defend, indemnify, and hold harmless MedNova from third-party claims alleging that Aster-provided deliverables infringe intellectual property rights, or that Aster's gross negligence or willful misconduct caused unauthorized disclosure of MedNova data. MedNova will defend Aster from claims arising from MedNova materials supplied for use in the services.

### 9. Limitation of Liability

Except for confidentiality breaches, data security obligations, indemnification obligations, payment obligations, gross negligence, willful misconduct, and equitable relief, each party's aggregate liability is capped at the fees paid or payable under the applicable statement of work during the twelve months before the event giving rise to liability. Neither party is liable for indirect, consequential, special, or punitive damages except to the extent included in a third-party claim covered by indemnification.

### 10. Termination and Exit Assistance

Either party may terminate for material breach if the breach is not cured within thirty days after written notice. MedNova may terminate a statement of work for convenience with sixty days' notice. Upon termination, Aster will provide up to thirty days of reasonable transition assistance, export MedNova data in a commercially reasonable format, and certify deletion of MedNova data after transition unless retention is legally required.

### 11. Audit and Records

Aster will maintain complete and accurate records related to service performance, security controls, and data processing for at least two years. No more than once per year, MedNova may request reasonable evidence of Aster's security and compliance controls. On reasonable notice, MedNova may conduct a remote audit if evidence provided by Aster is insufficient to verify compliance.

### 12. Governing Law and Dispute Resolution

This Agreement is governed by the laws of Delaware, excluding conflict-of-law rules. The parties will attempt executive escalation before filing litigation. Either party may seek injunctive relief for confidentiality, data security, or intellectual property violations.

## MSA_V2 - Master Services Agreement

### 1. Parties and Background

This Master Services Agreement is entered into by MedNova Clinics Group, Inc. ("MedNova") and Aster Cloud Solutions LLC ("Aster"). MedNova operates outpatient clinics and requires software implementation, integration, analytics, and support services. Aster provides cloud implementation and managed integration services for healthcare-adjacent operations.

### 2. Order Process and Scope

Services will be ordered through statements of work signed by both parties. Each statement of work must describe deliverables, milestones, acceptance criteria, fees, service levels, and project assumptions. Aster may adjust staffing, delivery sequence, technical approach, or implementation tools as reasonably necessary to deliver the services without requiring a formal amendment, provided the change does not materially reduce the purchased service quantity.

### 3. Regulatory and Compliance Responsibilities

Aster will perform the services in a professional manner and will comply with laws generally applicable to cloud service providers. MedNova remains solely responsible for determining whether the services satisfy healthcare, privacy, record retention, consent, and patient communication requirements applicable to MedNova's operations.

### 4. Confidential Information

Confidential Information includes business plans, pricing, patient workflow data, integration designs, security documentation, product roadmaps, credentials, non-public financial information, and information marked confidential. The receiving party may use Confidential Information to perform services, improve its products, train support staff, and create aggregated operational insights if those insights do not identify MedNova.

Confidential Information does not include information that is public through no fault of the receiving party, already known without duty of confidentiality, or received from a third party without restriction. The independent-development exception is removed. Confidentiality obligations continue for two years after disclosure, except that trade secrets remain protected only while they qualify as trade secrets under applicable law.

### 5. Data Security and Incident Response

Aster will maintain commercially reasonable safeguards designed to protect MedNova data. Safeguards may include access controls, encryption, logging, and vulnerability management based on Aster's standard security program. Aster may modify specific controls if it determines that alternative controls provide comparable protection.

Aster will notify MedNova within ten business days after confirming a security incident that Aster determines is likely to materially affect MedNova data. The notice will summarize known facts and remediation steps then available. Aster is not responsible for incident costs caused by MedNova credentials, MedNova integrations, user misconfiguration, or third-party systems outside Aster's direct control.

| Control Area | Minimum Requirement | Evidence |
| --- | --- | --- |
| Access management | Commercially reasonable access controls | Summary available on request |
| Encryption | Encryption where supported by Aster systems | Standard security summary |
| Vulnerability management | Remediation according to Aster priority policy | Internal report summary |
| Logging | Logs retained according to Aster policy | Not generally provided |

### 6. Subcontractors

Aster may use subcontractors and affiliates to provide the services. Aster will remain responsible for their performance but does not need MedNova's prior approval. Aster will provide a current subcontractor list on request and will give notice of material changes when commercially reasonable.

### 7. Intellectual Property

Aster owns all platform technology, configurations, workflows, integration adapters, templates, reusable components, scripts, dashboards, documentation patterns, and know-how used or created in connection with the services. Subject to payment, Aster grants MedNova a non-exclusive, non-transferable license to use configured deliverables internally during the subscription term. MedNova does not obtain ownership of custom deliverables unless a statement of work expressly states otherwise.

### 8. Indemnification

Aster will defend MedNova from third-party claims alleging that unmodified Aster platform technology infringes intellectual property rights. Aster has no indemnity obligation for claims arising from MedNova data, MedNova instructions, third-party integrations, open-source components requested by MedNova, or combinations not supplied by Aster. MedNova will indemnify Aster from claims arising from MedNova materials, patient communications, regulatory decisions, and use of the services in violation of this Agreement.

### 9. Limitation of Liability

Except for payment obligations and unpaid fees, each party's aggregate liability for all claims is capped at the fees paid under the affected statement of work during the three months before the event giving rise to liability. This cap applies to confidentiality claims, data security claims, indemnity claims, service credits, and all other claims regardless of legal theory. Neither party is liable for indirect, consequential, special, punitive, lost profit, lost revenue, lost data, or business interruption damages.

### 10. Termination and Exit Assistance

Either party may terminate for material breach if the breach is not cured within thirty days after written notice. Aster may terminate a statement of work or suspend services for convenience with fifteen days' notice if continued performance is commercially impracticable. Transition assistance is provided at Aster's then-current professional-services rates and is subject to resource availability. Aster will export MedNova data using its standard export tools.

### 11. Audit and Records

Aster will maintain records according to its standard retention policies. MedNova may request a current security summary once per year. On-site audits and remote control testing are not permitted unless required by law and mutually agreed in a separate audit statement of work.

### 12. Governing Law and Dispute Resolution

This Agreement is governed by the laws of Delaware, excluding conflict-of-law rules. The parties will attempt executive escalation before filing litigation. Either party may seek injunctive relief for intellectual property misuse, unauthorized access, or non-payment.

## SOW_V1 - Implementation SOW

### 1. Project Overview

This Statement of Work covers implementation of Aster Cloud's appointment workflow, digital intake, staff dashboard, and reporting integration for MedNova's pilot region. The pilot includes five clinics, approximately one hundred staff users, and integrations with MedNova's identity provider and scheduling data export.

### 2. Deliverables

| Deliverable | Description | Acceptance Evidence |
| --- | --- | --- |
| Discovery report | Current-state workflow summary and implementation plan | Signed discovery readout |
| Configured environment | Tenant configuration, roles, and clinic setup | Admin walkthrough |
| Identity integration | SSO configuration and role mapping | Successful login test |
| Scheduling import | Nightly appointment data import from MedNova export | Sample import log |
| Training package | Admin guide and two live training sessions | Attendance record and materials |

### 3. Milestones

| Milestone | Target Date | Fee |
| --- | --- | --- |
| Kickoff and discovery complete | 2026-05-15 | 20% |
| Core configuration complete | 2026-06-05 | 30% |
| Integration testing complete | 2026-06-26 | 30% |
| Production readiness complete | 2026-07-10 | 20% |

### 4. Acceptance Procedure

MedNova will have ten business days after delivery of each milestone to test and either accept the milestone or reject it with a written list of material non-conformities. Aster will correct rejected items at no additional charge if the rejection is based on the agreed acceptance criteria. Silence does not constitute acceptance unless Aster sends a reminder and MedNova fails to respond within five additional business days.

### 5. Fees and Payment Schedule

Total professional-services fees are USD 180,000. Aster will invoice each milestone after MedNova accepts the milestone. MedNova will pay undisputed invoices within thirty days after receipt. Travel expenses require prior written approval and will be billed at cost without markup.

### 6. Service Levels and Support

During pilot production, Aster will provide weekday support from 8:00 a.m. to 6:00 p.m. local clinic time. Severity 1 incidents will receive a response within one hour and continuous work until workaround or resolution. If monthly uptime falls below 99.5% due to Aster-controlled systems, MedNova may request a service credit equal to 10% of the affected monthly subscription fee.

### 7. Intellectual Property and Reusable Components

Custom workflow documentation, configuration exports, clinic-specific dashboards, and implementation materials prepared specifically for MedNova are MedNova-owned deliverables after payment. Aster retains ownership of pre-existing tools, reusable connectors, and generic templates, but grants MedNova a perpetual internal-use license to embedded reusable materials.

### 8. Change Control

Out-of-scope work requires a written change order signed by both parties before work begins. A change order must describe scope, fees, schedule impact, and acceptance criteria. Aster may not bill for out-of-scope work performed before a signed change order unless MedNova expressly approved emergency work in writing.

### 9. Assumptions and Customer Responsibilities

MedNova will provide timely access to subject-matter experts, test users, identity-provider administrators, scheduling export documentation, and clinic workflow owners. Delays caused by missing MedNova inputs will extend the project schedule day-for-day, but will not increase fees unless the delay exceeds twenty business days.

### 10. Exit Package

At project close, Aster will provide configuration documentation, admin guide, training materials, and a final issue log. If the SOW is terminated before completion, Aster will provide completed work product and a transition summary for accepted milestones.

## SOW_V2 - Implementation SOW

### 1. Project Overview

This Statement of Work covers implementation of Aster Cloud's appointment workflow, digital intake, staff dashboard, and reporting integration for MedNova's pilot region. The pilot includes five clinics, approximately one hundred staff users, and integrations with MedNova's identity provider and scheduling data export.

### 2. Deliverables

| Deliverable | Description | Acceptance Evidence |
| --- | --- | --- |
| Discovery report | Current-state workflow summary and implementation plan | Aster delivery notice |
| Configured environment | Tenant configuration, roles, and clinic setup | Admin walkthrough or screen recording |
| Identity integration | SSO configuration and role mapping | Aster successful login test |
| Scheduling import | Nightly appointment data import from MedNova export | Sample import log if export is available |
| Training package | Admin guide and one live training session | Materials delivered electronically |

### 3. Milestones

| Milestone | Target Date | Fee |
| --- | --- | --- |
| Kickoff and discovery complete | 2026-05-15 | 50% upfront |
| Core configuration complete | 2026-06-05 | 20% |
| Integration testing complete | 2026-06-26 | 20% |
| Production readiness complete | 2026-07-10 | 10% |

### 4. Acceptance Procedure

MedNova will have three business days after Aster's delivery notice to reject a milestone. A rejection must include detailed defect evidence showing that the deliverable materially fails the SOW. If MedNova does not reject within three business days, the milestone is deemed accepted. Aster may invoice deemed-accepted milestones even if MedNova has not completed internal testing.

### 5. Fees and Payment Schedule

Total professional-services fees are USD 180,000. Fifty percent is due before kickoff. Remaining milestone invoices are due within fifteen days after invoice date. Aster may suspend work for any overdue invoice. Travel expenses and third-party tool costs may be billed at cost plus 10% administrative markup.

### 6. Service Levels and Support

During pilot production, Aster will provide weekday support from 9:00 a.m. to 5:00 p.m. Aster's local time. Severity 1 incidents will receive commercially reasonable priority. If monthly uptime falls below 99.0% due solely to Aster-controlled systems, MedNova may request service credits. Service credits are MedNova's sole and exclusive remedy for availability issues and are capped at 5% of the affected monthly subscription fee.

### 7. Intellectual Property and Reusable Components

Aster retains ownership of workflow documentation, configuration patterns, integration adapters, templates, scripts, dashboards, and implementation materials created or used under this SOW. Subject to payment, Aster grants MedNova a limited, non-exclusive, non-transferable internal-use license during the subscription term. MedNova may not reuse integration adapters with another vendor without Aster's written consent.

### 8. Change Control

Aster may bill out-of-scope work on a time-and-materials basis if Aster reasonably determines that MedNova's request is outside the agreed scope. Aster will use commercially reasonable efforts to notify MedNova before performing billable extra work, but a signed change order is not required for work needed to protect schedule, resolve integration blockers, or respond to MedNova-requested changes.

### 9. Assumptions and Customer Responsibilities

MedNova will provide timely access to subject-matter experts, test users, identity-provider administrators, scheduling export documentation, and clinic workflow owners. Delays caused by missing MedNova inputs will extend the schedule and may increase fees if Aster resources remain allocated. Aster is not responsible for delays caused by MedNova's third-party systems or incomplete exports.

### 10. Exit Package

At project close, Aster will provide standard admin documentation and training materials. If the SOW is terminated before completion, Aster will provide completed paid work product. Additional transition support is available at Aster's then-current rates.

## SECURITY_ADDENDUM - Security and Data Processing Addendum

### 1. Purpose

This Security and Data Processing Addendum supplements the Master Services Agreement between MedNova Clinics Group and Aster Cloud Solutions. It describes operational safeguards, covered data categories, incident handling, cross-border support, and bilingual operational notice terms for the pilot deployment.

### 2. Covered Data

Covered data includes patient registration details, appointment history, contact details, insurance references, staff account records, role assignments, audit logs, support tickets, configuration records, and scheduling import files. Covered data does not include anonymized platform telemetry that cannot reasonably identify MedNova, a patient, or a staff member.

### 3. Processing Instructions

Aster will process covered data only to configure, support, secure, monitor, troubleshoot, and improve the services for MedNova. Aster may not sell covered data or use it for advertising. Aster may create aggregated operational metrics if the metrics do not identify MedNova or any individual.

### 4. Security Safeguards

Aster will maintain logical access controls, role-based permissions, encryption in transit, encryption at rest where supported, centralized logging, vulnerability management, and documented incident response procedures. Administrative access must be limited to authorized support and operations personnel.

### 5. Incident Notification

Aster will notify MedNova without undue delay after confirming unauthorized access to covered data. The notice will include known facts, affected data categories, containment steps, expected next updates, and a support contact. Aster will cooperate with MedNova's legally required notices.

### 6. Return and Deletion

Upon termination or expiration, Aster will make covered data available for export through standard tools for thirty days. After the export period, Aster may delete covered data from active systems. Backups may remain until overwritten under standard backup rotation.

### 7. Vietnamese Operational Notice

Thông báo sự cố bảo mật phải được gửi không chậm trễ sau khi Aster xác nhận sự cố ảnh hưởng đến dữ liệu của MedNova. Thông báo cần nêu dữ kiện đã biết, loại dữ liệu bị ảnh hưởng, biện pháp cô lập, thời điểm cập nhật tiếp theo và đầu mối phụ trách an ninh.

### 8. Signature Copy Note

This addendum may be provided as a scanned signature copy. If OCR confidence is insufficient, Redline should show parser diagnostics rather than treating uncertain text as legal truth.
