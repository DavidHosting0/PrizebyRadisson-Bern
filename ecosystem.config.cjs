/**
 * PM2 ecosystem — run after `npm run build` (see README or DEPLOY-PM2.md).
 *
 * `cwd` is anchored to this file (`__dirname`) so the API/Web app dirs are correct
 * even if `pm2 start ecosystem.config.cjs` is run from another working directory.
 *
 * API: `apps/api/dist/main.js` — created only by `npm run build -w @housekeeping/api`
 * (dist/ is gitignored).
 */
const path = require('path');
const root = __dirname;

module.exports = {
  apps: [
    {
      name: 'housekeeping-api',
      cwd: path.join(root, 'apps', 'api'),
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'housekeeping-web',
      cwd: path.join(root, 'apps', 'web'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3100',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
