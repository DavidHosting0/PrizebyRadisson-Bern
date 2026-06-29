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
  if (fs.existsSync(outFile)) {
    console.log(`Extension dist missing; keeping existing ${outFile}`);
    process.exit(0);
  }
  console.warn(
    'Extension dist missing and no zip present. Run: npm run build -w @housekeeping/prize-panel-extension',
  );
  process.exit(0);
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
  if (isWin) {
    console.error('Failed to create extension zip');
    process.exit(result.status ?? 1);
  }
  // Fallback when `zip` CLI is missing (common on minimal Linux images).
  console.warn('`zip` command failed; trying node archiver…');
  const archiverResult = spawnSync(
    process.execPath,
    [path.join(__dirname, 'package-prize-panel-extension-archiver.mjs')],
    { stdio: 'inherit', cwd: root },
  );
  if (archiverResult.status !== 0) {
    console.error('Failed to create extension zip (zip CLI and archiver)');
    process.exit(archiverResult.status ?? 1);
  }
  process.exit(0);
}

console.log(`Created ${outFile}`);
