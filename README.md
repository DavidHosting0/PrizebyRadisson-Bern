# Housekeeping Operations Platform

**Git:** Initialize and push from **this folder** (the monorepo root with `apps/` and `package.json`). If GitHub only shows `.gitattributes`, see **[GITHUB-FIX.md](GITHUB-FIX.md)**.

Single-hotel housekeeping stack: **NestJS** API (REST + Socket.IO), **Next.js** web app, **PostgreSQL**, **S3-compatible** uploads.

## Prerequisites

- Node.js 20+
- PostgreSQL 16 (or use Docker when available)

## Setup

1. Copy environment files:

   - `apps/api/.env` from `.env.example` (repo root)
   - `apps/web/.env.local` from `apps/web/.env.local.example`

2. Install dependencies:

   ```bash
   npm install
   npm run build -w @housekeeping/shared
   ```

3. Create the database and apply migrations:

   ```bash
   cd apps/api
   npx prisma migrate deploy
   npx prisma db seed
   ```

   If you use Docker: `docker compose up -d postgres minio` then run migrations.

4. **MinIO / S3** (optional for local photo upload): start MinIO (`docker compose up -d minio`), create bucket `housekeeping`, and keep `S3_*` vars in `apps/api/.env`.

## Run (development)

```bash
npm run dev:api
npm run dev:web
```

## Production (PM2 on a shared server)

- **SSH + GitHub first-time deploy:** **[DEPLOY-SSH-GITHUB.md](DEPLOY-SSH-GITHUB.md)** (step-by-step from clone to Nginx). Example deploy directory on the server: **`/var/www/PrizeByRadissonBern`**.
- **PM2 / env / updates:** **[DEPLOY-PM2.md](DEPLOY-PM2.md)** and **[ecosystem.config.cjs](ecosystem.config.cjs)**. Use free ports (e.g. 3100/3101), set `WEB_ORIGIN` and `NEXT_PUBLIC_API_URL` for your public URLs, put Nginx in front if you serve HTTPS.

- API: `http://localhost:3001/api/v1`
- Web: `http://localhost:3000`

## Demo users (after seed)

| Role        | Email                   | Password      |
| ----------- | ----------------------- | ------------- |
| Admin       | admin@demo.local        | Password123!  |
| Housekeeper | housekeeper@demo.local  | Password123!  |
| Supervisor  | supervisor@demo.local   | Password123!  |
| Reception   | reception@demo.local    | Password123!  |

## PWA

`apps/web/public/manifest.json` is registered in the root layout. Add icons and a service worker later for installability.

**Web push (optional):** configure VAPID keys in the API, register a service worker on the web app, and subscribe with the Notifications API; wire urgent `service_request` Socket.IO events to `registration.showNotification` when the page is in the background.

## Webhooks / realtime

Socket.IO namespace `/operations` broadcasts `room.status_updated`, `service_request.*`, and checklist events. The reception floor view subscribes and refreshes room data.
