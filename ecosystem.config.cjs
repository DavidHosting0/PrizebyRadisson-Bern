/**
 * PM2 ecosystem — run from repo root after `npm run build` (see README or DEPLOY-PM2.md).
 * Typical server path: /var/www/PrizeByRadissonBern
 *
 * API entry: apps/api/dist/main.js — created ONLY by `npm run build -w @housekeeping/api`
 * (dist/ is gitignored; git pull never ships compiled JS).
 *
 * 1. Pick free ports on your server (example: API 3101, Web 3100).
 * 2. Copy apps/api/.env and apps/web/.env.production.local (or set env in this file).
 * 3. For Next.js, NEXT_PUBLIC_* must be set when you run `next build` (public URL + /api/v1).
 */
module.exports = {
  apps: [
    {
      name: 'housekeeping-api',
      cwd: './apps/api',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      // Put secrets in apps/api/.env — Nest loads it when cwd is apps/api
      env: {
        NODE_ENV: 'production',
        // PORT: '3101',
        // WEB_ORIGIN: 'https://housekeeping.example.com',
      },
    },
    {
      name: 'housekeeping-web',
      cwd: './apps/web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3100',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      // Use apps/web/.env.production (and optional .env.production.local)
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
