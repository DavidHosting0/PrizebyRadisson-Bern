/**
 * Generates Chrome Web Store listing images (promo tiles + store icon).
 * Run: node scripts/generate-extension-store-assets.mjs
 *
 * Output: apps/prize-panel-extension/store-assets/
 *   - icon-128.png (also used as listing icon reference)
 *   - promo-small-440x280.png  (required)
 *   - promo-marquee-1400x560.png (optional, for featuring)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const logoPath = path.join(root, 'apps', 'prize-panel-extension', 'public', 'PrizeByRadisson.png');
const outDir = path.join(root, 'apps', 'prize-panel-extension', 'store-assets');
const BG = { r: 26, g: 35, b: 50, alpha: 1 };
const ACCENT = { r: 59, g: 111, b: 160, alpha: 1 };

async function whiteLogo(maxW, maxH) {
  const resized = await sharp(logoPath)
    .resize(maxW, maxH, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .png()
    .toBuffer();
  return sharp(resized).negate({ alpha: false }).png().toBuffer();
}

async function promoTile(width, height, logoMaxW, logoMaxH) {
  const logo = await whiteLogo(logoMaxW, logoMaxH);
  const meta = await sharp(logo).metadata();
  const left = Math.round((width - (meta.width ?? logoMaxW)) / 2);
  const top = Math.round((height - (meta.height ?? logoMaxH)) / 2 - height * 0.04);

  const accentBar = await sharp({
    create: {
      width: Math.round(width * 0.28),
      height: 6,
      channels: 4,
      background: ACCENT,
    },
  })
    .png()
    .toBuffer();

  return sharp({
    create: { width, height, channels: 4, background: BG },
  })
    .composite([
      { input: logo, left, top },
      {
        input: accentBar,
        left: Math.round((width - Math.round(width * 0.28)) / 2),
        top: top + (meta.height ?? logoMaxH) + Math.round(height * 0.06),
      },
    ])
    .png()
    .toBuffer();
}

async function main() {
  if (!fs.existsSync(logoPath)) {
    console.error('Missing logo:', logoPath);
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });

  // Listing icon (same art as extension 128)
  const icon128Src = path.join(root, 'apps', 'prize-panel-extension', 'public', 'icon-128.png');
  if (fs.existsSync(icon128Src)) {
    fs.copyFileSync(icon128Src, path.join(outDir, 'icon-128.png'));
  }

  const small = await promoTile(440, 280, 280, 120);
  fs.writeFileSync(path.join(outDir, 'promo-small-440x280.png'), small);
  console.log('Wrote promo-small-440x280.png');

  const marquee = await promoTile(1400, 560, 720, 220);
  fs.writeFileSync(path.join(outDir, 'promo-marquee-1400x560.png'), marquee);
  console.log('Wrote promo-marquee-1400x560.png');

  // Compress in-extension logo if oversized (keeps store zip lean)
  const logoStat = fs.statSync(logoPath);
  if (logoStat.size > 200_000) {
    const compressed = await sharp(logoPath)
      .resize(640, 640, { fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();
    if (compressed.length < logoStat.size * 0.9 && compressed.length > 1_000) {
      fs.writeFileSync(logoPath, compressed);
      console.log(
        `Compressed PrizeByRadisson.png ${logoStat.size} → ${compressed.length} bytes`,
      );
    } else {
      console.log('Skipped logo compression (no useful size win)');
    }
  }

  console.log('Store assets in', outDir);
  console.log('Still needed: at least one real screenshot 1280×800 (see CHROME-WEB-STORE.md)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
