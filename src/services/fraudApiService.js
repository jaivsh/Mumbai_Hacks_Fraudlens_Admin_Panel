/**
 * Calls the deployed FraudLens fraud scoring API (FastAPI on Cloud Run).
 * Base URL: REACT_APP_FRAUD_API_URL (no trailing slash).
 */

export function getFraudApiBaseUrl() {
  const u = process.env.REACT_APP_FRAUD_API_URL?.trim();
  return u ? u.replace(/\/$/, '') : '';
}

/**
 * @param {Record<string, unknown>} transactionPayload - matches API TransactionData
 * @returns {Promise<{ ok: boolean, data?: object, error?: string, status?: number }>}
 */
export async function predictFraud(transactionPayload) {
  const base = getFraudApiBaseUrl();
  if (!base) {
    return { ok: false, error: 'REACT_APP_FRAUD_API_URL is not set in .env' };
  }
  try {
    const res = await fetch(`${base}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(transactionPayload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: data?.detail || data?.message || `HTTP ${res.status}`,
        status: res.status,
        data
      };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.message || 'Network error' };
  }
}

export async function fetchFraudModelInfo() {
  const base = getFraudApiBaseUrl();
  if (!base) {
    return { ok: false, error: 'REACT_APP_FRAUD_API_URL is not set' };
  }
  try {
    const res = await fetch(`${base}/model/info`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data?.detail || `HTTP ${res.status}`, data };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.message || 'Network error' };
  }
}
