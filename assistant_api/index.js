require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const { BigQuery } = require('@google-cloud/bigquery');
const { VertexAI } = require('@google-cloud/vertexai');
const crypto = require('crypto');
const { GoogleAuth } = require('google-auth-library');
const {
  createRemoteJWKSet,
  jwtVerify,
  errors: JoseErrors
} = require('jose');

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

const FIREBASE_PROJECT_ID = (process.env.FIREBASE_PROJECT_ID || '').trim();
const REQUIRE_AUTH = (process.env.REQUIRE_AUTH || 'true').trim().toLowerCase() !== 'false';

const VERTEX_PROJECT_ID = (process.env.VERTEX_PROJECT_ID || process.env.GCP_PROJECT_ID || '').trim();
const VERTEX_LOCATION = (process.env.VERTEX_LOCATION || 'asia-south1').trim();
/**
 * Prefer current GA Gemini 2.5 IDs (see Model Garden). Older numbered IDs (gemini-1.5-*-002,
 * gemini-2.0-flash-001) are often retired or unavailable for new billing/API setups.
 */
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
const VERTEX_EMBED_MODEL = (process.env.VERTEX_EMBED_MODEL || 'text-embedding-004').trim();

/** Gemini Live (bidirectional) WebSocket region — often must be us-central1 even if embeddings use another region */
const VERTEX_LIVE_LOCATION = (process.env.VERTEX_LIVE_LOCATION || 'us-central1').trim();
/**
 * GA Live model (text + multimodal). Older `gemini-2.0-flash-live-preview-*` often returns close 1008 when retired.
 * Docs: gemini-live-2.5-flash-native-audio (inputs include text).
 */
let VERTEX_LIVE_MODEL = (process.env.VERTEX_LIVE_MODEL || 'gemini-live-2.5-flash-native-audio').trim();
if (!VERTEX_LIVE_MODEL || VERTEX_LIVE_MODEL.endsWith('-')) {
  console.warn(
    '[Live] VERTEX_LIVE_MODEL missing or looks truncated (trailing hyphen); using gemini-live-2.5-flash-native-audio'
  );
  VERTEX_LIVE_MODEL = 'gemini-live-2.5-flash-native-audio';
}

const CHRONOS_API_BASE = (process.env.CHRONOS_API_BASE || '').trim().replace(/\/$/, '');

const BQ_PROJECT_ID = (process.env.BQ_PROJECT_ID || '').trim();
const BQ_DATASET = (process.env.BQ_DATASET || '').trim();
const BQ_ARTIFACTS_TABLE = (process.env.BQ_ARTIFACTS_TABLE || 'doc_artifacts').trim();
const BQ_CHUNKS_TABLE = (process.env.BQ_CHUNKS_TABLE || 'rag_chunks').trim();
const BQ_FACTS_TABLE = (process.env.BQ_FACTS_TABLE || 'incident_facts').trim();
const ENABLE_VECTOR_SEARCH = (process.env.ENABLE_VECTOR_SEARCH || 'true').trim().toLowerCase() !== 'false';
/** Set VERTEX_ASSISTANT_NO_JSON_MIME=true if Vertex returns errors on responseMimeType for your model/region. */
const VERTEX_ASSISTANT_JSON_MIME =
  (process.env.VERTEX_ASSISTANT_NO_JSON_MIME || '').trim().toLowerCase() !== 'true';

const bigquery = BQ_PROJECT_ID ? new BigQuery({ projectId: BQ_PROJECT_ID }) : null;
const vertex = VERTEX_PROJECT_ID ? new VertexAI({ project: VERTEX_PROJECT_ID, location: VERTEX_LOCATION }) : null;
const gAuth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

/** Firebase ID tokens are RS256; must use JWK metadata (not x509 PEM) or jose throws "JSON Web Key Set malformed". */
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/robot/v1/metadata/jwk/securetoken@system.gserviceaccount.com')
);

function sha256Hex(s) {
  return crypto.createHash('sha256').update(String(s || ''), 'utf8').digest('hex');
}

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
    if (REQUIRE_AUTH) throw new Error('Missing Authorization bearer token.');
    return { uid: null, token: null };
  }

  try {
    return await verifyFirebaseIdTokenString(token);
  } catch (e) {
    if (e instanceof JoseErrors.JWTExpired) throw new Error('Token expired.');
    throw new Error('Invalid token.');
  }
}

