require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { VertexAI } = require('@google-cloud/vertexai');
const { createRemoteJWKSet, jwtVerify, errors: JoseErrors } = require('jose');
const admin = require('firebase-admin');

const {
  PROMPT_TEMPLATES,
  REPORT_RECIPIENTS,
  buildSubject,
  AUTO_REPORT_TYPES,
  listReportTypes
} = require('./lib/reportFormats');

const app = express();
const port = process.env.PORT || 8080;
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: '2mb' }));

/** Public OpenAPI for marketplaces (Swagger Editor, APIX import). */
app.get('/openapi.yaml', (req, res) => {
  const specPath = path.join(__dirname, 'openapi.yaml');
  if (!fs.existsSync(specPath)) {
    return res.status(404).type('text/plain').send('openapi.yaml not bundled in this build.');
  }
  res.type('application/yaml').send(fs.readFileSync(specPath, 'utf8'));
});

/** One-click: opens Swagger Editor with this service’s spec pre-loaded. */
app.get('/docs', (req, res) => {
  const host = req.get('x-forwarded-host') || req.get('host') || '';
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
  const specUrl = encodeURIComponent(`${proto}://${host}/openapi.yaml`);
  res.redirect(302, `https://editor.swagger.io/?url=${specUrl}`);
});

const FIREBASE_PROJECT_ID = (process.env.FIREBASE_PROJECT_ID || '').trim();
const REQUIRE_AUTH = (process.env.REQUIRE_AUTH || 'true').trim().toLowerCase() !== 'false';

const VERTEX_PROJECT_ID = (process.env.VERTEX_PROJECT_ID || process.env.GCP_PROJECT_ID || '').trim();
const VERTEX_LOCATION = (process.env.VERTEX_LOCATION || 'asia-south1').trim();
const VERTEX_GEMINI_MODEL = (process.env.VERTEX_GEMINI_MODEL || 'gemini-2.5-flash').trim();
const VERTEX_GEMINI_MODELS = String(process.env.VERTEX_GEMINI_MODELS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const VERTEX_GEMINI_FALLBACKS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
  'gemini-2.5-flash-preview-09-2025',
  'gemini-2.0-flash-001',
  'gemini-2.0-flash-lite-001'
];

const CHRONOS_API_BASE = (process.env.CHRONOS_API_BASE || '').trim().replace(/\/$/, '');
const ASSISTANT_API_BASE = (process.env.ASSISTANT_API_BASE || '').trim().replace(/\/$/, '');

/** Persist to Firestore when admin is initialized and client does not set persist:false */
const ENABLE_FIRESTORE_DEFAULT =
  (process.env.ENABLE_FIRESTORE || 'true').trim().toLowerCase() !== 'false';

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/robot/v1/metadata/jwk/securetoken@system.gserviceaccount.com')
);

const vertex = VERTEX_PROJECT_ID ? new VertexAI({ project: VERTEX_PROJECT_ID, location: VERTEX_LOCATION }) : null;

let firestoreReady = false;
function initFirestore() {
  if (!ENABLE_FIRESTORE_DEFAULT || !FIREBASE_PROJECT_ID) return null;
  try {
    if (!admin.apps.length) {
      admin.initializeApp({ projectId: FIREBASE_PROJECT_ID });
    }
    firestoreReady = true;
    return admin.firestore();
  } catch (e) {
    console.warn('[scribe] Firestore init skipped:', e.message || e);
    return null;
  }
}

const db = initFirestore();

async function verifyFirebaseIdTokenString(token) {
  if (!FIREBASE_PROJECT_ID) {
    throw new Error('Server misconfigured: FIREBASE_PROJECT_ID is required to verify tokens.');
  }
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    audience: FIREBASE_PROJECT_ID
  });
  return { uid: payload.user_id || payload.sub || null, token, payload };
}

async function verifyFirebaseIdToken(req) {
  const auth = String(req.headers.authorization || '');
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1]?.trim();

  if (!token) {
    if (REQUIRE_AUTH) {
      const e = new Error('Missing Authorization bearer token.');
      e.statusCode = 401;
      throw e;
    }
    return { uid: null, token: null };
  }

  try {
    return await verifyFirebaseIdTokenString(token);
  } catch (e) {
    const err = new Error(e instanceof JoseErrors.JWTExpired ? 'Token expired.' : 'Invalid token.');
    err.statusCode = 401;
    throw err;
  }
}

