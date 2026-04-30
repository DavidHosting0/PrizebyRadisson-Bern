# PrizeBern Favur Sync (Browser Extension)

Captures Favur shift API requests in your browser and forwards them — with cookies, including HttpOnly auth cookies — to the PrizeBern hotel housekeeping backend, so the schichtplan auto-syncs every 15 minutes.

You only need to install this on **one** computer (typically a manager or admin). Once captured, the backend replays the request server-side every 15 minutes.

## Install (one-time, ~3 minutes)

### Step 1 — Get your API key

1. Open the PrizeBern admin app.
2. Go to **Integrations → Favur**.
3. Click **„API-Key erzeugen"**. Copy the long random string that appears.
   _Treat this like a password — anyone with this key can post fake shift data to your backend._

### Step 2 — Load the extension in Chrome

1. Open Chrome (or Edge, Brave, Arc — anything Chromium-based).
2. Visit `chrome://extensions`.
3. Toggle **„Developer mode"** on (top-right).
4. Click **„Load unpacked"**.
5. Select this folder: `apps/favur-extension`.
6. The extension's icon should appear in the toolbar.

### Step 3 — Configure

1. Click the extension icon in the toolbar.
2. Paste your **Backend-URL** — for production: `https://prizebern.com/api/v1`.
3. Paste the **API-Key** you copied in Step 1.
4. Click **„Speichern"**, then **„Testen"** — you should see _„Verbindung OK"_.

### Step 4 — Use Favur as normal

1. Open `https://web.favur.ch/sign-in` in the same browser.
2. Log in with your phone number + SMS code (tick **„stay logged in"** so cookies persist).
3. Navigate to wherever you see the team's shifts.
4. The extension's popup will show **„Letzter Upload: ok"** and the upload counter ticks up.
5. In PrizeBern's admin → Integrations → Favur, you'll see the captures appearing.

That's it. The backend will sync every 15 minutes from now on. If Favur logs you out (every few weeks), just log in again — the extension picks up the fresh cookies automatically.

## How it works

- Content script + injected script monkey-patch `window.fetch` and `XMLHttpRequest` on web.favur.ch and any `*.favur.ch` host.
- Every API response (JSON-shaped, non-asset) is captured along with request URL, headers, and a sample of the response body.
- The extension reads ALL cookies for `*.favur.ch` via `chrome.cookies` (including HttpOnly cookies invisible to page JS) and includes them in the upload.
- Captures are POSTed to `/favur/import` on your backend with `Authorization: Bearer <api-key>`.
- The backend AES-encrypts and stores them, auto-promotes the most "shift-like" capture to active, and replays the request every 15 minutes (with date placeholders updated).

## What's NOT collected

- This extension does NOT touch any non-favur.ch host.
- It does NOT capture form input, keystrokes, or anything outside HTTP API responses.
- Your phone number, SMS codes, and any non-cookie credentials are never read.

## Troubleshooting

**„Letzter Upload: http 401"**
The API key on the backend has been rotated. Open admin → Integrations → Favur → click „API-Key erzeugen" again, copy the new value, paste into the extension popup, click Speichern.

**„Letzter Upload: network error"**
Backend URL is wrong or the backend is down. Verify by opening the Backend-URL + `/auth/me` in your browser — should respond.

**Sync says „No active capture"**
You haven't navigated to a page in Favur that actually loads shifts yet. Open the team plan / schichtplan page in Favur once.

**Sync says „Favur returned 401 / 403"**
Favur logged you out. Open web.favur.ch, log in again, and one of the next page loads will refresh the cookies in the backend automatically.