function vertexLiveServiceUrl() {
  const host = `${VERTEX_LIVE_LOCATION}-aiplatform.googleapis.com`;
  return `wss://${host}/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`;
}

async function getGcpAccessToken() {
  const client = await gAuth.getClient();
  const tok = await client.getAccessToken();
  const accessToken = typeof tok === 'string' ? tok : tok?.token;
  if (!accessToken) throw new Error('Failed to acquire GCP access token for Live API.');
  return accessToken;
}

/**
 * WebSocket proxy: browser <-> this server <-> Vertex Gemini Live (Bidi).
 * Client flow: send {"flAuth":"<firebase_jwt>"} (if REQUIRE_AUTH), receive {"flReady":true,"config":{...}}, then send Vertex Live JSON frames.
 */
function attachLiveWebSocketProxy(server) {
  /** perMessageDeflate off: fewer edge-case drops through proxies / Cloud Run. */
  const wss = new WebSocket.Server({ noServer: true, perMessageDeflate: false });

  server.on('upgrade', (request, socket, head) => {
    try {
      const host = request.headers.host || 'localhost';
      const u = new URL(request.url || '/', `http://${host}`);
      if (u.pathname !== '/api/assistant/live') {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket, head, (clientWs) => {
        handleLiveClient(clientWs);
      });
    } catch (err) {
      console.error('Live WS upgrade error', err);
      socket.destroy();
    }
  });
}

