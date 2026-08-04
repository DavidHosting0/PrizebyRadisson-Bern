/**
 * Dump detailed DOM structure of the loaded Dienstplan page.
 */
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
await page.waitForTimeout(10000);

const dump = await page.evaluate(() => {
  function brief(el, depth = 0) {
    if (!el || depth > 6) return null;
    const tag = el.tagName?.toLowerCase?.() || '';
    const cls = (el.className?.toString?.() || '').slice(0, 120);
    const id = el.id || '';
    const text = (el.childNodes && [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).filter(Boolean).join(' ') || '').slice(0, 80);
    const attrs = {};
    for (const a of el.attributes || []) {
      if (/^(data-|aria-|title|href|style)/i.test(a.name) || a.name === 'title') {
        attrs[a.name] = a.value.slice(0, 100);
      }
    }
    const kids = [...(el.children || [])].slice(0, 30).map((c) => brief(c, depth + 1)).filter(Boolean);
    return { tag, id, cls, text, attrs, kids: kids.length ? kids : undefined, childCount: el.children?.length };
  }

  const root =
    document.querySelector('.mud-main-content') ||
    document.querySelector('main') ||
    document.querySelector('#app') ||
    document.body;

  // collect all elements with time-like text or shift-ish classes
  const timed = [];
  for (const el of document.querySelectorAll('*')) {
    const t = el.textContent?.trim() || '';
    const cls = el.className?.toString?.() || '';
    if (el.children.length === 0 && /\d{1,2}:\d{2}/.test(t)) {
      timed.push({ tag: el.tagName, cls: cls.slice(0, 100), t: t.slice(0, 80), parent: el.parentElement?.className?.toString?.().slice(0, 100) });
    }
    if (/absence-plan-data|shift-block|duty|dienst|k-event|plan-data|shift-entry/i.test(cls) && timed.length < 50) {
      timed.push({ tag: el.tagName, cls: cls.slice(0, 100), t: t.slice(0, 80) });
    }
  }

  // list unique class tokens containing plan/shift/team/absence
  const classTokens = new Set();
  for (const el of document.querySelectorAll('[class]')) {
    for (const c of el.className.toString().split(/\s+/)) {
      if (/plan|shift|schicht|team|absence|duty|dienst|calendar|person|employee|member|row|cell/i.test(c)) {
        classTokens.add(c);
      }
    }
  }

  return {
    title: document.title,
    bodyText: document.body.innerText.slice(0, 4000),
    classTokens: [...classTokens].sort(),
    timed: timed.slice(0, 40),
    tree: brief(root),
  };
});

writeFileSync('c:/Users/ytmad/Desktop/Housekeeping/scripts/shift-dom-dump.json', JSON.stringify(dump, null, 2));
console.log('classTokens', dump.classTokens);
console.log('timed count', dump.timed.length, dump.timed.slice(0, 15));
console.log('bodyText\n', dump.bodyText);
await browser.close();