async function generateReportText(prompt) {
  if (!vertex) throw new Error('Vertex AI not configured (VERTEX_PROJECT_ID missing).');

  const modelCandidates = [...new Set([...VERTEX_GEMINI_MODELS, VERTEX_GEMINI_MODEL, ...VERTEX_GEMINI_FALLBACKS])].filter(
    Boolean
  );

  let lastErr = null;
  for (const m of modelCandidates) {
    try {
      const model = vertex.getGenerativeModel({ model: m });
      const resp = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 8192
        }
      });
      const text =
        resp?.response?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
      const trimmed = String(text || '').trim();
      if (trimmed) return trimmed;
      throw new Error('Model returned empty output.');
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message || e);
      const notFound =
        /NOT_FOUND/i.test(msg) ||
        /was not found/i.test(msg) ||
        (/404/i.test(msg) && /models\//i.test(msg));
      if (notFound) continue;
      throw e;
    }
  }
  throw lastErr || new Error('All Vertex model candidates failed.');
}

async function loadIncident({ incidentId, incidentData }) {
  if (incidentData && typeof incidentData === 'object') {
    const id = String(incidentData.id || incidentId || '').trim();
    return { id: id || 'inline', data: { ...incidentData, id: id || incidentData.id } };
  }
  const id = String(incidentId || '').trim();
  if (!id) {
    throw Object.assign(new Error('Provide incidentId (Firestore) or incidentData (JSON object).'), {
      statusCode: 400
    });
  }
  if (!db) {
    throw Object.assign(
      new Error('Firestore not available; pass incidentData in the request body or configure Firebase Admin on Cloud Run.'),
      { statusCode: 400 }
    );
  }
  const snap = await db.collection('transactions').doc(id).get();
  if (!snap.exists) {
    throw Object.assign(new Error(`No incident found for ID ${id}.`), { statusCode: 404 });
  }
  return { id, data: { id: snap.id, ...snap.data() } };
}

async function persistReport({
  reportType,
  incidentId,
  content,
  recipients,
  subject
}) {
  if (!db) return null;
  const ref = await db.collection('scribe_reports').add({
    reportType,
    incidentId,
    content,
    recipients,
    subject,
    generatedAt: admin.firestore.FieldValue.serverTimestamp(),
    status: 'draft',
    source: 'scribe_api'
  });
  return ref.id;
}

async function chronosUpload({ incidentId, reportType, content }) {
  if (!CHRONOS_API_BASE) return null;
  const resp = await fetch(`${CHRONOS_API_BASE}/api/docs/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ incidentId, reportType, content })
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Chronos upload failed: ${resp.status} ${t?.slice(0, 500)}`);
  }
  const data = await resp.json();
  if (data?.gcsPath && data?.sha256 && data?.objectPath) {
    return { gcsPath: data.gcsPath, sha256: data.sha256, objectPath: data.objectPath };
  }
  return null;
}

