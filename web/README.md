# Kassenbon web app

Take a photo of a supermarket receipt after shopping → Gemini reads it → you check it → it is added to your
Google Sheet. Works in any browser and installs on your phone's home screen. Deployed on Vercel.

<p>
  <img src="docs/review-desktop.jpg" alt="Reviewing a scanned receipt" width="640">
  <img src="docs/receipts-mobile.jpg" alt="Receipts on a phone" width="180">
</p>

| Page | What it does |
|------|--------------|
| **Scan** | *Take photo* (opens the phone camera) or *Upload photo or PDF*. Photos are shrunk in the browser before upload. Gemini extracts store, date, items, Pfand, discounts and total; you can correct anything, and the "lines add up to the total" check updates as you type. Duplicate receipts are detected. |
| **Receipts** | Everything saved, grouped by month, with a detail view and delete. |
| **Spending** | This month vs last month, per month, per store, top products, discounts saved, open Pfand. |

Data lives in **your Google Sheet**: a `Receipts` tab (one row per receipt) and an `Items` tab (one row per
line), created automatically on first save. Open it on any device or download it as Excel
(*File → Download → Microsoft Excel*).

Only the Google accounts you list in `ALLOWED_EMAILS` can sign in.

## How it works

```
Phone/browser ──photo──▶ /api/extract ──▶ Gemini (structured JSON, retries on 503/429, fallback model)
      ▲                                         │
      └──── editable review ◀── checks (sum = total, qty × price, date) ◀──┘
      │
      └──save──▶ /api/receipts ──▶ checks again on the server ──▶ Google Sheets (service account)
```

Gemini only reads; the arithmetic checks are plain code (`lib/validation.ts`). The API key, the Sheets
credentials and all Google calls stay on the server.

## Deploy to Vercel (one-time setup, ~20 minutes)

You need a Google account, a [Vercel](https://vercel.com) account linked to GitHub, and a Gemini API key from
[Google AI Studio](https://aistudio.google.com/apikey).

### 1. Google Cloud project

1. Open [console.cloud.google.com](https://console.cloud.google.com) → create a project (e.g. "Kassenbon").
2. **APIs & Services → Library** → search **Google Sheets API** → **Enable**.

### 2. Google sign-in (OAuth client)

1. **APIs & Services → OAuth consent screen** (Google Auth Platform): choose **External**, fill in app name and
   your email. Under **Audience → Test users**, add your Gmail address. (Leaving the app in *Testing* is fine
   for personal use.)
2. **APIs & Services → Credentials → Create credentials → OAuth client ID** → type **Web application**.
3. **Authorized redirect URIs**: add `https://<your-app>.vercel.app/api/auth/callback/google`
   (you get the exact domain in step 5; you can come back and add it), and
   `http://localhost:3000/api/auth/callback/google` for local development.
4. Copy the **Client ID** and **Client secret**.

### 3. Service account for Google Sheets

1. **IAM & Admin → Service Accounts → Create service account** (any name, no roles needed).
2. Open it → **Keys → Add key → Create new key → JSON**. A file downloads. From it you need `client_email`
   and `private_key`. Keep this file private.

### 4. The spreadsheet

1. Create an empty Google Sheet (e.g. "Receipts").
2. **Share** it with the service account's `client_email` as **Editor**.
3. Copy the sheet ID from its URL: `docs.google.com/spreadsheets/d/`**`<THIS PART>`**`/edit`.

### 5. Vercel

1. [vercel.com/new](https://vercel.com/new) → import the `TxtExtract` GitHub repo.
2. **Root Directory: `web`** (important). Framework is detected as Next.js.
3. Add these **Environment Variables** (see `.env.example`):

   | Name | Value |
   |------|-------|
   | `GEMINI_API_KEY` | your Gemini key |
   | `GEMINI_MODEL` | `gemini-2.5-flash` (or the model you use) |
   | `GEMINI_FALLBACK_MODEL` | optional, e.g. `gemini-3.5-flash-lite` |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | from step 2 |
   | `ALLOWED_EMAILS` | your Gmail address (comma-separate several) |
   | `NEXTAUTH_SECRET` | output of `openssl rand -base64 32` |
   | `NEXTAUTH_URL` | your fixed Vercel domain, e.g. `https://txtextract-web.vercel.app` (from the project's **Domains**) |
   | `GOOGLE_SHEET_ID` | from step 4 |
   | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` from the JSON key |
   | `GOOGLE_PRIVATE_KEY` | `private_key` from the JSON key, pasted as is (with `-----BEGIN PRIVATE KEY-----`) |

   If Vercel picks **Application Preset: Services**, change it to **Next.js**.
4. **Deploy**. Then make sure `NEXTAUTH_URL` is your fixed domain and that
   `<NEXTAUTH_URL>/api/auth/callback/google` is in the OAuth client's redirect URIs (step 2.3). After changing
   environment variables, **Redeploy**.
5. Open the app on your phone → browser menu → **Add to Home Screen** to use it like an app.

Every push to the branch you deployed redeploys automatically.

### Troubleshooting

| Message | Fix |
|---------|-----|
| "This Google account is not allowed" | Add the address to `ALLOWED_EMAILS` and redeploy. |
| Google says `redirect_uri_mismatch` | Set `NEXTAUTH_URL` to your fixed domain, redeploy, and add exactly `<NEXTAUTH_URL>/api/auth/callback/google` to the OAuth client. Google's "error details" link shows the URI that was sent. |
| "Google Sheets refused access (403)" | Share the sheet with the service account email as Editor; check `GOOGLE_SHEET_ID`. |
| "Gemini is busy or rate-limited" | Google is overloaded; try again or set `GEMINI_FALLBACK_MODEL`. |
| "No usable Gemini model … not available (404)" | Google retired the model name; use the replacement the message suggests. |

## Local development

```bash
cd web
npm install
cp .env.example .env.local      # fill in, or use the no-Google switches below
npm run dev                     # http://localhost:3000
```

To work on the UI without any Google setup, put these in `.env.local` (they are ignored in production builds):
`AUTH_DISABLED=1`, `GEMINI_FAKE=1`, `DATA_BACKEND=memory`.

```bash
npm run lint && npm run typecheck
npm test          # unit tests (validation, Gemini retries, Sheets storage against a fake API, analytics)
npm run e2e       # browser tests on desktop and phone sizes (fake Gemini, in-memory storage)
```
