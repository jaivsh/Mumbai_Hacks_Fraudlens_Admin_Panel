# Scribe report formats & what we need from you

**FraudLens Admin Panel** is built for **HaRBInger 2025** (RBI's "Innovation for Transformation" hackathon), selected for the **Solution Development** round under the *Enhancing Trust* problem statement. We keep reports in **our format**: RBI- and India-regulatory first, then SOC/GDPR/ISO. We align each Scribe document to RBI Master Circular, CERT-In, and formats used by banks, GDPR, and ISO 27001. Below is what each report follows and what we need from you (if anything).

---

## 1. RBI Fraud Report (FMR-style)

**Standard:** RBI Master Circular on Frauds – Classification and Reporting. Report to Fraud Monitoring Cell (&lt;₹1L), Regional Office (₹1L–₹25L), or Central Office (≥₹25L).

**Structure:** Reporting organisation → Amount involved → Reporting office (from amount) → Fraud classification → Occurrence/detection time → Affected systems → Incident summary → Impact → Actions taken → Contact details.

**From you:** Reporting organisation name; optional primary contact and logo.

---

## 2. CERT-In Incident Report (India)

**Standard:** CERT-In directions (Section 70B, IT Act); Annexure A–style (6-hour rule).

**Structure:** Reporting organisation → Incident type (20 categories) → Occurrence/detection time → Affected systems → Description → Impact → Actions taken → Contact details.

**From you:** Reporting organisation name; optional primary contact and logo.

---

## 3. Executive Summary

**Standard:** One-page, board/C-suite; no technical jargon.

**Structure:** Incident ID & date → Amount at risk → Outcome → Short narrative → 3–5 bullet points.

**From you:** Optional organisation name and logo.

---

## 4. Internal SOC Post-Mortem

**Standard:** SOC 2 / incident post-mortem practice (timeline, root cause, follow-ups).

**Structure:**  
Title & metadata → Executive summary → Chronological timeline (with timestamps) → Root cause analysis → Impact (users/systems/amount) → What went well / What didn't → Follow-up actions → Appendix (IOCs, logs).

**From you:**  
- Optional: **company logo** (PNG/SVG) for the report header.  
- Optional: **organisation name** (e.g. "FraudLens" or your bank name) for the title/header.

---

## 5. GDPR Data Breach Notification (Draft)

**Standard:** GDPR Article 33 (72-hour notification to supervisory authority).

**Structure:**  
Nature of the breach → Categories and approximate number of data subjects and records → DPO (or equivalent) contact → Likely consequences → Measures taken or proposed (including mitigation) → Timeline (e.g. detection, containment, notification).

**From you:**  
- **DPO (or equivalent) contact:** name, email, phone (for "contact point" in the draft).  
- Optional: **organisation name** and **logo**.

---

## 6. ISO 27001 Incident Evidence

**Standard:** ISO 27001 Annex A (e.g. A.5.26 incident response, A.5.28 evidence collection).

**Structure:**  
Control mapping (e.g. A.5.26, A.5.28) → Evidence summary (logs, actions, decisions) → Timeline of response → Chain of evidence / integrity note → Next actions and remediation.

**From you:**  
- Optional: **organisation name** and **logo** for cover/header.

---

## Summary: what to send (if you want them in the reports)

| Item | Used in | Required? |
|------|--------|-----------|
| Organisation name | All | Optional (we can use "FraudLens" or a placeholder) |
| Logo (PNG/SVG URL or file) | All | Optional |
| DPO / contact (name, email, phone) | GDPR, CERT-In, RBI | **Yes for GDPR**; optional for CERT-In and RBI |
| Primary contact for CERT-In / RBI | CERT-In, RBI Fraud Report | Optional |

You can send:  
- **Logo:** file path (e.g. `public/scribe-logo.png`) or URL.  
- **Names/contacts:** plain text (we'll plug into the right fields).  

Once you share these (or confirm "use placeholders"), we'll wire them into the Scribe templates and the proper file structure for each document category.