function handleLiveClient(clientWs) {
  let upstream = null;
  let authed = !REQUIRE_AUTH;
  let upstreamOpening = false;
  const pendingToVertex = [];

  /** Cloud Run throttles CPU when “idle”; ping keeps the connection warm and satisfies L7 idle timeouts. */
  const pingMs = Math.max(5000, Number(process.env.LIVE_WS_PING_MS || 20000));
  const pingTimer = setInterval(() => {
    if (clientWs.readyState === WebSocket.OPEN) {
      try {
        clientWs.ping();
      } catch (_) {
        // ignore
      }
    }
  }, pingMs);

  const safeCloseClient = (code, reason) => {
    try {
      if (upstream && upstream.readyState === WebSocket.OPEN) upstream.close();
    } catch (_) {
      // ignore
    }
    try {
      clearInterval(pingTimer);
    } catch (_) {
      // ignore
    }
    try {
      clientWs.close(code, reason);
    } catch (_) {
      // ignore
    }
  };

  const flushPendingToVertex = () => {
    if (!upstream || upstream.readyState !== WebSocket.OPEN) return;
    while (pendingToVertex.length) {
      const t = pendingToVertex.shift();
      try {
        upstream.send(t);
      } catch (e) {
        console.error('Live upstream send failed', e);
        break;
      }
    }
  };

  const attachUpstream = () => {
    if (upstream || upstreamOpening) return;
    if (!VERTEX_PROJECT_ID) {
      clientWs.send(JSON.stringify({ flError: 'VERTEX_PROJECT_ID not configured for Live API.' }));
      safeCloseClient(1011, 'config');
      return;
    }
    upstreamOpening = true;
    getGcpAccessToken()
      .then((accessToken) => {
        const serviceUrl = vertexLiveServiceUrl();
        const up = new WebSocket(serviceUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`
          },
          perMessageDeflate: false
        });
        upstream = up;
        upstreamOpening = false;

        up.on('open', () => {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(
              JSON.stringify({
                flReady: true,
                config: {
                  projectId: VERTEX_PROJECT_ID,
                  location: VERTEX_LIVE_LOCATION,
                  model: VERTEX_LIVE_MODEL
                }
              })
            );
          }
          flushPendingToVertex();
        });

        up.on('message', (data, isBinary) => {
          if (clientWs.readyState !== WebSocket.OPEN) return;
          if (isBinary) {
            clientWs.send(data);
          } else {
            clientWs.send(data.toString());
          }
        });

        up.on('error', (err) => {
          console.error('Live upstream error', err);
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ flError: err.message || 'Upstream WebSocket error' }));
          }
        });

        up.on('close', (code, buf) => {
          const reasonStr = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf || '');
          if (clientWs.readyState === WebSocket.OPEN) {
            if (code && code !== 1000) {
              try {
                clientWs.send(
                  JSON.stringify({
                    flError: `Vertex Live closed (${code})${reasonStr ? `: ${reasonStr.slice(0, 500)}` : ''}`
                  })
                );
              } catch (_) {
                // ignore
              }
            }
            try {
              clearInterval(pingTimer);
            } catch (_) {
              // ignore
            }
            try {
              const ok =
                typeof code === 'number' && code >= 1000 && code < 5000 && code !== 1005 && code !== 1006;
              const outCode = ok ? code : 1011;
              const r = reasonStr.replace(/\0/g, '').slice(0, 123);
              clientWs.close(outCode, r || undefined);
            } catch (_) {
              try {
                clientWs.terminate();
              } catch (_) {
                // ignore
              }
            }
          }
        });
      })
      .catch((err) => {
        upstreamOpening = false;
        console.error('Live token/upstream failed', err);
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({ flError: err.message || 'Failed to connect to Vertex Live' }));
        }
        safeCloseClient(1011, 'upstream');
      });
  };

  clientWs.on('message', async (buf) => {
    const text = buf.toString();
    if (!authed) {
      let msg;
      try {
        msg = JSON.parse(text);
      } catch {
        safeCloseClient(1008, 'invalid json');
        return;
      }
      const jwt = typeof msg.flAuth === 'string' ? msg.flAuth.trim() : '';
      if (!jwt) {
        safeCloseClient(1008, 'flAuth required');
        return;
      }
      try {
        await verifyFirebaseIdTokenString(jwt);
        authed = true;
      } catch (e) {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({ flError: e.message || 'Auth failed' }));
        }
        safeCloseClient(1008, 'auth');
        return;
      }
      attachUpstream();
      return;
    }

    if (!upstream || upstream.readyState !== WebSocket.OPEN) {
      pendingToVertex.push(text);
      if (!upstream && !upstreamOpening) attachUpstream();
      else if (upstream && upstream.readyState === WebSocket.CONNECTING) {
        /* wait for open; flushPendingToVertex runs in upstream "open" */
      } else if (!upstreamOpening) attachUpstream();
      return;
    }
    upstream.send(text);
  });

  clientWs.on('close', () => {
    try {
      clearInterval(pingTimer);
    } catch (_) {
      // ignore
    }
    try {
      if (upstream && upstream.readyState === WebSocket.OPEN) upstream.close();
    } catch (_) {
      // ignore
    }
  });

  clientWs.on('error', (err) => {
    console.error('Live client error', err);
  });

  if (authed) {
    attachUpstream();
  }
}

async function embedText(text) {
  if (!VERTEX_PROJECT_ID) throw new Error('Vertex AI not configured (VERTEX_PROJECT_ID missing).');
  const client = await gAuth.getClient();
  const token = await client.getAccessToken();
  const accessToken = typeof token === 'string' ? token : token?.token;
  if (!accessToken) throw new Error('Failed to acquire GCP access token for embeddings.');

  const url = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${VERTEX_PROJECT_ID}/locations/${VERTEX_LOCATION}/publishers/google/models/${VERTEX_EMBED_MODEL}:predict`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      instances: [{ content: String(text || '') }]
    })
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(body || 'Vertex embedding error');
  }
  const data = await resp.json();
  const values = data?.predictions?.[0]?.embeddings?.values;
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('Embedding response missing values.');
  }
  return values;
}

/** Client sends { role: 'user'|'assistant', content }; Vertex uses role 'model' for assistant. */
function sanitizeChatHistory(raw) {
  const items = [];
  for (const h of (Array.isArray(raw) ? raw : []).slice(-20)) {
    if (!h || typeof h !== 'object') continue;
    const roleIn = String(h.role || '').toLowerCase();
    const role =
      roleIn === 'assistant' || roleIn === 'model' ? 'model' : roleIn === 'user' ? 'user' : null;
    let content = String(h.content || '').trim();
    if (!role || !content) continue;
    if (content.length > 8000) content = content.slice(0, 8000);
    items.push({ role, parts: [{ text: content }] });
  }
  while (items.length && items[0].role !== 'user') items.shift();
  const merged = [];
  for (const it of items) {
    if (merged.length && merged[merged.length - 1].role === it.role) {
      merged[merged.length - 1].parts[0].text += `\n\n${it.parts[0].text}`;
    } else {
      merged.push({ role: it.role, parts: [{ text: it.parts[0].text }] });
    }
  }
  return merged;
}

