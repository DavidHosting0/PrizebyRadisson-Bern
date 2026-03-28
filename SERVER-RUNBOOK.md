# Run Prize by Radisson Bern on a server (with other projects already running)

This guide assumes:

- **Ubuntu** (or similar Linux), SSH access  
- **PM2** already used for other apps  
- **Nginx** on ports **80/443**  
- **PostgreSQL** available (you already had `:5432` listening)  
- **GitHub repo:** `https://github.com/DavidHosting0/PrizebyRadisson-Bern`  
- **Deploy directory:** `/var/www/PrizeByRadissonBern`  
- **App ports:** **3100** (Next.js web) and **3101** (NestJS API) — these did **not** conflict with your earlier scan (**3000**, **4000**, **5000**). **Re-check** before going live: `sudo ss -tlnp | grep -E ':3100|:3101'`

Other projects are **unchanged**: this stack adds **two new PM2 processes** and **one new Nginx `server` block** (new `server_name` / subdomain).

---

## 1. SSH and prerequisites

```bash
ssh user@your-server-ip
node -v    # expect 20+
npm -v
pm2 -v
git --version
nginx -v   # if you terminate TLS with Nginx
```

---

## 2. Avoid port clashes

List what is already listening:

```bash
sudo ss -tlnp | sort
pm2 list
```

Reserve **3100** and **3101** for this project. If either is taken, pick two free ports (e.g. **3110** / **3111**) and use them everywhere: `apps/api/.env` (`PORT`), `ecosystem.config.cjs` (Next `start -p`), and Nginx `proxy_pass`.

---

## 3. Clone the repo (separate folder from other apps)

Do **not** put this inside `mensom` or another project’s folder. Use a **dedicated** directory:

```bash
sudo mkdir -p /var/www/PrizeByRadissonBern
sudo chown "$USER:$USER" /var/www/PrizeByRadissonBern
cd /var/www/PrizeByRadissonBern

git clone https://github.com/DavidHosting0/PrizebyRadisson-Bern.git .
git checkout main
```

SSH clone (if you use deploy keys):

```bash
git clone git@github.com:DavidHosting0/PrizebyRadisson-Bern.git .
```

---

## 4. Install dependencies and build shared package

```bash
cd /var/www/PrizeByRadissonBern
npm ci
npm run build -w @housekeeping/shared
```

If `npm ci` fails (no lockfile), use `npm install` once.

---

## 5. PostgreSQL database

**One PostgreSQL server can host many databases.** Your other projects keep their existing DBs; this app only needs a **new database** (and usually a **new user**) on the same Postgres instance on port `5432` — you do **not** need a second PostgreSQL installation.

Create a dedicated DB and user (names are examples; adjust passwords):

```bash
sudo -u postgres psql
```

```sql
CREATE USER prize_hk WITH PASSWORD 'STRONG_PASSWORD_HERE';
CREATE DATABASE prize_hk OWNER prize_hk;
GRANT ALL PRIVILEGES ON DATABASE prize_hk TO prize_hk;
\c prize_hk
GRANT ALL ON SCHEMA public TO prize_hk;
\q
```

Connection string for `DATABASE_URL`:

`postgresql://prize_hk:STRONG_PASSWORD_HERE@127.0.0.1:5432/prize_hk`

---

## 6. API environment: `apps/api/.env`

```bash
nano /var/www/PrizeByRadissonBern/apps/api/.env
```

Minimum:

```env
DATABASE_URL=postgresql://prize_hk:STRONG_PASSWORD_HERE@127.0.0.1:5432/prize_hk
JWT_ACCESS_SECRET=long_random_string_min_32_chars
JWT_REFRESH_SECRET=another_long_random_string
PORT=3101
WEB_ORIGIN=https://your-domain.com
```

- **`PORT`** — API listen port (default **3101**).  
- **`WEB_ORIGIN`** — Exact origin of the **website** (scheme + host, **no path**), e.g. `https://hk.yourdomain.com`. For testing with IP only: `http://SERVER_IP:3100` until DNS + HTTPS exist.  
- **S3 / MinIO** — Add `S3_*` from `.env.example` if you use real photo uploads.

Save and exit.

---

## 7. Web environment: `apps/web/.env.production`

**Must exist before `next build`** — `NEXT_PUBLIC_*` is baked in at build time.

