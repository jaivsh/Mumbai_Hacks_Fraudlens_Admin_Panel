/**
 * Server-side report prompts (aligned with dashboard `src/components/scribe/reportFormats.js`).
 * Env: SCRIBE_ORG_NAME, SCRIBE_DPO_*, SCRIBE_CONTACT_EMAIL, SCRIBE_CONTACT_PHONE
 */

const ORG_NAME = process.env.SCRIBE_ORG_NAME || 'FraudLens';
const DPO_CONTACT = {
  name: process.env.SCRIBE_DPO_NAME || '[DPO Name]',
  email: process.env.SCRIBE_DPO_EMAIL || '[dpo@example.com]',
  phone: process.env.SCRIBE_DPO_PHONE || '[+91 xxxxx xxxxx]'
};
const REPORTING_CONTACT = {
  email:
    process.env.SCRIBE_CONTACT_EMAIL ||
    process.env.SCRIBE_DPO_EMAIL ||
    '[contact@example.com]',
  phone: process.env.SCRIBE_DPO_PHONE || '[+91 xxxxx xxxxx]'
};

/** Default recipients per report type (override via env JSON: SCRIBE_RECIPIENTS_JSON) */
function defaultRecipients() {
  const raw = (process.env.SCRIBE_RECIPIENTS_JSON || '').trim();
  if (raw) {
    try {
      const o = JSON.parse(raw);
      if (o && typeof o === 'object') return o;
    } catch (_) {
      /* fall through */
    }
  }
  return {
    'RBI Fraud Report (FMR-style)': ['compliance@example.com'],
    'Internal SOC Post-Mortem': ['soc@example.com'],
    'Executive Summary': ['executives@example.com'],
    'CERT-In Incident Report (India)': ['soc@example.com'],
    'GDPR Data Breach Notification (Draft)': ['dpo@example.com'],
    'ISO 27001 Incident Evidence': ['soc@example.com']
  };
}

const REPORT_RECIPIENTS = defaultRecipients();

const REPORT_SUBJECTS = {
  'RBI Fraud Report (FMR-style)': '[RBI] Fraud Report (FMR-style) — Incident [INCIDENT_ID]',
  'Internal SOC Post-Mortem': '[CRITICAL] Fraudlens Alert: Post-Mortem for Incident [INCIDENT_ID]',
  'Executive Summary': '[SUMMARY] Fraudlens Success: Incident [INCIDENT_ID]',
  'CERT-In Incident Report (India)': '[ACTION REQUIRED] Draft CERT-In Report for Incident [INCIDENT_ID]',
  'GDPR Data Breach Notification (Draft)': '[URGENT ACTION] Draft GDPR Breach Notification for [INCIDENT_ID]',
  'ISO 27001 Incident Evidence': '[AUDIT] ISO 27001 Incident Evidence for [INCIDENT_ID]'
};

const AUTO_REPORT_TYPES = [
  'RBI Fraud Report (FMR-style)',
  'CERT-In Incident Report (India)',
  'Executive Summary'
];

