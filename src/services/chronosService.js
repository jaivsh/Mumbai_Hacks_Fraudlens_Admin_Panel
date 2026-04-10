/**
 * Chronos API service – fraud decision commit, incident history, document verification.
 * Uses REACT_APP_CHRONOS_API_URL (GCP VM) when set; falls back to REACT_APP_CHRONOS_API.
 */

const getBaseUrl = () => {
  const vm = process.env.REACT_APP_CHRONOS_API_URL?.trim();
  const cloudRun = process.env.REACT_APP_CHRONOS_API?.trim();
  return vm || cloudRun || '';
};

/**
 * @param {string} incidentId
 * @param {string} decision - e.g. 'FRAUD_CONFIRMED', 'APPROVED'
 * @param {string} [reasonCode] - optional
 * @param {Array<{objectPath:string, sha256:string, reportType?:string}>} [reports]
 * @param {string} [decidedBy]
 * @param {string} [bankCode]
 * @returns {Promise<{ ok: boolean, data?: any, error?: string }>}
 */
export async function commitFraudDecision(incidentId, decision, reasonCode, reports = [], decidedBy, bankCode) {
  const base = getBaseUrl();
  if (!base) {
    return { ok: false, error: 'Chronos API URL not configured (REACT_APP_CHRONOS_API_URL or REACT_APP_CHRONOS_API)' };
  }

  try {
    const url = `${base.replace(/\/$/, '')}/api/chronos/decision`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        incidentId,
        decision,
        reasonCode: reasonCode || undefined,
        reports: Array.isArray(reports) ? reports : [],
        decidedBy: decidedBy || undefined,
        bankCode: bankCode || undefined
      })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false,
        error: data?.message || data?.error || `HTTP ${res.status}`,
        data
      };
    }

    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: err.message || 'Network error',
      data: null
    };
  }
}

/**
 * @param {string} incidentId
 * @returns {Promise<{ ok: boolean, data?: any, error?: string }>}
 */
export async function getIncidentHistory(incidentId) {
  const base = getBaseUrl();
  if (!base) {
    return { ok: false, error: 'Chronos API URL not configured' };
  }

  try {
    const url = `${base.replace(/\/$/, '')}/api/chronos/incident/${encodeURIComponent(incidentId)}`;
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false,
        error: data?.message || data?.error || `HTTP ${res.status}`,
        data: null
      };
    }

    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: err.message || 'Network error',
      data: null
    };
  }
}

const normHex = (s) => String(s || '').trim().toLowerCase();

/**
 * Verify an artifact: prefers GCS re-hash via /api/docs/meta when objectPath is known
 * (Cloud Run Chronos implements meta; it does not implement verify-doc).
 * Falls back to in-memory ledger match via /api/chronos/verify-doc when objectPath is missing.
 *
 * @param {string} incidentId
 * @param {string} sha256
 * @param {string} [objectPath] - e.g. reports/{incident}/file.pdf
 * @returns {Promise<{ ok: boolean, data?: any, error?: string }>}
 */
export async function verifyDocument(incidentId, sha256, objectPath) {
  const base = getBaseUrl();
  if (!base) {
    return { ok: false, error: 'Chronos API URL not configured' };
  }

  const baseUrl = base.replace(/\/$/, '');
  const exp = normHex(sha256);
  if (!exp) {
    return { ok: false, error: 'No SHA-256 recorded for this artifact.' };
  }

  try {
    const pathTrim = String(objectPath || '').trim();
    if (pathTrim) {
      const url = `${baseUrl}/api/docs/meta?objectPath=${encodeURIComponent(pathTrim)}`;
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          ok: false,
          error: data?.error || data?.details || `HTTP ${res.status}`,
          data: null
        };
      }
      const got = normHex(data.sha256);
      if (got && got === exp) {
        return { ok: true, data: { ...data, verified: true, source: 'gcs' } };
      }
      return {
        ok: false,
        error: 'SHA256 mismatch — stored file does not match the hash on record.',
        data
      };
    }

    const params = new URLSearchParams({ incidentId, sha256 });
    const ledgerUrl = `${baseUrl}/api/chronos/verify-doc?${params.toString()}`;
    const res = await fetch(ledgerUrl);
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data?.verified || data?.ok)) {
      return { ok: true, data };
    }
    return {
      ok: false,
      error: data?.error || data?.message || `HTTP ${res.status}`,
      data: null
    };
  } catch (err) {
    return {
      ok: false,
      error: err.message || 'Network error',
      data: null
    };
  }
}

/**
 * Health check
 * @returns {Promise<{ ok: boolean, data?: any, error?: string }>}
 */
export async function checkChronosHealth() {
  const base = getBaseUrl();
  if (!base) {
    return { ok: false, error: 'Chronos API URL not configured' };
  }

  try {
    const url = `${base.replace(/\/$/, '')}/api/chronos/health`;
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return { ok: false, error: data?.message || `HTTP ${res.status}`, data };
    }

    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message || 'Network error', data: null };
  }
}

/** Export for scribe/docs upload – use same base URL */
export { getBaseUrl };
