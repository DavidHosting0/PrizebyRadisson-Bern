# PrizeBern Panel — Chrome Extension

Einklappbares Sidepanel für PrizeBern Housekeeping, aktiv auf allen Websites.

## Features

- Rechts andockendes Panel mit PrizeBern-Design
- Login mit denselben Zugangsdaten wie die Webapp
- Team-Chat, To-Do-/Schichtübergabe, Schichtnotizen, Beschwerden, Leihartikel

## Entwicklung

```bash
# Im Monorepo-Root
npm install
npm run build -w @housekeeping/shared
npm run dev -w @housekeeping/prize-panel-extension
```

Nach Änderungen in Chrome: `chrome://extensions` → Entwicklermodus → **Aktualisieren** (oder Extension neu laden).

**Ordner laden:** `apps/prize-panel-extension/dist`

**Download-ZIP für Nutzer:** `apps/web/public/downloads/prize-panel-extension.zip` (wird mit `npm run build:extension` erzeugt)

## Lokale API

Standard-Produktion: `https://prizebern.com/api/v1`

Für lokale Entwicklung im Panel **Einstellungen** (Zahnrad) öffnen und setzen:

```
http://localhost:3001/api/v1
```

Oder beim Build:

```bash
VITE_API_URL=http://localhost:3001/api/v1 npm run build -w @housekeeping/prize-panel-extension
```

## Production Build

```bash
npm run build:extension
```

Lädt `dist/` — in Chrome als entpackte Erweiterung installieren.

## Chrome Web Store (Auto-Update)

```bash
npm run build:extension:store
```

Upload: `apps/prize-panel-extension/chrome-web-store.zip`  
Promo tiles: `apps/prize-panel-extension/store-assets/`  
Guide: [CHROME-WEB-STORE.md](./CHROME-WEB-STORE.md)  
Privacy policy (for the listing): `https://prizebern.com/extension-privacy`

## Berechtigungen

Benutzer brauchen die jeweiligen Permissions (z. B. `SHIFT_HANDOVER_READ`, Chat, …), um Kategorien zu sehen.

## Architektur

- **Content Script** (`src/content/inject.ts`): injiziert Panel-Host + iframe auf http(s)
- **Panel** (`src/panel/`): React-App im iframe
- **Auth**: JWT in `chrome.storage.local` (getrennt von Website-`localStorage`)