/**
 * Gemini sometimes wraps JSON in ```json fences or adds a preamble. Never throw — chat must always get a 200 + body.
 */
function parseAssistantModelJson(rawText) {
  let s = String(rawText || '').trim();
  if (!s) return { answer: '(No answer)', citations: [] };

  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();

  const tryParse = (t) => {
    try {
      return JSON.parse(t);
    } catch {
      return null;
    }
  };

  let parsed = tryParse(s);
  if (parsed && typeof parsed === 'object') {
    return {
      answer: String(parsed.answer ?? '').trim() || s,
      citations: Array.isArray(parsed.citations) ? parsed.citations : []
    };
  }

  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) {
    parsed = tryParse(s.slice(start, end + 1));
    if (parsed && typeof parsed === 'object') {
      return {
        answer: String(parsed.answer ?? '').trim() || s.slice(start, end + 1),
        citations: Array.isArray(parsed.citations) ? parsed.citations : []
      };
    }
    console.error('Assistant model JSON parse (substring) failed; returning plain text answer.');
    return { answer: s, citations: [] };
  }

  console.error('Assistant model output not valid JSON; returning plain text answer.');
  return { answer: s, citations: [] };
}

async function generateAnswer({ question, facts, passages, history, audience }) {
  if (!vertex) throw new Error('Vertex AI not configured (VERTEX_PROJECT_ID missing).');
  const modelCandidates = [
    ...new Set([...VERTEX_GEMINI_MODELS, VERTEX_GEMINI_MODEL, ...VERTEX_GEMINI_FALLBACKS])
  ].filter(Boolean);

  const aud = audience === 'exec' ? 'exec' : 'analyst';
  const audienceRules =
    aud === 'exec'
      ? [
          'Audience: executive reader. Open with 1–2 plain sentences (the “so what”).',
          'Add at most 3 short bullets only if needed. Avoid internal field names and raw JSON paths.',
          'Prefer everyday language; define acronyms once if you use them.'
        ]
      : [
          'Audience: fraud analyst. Use clear short bullets with labels when listing drivers or checks.',
          'Stay conversational; avoid sounding like a database dump or error template.'
        ];

  const toneRules = [
    'Write naturally, like chat. If the question is very short or vague but an incidentId is present in context, interpret charitably for that incident and state your assumption in one short phrase.',
    'If you cannot answer, give one helpful clarifying question instead of only saying the question is incomplete.',
    'For probabilities/scores between 0 and 1 in facts, also give a percentage with at most one decimal (e.g. 99.5%).',
    'Round noisy floats to sensible precision; do not paste 10+ decimal places.',
    'Prefer “blocked / allowed / high risk” phrasing over “model decision was true”.'
  ];

  const system = [
    'You are FraudLens Assistant for an RBI-regulated entity.',
    'You answer questions from IT teams and executives about fraud incidents.',
    ...audienceRules,
    ...toneRules,
    'Rules:',
    '- Ground answers ONLY in the provided facts and retrieved passages. If something is missing, say so briefly.',
    '- Output MUST be a single valid JSON object with keys: answer (string), citations (array).',
    '- citations entries: incidentId, reportType, objectPath, sha256, fileUrl (null when unknown).',
    '- Cite real report objectPath/sha256 from passages when possible; do not invent paths like contextFacts.incident.*.',
    '- The answer string may use line breaks; do not use markdown code fences.',
    '- Output no text outside that one JSON object.'
  ].join('\n');

  const context = {
    facts: facts || null,
    passages: Array.isArray(passages) ? passages : []
  };

  const finalUserText = [
    system,
    '',
    'Context JSON:',
    JSON.stringify(context, null, 2),
    '',
    'Question:',
    String(question || '').trim()
  ].join('\n');

  const hist = sanitizeChatHistory(history);
  const contents = [...hist, { role: 'user', parts: [{ text: finalUserText }] }];

  const temperature = aud === 'exec' ? 0.48 : 0.42;
  const maxOutputTokens = 2048;

  let resp;
  let lastErr = null;
  for (const m of modelCandidates) {
    try {
      const model = vertex.getGenerativeModel({ model: m });
      resp = await model.generateContent({
        contents,
        generationConfig: {
          temperature,
          maxOutputTokens,
          ...(VERTEX_ASSISTANT_JSON_MIME ? { responseMimeType: 'application/json' } : {})
        }
      });
      break;
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
  if (!resp) {
    throw lastErr || new Error('All Vertex model candidates failed.');
  }

  const text =
    resp?.response?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('Model returned empty output.');

  return parseAssistantModelJson(trimmed);
}

function bqTableRef(tableName) {
  return `\`${BQ_PROJECT_ID}.${BQ_DATASET}.${tableName}\``;
}

function chunkText(text, maxChars = 1200, overlap = 120) {
  const s = String(text || '').replace(/\r\n/g, '\n');
  const parts = s.split(/\n{2,}/g).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let buf = '';

  const flush = () => {
    const v = buf.trim();
    if (v) chunks.push(v);
    buf = '';
  };

  for (const p of parts) {
    if ((buf + '\n\n' + p).length <= maxChars) {
      buf = buf ? buf + '\n\n' + p : p;
      continue;
    }
    flush();
    if (p.length <= maxChars) {
      buf = p;
      continue;
    }
    // Hard split long paragraphs
    let i = 0;
    while (i < p.length) {
      const end = Math.min(i + maxChars, p.length);
      chunks.push(p.slice(i, end));
      i = Math.max(end - overlap, end);
    }
  }
  flush();
  return chunks.slice(0, 60); // safety bound per document
}

function requireBigQuery() {
  if (!bigquery || !BQ_PROJECT_ID || !BQ_DATASET) {
    const msg =
      'BigQuery not configured. Set BQ_PROJECT_ID and BQ_DATASET (and create tables) on the Assistant API.';
    const err = new Error(msg);
    err.statusCode = 400;
    throw err;
  }
}

async function retrievePassages({ question, incidentId }) {
  if (!bigquery || !BQ_PROJECT_ID || !BQ_DATASET) return [];

  const q = String(question || '').slice(0, 5000);

  try {
    if (ENABLE_VECTOR_SEARCH) {
      const qEmb = await embedText(q);
      const params = {
        incidentId: incidentId || null,
        qEmb
      };
      const chunksTable = bqTableRef(BQ_CHUNKS_TABLE);
      // BigQuery: TABLE (subquery) is invalid for VECTOR_SEARCH — use a bare parenthesized subquery when filtering.
      const sql = incidentId
        ? `
        SELECT
          incidentId, reportType, objectPath, sha256, fileUrl, chunkText,
          distance
        FROM VECTOR_SEARCH(
          (SELECT * FROM ${chunksTable} WHERE incidentId = @incidentId),
          'embedding',
          @qEmb,
          top_k => 8
        )
      `
        : `
        SELECT
          incidentId, reportType, objectPath, sha256, fileUrl, chunkText,
          distance
        FROM VECTOR_SEARCH(
          TABLE ${chunksTable},
          'embedding',
          @qEmb,
          top_k => 8
        )
      `;
      const [rows] = await bigquery.query({ query: sql, params });
      return (rows || []).map((r) => ({
        incidentId: r.incidentId || null,
        reportType: r.reportType || null,
        objectPath: r.objectPath || null,
        sha256: r.sha256 || null,
        fileUrl: r.fileUrl || null,
        text: r.chunkText || ''
      }));
    }

    const params = { incidentId: incidentId || null, q: q.slice(0, 500) };
    const sql = incidentId
      ? `
        SELECT incidentId, reportType, objectPath, sha256, fileUrl, chunkText
        FROM ${bqTableRef(BQ_CHUNKS_TABLE)}
        WHERE incidentId = @incidentId AND LOWER(chunkText) LIKE CONCAT('%', LOWER(@q), '%')
        ORDER BY updatedAt DESC
        LIMIT 6
      `
      : `
        SELECT incidentId, reportType, objectPath, sha256, fileUrl, chunkText
        FROM ${bqTableRef(BQ_CHUNKS_TABLE)}
        WHERE LOWER(chunkText) LIKE CONCAT('%', LOWER(@q), '%')
        ORDER BY updatedAt DESC
        LIMIT 6
      `;
    const [rows] = await bigquery.query({ query: sql, params });
    return (rows || []).map((r) => ({
      incidentId: r.incidentId || null,
      reportType: r.reportType || null,
      objectPath: r.objectPath || null,
      sha256: r.sha256 || null,
      fileUrl: r.fileUrl || null,
      text: r.chunkText || ''
    }));
  } catch (e) {
    // Non-fatal; fall back to provided context only
    console.error('BigQuery retrieval failed (non-fatal)', e.message || e);
    return [];
  }
}

async function retrieveFacts({ incidentId }) {
  if (!bigquery || !incidentId || !BQ_PROJECT_ID || !BQ_DATASET) return null;
  const sql = `
    SELECT * FROM ${bqTableRef(BQ_FACTS_TABLE)}
    WHERE incidentId = @incidentId
    ORDER BY updatedAt DESC
    LIMIT 1
  `;
  try {
    const [rows] = await bigquery.query({ query: sql, params: { incidentId } });
    return rows?.[0] || null;
  } catch (e) {
    console.error('BigQuery facts fetch failed (non-fatal)', e.message || e);
    return null;
  }
}

function tryExactAnswerFromFacts(question, factsRow) {
  if (!factsRow || !question) return null;
  const q = String(question).toLowerCase();
  const out = [];

  const has = (s) => q.includes(s);

  if (has('amount') || has('inr') || has('₹') || has('rs') || has('rupee')) {
    if (factsRow.amount != null) out.push(`Amount: ₹${Number(factsRow.amount).toLocaleString('en-IN')}`);
  }
  if (has('status') || has('blocked') || has('approved') || has('pending')) {
    if (factsRow.status) out.push(`Status: ${factsRow.status}`);
  }
  if (has('fraud score') || has('fraudscore') || has('risk score') || has('score')) {
    if (factsRow.fraudScore != null) out.push(`Fraud score: ${Number(factsRow.fraudScore)}`);
  }
  if (has('ncrp') || has('i4c') || has('cybercrime')) {
    if (factsRow.ncrpStatus) out.push(`NCRP status: ${factsRow.ncrpStatus}`);
  }
  if (has('model decision') || has('modeldecision') || has('ml decision') || has('decision')) {
    if (factsRow.modelDecision != null) out.push(`Model decision: ${factsRow.modelDecision ? 'FRAUD' : 'SAFE'}`);
  }
  if (has('timestamp') || has('time') || has('when')) {
    if (factsRow.timestamp) out.push(`Incident time: ${factsRow.timestamp}`);
  }

  if (out.length === 0) return null;
  return out.join('\n');
}

app.get('/api/assistant/health', (req, res) => {
  res.json({
    ok: true,
    service: 'assistant',
    requireAuth: REQUIRE_AUTH,
    firebaseProjectId: FIREBASE_PROJECT_ID || null,
    vertex: {
      projectId: VERTEX_PROJECT_ID || null,
      location: VERTEX_LOCATION || null,
      model: VERTEX_GEMINI_MODEL
    },
    live: {
      path: '/api/assistant/live',
      vertexLiveLocation: VERTEX_LIVE_LOCATION,
      vertexLiveModel: VERTEX_LIVE_MODEL
    },
    bigquery: {
      projectId: BQ_PROJECT_ID || null,
      dataset: BQ_DATASET || null,
      artifactsTable: BQ_ARTIFACTS_TABLE,
      chunksTable: BQ_CHUNKS_TABLE,
      factsTable: BQ_FACTS_TABLE
    },
    chronosApiBase: CHRONOS_API_BASE || null
  });
});

app.post('/api/assistant/chat', async (req, res) => {
  try {
    const { question, mode, incidentId, providedContext, history, audience } = req.body || {};
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'question is required' });
    }

    const authInfo = await verifyFirebaseIdToken(req);

    const safeMode = mode === 'global' ? 'global' : 'incident';
    const safeIncidentId = safeMode === 'incident' ? String(incidentId || '').trim() : '';
    const safeAudience = audience === 'exec' ? 'exec' : 'analyst';
    const rawHistory = Array.isArray(history) ? history : [];

    const contextFacts = {};
    if (providedContext?.incident) {
      contextFacts.incident = providedContext.incident;
      contextFacts.incidentHash = sha256Hex(JSON.stringify(providedContext.incident));
    }
    if (Array.isArray(providedContext?.reports)) {
      contextFacts.reports = providedContext.reports.map((r) => ({
        reportId: r.reportId,
        reportType: r.reportType,
        incidentId: r.incidentId,
        status: r.status,
        generatedAt: r.generatedAt,
        gcsObjectPath: r.gcsObjectPath,
        gcsSha256: r.gcsSha256,
        gcsPath: r.gcsPath
      }));
    }

    const bqFacts = safeIncidentId ? await retrieveFacts({ incidentId: safeIncidentId }) : null;
    if (bqFacts) contextFacts.bigQueryFacts = bqFacts;

    // Deterministic exact answers when possible (single-turn only — follow-ups need model + tone).
    if (safeIncidentId && bqFacts && rawHistory.length === 0) {
      const exact = tryExactAnswerFromFacts(question, bqFacts);
      if (exact) {
        return res.json({
          answer: exact,
          citations: [
            {
              incidentId: safeIncidentId,
              reportType: 'Incident facts (BigQuery)',
              objectPath: null,
              sha256: null,
              fileUrl: null
            }
          ]
        });
      }
    }

    const bqPassages = await retrievePassages({ question, incidentId: safeIncidentId || null });

    // Always include provided report text passages first (precise incident scope)
    const passages = [];
    if (safeIncidentId && Array.isArray(providedContext?.reports)) {
      for (const r of providedContext.reports) {
        if (!r?.content) continue;
        passages.push({
          incidentId: r.incidentId || safeIncidentId,
          reportType: r.reportType || null,
          objectPath: r.gcsObjectPath || null,
          sha256: r.gcsSha256 || null,
          fileUrl:
            CHRONOS_API_BASE && r.gcsObjectPath
              ? `${CHRONOS_API_BASE}/api/docs/file?objectPath=${encodeURIComponent(r.gcsObjectPath)}`
              : null,
          text: String(r.content || '').slice(0, 30000)
        });
      }
    }
    for (const p of bqPassages) passages.push(p);

    // Deduplicate citations by objectPath+sha256
    const citationMap = new Map();
    for (const p of passages) {
      const k = `${p.objectPath || ''}::${p.sha256 || ''}::${p.reportType || ''}`;
      if (!citationMap.has(k)) {
        citationMap.set(k, {
          incidentId: p.incidentId || safeIncidentId || null,
          reportType: p.reportType || null,
          objectPath: p.objectPath || null,
          sha256: p.sha256 || null,
          fileUrl: p.fileUrl || null
        });
      }
    }

    const modelResp = await generateAnswer({
      question,
      facts: {
        mode: safeMode,
        incidentId: safeIncidentId || null,
        user: { uid: authInfo.uid },
        contextFacts
      },
      passages: passages.map((p) => ({
        incidentId: p.incidentId || null,
        reportType: p.reportType || null,
        objectPath: p.objectPath || null,
        sha256: p.sha256 || null,
        fileUrl: p.fileUrl || null,
        text: p.text || ''
      })),
      history: rawHistory,
      audience: safeAudience
    });

    const answer = String(modelResp?.answer || '').trim() || '(No answer)';
    const citations = Array.isArray(modelResp?.citations)
      ? modelResp.citations
      : Array.from(citationMap.values());

    return res.json({ answer, citations });
  } catch (err) {
    console.error('Assistant chat failed', err);
    return res.status(500).json({ error: err.message || 'Assistant error' });
  }
});

