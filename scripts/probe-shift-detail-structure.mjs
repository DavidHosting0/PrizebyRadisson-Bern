import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { mirusLogin } = require('../apps/api/dist/favur/mirus-http-auth.js');
const har = JSON.parse(readFileSync('c:/Users/ytmad/Downloads/mirus login.har', 'utf8'));
const params = new URLSearchParams(har.log.entries[0].request.postData.text);
const origin = 'https://neo.mirus.ch';
const jar = await mirusLogin(origin, params.get('Model.UserName'), params.get('Model.Password'));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: 'de-CH' });
await context.addCookies(
  jar.toJSON().map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain || 'neo.mirus.ch',
    path: c.path || '/',
    secure: true,
  })),
);
const page = await context.newPage();
await page.goto(`${origin}/webapp/shifts/shift`, { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForTimeout(6000);

// Click first visible team avatar to open detail list (as in browser)
await page.locator('.team-color-container').first().click();
await page.waitForTimeout(4000);
await page.waitForFunction(() => /Arbeitszeit/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});

const dump = await page.evaluate(() => {
  const TIME = /(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/;
  // Find containers that mention Arbeitszeit
  const hits = [];
  for (const el of document.querySelectorAll('*')) {
    if (el.children.length > 8) continue;
    const t = el.innerText || '';
    if (t.includes('Arbeitszeit') && TIME.test(t) && t.length < 400) {
      hits.push({
        tag: el.tagName,
        cls: el.className?.toString?.().slice(0, 120),
        text: t.slice(0, 300),
        parentCls: el.parentElement?.className?.toString?.().slice(0, 120),
        html: el.outerHTML.slice(0, 600),
      });
    }
  }

  // Parse structured from body text sections
  const body = document.body.innerText;
  const lines = body.split(/\n/).map((l) => l.trim()).filter(Boolean);

  return {
    hits: hits.slice(0, 20),
    lines: lines.slice(0, 120),
    classTokens: [...new Set(
      [...document.querySelectorAll('[class]')]
        .flatMap((el) => el.className.toString().split(/\s+/))
        .filter((c) => /anwesen|abwesen|shift|dienst|person|employee|card|list|detail|presence|absent|work/i.test(c)),
    )].sort(),
  };
});

writeFileSync('c:/Users/ytmad/Desktop/Housekeeping/scripts/shift-detail-structure.json', JSON.stringify(dump, null, 2));
console.log('classTokens', dump.classTokens);
console.log('hits', dump.hits.length);
console.log(dump.hits.slice(0, 5));
console.log(dump.lines.slice(0, 80));
await browser.close();
