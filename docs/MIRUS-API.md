# Mirus NEO shift sync

Mirus NEO (`neo.mirus.ch`) is the employee portal. The web app uses **Blazor Server + SignalR** and does not expose a customer-facing shift REST API in the browser.

## Server sync (implemented)

Code lives under `apps/api/src/mirus/`:

1. HTTP login to `/Account/Login?ReturnUrl=/webapp/home` → session cookie `mirusWeb`
2. Playwright opens `/webapp/shifts/shift/{date}` with that session, expands the day detail, scrapes `Arbeitszeit` rows
3. Employees are upserted into the user-map table; **Shift rows are only written for manually mapped users**
4. Cron every 15 minutes when sync is enabled

Configure credentials in Admin → Integrationen.

On the production server:

```bash
cd apps/api && npx playwright install chromium
```

## Manual mapping workflow

1. Sync once → Mirus names appear under «Mitarbeiter zuordnen»
2. Map each person to a local user
3. Sync again → shifts appear on the Schichtplan

## Official API (future)

Request access to **Mirus HR 3.0** APIs from Mirus Software AG for a REST-based integration without Playwright.

## Selectors

See [docs/mirus-dom-selectors.md](mirus-dom-selectors.md).