app.post('/api/assistant/ingest/report', async (req, res) => {
  try {
    await verifyFirebaseIdToken(req);
    requireBigQuery();

    const { incidentId, reportType, reportId, objectPath, gcsPath, sha256, content, source, contentType } = req.body || {};
    if (!incidentId || !reportType || typeof content !== 'string') {
      return res.status(400).json({ error: 'incidentId, reportType, content are required' });
    }
    const safeIncidentId = String(incidentId).trim();
    const safeReportType = String(reportType).trim();
    const safeObjectPath = objectPath ? String(objectPath).trim() : null;
    const safeGcsPath = gcsPath ? String(gcsPath).trim() : null;
    const safeSha = sha256 ? String(sha256).trim() : null;
    const safeReportId = reportId ? String(reportId).trim() : null;
    const safeContentType = contentType ? String(contentType).trim() : 'application/pdf';

    // Insert artifact metadata (best-effort). This is useful even before chunking is complete.
    try {
      await bigquery.dataset(BQ_DATASET).table(BQ_ARTIFACTS_TABLE).insert(
        [
          {
            artifactId: safeObjectPath || safeReportId || `${safeIncidentId}:${safeReportType}:${safeSha || ''}`,
            incidentId: safeIncidentId,
            reportType: safeReportType,
            reportId: safeReportId,
            objectPath: safeObjectPath,
            gcsPath: safeGcsPath,
            sha256: safeSha,
            contentType: safeContentType,
            fileUrl:
              CHRONOS_API_BASE && safeObjectPath
                ? `${CHRONOS_API_BASE}/api/docs/file?objectPath=${encodeURIComponent(safeObjectPath)}`
                : null,
            updatedAt: new Date().toISOString()
          }
        ],
        { ignoreUnknownValues: true }
      );
    } catch (e) {
      console.error('Artifacts insert failed (non-fatal)', e.message || e);
    }

    const chunks = chunkText(content, 1400, 140);
    const rows = [];
    for (let i = 0; i < chunks.length; i++) {
      const text = chunks[i];
      const emb = await embedText(text);
      rows.push({
        chunkId: `${safeIncidentId}:${safeReportType}:${safeReportId || 'na'}:${i}:${sha256Hex(text).slice(0, 12)}`,
        incidentId: safeIncidentId,
        reportType: safeReportType,
        reportId: safeReportId,
        objectPath: safeObjectPath,
        sha256: safeSha,
        fileUrl:
          CHRONOS_API_BASE && safeObjectPath
            ? `${CHRONOS_API_BASE}/api/docs/file?objectPath=${encodeURIComponent(safeObjectPath)}`
            : null,
        source: source || 'firestore_report',
        chunkIndex: i,
        chunkText: text,
        embedding: emb,
        updatedAt: new Date().toISOString()
      });
    }

    await bigquery.dataset(BQ_DATASET).table(BQ_CHUNKS_TABLE).insert(rows, { ignoreUnknownValues: true });
    return res.status(201).json({ ok: true, inserted: rows.length });
  } catch (err) {
    const status = err.statusCode || 500;
    console.error('Ingest report failed', err);
    return res.status(status).json({ error: err.message || 'ingest error' });
  }
});

