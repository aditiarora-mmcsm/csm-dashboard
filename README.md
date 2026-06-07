# MM CSM Dashboard – Shared Multi-User Setup

This project wraps the existing single-file dashboard in a Next.js application backed by Supabase (PostgreSQL + Auth) and deploys to Vercel.

---

## Architecture

```
Browser → Vercel (Next.js) → Supabase (PostgreSQL + Auth + Realtime)
```

| Layer | Technology | What it does |
|---|---|---|
| Frontend | Existing `dashboard_v2.html` | All UI, unchanged |
| Bridge | `public/data-bridge.js` | Syncs localStorage ↔ Supabase, enforces roles |
| Auth | Supabase + Google OAuth | Login, session, domain restriction |
| Database | Supabase PostgreSQL | All shared data, RLS policies |
| Hosting | Vercel | Serves the app, runs auth middleware |

---

## Roles

| Role | Can do |
|---|---|
| **admin** | Upload CSVs · Edit all data · Manage users · Generate reports |
| **spoc** | View own merchants · Add/edit pipeline entries · Add MoMs/action items · Update account status |
| **leadership** | View-only · All dashboards · Filter by month/product/SPOC/merchant |

---

## Step 1 – Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) → **New project**
2. Choose a name (e.g. `csm-dashboard`), set a strong DB password, pick **Asia South 1 (Mumbai)**
3. Wait ~2 min for the project to provision

---

## Step 2 – Run the Database Schema

In Supabase Dashboard → **SQL Editor** → **New Query**:

1. Paste the contents of `supabase/migrations/001_schema.sql` → **Run**
2. Paste the contents of `supabase/migrations/002_rls_policies.sql` → **Run**

---

## Step 3 – Configure Google OAuth

1. Go to **Authentication → Providers → Google** in Supabase Dashboard
2. Toggle **Enable Google provider** ON
3. Go to [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services → Credentials**
4. Create an **OAuth 2.0 Client ID** (Web application)
5. Add Authorised redirect URI:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```
   (Also add `http://localhost:3000/auth/callback` for local dev)
6. Copy the **Client ID** and **Client Secret** back into Supabase
7. In Supabase → **Authentication → URL Configuration**, set:
   - **Site URL**: `https://your-app.vercel.app`
   - **Redirect URLs**: `https://your-app.vercel.app/auth/callback`

---

## Step 4 – Add Your Dashboard File

Copy your existing dashboard file to the `public/` folder **and rename it**:

```bash
cp /path/to/dashboard_v2.html public/dashboard.html
```

> The file must be named exactly `dashboard.html`.

---

## Step 5 – Deploy to Vercel

### Option A – Vercel CLI (recommended)

```bash
npm install -g vercel
vercel login
vercel --prod
```

### Option B – Vercel Dashboard

1. Push this project to a GitHub/GitLab repo
2. Go to [vercel.com](https://vercel.com) → **Add New Project**
3. Import the repo → Framework: **Next.js** → Deploy

---

## Step 6 – Set Environment Variables in Vercel

In Vercel → Project Settings → **Environment Variables**, add:

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon / public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role key ⚠️ keep secret |
| `NEXT_PUBLIC_SITE_URL` | Your Vercel deployment URL, e.g. `https://csm-dashboard.vercel.app` |
| `NEXT_PUBLIC_ALLOWED_DOMAIN` | `razorpay.com` |

Redeploy after adding vars.

---

## Step 7 – Create the First Admin User

1. Open `https://your-app.vercel.app` → sign in with your Razorpay Google account
2. In Supabase → **Table Editor → users**, find your row
3. Set `role` to `admin`

That's it – you're now an admin. All subsequent users default to `spoc` until you promote them.

---

## Step 8 – Invite Your Team

Share the app URL. Anyone with a `@razorpay.com` Google account can sign in. They'll default to the `spoc` role. Promote users in the `users` table as needed.

---

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Copy environment file
cp .env.local.example .env.local
# Fill in your Supabase URL, anon key, and service role key

# 3. Run dev server
npm run dev
# Open http://localhost:3000
```

---

## How Data Sync Works

```
User edits data in dashboard
    ↓
localStorage.setItem("csm_etb_ntb", ...)  ← intercepted by data-bridge.js
    ↓
Supabase: dashboard_store.upsert({ key: "csm_etb_ntb", value: {...} })
    ↓
Supabase Realtime broadcasts the change
    ↓
All other open browser sessions receive it
    ↓
Their localStorage is updated → dashboard re-renders
```

---

## Project Structure

```
csm-dashboard/
├── public/
│   ├── dashboard.html        ← YOUR DASHBOARD FILE (copy here)
│   └── data-bridge.js        ← Supabase sync layer (injected at runtime)
├── app/
│   ├── page.tsx              ← Redirects to /dashboard
│   ├── layout.tsx
│   ├── auth/
│   │   ├── login/page.tsx    ← Google OAuth login page
│   │   └── callback/route.ts ← OAuth callback handler
│   └── dashboard/
│       └── route.ts          ← Serves dashboard.html with bridge injected
├── lib/
│   ├── supabase/
│   │   ├── client.ts         ← Browser Supabase client
│   │   └── server.ts         ← Server Supabase client (+ admin)
│   └── types.ts              ← TypeScript types
├── supabase/migrations/
│   ├── 001_schema.sql        ← All 10 tables
│   └── 002_rls_policies.sql  ← Row Level Security
├── middleware.ts             ← Auth guard + domain restriction
├── next.config.mjs
├── package.json
└── .env.local.example
```

---

## Troubleshooting

**"dashboard.html not found"**
→ Make sure you copied your file to `public/dashboard.html` (exact name).

**"Only @razorpay.com accounts are authorised"**
→ The logged-in Google account is not a Razorpay email. Use your work account.

**Data not syncing to other users**
→ Check Supabase → Realtime is enabled for the `dashboard_store` table (run `002_rls_policies.sql` again if unsure).

**SPOC filter not auto-setting**
→ In the `users` table, set `spoc_name` to the exact SPOC label used in the CSV (e.g. `"Priya Sharma"` not `"priya.sharma@razorpay.com"`).

**I want to make someone an admin**
→ Supabase → Table Editor → `users` → find their row → edit `role` to `admin`.
