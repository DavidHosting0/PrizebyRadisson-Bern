/**
 * Generates PWA / home-screen icons from PrizeByRadisson.png.
 * Run: node scripts/generate-pwa-icons.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'apps', 'web', 'public');
const iconsDir = path.join(publicDir, 'icons');
const logoPath = path.join(publicDir, 'PrizeByRadisson.png');

const BG = '#F5F5F5';

async function buildIcon(size, logoMaxRatio) {
  const logoMaxW = Math.round(size * logoMaxRatio);
  const logo = sharp(logoPath);
  const meta = await logo.metadata();
  const scale = logoMaxW / (meta.width ?? logoMaxW);
  const logoH = Math.round((meta.height ?? logoMaxW) * scale);

  const resizedLogo = await logo.resize(logoMaxW, logoH, { fit: 'inside' }).png().toBuffer();

  const left = Math.round((size - logoMaxW) / 2);
  const top = Math.round((size - logoH) / 2);

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG,
    },
  })
    .composite([{ input: resizedLogo, left, top }])
    .png()
    .toBuffer();
}

async function main() {
  if (!fs.existsSync(logoPath)) {
    console.error('Missing source logo:', logoPath);
    process.exit(1);
  }

  fs.mkdirSync(iconsDir, { recursive: true });

  const standard = await buildIcon(512, 0.75);
  const maskable = await buildIcon(512, 0.58);

  const outputs = [
    [path.join(iconsDir, 'icon-512.png'), standard],
    [path.join(iconsDir, 'icon-512-maskable.png'), maskable],
    [path.join(publicDir, 'apple-touch-icon.png'), await sharp(standard).resize(180, 180).png().toBuffer()],
    [path.join(iconsDir, 'icon-192.png'), await sharp(standard).resize(192, 192).png().toBuffer()],
    [path.join(iconsDir, 'icon-152.png'), await sharp(standard).resize(152, 152).png().toBuffer()],
    [path.join(iconsDir, 'icon-167.png'), await sharp(standard).resize(167, 167).png().toBuffer()],
  ];

  for (const [out, buf] of outputs) {
    await sharp(buf).toFile(out);
    console.log('Wrote', path.relative(root, out));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
