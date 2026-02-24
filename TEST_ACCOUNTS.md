# Test Login Accounts (IT Admin & Exec)

Use these **only for testing**. Your real IT admin account is unchanged and keeps working as before.

---

## Recommended test credentials (you create these)

Create **two** test users in Firebase, then add their roles in Firestore.

### 1. Test IT Admin

| Field    | Value |
|----------|--------|
| **Email** | `itadmin@test.fraudlens.in` (or any test email you control) |
| **Password** | `Test@1234` (or any password ≥ 6 chars) |

**Role in app:** IT Admin — full dashboard, User Management, Scribe, Approve/Block, NCRP.

### 2. Test Exec (Leadership)

| Field    | Value |
|----------|--------|
| **Email** | `exec@test.fraudlens.in` (or any other test email) |
| **Password** | `Test@1234` |

**Role in app:** Leadership (Exec) — Executive dashboard only, Executive Summary reports.

---

## How to create test users (one-time)

### Step 1: Create users in Firebase Authentication

1. Open [Firebase Console](https://console.firebase.google.com/) → project **fraudlensapp**.
2. Go to **Authentication** → **Users**.
3. Click **Add user**:
   - Email: `itadmin@test.fraudlens.in` (or your chosen test IT email)
   - Password: `Test@1234`
   → Save and **copy the User UID** (e.g. `abc123...`).
4. Add user again:
   - Email: `exec@test.fraudlens.in` (or your chosen test Exec email)
   - Password: `Test@1234`
   → Save and **copy this User UID** as well.

### Step 2: Add roles in Firestore (`admin_users`)

1. In Firebase Console go to **Firestore Database**.
2. Create or open collection **`admin_users`**.
3. Add a document for the **Test IT Admin**:
   - **Document ID:** paste the **IT admin user’s UID** (from Step 1).
   - Fields:

   | Field         | Type    | Value |
   |---------------|---------|--------|
   | `email`       | string  | `itadmin@test.fraudlens.in` (same as in Auth) |
   | `displayName` | string  | `Test IT Admin` |
   | `role`        | string  | `it_admin` |
   | `approved`    | boolean | `true` |
   | `requestedRole` | string | `it_analyst` (optional) |
   | `createdAt`   | timestamp | (e.g. now) |
   | `updatedAt`   | timestamp | (e.g. now) |

4. Add a document for the **Test Exec**:
   - **Document ID:** paste the **Exec user’s UID**.
   - Fields:

   | Field         | Type    | Value |
   |---------------|---------|--------|
   | `email`       | string  | `exec@test.fraudlens.in` |
   | `displayName` | string  | `Test Exec` |
   | `role`        | string  | `exec` |
   | `approved`    | boolean | `true` |
   | `requestedRole` | string | `exec` (optional) |
   | `createdAt`   | timestamp | (e.g. now) |
   | `updatedAt`   | timestamp | (e.g. now) |

Save both documents.

---

## How to log in with test accounts

1. Open the app (e.g. `http://localhost:3000`).
2. You’ll be redirected to **Login**.
3. **Test IT Admin:**  
   - Email: `itadmin@test.fraudlens.in`  
   - Password: `Test@1234`  
   → Sign in → you land on the **main dashboard** (`/`). You can use Live Alerts, User Management, Scribe, NCRP, etc.
4. **Test Exec:**  
   - Email: `exec@test.fraudlens.in`  
   - Password: `Test@1234`  
   → Sign in → you land on the **Executive dashboard** (`/exec`). You only see analytics and Executive Summary reports.

Sign out and switch between the two to test both flows.

---

## Real IT admin

- Your **real** IT admin account is whatever account you already use (first signup or any account that has an `admin_users` doc with `approved: true` and `role: it_admin` or `it_analyst`).
- Creating the test users above **does not change** the real IT admin; you’re only adding two extra users in Auth and two extra docs in `admin_users`.
- Real IT admin continues to work as described in **FLOW.md**.

---

## Quick reference

| Account       | Email (example)           | Password  | Role    | After login  |
|---------------|---------------------------|-----------|---------|--------------|
| Test IT Admin | itadmin@test.fraudlens.in | Test@1234 | it_admin | `/` (main)   |
| Test Exec     | exec@test.fraudlens.in    | Test@1234 | exec    | `/exec`      |

Use your own test emails if you prefer; just use the same emails in Authentication and in the `admin_users` documents (and set `role` and `approved` as above).
