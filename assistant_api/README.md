# FraudLens Assistant API (Cloud Run)

Backend service for the dashboard chatbot:

- Verifies **Firebase ID tokens** (JWT) using public signing keys
- Uses **Vertex AI (Gemini)** to generate answers
- Uses **BigQuery vector search** for enterprise retrieval (optional until tables exist)
- Returns **audit-friendly citations** (incidentId, reportType, objectPath, sha256, fileUrl)

## Endpoints

- `GET /api/assistant/health`
- `POST /api/assistant/chat` — optional `history` (prior `{role, content}` turns) and `audience` (`analyst` | `exec`) for tone; multi-turn skips deterministic exact-match shortcut so follow-ups stay conversational.
- `POST /api/assistant/ingest/report`
- `POST /api/assistant/ingest/facts`
- **WebSocket** `GET /api/assistant/live` — bidirectional proxy to **Vertex Gemini Live API** (`LlmBidiService/BidiGenerateContent`).  
  - If `REQUIRE_AUTH=true` (default): first client frame must be `{"flAuth":"<Firebase ID token>"}`.  
  - Then client sends Vertex Live JSON (`setup`, `client_content`, etc.); server forwards to Google and relays responses.

### Live API env vars

- `VERTEX_LIVE_LOCATION` (default `us-central1`) — Live WebSocket host region; often **must** be `us-central1` even if batch Vertex uses another region.
- `VERTEX_LIVE_MODEL` (default **`gemini-live-2.5-flash-native-audio`** — GA Live on Vertex; supports **text** I/O. Do not use a truncated value ending in `live-preview-` or Vertex closes with **1008**.)

### Cloud Run

Use a **long enough request timeout** for WebSocket sessions (e.g. 3600s where supported). The dashboard **Live** tab connects with `wss://` derived from `REACT_APP_ASSISTANT_API`.

**WebSockets / Live:** Cloud Run’s default **CPU throttling** (CPU only while “handling a request”) often drops idle sockets and the browser shows close **1005**. Deploy with **`--no-cpu-throttling`** (CPU always allocated while the instance runs) and keep **`--session-affinity`**. Optional: **`LIVE_WS_PING_MS`** (default 20000) sets server→client WebSocket ping interval.

## Required env vars

### Auth

- `FIREBASE_PROJECT_ID` (Firebase project where Auth lives)
- `REQUIRE_AUTH` (default `true`)

### Vertex AI

- `VERTEX_PROJECT_ID` (GCP project hosting Vertex AI)
- `VERTEX_LOCATION` (e.g. `asia-south1`)
- `VERTEX_GEMINI_MODEL` (e.g. GA `gemini-2.5-flash` in us-central1; older `gemini-1.5-*-002` / `gemini-2.0-flash-001` may 404 if retired for your project)
- `VERTEX_EMBED_MODEL` (e.g. `text-embedding-004`)

### BigQuery (for RAG + facts)

- `BQ_PROJECT_ID`
- `BQ_DATASET`
- `BQ_CHUNKS_TABLE` (default `rag_chunks`)
- `BQ_FACTS_TABLE` (default `incident_facts`)
- `ENABLE_VECTOR_SEARCH` (default `true`)

### Evidence links

- `CHRONOS_API_BASE` (e.g. `https://chronos-api-...run.app`)

## BigQuery schema

Create tables + vector index using:

- `sql/schema.sql`

## Frontend wiring

Set in the React app:

- `REACT_APP_ASSISTANT_API=https://<assistant-cloud-run-url>`

Then the floating **Ask Assistant** widget appears in both IT and Executive dashboards.

## APIX / partner docs

- OpenAPI 3: `openapi.yaml` (set `servers[0].url` to your Cloud Run URL before upload)
- Marketplace checklist: `APIX_MARKETPLACE.md`
- Demo users (no passwords in repo): `DEMO_TEST_ACCOUNTS.md`

