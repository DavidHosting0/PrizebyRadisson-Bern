/**
 * Login via HTTP, open shift plan with session cookies, dump network + DOM.
 * Credentials from login HAR (not stored in repo).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { mirusLogin } = require('../apps/api/dist/favur/mirus-http-auth.js');

const har = JSON.parse(readFileSync('c:/Users/ytmad/Downloads/mirus login.har', 'utf8'));
const params = new URLSearchParams(har.log.entries[0].request.postData.text);
const username = params.get('Model.UserName');
const password = params.get('Model.Password');
const origin = 'https://neo.mirus.ch';

const jar = await mirusLogin(origin, username, password);
console.log('logged in', jar.cookieNames());

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
  locale: 'de-CH',
});
const host = 'neo.mirus.ch';
await context.addCookies(
  jar.toJSON().map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain || host,
    path: c.path || '/',
    secure: true,
  })),
);

const page = await context.newPage();
const net = [];
page.on('request', (req) => {
  const u = req.url();
  if (/\.(css|js|woff2|png|jpg|jpeg|svg|ico)(\?|$)/i.test(u)) return;
  net.push({ type: 'req', method: req.method(), url: u });
});
page.on('response', async (res) => {
  const u = res.url();
  if (/\.(css|js|woff2|png|jpg|jpeg|svg|ico)(\?|$)/i.test(u)) return;
  const ct = res.headers()['content-type'] || '';
  let preview = '';
  try {
    if (ct.includes('json') || ct.includes('text') || ct.includes('html')) {
      preview = (await res.text()).slice(0, 300);
    }
  } catch {}
  net.push({ type: 'res', status: res.status(), url: u, ct, preview });
});
page.on('websocket', (ws) => {
  console.log('WS open', ws.url());
  ws.on('framereceived', (frame) => {
    const d = String(frame.payload).slice(0, 400);
    if (d.length > 5) console.log('WS <<', d.replace(/\s+/g, ' ').slice(0, 300));
    net.push({ type: 'ws-in', data: String(frame.payload).slice(0, 2000) });
  });
  ws.on('framesent', (frame) => {
    const d = String(frame.payload).slice(0, 400);
    if (d.length > 2) console.log('WS >>', d.replace(/\s+/g, ' ').slice(0, 200));
    net.push({ type: 'ws-out', data: String(frame.payload).slice(0, 1000) });
  });
});

const urls = [
  `${origin}/webapp/shifts/shift`,
  `${origin}/webapp/shifts/shift/2026-08-04`,
];

for (const url of urls) {
  console.log('\n=== GOTO', url);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 }).catch((e) => console.log('goto err', e.message));
  await page.waitForTimeout(8000);
  console.log('final url', page.url());
  const html = await page.content();
  writeFileSync(`c:/Users/ytmad/Desktop/Housekeeping/scripts/shift-dom-${url.includes('2026') ? 'dated' : 'base'}.html`, html);
  const info = await page.evaluate(() => {
    const text = document.body?.innerText?.slice(0, 2000) || '';
    const classes = [...document.querySelectorAll('[class]')].slice(0, 80).map((el) => el.className.toString().slice(0, 80));
    const interesting = [...document.querySelectorAll('*')]
      .map((el) => el.className?.toString?.() || '')
      .filter((c) => /shift|schicht|absence|plan|scheduler|mud-table|k-event|employee|person|team/i.test(c))
      .slice(0, 40);
    return {
      title: document.title,
      text,
      interesting,
      hasPassword: !!document.querySelector('#password'),
      bodyLen: document.body?.innerHTML?.length || 0,
    };
  });
  console.log(JSON.stringify(info, null, 2).slice(0, 3000));
}

writeFileSync(
  'c:/Users/ytmad/Desktop/Housekeeping/scripts/shift-net.json',
  JSON.stringify(net, null, 2),
);
console.log('net events', net.length);
await browser.close();
