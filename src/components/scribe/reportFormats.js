/**
 * Report formats aligned to RBI/CERT-In/GDPR/ISO/SOC.
 * Prompts instruct Gemini to output structured content (JSON or strict markdown sections).
 */

const ORG_NAME = process.env.REACT_APP_SCRIBE_ORG_NAME || 'FraudLens';
const DPO_CONTACT = {
  name: process.env.REACT_APP_SCRIBE_DPO_NAME || '[DPO Name]',
  email: process.env.REACT_APP_SCRIBE_DPO_EMAIL || '[dpo@example.com]',
  phone: process.env.REACT_APP_SCRIBE_DPO_PHONE || '[+91 xxxxx xxxxx]'
};
const REPORTING_CONTACT = {
  email: process.env.REACT_APP_SCRIBE_CONTACT_EMAIL || process.env.REACT_APP_SCRIBE_DPO_EMAIL || '[contact@example.com]',
  phone: process.env.REACT_APP_SCRIBE_DPO_PHONE || '[+91 xxxxx xxxxx]'
};

/** Default recipients per report type (IT, Leadership, DPO). Override in ScribeDashboard if needed. */
export const REPORT_RECIPIENTS = {
  'RBI Fraud Report (FMR-style)': ['fancybeardarmies@gmail.com', 'shuklajaivardhan3@gmail.com'],
  'Internal SOC Post-Mortem': ['shuklajaivardhan3@gmail.com'],
  'Executive Summary': ['fancybeardarmies@gmail.com'],
  'CERT-In Incident Report (India)': ['shuklajaivardhan3@gmail.com'],
  'GDPR Data Breach Notification (Draft)': ['shuklajaivardhan3@gmail.com', 'fancybeardarmies@gmail.com'],
  'ISO 27001 Incident Evidence': ['shuklajaivardhan3@gmail.com'],
  'Weekly Intelligence Summary': ['fancybeardarmies@gmail.com', 'shuklajaivardhan3@gmail.com']
};

/** Email subject templates; [INCIDENT_ID] is replaced with the incident id. */
export const REPORT_SUBJECTS = {
  'RBI Fraud Report (FMR-style)': '[RBI] Fraud Report (FMR-style) — Incident [INCIDENT_ID]',
  'Internal SOC Post-Mortem': '[CRITICAL] Fraudlens Alert: Post-Mortem for Incident [INCIDENT_ID]',
  'Executive Summary': '[SUMMARY] Fraudlens Success: Incident [INCIDENT_ID]',
  'CERT-In Incident Report (India)': '[ACTION REQUIRED] Draft CERT-In Report for Incident [INCIDENT_ID]',
  'GDPR Data Breach Notification (Draft)': '[URGENT ACTION] Draft GDPR Breach Notification for [INCIDENT_ID]',
  'ISO 27001 Incident Evidence': '[AUDIT] ISO 27001 Incident Evidence for [INCIDENT_ID]',
  'Weekly Intelligence Summary': '[INFO] Fraudlens Weekly Intelligence Brief'
};

/** Report types to auto-generate when an incident is blocked (autonomous Scribe). */
export const AUTO_REPORT_TYPES = [
  'RBI Fraud Report (FMR-style)',
  'CERT-In Incident Report (India)',
  'Executive Summary'
];

export { ORG_NAME, DPO_CONTACT, REPORTING_CONTACT };

/** Section headings we expect in markdown outputs (in order) for parsing */
export const MARKDOWN_SECTIONS = {
  'Internal SOC Post-Mortem': [
    'Executive Summary',
    'Timeline',
    'Root Cause Analysis',
    'Impact',
    'What Went Well',
    'What Did Not Go Well',
    'Follow-up Actions',
    'Indicators of Compromise'
  ],
  'GDPR Data Breach Notification (Draft)': [
    'Nature of the Breach',
    'Personal Data Impacted',
    'DPO / Contact Details',
    'Likely Consequences',
    'Measures Taken or Proposed',
    'Timeline'
  ],
  'ISO 27001 Incident Evidence': [
    'Control Mapping',
    'Evidence Items',
    'Timeline',
    'Next Actions'
  ]
};

/** Prompts that demand structured output for each report type (RBI/CERT-In/India-first for HaRBInger 2025). */
export const PROMPT_TEMPLATES = {
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
