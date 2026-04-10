# Demo / test accounts (do not commit real passwords)

**Do not store real passwords in this repository.** Create users in your own Firebase project and keep credentials in a password manager or team vault.

## One-click demo on the login page

The **Demo — IT Admin** / **Demo — Exec** buttons call `signInWithEmailAndPassword` using env vars (Create React App reads these at `npm start` / build time):

| Variable | Purpose |
|----------|---------|
| `REACT_APP_DEMO_IT_EMAIL` | Email for IT demo user |
| `REACT_APP_DEMO_IT_PASSWORD` | Password for IT demo user |
| `REACT_APP_DEMO_EXEC_EMAIL` | Email for Exec demo user (separate account with `role: exec` in `admin_users`) |
| `REACT_APP_DEMO_EXEC_PASSWORD` | Password for Exec demo user |

Add these to the **repo root** `.env` (not committed). After changing them, restart `npm start`.

**Offline preview** links on the same card still use the old fake session (no Firebase user) — Assistant Live will not work there.

## Option A — Use the app Sign up flow (recommended)

1. Open your deployed (or local) FraudLens app → **Sign up** with a dedicated test email, e.g. `fraudlens-demo-it@<your-domain>` and `fraudlens-demo-exec@<your-domain>`.
2. In **Firebase Console → Authentication**, confirm the users exist.
3. In **Firestore**, create or update documents:

   Collection: `admin_users`  
   Document ID: **the user’s Firebase `uid`** (from Authentication user list)

   **IT demo user example fields:**

   ```json
   {
     "approved": true,
     "role": "it_admin",
     "email": "fraudlens-demo-it@your-domain.com"
   }
   ```

   **Exec demo user example fields:**

   ```json
   {
     "approved": true,
     "role": "exec",
     "email": "fraudlens-demo-exec@your-domain.com"
   }
   ```

4. Sign in as each user and open **Live Alerts** or **Executive** view → **Ask Assistant**.

## Option B — Create user in Firebase Console

1. Firebase Console → **Authentication** → **Add user** → set email + password.
2. Copy the new user’s **UID**.
3. Add `admin_users/{uid}` as in Option A.

## Assistant API checklist for those accounts

- Frontend: `REACT_APP_ASSISTANT_API=https://<your-assistant-cloud-run-url>`  
- Cloud Run: `FIREBASE_PROJECT_ID=<same as dashboard Firebase project>`  
- Cloud Run: `REQUIRE_AUTH=true`  
- Do **not** rely on `REACT_APP_ASSISTANT_ALLOW_DEMO` in production.

## Quick API test (with a real ID token)

After signing in on the dashboard, you can copy a short-lived token from browser devtools (Application → IndexedDB / or call `auth.currentUser.getIdToken()` in console) and run:

```bash
curl -sS "https://YOUR-ASSISTANT-URL/api/assistant/health"

curl -sS -X POST "https://YOUR-ASSISTANT-URL/api/assistant/chat" \
  -H "Authorization: Bearer YOUR_FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question":"What incidents do we have?","mode":"global"}'
```

Replace URL and token. Tokens expire (~1 hour); refresh for longer tests.
