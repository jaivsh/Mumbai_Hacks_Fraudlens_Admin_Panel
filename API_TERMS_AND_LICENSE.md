# FraudLens — API / Service Terms & License Agreement (Template)

> **Important**: This is a template for hackathon/prototype publishing and **not legal advice**. Before publishing on APIX or signing with a bank, have counsel review and adapt (especially liability, regulatory, data protection, security, and audit clauses).

**Last updated:** 2026-04-03  
**Provider:** **FraudLens (Project Team)**, pre-incorporation prototype team, Mumbai, Maharashtra, India (“**Provider**”, “**we**”, “**us**”).  
**Customer / User:** the organization or individual accepting these terms (“**Customer**”, “**you**”).  
**Service:** FraudLens Admin Panel, Scribe Reports, Chronos evidence/audit APIs, and related endpoints, dashboards, and documentation (“**Service**”).

If you access or use the Service (including via APIX Marketplace), you agree to these terms.

---

## 1. Scope and order of precedence
1. These terms govern your use of the Service and APIs.
2. If you also sign an order form, SOW, or marketplace subscription, that document may override these terms **only to the extent of conflict**.
3. If you upload an NDA or SLA on APIX, those documents apply in addition to these terms.

---

## 2. Definitions
- **API**: any endpoint, SDK, webhook, or integration exposed by Provider.
- **Customer Data**: any data provided by Customer to the Service, including incident/transaction data, user records, logs, and report content.
- **Artifacts**: generated reports/evidence stored as documents (e.g., PDFs) and referenced via metadata (e.g., hashes).
- **Documentation**: technical docs, descriptions, schemas (including Swagger/OpenAPI), and usage guides.

---

## 3. License grant (SaaS + API)
3.1 **License.** Subject to these terms, Provider grants you a **non-exclusive, non-transferable, revocable** right during the Subscription Term to access and use the Service and APIs for your internal business purposes.

3.2 **Restrictions.** You must not:
- copy, modify, or create derivative works of the Service (except as expressly permitted);
- reverse engineer, decompile, or attempt to derive source code (except to the extent permitted by law);
- bypass authentication, rate limits, or security controls;
- use the Service to build or benchmark a competing product without written permission;
- use the Service for unlawful purposes or to process data you do not have rights to use.

3.3 **Open source.** Third-party open-source software used in the Service is licensed under its respective licenses.

---

## 4. Accounts, authentication, and access control
4.1 **Accounts.** You are responsible for all activity under your accounts, including administrator actions.

4.2 **Role-based access.** The Service may implement role-based permissions (e.g., IT vs Executive views). You are responsible for assigning roles appropriately and maintaining least-privilege access.

4.3 **Security of credentials.** Do not share credentials or tokens. Notify Provider promptly of suspected compromise.

---

## 5. Service description and AI-generated outputs
5.1 **AI outputs are drafts.** Some outputs (e.g., compliance reports) may be generated using AI/LLMs. Unless explicitly stated otherwise, AI outputs are **drafts** and require human review.

5.2 **No regulator submission by default.** Unless you have a signed written agreement explicitly enabling automated submission, the Service does not submit reports to regulators/authorities on your behalf.

5.3 **Accuracy.** Provider does not guarantee that AI outputs are complete, correct, or legally sufficient. You remain responsible for decisions and filings.

---

## 6. Evidence, integrity, and audit trail (Chronos)
6.1 **Artifacts and hashes.** The Service may store evidence artifacts (e.g., PDFs) and compute cryptographic hashes (e.g., SHA-256) to support integrity verification.

6.2 **Immutability disclaimer.** Hash anchoring and audit logs improve tamper-evidence, but no system is perfectly immutable. Provider does not warrant absolute immutability or non-repudiation unless expressly agreed in writing.

6.3 **Verification.** Where available, you may verify an artifact by comparing its computed hash to the recorded hash.

---

