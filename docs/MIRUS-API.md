# Mirus HR API — Phase 2 integration notes

Mirus NEO (`neo.mirus.ch`) replaced Favur as the employee portal. The web app uses **Blazor Server + SignalR** and does not expose a customer-facing shift REST/GraphQL API in the browser. Phase 1 of our integration uses **DOM scraping** via the browser extension.

For a robust long-term integration, request access to **Mirus HR 3.0** APIs from Mirus Software AG.

## Contacts

- **Mirus Software AG** — Tobelmühlestrasse 11, 7270 Davos Platz
- Product: [Mirus NEO](https://mirus.ch/produkte/mirus-neo-mitarbeiterportal/)
- Favur migration notice: [favur.ch](https://www.favur.ch/) → Mirus NEO
- Example third-party integration: [Blent — Mirus HR data source](https://www.blent.io/data-sources/mirus-hr-api)

Suggested email topic: *API access for shift schedule export / integration with internal housekeeping software*.

## What to ask Mirus

1. Official API documentation for **shift / team plan** data (read-only).
2. Authentication model (OAuth2, API key, client credentials).
3. Whether Classic NEO (Echtzeit-Verbindung zum Planungssystem) is required for programmatic access.
4. Rate limits and supported date-range queries.
5. Stable employee identifiers for mapping to internal user accounts.

## Proposed implementation (when API docs available)

Mirror the existing EMMA integration pattern under `apps/api/src/mirus/`:

| Piece | Purpose |
|-------|---------|
| `mirus.module.ts` | Nest module |
| `mirus.service.ts` | Auth, fetch shifts, persist via existing `Shift` model |
| `mirus.scheduler.ts` | Cron sync every 15 min |
| Admin card | Credentials + last sync status (extend Integrations page) |

Reuse `FavurUserMap` / shift `source: 'favur'` or introduce `source: 'mirus'` if IDs differ.

## Until official API access

Server-side sync is implemented in `apps/api/src/favur/mirus-*.ts`:

1. HTTP login to `/Account/Login?ReturnUrl=/webapp/home` (ASP.NET form + antiforgery)
2. Session cookie is **`mirusWeb`** (not `.AspNetCore.Identity.Application`)
3. Authenticated fetch of `/swagger/v1/swagger.json` and shift-related REST paths (often 401 for customer accounts)
4. Shift pages are Blazor: after HTTP login, the sync opens `/webapp/shifts/shift/{date}` with the `mirusWeb` session cookies

Configure username/password in Admin → Integrationen (Basis-URL `https://neo.mirus.ch`).

On the production server, Chromium for Playwright must be available (same as Puzzel integration):

```bash
cd apps/api && npx playwright install chromium
```

## References

- HAR analysis (2026-06-29): only `/_blazor/negotiate` + WebSocket — no shift JSON endpoints.
- CSS selectors for DOM scraper: [`apps/favur-extension/mirus-dom-selectors.md`](../apps/favur-extension/mirus-dom-selectors.md)
