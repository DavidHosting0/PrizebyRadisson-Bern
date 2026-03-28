# Deploy on a server with PM2 (alongside other apps)

This stack is two Node processes: **NestJS API** + **Next.js web**. Run them on **ports that do not conflict** with your existing PM2 apps (example below uses **3101** and **3100**).

## 1. Server prerequisites

- Node.js 20+
- PostgreSQL (local or remote) and a database + user for this project
- Optional: MinIO or S3-compatible storage for photo uploads
- Nginx (or Caddy) in front, if you serve HTTPS and multiple sites on 80/443

## 2. Clone and install (production)

```bash
cd /var/www
git clone <your-repo> PrizeByRadissonBern
cd PrizeByRadissonBern
npm ci
npm run build -w @housekeeping/shared
```

## 3. Environment files

**API — `apps/api/.env`**

- `DATABASE_URL` — production Postgres URL  
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — long random strings  
- `PORT` — e.g. `3101` (must match what PM2 / Nginx expect)  
- `WEB_ORIGIN` — public origin of the **web** app (scheme + host, no path), e.g. `https://hk.example.com`  
- `S3_*` — if you use presigned uploads in production  

**Web — build-time public API URL**

Next.js inlines `NEXT_PUBLIC_*` at **`next build` time**. Before building:

- Set `NEXT_PUBLIC_API_URL` to the **browser-reachable** API base, e.g.  
  `https://hk.example.com/api/v1` **if** Nginx proxies `/api` to the API, **or**  
  `https://api-hk.example.com/api/v1` if the API is on a separate host.

Create `apps/web/.env.production`:

```bash
NEXT_PUBLIC_API_URL=https://YOUR_PUBLIC_API_BASE/api/v1
```

If the API is only exposed as `https://hk.example.com/api/v1` behind Nginx, use exactly that URL so the browser and Socket.IO client hit the same host (and enable WebSocket upgrade for `/socket.io`).

## 4. Build

```bash
cd /var/www/PrizeByRadissonBern
npm run prisma:generate -w @housekeeping/api
npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma
# optional: npx prisma db seed --schema=apps/api/prisma/schema.prisma

npm run build -w @housekeeping/api
npm run build -w @housekeeping/web
```

Adjust `ecosystem.config.cjs` **ports** (`args: 'start -p 3100'` and `PORT` in API `.env`) so they do not clash with other PM2 apps.

## 5. Start with PM2

From the **repo root**:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # follow instructions so processes survive reboot
```

Useful commands:

```bash
pm2 logs housekeeping-api
pm2 logs housekeeping-web
pm2 restart ecosystem.config.cjs
```

## 6. Nginx sketch (one server, one domain)

Example: web on `/`, API under `/api`, WebSocket for Socket.IO:

- Proxy `location /api/` → `http://127.0.0.1:3101/api/` (strip or pass path consistently with how Nest expects `/api/v1`).  
- The Nest app uses global prefix `api/v1`, so often you want:  
  - `location /api/ { proxy_pass http://127.0.0.1:3101; }`  
  and `NEXT_PUBLIC_API_URL=https://hk.example.com/api/v1` only if your Nginx maps `/api` → backend root correctly (test with `curl`).

- Proxy `location /socket.io/` → same upstream as API (Socket.IO), with headers:

  `proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`

- Next.js: `proxy_pass http://127.0.0.1:3100;` for `/`.

Exact Nginx snippets depend on path layout; verify with your other vhosts.

## 7. Socket.IO / CORS

- `WEB_ORIGIN` on the API must match the **browser origin** of the Next app (e.g. `https://hk.example.com`).  
- If the web app calls the API on the **same origin** via Nginx, CORS is simpler; if it calls another subdomain, add that origin to `WEB_ORIGIN` (comma-separated).

## 8. One instance for the API (recommended for WebSockets)

Keep **`instances: 1`** for `housekeeping-api` unless you add a Redis Socket.IO adapter and sticky sessions. The included [ecosystem.config.cjs](ecosystem.config.cjs) uses a single fork.

## 9. Updates after code pull

```bash
git pull
npm ci
npm run build -w @housekeeping/shared
npm run build -w @housekeeping/api
npm run build -w @housekeeping/web   # set NEXT_PUBLIC_* before build if URL changed
npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma
pm2 restart ecosystem.config.cjs
```

If your **public URL** for the API changes, rebuild the web app with the new `NEXT_PUBLIC_API_URL` and restart `housekeeping-web`.