## 7. Customer Data and data rights
7.1 **Customer Data ownership.** As between the parties, Customer retains all rights in Customer Data.

7.2 **Provider use of Customer Data.** Provider will process Customer Data only to provide, maintain, and improve the Service; to secure the Service; and as otherwise permitted by this agreement and applicable law.

7.3 **Feedback.** If you provide feedback, Provider may use it without restriction or compensation.

---

## 8. Privacy and data protection
8.1 **Privacy notice.** If Provider provides a Privacy Notice, it applies to personal data processed in connection with the Service.

8.2 **DPA.** If Customer is a controller and Provider processes personal data on Customer’s behalf, a Data Processing Addendum (DPA) applies (either your uploaded DPA on APIX or a separately signed DPA).

8.3 **Regulatory alignment.** Customer remains responsible for meeting regulatory reporting obligations (e.g., RBI, CERT-In) and for lawful collection and sharing of data.

---

## 9. Security
9.1 **Security measures.** Provider will maintain reasonable administrative, technical, and physical safeguards appropriate to the nature of the Service.

9.2 **Customer responsibilities.** Customer is responsible for:
- lawful collection and secure transmission of Customer Data;
- device, browser, and account security of its users;
- configuring access controls and review workflows.

9.3 **Security incidents.** Provider will notify Customer of a confirmed breach affecting Customer Data in accordance with the DPA or applicable law.

---

## 10. Acceptable use
You must comply with the Acceptable Use Policy (AUP) attached or referenced by Provider. Breach may result in suspension or termination.

---

## 11. Fees, billing, taxes (if applicable)
11.1 **Fees.** Fees are as stated in your subscription/order or APIX listing.

11.2 **Taxes.** Fees exclude taxes unless stated otherwise. Customer is responsible for applicable taxes.

---

## 12. Support and SLA
Support and uptime commitments, if any, are described in the SLA. If no SLA is provided, the Service is provided on a commercially reasonable basis without uptime guarantees.

---

## 13. Third-party services
The Service may depend on third-party cloud providers and services (e.g., Google Cloud / Firebase). Provider is not responsible for outages caused by third-party services outside Provider’s reasonable control.

---

## 14. Warranties and disclaimers
14.1 **Limited warranty.** Provider warrants it will provide the Service in a professional manner.

14.2 **Disclaimer.** EXCEPT AS EXPRESSLY PROVIDED, THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE”. PROVIDER DISCLAIMS ALL IMPLIED WARRANTIES, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.

---

## 15. Limitation of liability
15.1 **No indirect damages.** Provider is not liable for indirect, incidental, special, consequential, or punitive damages, including lost profits, revenue, or data.

15.2 **Cap.** Provider’s total liability under these terms is capped at the fees paid by Customer to Provider in the **12 months** preceding the claim (or **USD 100** if free/trial), unless prohibited by law.

---

## 16. Indemnities
16.1 **IP indemnity (optional).** Provider may indemnify Customer for third-party claims alleging the Service infringes IP, subject to exclusions.

16.2 **Customer indemnity.** Customer will indemnify Provider for claims arising from Customer Data, Customer’s misuse, or unlawful processing.

---

## 17. Term, suspension, termination
17.1 **Term.** These terms apply while you use the Service.

17.2 **Suspension.** Provider may suspend access for security threats, legal compliance, or material breach.

17.3 **Termination.** Either party may terminate for material breach not cured within [30] days (or immediately for severe breaches).

---

## 18. Export controls and sanctions
You represent you are not prohibited from using the Service under applicable export controls or sanctions laws.

---

## 19. Governing law and disputes
**Governing law:** [India / Singapore / other].  
**Courts/venue:** [City, Country].  
Alternative: arbitration under [institution/rules] in [seat].

---

## 20. Contact
**Legal/Support contact:** fancybeardarmies@gmail.com  
**Privacy contact:** shuklajaivardhan3@gmail.com  
**DPO (if applicable):** Not appointed (prototype)

