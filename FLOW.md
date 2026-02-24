# FraudLens Admin Panel — Flow

**Context:** Built for **HaRBInger 2025** (RBI's "Innovation for Transformation" hackathon), selected for the **Solution Development** round under *Enhancing Trust* (fraud prevention, data verification, digital identity). Reports follow **our format**: RBI Fraud Report (FMR-style), CERT-In, Executive Summary, then SOC/GDPR/ISO.

## 1. App entry and auth

- **Unauthenticated:** Opening the app redirects to **Login** (`/login`).
- **Sign up:** "Request access" → **Signup** (`/signup`). User enters name, email, password, and "I am a" (IT / Leadership / Other). Account is created; if they are **not** the first approved user, they are sent to **Pending approval** (`/pending`).
- **First signup in the system** is auto-approved as **IT Admin** and lands on the main dashboard (`/`). All later signups stay **Pending** until an IT admin approves them.

---

## 2. After login — role-based routing

- **IT Admin / IT Analyst:**  
  - Lands on **main dashboard** (`/`)  
  - Tabs: Live Alerts, Map View, IP Management, Analytics, Database Info, **User Management**  
  - Can open **Scribe Reports** (`/reports`) with all report types and scheduling  

- **Leadership (Exec), e.g. CFO/CEO:**  
  - Lands on **Executive dashboard** (`/exec`)  
  - Sees: KPIs, charts, recent fraud incidents table, link to **Reports**  
  - **Reports** (`/exec/reports`): only **Executive Summary** (and back link to Executive dashboard)  
  - No Live Alerts, Map, IP Management, or User Management  

- **Pending:**  
  - Stays on **Pending approval** (`/pending`) until an IT admin approves them.  

- **Rejected:**  
  - Sees **Access denied** on `/pending` and can only sign out.  

Trying to open a route for the other role (e.g. Exec opening `/`) redirects to that role’s home (`/` or `/exec`).

---

## 3. IT dashboard — main flows

### 3.1 Live Alerts and case review

- **Live Alerts** tab: list of transactions (search/filter by severity and status).  
- Click a row → **Case Review** panel on the right.  
- **Approve** → transaction status = approved, balances updated (payer debited, receiver credited).  
- **Block** → transaction status = blocked, balances reverted (payer credited, receiver debited).  
- If the transaction is **blocked or fraud-flagged**, **Report to NCRP** appears: opens National Cyber Crime Portal in a new tab and shows a modal with pre-filled report text to copy and paste into the portal (fast-track reporting).

### 3.2 Map, IP Management, Analytics, Database Info

- **Map View:** transactions with location on a map; filters by risk and type.  
- **IP Management:** list of IPs from `ip_logs`, block/unblock, filters.  
- **Analytics:** KPIs and charts (volume, risk distribution).  
- **Database Info:** collection counts and sample transactions.  

### 3.3 User Management (IT only)

- **User Management** tab: list of **pending** users (signed up but not yet approved/rejected).  
- Each row: email, name, requested role, requested at.  
- **Assign role:** dropdown (IT Admin / IT Analyst / Leadership (Exec)).  
- **Approve** → user’s `admin_users` doc is set to `approved: true` and chosen `role`; they can log in and see the right dashboard.  
- **Reject** → user’s doc is set `rejected: true`; they see "Access denied" on next login.  

Real IT admins are unchanged; only the listed pending users are affected.

### 3.4 Scribe Reports (IT) — autonomous flow

- **Scribe Reports** (`/reports`): full report types (RBI, CERT-In, Executive Summary, SOC, GDPR, ISO 27001), incident ID, Generate & Preview, Download, Send Email, scheduling, recent reports table.
- **Autonomous Scribe:** When an analyst **blocks** a transaction, a modal asks: **"Generate compliance reports for this incident?"** If they choose **Yes**, the app auto-generates **RBI Fraud Report**, **CERT-In Incident Report**, and **Executive Summary** and saves them to Firestore. The analyst then opens **Scribe** to send each report to the concerned authorities (IT/Compliance, Leadership). See **SCRIBE_AUTHORITIES.md** for who receives what.  

---

## 4. Executive dashboard — main flows

- **Executive dashboard** (`/exec`): KPIs, charts, recent fraud incidents table.  
- **Reports** (`/exec/reports`): only **Executive Summary**; same generate/preview/download flow, back link to Executive dashboard.  
- No approve/block, no IP/User Management, no other Scribe types.  

---

## 5. NCRP (National Cyber Crime Portal) fast-track

- **When:** A transaction is **blocked** or **fraud-flagged** (`modelDecision === true`).  
- **Where:** Case Review panel → **Report to NCRP** button.  
- **What happens:**  
  1. NCRP portal (`https://cybercrime.gov.in`) opens in a new tab.  
  2. A modal in the app shows pre-filled report text (incident ID, amount, VPAs, fraud score, IP, location, etc.).  
  3. User clicks **Copy report text** and pastes into the NCRP complaint form (min 200 characters).  
- Real IT admin (and any other user) is not changed; only the reporting flow is used.

---

## 6. Sign out

- **IT:** Header (main dashboard or Scribe) → Sign out.  
- **Exec:** Header (Executive dashboard) → Sign out.  
- After sign out, user is sent to **Login**. Real IT admin and test accounts behave the same; only session is cleared.

---

## Summary

| Role        | Home       | Main actions                                      |
|------------|------------|---------------------------------------------------|
| IT Admin   | `/`        | Alerts, Approve/Block, NCRP, Map, IP, User Mgmt, Scribe |
| IT Analyst | `/`        | Same as IT Admin                                  |
| Exec       | `/exec`    | View analytics, Executive Summary reports         |
| Pending    | `/pending` | Wait for approval                                 |
| Rejected   | `/pending` | Access denied, Sign out only                      |

Real IT admin IDs work as above; test logins (IT admin and Exec) use the same flow with test accounts created as in TEST_ACCOUNTS.md.
