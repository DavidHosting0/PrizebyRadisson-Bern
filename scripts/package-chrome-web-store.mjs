/**
 * Packs apps/prize-panel-extension/dist for Chrome Web Store upload.
 * Output: apps/prize-panel-extension/chrome-web-store.zip
 *
 * Run after: npm run build -w @housekeeping/prize-panel-extension
 */
import archiver from 'archiver';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const distDir = path.join(root, 'apps', 'prize-panel-extension', 'dist');
const outFile = path.join(root, 'apps', 'prize-panel-extension', 'chrome-web-store.zip');

if (!fs.existsSync(path.join(distDir, 'manifest.json'))) {
  console.error('dist/manifest.json missing. Run: npm run build -w @housekeeping/prize-panel-extension');
  process.exit(1);
}

if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

await new Promise((resolve, reject) => {
  const output = fs.createWriteStream(outFile);
  const archive = archiver('zip', { zlib: { level: 9 } });
  output.on('close', resolve);
  archive.on('error', reject);
  archive.pipe(output);
  // Store ZIP root = contents of dist/ (manifest.json at zip root)
  archive.directory(distDir, false);
  archive.finalize();
});

console.log(`Created ${outFile}`);
console.log('Upload this file at https://chrome.google.com/webstore/devconsole');
