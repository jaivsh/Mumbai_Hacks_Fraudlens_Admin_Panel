import { auth } from '../firebase';

const DEFAULT_ASSISTANT_API_BASE = 'https://fraudlens-assistant-api-875422601666.asia-south1.run.app';

function assistantBase() {
  const base = process.env.REACT_APP_ASSISTANT_API?.trim();
  const v = base || DEFAULT_ASSISTANT_API_BASE;
  return v ? v.replace(/\/$/, '') : '';
}

async function getIdToken() {
  const user = auth.currentUser;
  if (!user) return null;
  return await user.getIdToken();
}

async function postJson(path, body) {
  const base = assistantBase();
  if (!base) return { ok: false, skipped: true, reason: 'REACT_APP_ASSISTANT_API not set' };

  const token = await getIdToken();
  const resp = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body || {})
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(text || 'Assistant API error');
  }
  try {
    return JSON.parse(text);
  } catch (_) {
    return { ok: true };
  }
}

export async function ingestReportToAssistant({
  incidentId,
  reportType,
  reportId,
  objectPath,
  gcsPath,
  sha256,
  contentType,
  content,
  source
}) {
  return await postJson('/api/assistant/ingest/report', {
    incidentId,
    reportType,
    reportId,
    objectPath,
    gcsPath,
    sha256,
    contentType,
    content,
    source
  });
}

export async function ingestFactsToAssistant({ incidentId, facts }) {
  return await postJson('/api/assistant/ingest/facts', { incidentId, facts });
}

