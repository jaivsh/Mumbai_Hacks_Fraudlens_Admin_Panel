# Listing FraudLens Assistant API on APIX (and similar marketplaces)

This service is a standard **HTTPS JSON API** on **Cloud Run**. Marketplaces usually want: **OpenAPI**, **base URL**, **auth model**, **rate limits**, and **support contact**.

## Bundle to upload

- **OpenAPI 3 spec:** `assistant_api/openapi.yaml`  
  Replace `servers[0].url` with your production Cloud Run URL (HTTPS).

## How auth works today

- **Production (recommended):** `Authorization: Bearer <Firebase ID token>`  
  Same Firebase project as the FraudLens admin dashboard (`FIREBASE_PROJECT_ID` on the service).
- **Development only:** `REQUIRE_AUTH=false` on Cloud Run (do **not** use on a public marketplace listing).

APIX consumers may not use Firebase directly. Typical patterns:

1. **Gateway pattern:** Expose a stable **API key** at an API Gateway / Apigee layer that maps to your internal Firebase-backed flow, **or**
2. **Partner JWT:** Issue your own short-lived tokens after partner onboarding (requires a small auth service change).

Document whichever pattern you choose in the marketplace “Authentication” section.

## “Real time” — what this API actually does

- **Chat:** Each message is a **single HTTP POST**; the UI feels instant, but there is **no WebSocket or server-sent events** in this codebase.
- **Cross-user “live” updates:** If an IT user blocks a transaction, an exec does **not** get a push notification from the Assistant API. They see new data when **Firestore updates the UI** and when the next **ingest** runs (facts/reports → BigQuery) and the next **chat** query runs.
- **Ingest:** Happens when the dashboard calls ingest endpoints (e.g. after actions/reports). It is **not** a continuous broadcast channel.

If APIX or a bank asks for “real-time streaming,” that would be a **separate** feature (WebSocket/SSE or Firebase listeners only in the frontend).

## Dashboard users: will IT / Exec “just work” after signup?

**If all of this is true, yes:**

| Requirement | Why |
|-------------|-----|
| User exists in **Firebase Auth** | Chat sends a Bearer token from `auth.currentUser`. |
| Document `admin_users/{uid}` with `approved: true` and `role` in `it_admin` / `it_analyst` / `exec` | App routing uses this; without approval they stay on pending. |
| `REACT_APP_ASSISTANT_API` points to your **HTTPS** Cloud Run URL | Widget calls that host. |
| Cloud Run has correct **env** (`FIREBASE_PROJECT_ID`, Vertex, BigQuery, etc.) | Otherwise chat returns 500. |
| CORS | Current service uses open `cors()`; tighten to your dashboard origins before public listing. |

**Demo mode** (`AuthContext` local demo session, no Firebase user): the Assistant is **blocked** unless you set `REACT_APP_ASSISTANT_ALLOW_DEMO=true` **and** run the API with `REQUIRE_AUTH=false` — **lab only**.

## Production hardening before a public marketplace

- Set **CORS** allowlist to your dashboard origins only.
- Keep **`REQUIRE_AUTH=true`**.
- Add **rate limiting** (Cloud Armor, API Gateway, or Apigee).
- Do **not** embed secrets in the frontend; only public config (`REACT_APP_*` URLs, Firebase config).

## OpenAPI server URL

After deploy:

```bash
# Example: set in openapi.yaml under servers:
# url: https://assistant-api-xxxxx-xx.a.run.app
```

Upload the edited file to APIX with your product description and SLA/support contacts.
