# First-time deploy over SSH (code on GitHub)

Use this when you are **already logged in via SSH** and the project lives in a **GitHub** repo. Adjust paths, domain names, and ports to match your server.

---

## Step 0 — What you need on the server

| Requirement | Check |
|-------------|--------|
| Node.js **20+** | `node -v` |
| npm | `npm -v` |
| Git | `git --version` |
| PostgreSQL (server or reachable host) | `psql --version` or your host’s docs |
| PM2 (you said you use it) | `pm2 -v` |
| Nginx (recommended for HTTPS + multiple sites) | `nginx -v` |

If Node is too old, install Node 20 LTS (e.g. NodeSource, nvm, or your OS packages).

---

## Step 1 — Pick a folder and clone from GitHub

Use a dedicated deploy folder, e.g. **`/var/www/PrizeByRadissonBern`**. Replace the URL with **your** repo (HTTPS or SSH).

```bash
cd /var/www
sudo mkdir -p PrizeByRadissonBern
sudo chown "$USER:$USER" PrizeByRadissonBern
cd PrizeByRadissonBern
git clone https://github.com/DavidHosting0/PrizebyRadisson-Bern.git .
```

If you use **SSH keys** with GitHub:

```bash
cd /var/www
git clone git@github.com:DavidHosting0/PrizebyRadisson-Bern.git PrizeByRadissonBern
cd PrizeByRadissonBern
```

Use the default branch (e.g. `main`) or checkout the branch you deploy:

```bash
git checkout main
```

---

## Step 2 — Install dependencies (production)

From the **repository root** (the `PrizeByRadissonBern` folder that contains `apps/` and `package.json`):

```bash
npm ci
```

If `npm ci` fails because there is no `package-lock.json`, use:

```bash
npm install
```

Build the shared package first:

```bash
npm run build -w @housekeeping/shared
```

---

## Step 3 — Choose ports that do not conflict

Your other PM2 apps already use ports. List PM2 processes and ports:

```bash
pm2 list
ss -tlnp | head -40
```

This project uses **two** ports by default in `ecosystem.config.cjs`:

- **3100** — Next.js (web)
- **3101** — NestJS (API) — set via `PORT` in `apps/api/.env`

If 3100/3101 are taken, pick two free ports (e.g. **3200** and **3201**) and use them consistently in the next steps.

---

## Step 4 — Create the PostgreSQL database

Log into Postgres as a superuser (command varies by OS):

```bash
sudo -u postgres psql
```

In `psql`, create a user and database (change passwords and names):

```sql
CREATE USER housekeeping_user WITH PASSWORD 'your_strong_password';
CREATE DATABASE housekeeping OWNER housekeeping_user;
GRANT ALL PRIVILEGES ON DATABASE housekeeping TO housekeeping_user;
\q
```

Your `DATABASE_URL` will look like:

```text
postgresql://housekeeping_user:your_strong_password@127.0.0.1:5432/housekeeping
```

If Postgres is on another host, replace `127.0.0.1` with that host.

---

## Step 5 — Configure the API environment

Create **`apps/api/.env`** on the server (you can use `nano` or `vim`):

```bash
cd /var/www/PrizeByRadissonBern/apps/api
nano .env
```

Minimum content (edit values):

```env
DATABASE_URL=postgresql://housekeeping_user:your_strong_password@127.0.0.1:5432/housekeeping
JWT_ACCESS_SECRET=long_random_string_at_least_32_chars
JWT_REFRESH_SECRET=another_long_random_string
PORT=3101
WEB_ORIGIN=https://your-domain.com
```

Notes:

- **`PORT`** — Must match the API port you chose (e.g. **3101**).
- **`WEB_ORIGIN`** — The **exact** origin visitors use for the **website** (scheme + host, **no path**). Examples: `https://housekeeping.example.com` or `http://YOUR_SERVER_IP:3100` during testing only.
- For **photo uploads** in production, add `S3_*` variables (see repo root `.env.example`).

Save and exit.

---

## Step 6 — Configure the web app (public API URL)

Next.js reads **`NEXT_PUBLIC_*`** at **build time**. Create **`apps/web/.env.production`**:

```bash
cd /var/www/PrizeByRadissonBern/apps/web
nano .env.production
```

Set the API base URL **as the browser will call it**:

**If you will put Nginx in front** and expose the API as `https://your-domain.com/api/v1`:

```env
NEXT_PUBLIC_API_URL=https://your-domain.com/api/v1
```

**If the API is on another host/port** (no Nginx yet):

```env
NEXT_PUBLIC_API_URL=http://YOUR_SERVER_IP:3101/api/v1
```

Use **HTTPS** in production when you have TLS. After changing this file, you must **`npm run build -w @housekeeping/web` again** so the value is baked in.

