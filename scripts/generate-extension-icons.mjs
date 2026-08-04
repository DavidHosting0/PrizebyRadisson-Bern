/**
 * Generates Chrome Web Store icons for PrizeBern Panel.
 * Run: node scripts/generate-extension-icons.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const logoPath = path.join(root, 'apps', 'prize-panel-extension', 'public', 'PrizeByRadisson.png');
const outDir = path.join(root, 'apps', 'prize-panel-extension', 'public');
const BG = '#1A2332';

async function buildIcon(size) {
  const padding = Math.round(size * 0.14);
  const maxW = size - padding * 2;
  const maxH = size - padding * 2;

  // Flatten logo onto dark navy, then invert so logo reads white on dark (like sidebar).
  const resized = await sharp(logoPath)
    .resize(maxW, maxH, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .png()
    .toBuffer();

  const meta = await sharp(resized).metadata();
  const w = meta.width ?? maxW;
  const h = meta.height ?? maxH;
  const left = Math.round((size - w) / 2);
  const top = Math.round((size - h) / 2);

  const onDark = await sharp(resized).negate({ alpha: false }).png().toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG,
    },
  })
    .composite([{ input: onDark, left, top }])
    .png()
    .toBuffer();
}

async function main() {
  if (!fs.existsSync(logoPath)) {
    console.error('Missing logo:', logoPath);
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  for (const size of [16, 48, 128]) {
    const buf = await buildIcon(size);
    const out = path.join(outDir, `icon-${size}.png`);
    fs.writeFileSync(out, buf);
    console.log('Wrote', out, `(${buf.length} bytes)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