async function patchFirestoreGcs(reportDocId, gcs) {
  if (!db || !reportDocId || !gcs) return;
  await db.collection('scribe_reports').doc(reportDocId).update({
    gcsPath: gcs.gcsPath,
    gcsObjectPath: gcs.objectPath,
    gcsSha256: gcs.sha256,
    gcsUploadedAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

async function assistantIngest({ authHeader, body }) {
  if (!ASSISTANT_API_BASE) return;
  const r = await fetch(`${ASSISTANT_API_BASE}/api/assistant/ingest/report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const t = await r.text();
    console.warn('[scribe] Assistant ingest non-OK:', r.status, t?.slice(0, 300));
  }
}

async function runGenerate(req, opts) {
  const authInfo = opts.preAuth || (await verifyFirebaseIdToken(req));
  const {
    reportType,
    incidentId: bodyIncidentId,
    incidentData,
    persist,
    uploadToChronos,
    ingestToAssistant
  } = opts;

  if (!reportType || typeof reportType !== 'string') {
    throw Object.assign(new Error('reportType is required'), { statusCode: 400 });
  }
  if (!PROMPT_TEMPLATES[reportType]) {
    throw Object.assign(new Error(`Unknown reportType. Use GET /api/scribe/report-types for allowed values.`), {
      statusCode: 400
    });
  }

  const { id: resolvedIncidentId, data: incidentPayload } = await loadIncident({
    incidentId: bodyIncidentId,
    incidentData
  });

  const promptTemplate = PROMPT_TEMPLATES[reportType];
  const prompt = promptTemplate.replace('{incident_data}', JSON.stringify(incidentPayload, null, 2));

  const reportText = await generateReportText(prompt);
  const recipientsList = REPORT_RECIPIENTS[reportType] || [];
  const subject = buildSubject(reportType, resolvedIncidentId);

  let reportId = null;
  const shouldPersist =
    Boolean(db) &&
    persist !== false &&
    (persist === true || (persist === undefined && ENABLE_FIRESTORE_DEFAULT));
  if (shouldPersist) {
    reportId = await persistReport({
      reportType,
      incidentId: resolvedIncidentId,
      content: reportText,
      recipients: recipientsList,
      subject
    });
  }

  let gcs = null;
  const doChronos = uploadToChronos !== false && CHRONOS_API_BASE;
  if (doChronos) {
    try {
      gcs = await chronosUpload({
        incidentId: resolvedIncidentId,
        reportType,
        content: reportText
      });
      if (gcs && reportId) await patchFirestoreGcs(reportId, gcs);
    } catch (e) {
      console.error('[scribe] Chronos upload failed', e.message || e);
      if (opts.failOnChronosError) throw e;
    }
  }

  const doIngest = ingestToAssistant !== false && ASSISTANT_API_BASE && gcs;
  if (doIngest) {
    const authHeader = req.headers.authorization || '';
    try {
      await assistantIngest({
        authHeader,
        body: {
          incidentId: resolvedIncidentId,
          reportType,
          reportId,
          objectPath: gcs.objectPath,
          gcsPath: gcs.gcsPath,
          sha256: gcs.sha256,
          contentType: 'application/pdf',
          content: reportText,
          source: 'firestore_report'
        }
      });
    } catch (e) {
      console.warn('[scribe] Assistant ingest failed (non-fatal)', e.message || e);
    }
  }

  return {
    reportId,
    reportType,
    subject,
    recipients: recipientsList,
    incidentId: resolvedIncidentId,
    content: reportText,
    gcs,
    generatedBy: { uid: authInfo.uid }
  };
}

app.get('/api/scribe/health', (req, res) => {
  res.json({
    ok: true,
    service: 'fraudlens-scribe-api',
    requireAuth: REQUIRE_AUTH,
    firebaseProjectId: FIREBASE_PROJECT_ID || null,
    firestore: Boolean(db && firestoreReady),
    vertex: {
      projectId: VERTEX_PROJECT_ID || null,
      location: VERTEX_LOCATION || null,
      model: VERTEX_GEMINI_MODEL
    },
    chronosApiBase: CHRONOS_API_BASE || null,
    assistantApiBase: ASSISTANT_API_BASE || null
  });
});

app.get('/api/scribe/report-types', async (req, res) => {
  try {
    await verifyFirebaseIdToken(req);
  } catch (e) {
    if (REQUIRE_AUTH) return res.status(401).json({ error: e.message || 'Unauthorized' });
  }
  res.json({
    reportTypes: listReportTypes(),
    autoReportTypes: AUTO_REPORT_TYPES
  });
});

app.post('/api/scribe/generate', async (req, res) => {
  try {
    const out = await runGenerate(req, req.body || {});
    res.json(out);
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error('Scribe generate failed', err);
    res.status(status).json({ error: err.message || 'Scribe error' });
  }
});

app.post('/api/scribe/generate/batch', async (req, res) => {
  try {
    const preAuth = await verifyFirebaseIdToken(req);
    const { reportTypes, ...rest } = req.body || {};
    const types = Array.isArray(reportTypes) && reportTypes.length ? reportTypes : AUTO_REPORT_TYPES;
    const results = [];
    const errors = [];
    for (const reportType of types) {
      try {
        const out = await runGenerate(req, {
          ...rest,
          reportType,
          preAuth,
          failOnChronosError: false
        });
        results.push(out);
      } catch (e) {
        errors.push({ reportType, error: e.message || String(e) });
      }
    }
    res.json({ results, errors });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error('Scribe batch failed', err);
    res.status(status).json({ error: err.message || 'Scribe error' });
  }
});

app.listen(port, () => {
  console.log(`Scribe API listening on port ${port}`);
});