app.post('/api/assistant/ingest/facts', async (req, res) => {
  try {
    await verifyFirebaseIdToken(req);
    requireBigQuery();

    const { incidentId, facts } = req.body || {};
    if (!incidentId || typeof facts !== 'object' || !facts) {
      return res.status(400).json({ error: 'incidentId and facts object are required' });
    }
    const safeIncidentId = String(incidentId).trim();
    const row = {
      incidentId: safeIncidentId,
      amount: facts.amount != null ? Number(facts.amount) : null,
      currency: facts.currency != null ? String(facts.currency) : null,
      status: facts.status != null ? String(facts.status) : null,
      fraudScore: facts.fraudScore != null ? Number(facts.fraudScore) : null,
      modelDecision: facts.modelDecision != null ? Boolean(facts.modelDecision) : null,
      ncrpStatus: facts.ncrpStatus != null ? String(facts.ncrpStatus) : null,
      timestamp: facts.timestamp != null ? String(facts.timestamp) : null,
      factsJson: JSON.stringify(facts),
      updatedAt: new Date().toISOString()
    };
    await bigquery.dataset(BQ_DATASET).table(BQ_FACTS_TABLE).insert([row], { ignoreUnknownValues: true });
    return res.status(201).json({ ok: true });
  } catch (err) {
    const status = err.statusCode || 500;
    console.error('Ingest facts failed', err);
    return res.status(status).json({ error: err.message || 'ingest error' });
  }
});

const server = http.createServer(app);
attachLiveWebSocketProxy(server);
server.listen(port, () => {
  console.log(`Assistant API listening on port ${port} (HTTP + WS /api/assistant/live)`);
});

