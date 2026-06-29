/**
 * Cross-platform zip fallback using archiver (no system `zip` required).
 */
import archiver from 'archiver';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const distDir = path.join(root, 'apps', 'prize-panel-extension', 'dist');
const outDir = path.join(root, 'apps', 'web', 'public', 'downloads');
const outFile = path.join(outDir, 'prize-panel-extension.zip');

fs.mkdirSync(outDir, { recursive: true });

await new Promise((resolve, reject) => {
  const output = fs.createWriteStream(outFile);
  const archive = archiver('zip', { zlib: { level: 9 } });

  output.on('close', resolve);
  archive.on('error', reject);
  archive.pipe(output);
  archive.directory(distDir, false);
  archive.finalize();
});

console.log(`Created ${outFile} (archiver)`);
