# Who receives Scribe reports (concerned authorities)

Scribe generates **compliance and internal reports** for each incident. Below is who should receive each report so the right people get the right doc without manual guesswork.

---

## Summary: report → recipient

| Report type | Primary recipient (concerned authority) | Why |
|-------------|----------------------------------------|-----|
| **RBI Fraud Report (FMR-style)** | **IT / Compliance team** (they submit to RBI per amount threshold) | RBI requires banks to report to Fraud Monitoring Cell (&lt;₹1L), Regional Office (₹1L–₹25L), or Central Office (≥₹25L). Your IT or compliance officer files this. |
| **CERT-In Incident Report (India)** | **IT / CISO or Compliance** (they submit to CERT-In) | CERT-In 6-hour rule: must be sent to incident@cert-in.org.in. Usually done by IT Security or compliance. |
| **Executive Summary** | **Leadership (C-suite)** — CFO, CEO, Risk head | One-pager for decision-makers; no technical jargon. |
| **Internal SOC Post-Mortem** | **IT Security / SOC team** | Internal learning and SOC 2 evidence. |
| **GDPR Data Breach Notification (Draft)** | **DPO (Data Protection Officer) / Legal** | They finalise and send to supervisory authority within 72 hours. |
| **ISO 27001 Incident Evidence** | **IT / Audit team** | For Annex A controls (e.g. 5.26, 5.28) and audits. |
| **NCRP (National Cyber Crime Portal)** | **Handled in dashboard** | Case Review → "Report to NCRP" opens cybercrime.gov.in and gives copy-paste text; not an email from Scribe. |

So: **IT team** (and/or compliance) receives **RBI**, **CERT-In**, **SOC**, **ISO**; **Leadership** receives **Executive Summary**; **DPO/Legal** receives **GDPR**. Configure the exact email addresses in your environment (see below).

---

## How to configure recipients

Recipients are set in code: `REPORT_RECIPIENTS` in `ScribeDashboard.js`. Replace the placeholder emails with your own:

- **RBI + CERT-In + SOC + ISO** → your IT Security / compliance team emails (e.g. `it-compliance@yourbank.com`, `ciso@yourbank.com`).
- **Executive Summary** → leadership emails (e.g. `cfo@yourbank.com`, `ceo@yourbank.com`).
- **GDPR** → DPO / legal (e.g. `dpo@yourbank.com`).

For true autonomy you can later drive these from Firestore or env (e.g. `REACT_APP_SCRIBE_RECIPIENTS_RBI`) so each report type’s recipients are configurable without code changes.

---

## Making Scribe autonomous (auto-create and send)

**Goal:** When an incident happens (e.g. a transaction is **blocked** or fraud-flagged), the system should **automatically** create the required docs and, where possible, send them to the concerned authorities.

### What we support today

1. **Auto-generate on block (one click)**  
   When an analyst **blocks** a transaction in the dashboard, they are prompted: **"Generate compliance reports for this incident?"**  
   - If they choose **Yes**, the app generates the **required set** for that incident: **RBI Fraud Report**, **CERT-In Incident Report**, and **Executive Summary**, and saves them to Firestore.  
   - The analyst then goes to **Scribe** (`/reports`) to **send** each report (Download or “Send Email” with pre-filled recipients). So: **creation is automatic** (triggered by block); **sending** is one click per report from Scribe.

2. **Fully automatic sending (future)**  
   To have reports **emailed automatically** without opening Scribe, you need a **backend** that:  
   - Runs when an incident is blocked (e.g. Firebase Cloud Function on `transactions` update, or a cron that reads a queue).  
   - Calls the same Gemini + template logic to generate each report.  
   - Sends email via SendGrid, Mailgun, or similar using the same recipient table above.  
   The admin panel’s Scribe UI can stay as the place to **preview, edit, or resend** any report.

### Required reports per incident (default “autonomous” set)

For a **blocked or fraud-flagged** incident, the **required set** is:

- **RBI Fraud Report (FMR-style)** → IT/Compliance (for RBI submission).
- **CERT-In Incident Report (India)** → IT/CISO (for CERT-In 6-hour submission).
- **Executive Summary** → Leadership.

Optionally you can add **Internal SOC Post-Mortem** for the SOC team. GDPR and ISO are usually generated when the incident involves a data breach or you need audit evidence.

---

## Quick reference: who receives what

- **IT team / Compliance:** RBI Fraud Report, CERT-In Report, SOC Post-Mortem, ISO 27001 Evidence.  
- **Leadership:** Executive Summary.  
- **DPO / Legal:** GDPR Data Breach Notification (Draft).  
- **NCRP:** Use the dashboard “Report to NCRP” flow (no Scribe email).

Configuring `REPORT_RECIPIENTS` to match the table above gives you clear ownership and makes Scribe capable of creating (and, with a backend, sending) the right docs to the right authorities automatically when an incident occurs.
