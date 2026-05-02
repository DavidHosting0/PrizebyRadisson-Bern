/* eslint-disable no-console */
/**
 * Standalone smoke test for the EMMA login flow.
 *
 * Runs the four-stage login in a real Chromium browser, prints each step, and
 * leaves the browser open for a few seconds so you can visually confirm the
 * launchpad loaded. Bypasses the DB and the Nest app entirely.
 *
 * Usage (PowerShell):
 *   cd apps/api
 *   $env:EMMA_ADFS_EMAIL="..."
 *   $env:EMMA_ADFS_PASSWORD="..."
 *   $env:EMMA_TOTP_SECRET="..."
 *   $env:EMMA_SAP_USER="..."
 *   $env:EMMA_SAP_PASSWORD="..."
 *   $env:EMMA_OPERATOR_CODE="..."
 *   $env:EMMA_OPERATOR_PASSWORD="..."
 *   npx ts-node scripts/emma-login-test.ts
 *
 * Flags (set via env, all optional):
 *   EMMA_HEADLESS=true     run without a visible browser window
 *   EMMA_LINGER_MS=8000    keep the browser open this long after success
 *   EMMA_BASE_URL=...      override the default launchpad URL
 */
import { chromium } from 'playwright';
import { emmaOpenLoggedIn, type EmmaLoginOpts } from '../src/emma/emma-scraper';

function required(envVar: string): string {
  const value = process.env[envVar];
  if (!value || !value.trim()) {
    console.error(`Missing required env var: ${envVar}`);
    process.exit(2);
  }
  return value;
}

function optional(envVar: string): string | undefined {
  const value = process.env[envVar];
  return value && value.trim() ? value : undefined;
}

async function main() {
  const headless = (process.env.EMMA_HEADLESS ?? 'false').toLowerCase() === 'true';
  const lingerMs = Number(process.env.EMMA_LINGER_MS ?? (headless ? 0 : 8000));

  const opts: EmmaLoginOpts = {
    adfsEmail: required('EMMA_ADFS_EMAIL'),
    adfsPassword: required('EMMA_ADFS_PASSWORD'),
    totpSecret: required('EMMA_TOTP_SECRET'),
    sapUser: required('EMMA_SAP_USER'),
    sapPassword: required('EMMA_SAP_PASSWORD'),
    operatorCode: optional('EMMA_OPERATOR_CODE'),
    operatorPassword: optional('EMMA_OPERATOR_PASSWORD'),
    baseUrl: optional('EMMA_BASE_URL'),
    progress: (msg) => console.log(msg),
  };

  console.log(
    `EMMA login smoke test — headless=${headless}, lingerMs=${lingerMs}`,
  );
  const startedAt = Date.now();

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    locale: 'de-CH',
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    await emmaOpenLoggedIn(page, opts);
    await page
      .waitForLoadState('networkidle', { timeout: 30_000 })
      .catch(() => undefined);
    const url = page.url();
    const title = await page.title().catch(() => '');
    const durationMs = Date.now() - startedAt;
    console.log('\n---');
    console.log(`OK — landed on: ${url}`);
    console.log(`title: ${title}`);
    console.log(`took:  ${durationMs} ms`);
    if (lingerMs > 0) {
      console.log(`(browser stays open for ${lingerMs} ms)`);
      await new Promise<void>((resolve) => setTimeout(resolve, lingerMs));
    }
  } catch (err) {
    console.error('\nFAILED:', (err as Error).message);
    process.exitCode = 1;
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
