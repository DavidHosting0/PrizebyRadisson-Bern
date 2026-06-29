/**
 * Zips apps/prize-panel-extension/dist for download from the web app.
 * Run: node scripts/package-prize-panel-extension.mjs
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const distDir = path.join(root, 'apps', 'prize-panel-extension', 'dist');
const outDir = path.join(root, 'apps', 'web', 'public', 'downloads');
const outFile = path.join(outDir, 'prize-panel-extension.zip');

if (!fs.existsSync(distDir)) {
  console.error('Extension dist missing. Run: npm run build -w @housekeeping/prize-panel-extension');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

const isWin = process.platform === 'win32';
const result = isWin
  ? spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Compress-Archive -Path '${distDir.replace(/'/g, "''")}\\*' -DestinationPath '${outFile.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: 'inherit' },
    )
  : spawnSync('zip', ['-r', outFile, '.'], { cwd: distDir, stdio: 'inherit' });

if (result.status !== 0) {
  console.error('Failed to create extension zip');
  process.exit(result.status ?? 1);
}

console.log(`Created ${outFile}`);