---

## Step 7 — Prisma: generate client and run migrations

From **`/var/www/PrizeByRadissonBern`**, with `DATABASE_URL` in `apps/api/.env`:

```bash
cd /var/www/PrizeByRadissonBern/apps/api
npx prisma generate
npx prisma migrate deploy
```

Optional demo data:

```bash
npx prisma db seed
```

If `migrate deploy` fails, read the error: usually wrong `DATABASE_URL`, Postgres not running, or firewall.

---

## Step 8 — Align PM2 with your ports

Edit **`ecosystem.config.cjs`** at the repo root if you changed ports:

- **Next.js:** `args: 'start -p 3100'` → your web port (e.g. **3200**).
- **API:** `PORT` in **`apps/api/.env`** must match (e.g. **3101**).
- **`WEB_ORIGIN`** — If you only test with IP + port for the web app, use e.g. `http://YOUR_IP:3100` until DNS + HTTPS are ready.

---

## Step 9 — Build API and web

From **`/var/www/PrizeByRadissonBern`** (repo root):

```bash
cd /var/www/PrizeByRadissonBern
npm run build -w @housekeeping/api
npm run build -w @housekeeping/web
```

---

## Step 10 — Start with PM2

From the **repo root** (`/var/www/PrizeByRadissonBern`, where `ecosystem.config.cjs` is):

```bash
cd /var/www/PrizeByRadissonBern
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Run the command `pm2 startup` prints (often `sudo env PATH=... pm2 startup systemd -u youruser`).

Check logs:

```bash
pm2 logs housekeeping-api --lines 50
pm2 logs housekeeping-web --lines 50
```

Test locally on the server:

```bash
curl -s http://127.0.0.1:3101/api/v1/auth/me
curl -s -I http://127.0.0.1:3100
```

(Expect 401 or similar for `/auth/me` without a token.)

---

## Step 11 — Nginx reverse proxy (recommended)

This gives you one domain, HTTPS, and no need to expose Node ports publicly.

**1. DNS** — Point `your-domain.com` (or a subdomain) to your server’s IP.

**2. Server block** — Example: Next on `/`, API under `/api`, Socket.IO for realtime:

```nginx
# /etc/nginx/sites-available/prizebyradissonbern

upstream prizebyradissonbern_next {
    server 127.0.0.1:3100;
}

upstream prizebyradissonbern_api {
    server 127.0.0.1:3101;
}

server {
    listen 80;
    server_name your-domain.com;

    location /api/ {
        proxy_pass http://prizebyradissonbern_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket.io/ {
        proxy_pass http://prizebyradissonbern_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    location / {
        proxy_pass http://prizebyradissonbern_next;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site and reload Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/prizebyradissonbern /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

**3. TLS** — Use Certbot (Let’s Encrypt) or your provider’s certificates.

**4. Set `WEB_ORIGIN` and rebuild web** — After your public URL is `https://your-domain.com`:

- In **`apps/api/.env`**: `WEB_ORIGIN=https://your-domain.com`
- In **`apps/web/.env.production`**: `NEXT_PUBLIC_API_URL=https://your-domain.com/api/v1`
- Rebuild web and restart PM2:

```bash
cd /var/www/PrizeByRadissonBern
npm run build -w @housekeeping/web
pm2 restart housekeeping-web
pm2 restart housekeeping-api
```

---

## Step 12 — Firewall (if applicable)

Allow HTTP/HTTPS if you use UFW:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw status
```

Do **not** open 3100/3101 to the world if Nginx proxies locally; keep them on `127.0.0.1` only.

---

## Updating after you push to GitHub

On the server:

```bash
cd /var/www/PrizeByRadissonBern
git pull
npm ci
npm run build -w @housekeeping/shared
npm run build -w @housekeeping/api
npm run build -w @housekeeping/web   # if NEXT_PUBLIC_* or web code changed
cd apps/api && npx prisma migrate deploy && cd ../..
pm2 restart ecosystem.config.cjs
```

---

## Troubleshooting

| Problem | What to check |
|--------|----------------|
| `migrate deploy` fails | `DATABASE_URL`, Postgres running, user/password |
| 502 from Nginx | PM2 apps running, `proxy_pass` ports match `.env` / ecosystem |
| Login works but realtime does not | Nginx `/socket.io/` block, `WEB_ORIGIN`, `NEXT_PUBLIC_API_URL` |
| CORS errors | `WEB_ORIGIN` matches the browser’s origin exactly |
| Wrong API URL in browser | Rebuild web after changing `NEXT_PUBLIC_API_URL` |

---

## Quick reference: demo users (seed only)

If you ran `prisma db seed`, see README for emails/passwords. Change passwords before production use.
