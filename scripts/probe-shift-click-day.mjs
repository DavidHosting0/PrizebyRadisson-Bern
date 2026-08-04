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

// Capture XHR/fetch that might load shift JSON (sometimes Blazor uses HTTP too)
const jsonHits = [];
page.on('response', async (res) => {
  try {
    const ct = res.headers()['content-type'] || '';
    const u = res.url();
    if (!ct.includes('json') && !/api|odata|shift|export/i.test(u)) return;
    if (/\.(js|css)(\?|$)/i.test(u)) return;
    const text = await res.text();
    if (text.length < 10) return;
    jsonHits.push({ status: res.status(), url: u, ct, len: text.length, preview: text.slice(0, 500) });
  } catch {}
});

await page.goto(`${origin}/webapp/shifts/shift`, { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForTimeout(5000);

// Try clicking tomorrow / another day in week calendar
const dayClicked = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('.weekCalendarTable td, .weekCalendarTable th, .weekCalendarTable *')];
  const five = cells.find((el) => el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() === '5'));
  if (five) {
    five.click();
    return 'clicked 5';
  }
  return 'no day 5';
});
console.log(dayClicked);
await page.waitForTimeout(5000);

const htmlSnips = await page.evaluate(() => {
  const snips = [];
  for (const el of document.querySelectorAll('.team-color-container, .team-color, [class*="absence"], [class*="Absence"], [class*="shift"], [class*="Shift"]')) {
    snips.push({
      cls: el.className.toString().slice(0, 120),
      html: el.outerHTML.slice(0, 500),
      text: el.innerText?.slice(0, 200),
    });
  }
  // Also get main content outerHTML slice
  const main = document.querySelector('.mud-main-content') || document.querySelector('main');
  return {
    snips: snips.slice(0, 30),
    mainHtml: (main?.innerHTML || '').slice(0, 15000),
    text: document.body.innerText.slice(0, 3000),
  };
});

writeFileSync('c:/Users/ytmad/Desktop/Housekeeping/scripts/shift-html-snips.json', JSON.stringify(htmlSnips, null, 2));
writeFileSync('c:/Users/ytmad/Desktop/Housekeeping/scripts/shift-json-hits.json', JSON.stringify(jsonHits, null, 2));
console.log('jsonHits', jsonHits.length, jsonHits.map((h) => h.url.slice(0, 100)));
console.log('snips', htmlSnips.snips.length);
console.log(htmlSnips.snips.slice(0, 5));
console.log('text', htmlSnips.text);
await browser.close();
