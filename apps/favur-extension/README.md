# PrizeBern Schichtplan Sync (Browser Extension)

**Optional** — for legacy **Favur** (`web.favur.ch`) only.

**Mirus NEO** (`neo.mirus.ch`) is synced **server-side**: enter username/password in Admin → Integrations. No extension required.

## Mirus NEO (recommended)

1. Admin → **Integrations → Schichtplan**
2. Basis-URL: `https://neo.mirus.ch`
3. Enter **Mirus Benutzername** and **Passwort**, save
4. Enable sync — cron runs every 15 minutes; use **Jetzt synchronisieren** to test

The API logs in via HTTP, tries the authenticated Swagger API, and falls back to headless browser scraping if needed.

## Legacy Favur extension install

1. Admin → generate API key
2. `chrome://extensions` → Load unpacked → `apps/favur-extension`
3. Configure backend URL + API key
4. Log in to `web.favur.ch` and open shift plan

See [docs/MIRUS-API.md](../docs/MIRUS-API.md) for future official Mirus HR API integration.