const PROMPT_TEMPLATES = {
  'RBI Fraud Report (FMR-style)': `You are an AI compliance officer for an RBI-regulated entity. Based on the following incident JSON, produce an RBI Master Circular–style fraud report (aligned to Frauds – Classification and Reporting).

Output MUST be a single valid JSON object (no markdown, no code fence) with exactly these keys:
- "reportingOrganization": string (organisation name).
- "amountInvolved": number (INR amount from incident; used to determine reporting office).
- "reportingOffice": string — one of "Fraud Monitoring Cell (RBI)" (if amount < ₹1,00,000), "RBI Regional Office" (if ₹1,00,000 to ₹25,00,000), "RBI Central Office" (if ≥ ₹25,00,000).
- "fraudClassification": string (e.g. "Digital payment / UPI fraud", "Identity theft / phishing", "Unauthorised access", "Data breach", "Other" — align with RBI categories where applicable).
- "occurrenceTime": string (ISO 8601 or readable date-time).
- "detectionTime": string (ISO 8601 or readable date-time).
- "affectedSystems": string (brief: e.g. UPI, payment gateway, core banking).
- "incidentSummary": string (2–4 sentences).
- "impact": string (e.g. potential loss, users affected, amount blocked/recovered).
- "actionsTaken": string (e.g. transaction blocked, user notified, NCRP reported).
- "contactName": string.
- "contactEmail": string.
- "contactPhone": string.

Incident data (JSON):
{incident_data}

Output only the JSON object.`,

  'Internal SOC Post-Mortem': `You are an AI security analyst. Based on the following incident JSON, produce an Internal SOC Post-Mortem report.

Output MUST be valid Markdown with exactly these level-2 headings (##) in this order. Under each heading write 1–3 short paragraphs or a bullet list as appropriate. Use clear, professional language.

## Executive Summary
## Timeline
## Root Cause Analysis
## Impact
## What Went Well
## What Did Not Go Well
## Follow-up Actions
## Indicators of Compromise

Incident data (JSON):
{incident_data}

Write only the markdown report, no preamble.`,

  'Executive Summary': `You are an AI business analyst. Based on the following incident JSON, produce an Executive Summary for the C-suite.

Output MUST be a single valid JSON object (no markdown, no code fence) with exactly these keys:
- "headline": one short sentence (e.g. "Fraud attempt blocked; ₹X at risk.")
- "summary": 2–3 sentences on what happened and how the system prevented loss. No technical jargon.
- "amountAtRisk": number in INR (from incident).
- "outcome": one of "Blocked" | "Recovered" | "Under review".
- "keyPoints": array of exactly 3 to 5 short bullet strings (business impact only).

Incident data (JSON):
{incident_data}

Output only the JSON object.`,

  'CERT-In Incident Report (India)': `You are an AI compliance officer. Based on the following incident JSON, produce a CERT-In Annexure A style incident report.

Output MUST be a single valid JSON object (no markdown, no code fence) with exactly these keys (use the incident data to fill them; for incidentType pick the closest from: "Targeted scanning/probing", "Compromise of critical systems", "Unauthorised access to IT systems/data", "Malicious code attacks", "Identity theft/phishing", "DoS/DDoS", "Data breach", "Data leak", "Attacks affecting Digital Payment systems", "Attacks on cloud systems", "Other"):
- "reportingOrganization": string (organisation name).
- "incidentType": string (from CERT-In 20 categories).
- "occurrenceTime": string (ISO 8601 or readable date-time).
- "detectionTime": string (ISO 8601 or readable date-time).
- "affectedSystems": string (brief: e.g. payment gateway, UPI).
- "incidentSummary": string (2–4 sentences).
- "technicalDetails": string (brief: IP, amounts, VPAs if relevant).
- "impact": string (e.g. potential financial loss, users affected).
- "actionsTaken": string (e.g. transaction blocked, user notified).
- "contactName": string.
- "contactEmail": string.
- "contactPhone": string.

Incident data (JSON):
{incident_data}

Output only the JSON object.`,

  'GDPR Data Breach Notification (Draft)': `You are an AI compliance specialist. Based on the following incident JSON, draft a GDPR Article 33 breach notification for internal review.

Output MUST be valid Markdown with exactly these level-2 headings (##) in this order. Use formal language and cite the incident ID where relevant.

## Nature of the Breach
## Personal Data Impacted
## DPO / Contact Details
## Likely Consequences
## Measures Taken or Proposed
## Timeline

Incident data (JSON):
{incident_data}

Write only the markdown report, no preamble.`,

  'ISO 27001 Incident Evidence': `You are an ISO 27001 auditor assistant. Based on the following incident JSON, produce an incident evidence packet (Annex A controls 5.26, 5.28).

Output MUST be valid Markdown with exactly these level-2 headings (##) in this order:
## Control Mapping
## Evidence Items
## Timeline
## Next Actions

Incident data (JSON):
{incident_data}

Write only the markdown report, no preamble.`
};

function buildSubject(reportType, incidentId) {
  const template = REPORT_SUBJECTS[reportType];
  return template?.replace('[INCIDENT_ID]', incidentId) || `Report for ${incidentId}`;
}

module.exports = {
  ORG_NAME,
  DPO_CONTACT,
  REPORTING_CONTACT,
  REPORT_RECIPIENTS,
  REPORT_SUBJECTS,
  AUTO_REPORT_TYPES,
  PROMPT_TEMPLATES,
  buildSubject,
  listReportTypes: () => Object.keys(PROMPT_TEMPLATES)
};
