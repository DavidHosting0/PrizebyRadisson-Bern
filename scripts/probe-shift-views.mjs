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

const paths = [
  '/webapp/shifts/shift',
  '/webapp/shifts/absenceplan',
  '/webapp/shifts/absences',
  '/webapp/absenceplan',
  '/webapp/absences',
  '/webapp/shifts/week',
  '/webapp/shifts/team',
];

for (const p of paths) {
  const res = await page.goto(origin + p, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => null);
  await page.waitForTimeout(4000);
  const info = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    text: document.body?.innerText?.slice(0, 500) || '',
    hasAbsenceTable: !!document.querySelector('.absenceplan-table'),
    hasTimes: /\d{1,2}:\d{2}\s*[-–]/.test(document.body?.innerText || ''),
  }));
  console.log(p, '->', info.url, 'title=', info.title, 'table=', info.hasAbsenceTable, 'times=', info.hasTimes);
  console.log(' ', info.text.replace(/\n/g, ' | ').slice(0, 250));
}

// On shift page: click first avatar and dump resulting text
await page.goto(`${origin}/webapp/shifts/shift`, { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForTimeout(5000);

const before = await page.evaluate(() => document.body.innerText);
await page.locator('.team-color-container').nth(1).click({ timeout: 5000 }).catch(() => {});
await page.waitForTimeout(2000);
await page.locator('.mud-avatar').nth(2).click({ timeout: 5000 }).catch(() => {});
await page.waitForTimeout(3000);

const after = await page.evaluate(() => {
  const dialogs = [...document.querySelectorAll('.mud-dialog, .mud-popover, .mud-overlay, [role="dialog"], .mud-paper')].map((el) => ({
    cls: el.className.toString().slice(0, 80),
    text: el.innerText?.slice(0, 400),
  }));
  return {
    text: document.body.innerText.slice(0, 4000),
    dialogs: dialogs.filter((d) => d.text && d.text.length > 5).slice(0, 10),
    titles: [...document.querySelectorAll('[title]')].map((el) => ({
      title: el.getAttribute('title'),
      text: el.textContent?.slice(0, 40),
      cls: el.className.toString().slice(0, 60),
    })).slice(0, 30),
    alts: [...document.querySelectorAll('img[alt]')].map((img) => ({
      alt: img.getAttribute('alt'),
      src: img.getAttribute('src'),
    })),
  };
});

writeFileSync('c:/Users/ytmad/Desktop/Housekeeping/scripts/shift-click-person.json', JSON.stringify(after, null, 2));
console.log('alts', after.alts);
console.log('titles', after.titles);
console.log('dialogs', after.dialogs);
console.log('text changed?', before !== after.text);
console.log(after.text.slice(0, 1500));

await browser.close();