```bash
nano /var/www/PrizeByRadissonBern/apps/web/.env.production
```

**If Nginx will expose the API as** `https://your-domain.com/api/v1`:

```env
NEXT_PUBLIC_API_URL=https://your-domain.com/api/v1
```

**If you test without Nginx** (browser talks directly to Node):

```env
NEXT_PUBLIC_API_URL=http://YOUR_SERVER_IP:3101/api/v1
```

Use **HTTPS** in production when Nginx + certificates are ready, then change this and **rebuild** the web app (see updates section).

---

## 8. Database schema and optional seed

```bash
cd /var/www/PrizeByRadissonBern/apps/api
npx prisma generate
npx prisma migrate deploy
# optional demo users / rooms:
# npx prisma db seed
```

---

## 9. Production build

```bash
cd /var/www/PrizeByRadissonBern
npm run build -w @housekeeping/api
npm run build -w @housekeeping/web
```

---

## 10. PM2 (alongside bern-ticket, mensom, etc.)

From **repo root** (where `ecosystem.config.cjs` lives):

```bash
cd /var/www/PrizeByRadissonBern
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup    # run the command it prints once, often with sudo
```

You should see **new** processes named like `housekeeping-api` and `housekeeping-web` in `pm2 list`; existing apps keep their names and ports.

Logs:

```bash
pm2 logs housekeeping-api --lines 80
pm2 logs housekeeping-web --lines 80
```

Local smoke test **on the server**:

```bash
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3101/api/v1/auth/me
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3100
```

---

## 11. Nginx (recommended: one more site, same ports 80/443)

Add a **new** `server { ... }` block — do **not** remove existing vhosts.

- **Web** → `http://127.0.0.1:3100`  
- **API** → `http://127.0.0.1:3101` (paths include `/api/v1`)  
- **Socket.IO** → same API upstream, path `/socket.io/`

Example file: `/etc/nginx/sites-available/prizebyradissonbern` — see **[DEPLOY-SSH-GITHUB.md](DEPLOY-SSH-GITHUB.md)** (Nginx section) for a full snippet.

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/prizebyradissonbern /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

TLS: Certbot or your provider for `https://your-domain.com`.

**Firewall:** usually only **80/443** are public; **3100/3101** stay **localhost-only** (Nginx proxies to them). Do not expose 3100/3101 to the internet unless you intend to.

---

## 12. After DNS + HTTPS

1. Set `WEB_ORIGIN=https://your-domain.com` in `apps/api/.env`.  
2. Set `NEXT_PUBLIC_API_URL=https://your-domain.com/api/v1` in `apps/web/.env.production`.  
3. Rebuild web and restart PM2:

```bash
cd /var/www/PrizeByRadissonBern
npm run build -w @housekeeping/web
pm2 restart housekeeping-web housekeeping-api
```

---

## 13. Updating when you push to GitHub

```bash
cd /var/www/PrizeByRadissonBern
git pull
npm ci
npm run build -w @housekeeping/shared
npm run build -w @housekeeping/api
npm run build -w @housekeeping/web
cd apps/api && npx prisma migrate deploy && cd ../..
pm2 restart ecosystem.config.cjs
```

---

## 14. Troubleshooting

| Issue | Check |
|--------|--------|
| `migrate deploy` fails | `DATABASE_URL`, Postgres running, user rights |
| 502 from Nginx | `pm2 list` shows both apps online; ports match `.env` / ecosystem |
| Login / API errors | `NEXT_PUBLIC_API_URL` matches how the browser reaches the API; rebuild web after changes |
| CORS | `WEB_ORIGIN` matches the site origin exactly |
| Realtime / Socket.IO | Nginx `location /socket.io/` + Upgrade headers; same host as API if possible |

---

## Quick reference

| Item | Value |
|------|--------|
| Repo | `https://github.com/DavidHosting0/PrizebyRadisson-Bern` |
| Path | `/var/www/PrizeByRadissonBern` |
| Web (Next) | `127.0.0.1:3100` |
| API (Nest) | `127.0.0.1:3101` |
| PM2 | `ecosystem.config.cjs` at repo root |

Related docs: **[DEPLOY-SSH-GITHUB.md](DEPLOY-SSH-GITHUB.md)**, **[DEPLOY-PM2.md](DEPLOY-PM2.md)**.
