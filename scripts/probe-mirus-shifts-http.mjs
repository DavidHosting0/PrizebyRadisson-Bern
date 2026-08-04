/**
 * After login, inspect shift page HTML / any embedded JSON.
 */
import { readFileSync, writeFileSync } from 'node:fs';

class Jar {
  store = new Map();
  ingest(headers) {
    for (const line of headers) {
      const part = line.split(';')[0]?.trim();
      if (!part?.includes('=')) continue;
      const eq = part.indexOf('=');
      const name = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      if (!value) this.store.delete(name);
      else this.store.set(name, value);
    }
  }
  header() {
    return [...this.store.entries()].map(([n, v]) => `${n}=${v}`).join('; ');
  }
}
function sc(res) {
  return typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [res.headers.get('set-cookie')].filter(Boolean);
}
async function req(jar, url, init = {}) {
  const headers = new Headers(init.headers ?? {});
  headers.set(
    'User-Agent',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
  );
  const c = jar.header();
  if (c) headers.set('Cookie', c);
  const res = await fetch(url, { ...init, headers, redirect: 'manual' });
  jar.ingest(sc(res));
  return res;
}

const har = JSON.parse(readFileSync('c:/Users/ytmad/Downloads/mirus login.har', 'utf8'));
const params = new URLSearchParams(har.log.entries[0].request.postData.text);
const origin = 'https://neo.mirus.ch';
const loginUrl = `${origin}/Account/Login?ReturnUrl=${encodeURIComponent('/webapp/home')}`;
const jar = new Jar();
const getHtml = await (await req(jar, loginUrl)).text();
const token =
  getHtml.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/i)?.[1] ||
  getHtml.match(/value="([^"]+)"[^>]*name="__RequestVerificationToken"/i)?.[1];
let post = await req(jar, loginUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    Origin: origin,
    Referer: loginUrl,
  },
  body: new URLSearchParams({
    _handler: 'login',
    __RequestVerificationToken: token,
    'Model.UserName': params.get('Model.UserName'),
    'Model.Password': params.get('Model.Password'),
  }).toString(),
});
post = await req(jar, new URL(post.headers.get('location'), origin).toString());

const date = '2026-08-04';
const shiftUrl = `${origin}/webapp/shifts/shift/${date}`;
const res = await req(jar, shiftUrl, {
  headers: {
    Accept: 'text/html',
    Referer: `${origin}/webapp/Home`,
  },
});
const html = await res.text();
writeFileSync('c:/Users/ytmad/Desktop/Housekeeping/scripts/mirus-shift-page.html', html);
console.log('shift page', res.status, 'len', html.length);
console.log('title', html.match(/<title[^>]*>([^<]+)/i)?.[1]);
console.log('has absenceplan', /absenceplan/i.test(html));
console.log('has blazor', /blazor/i.test(html));
// look for JSON blobs / prerender
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
console.log('inline scripts', scripts.length, 'sizes', scripts.map((s) => s.length).slice(0, 10));
for (const s of scripts) {
  if (/shift|schicht|employee|mitarbeiter|duty/i.test(s) && s.length > 50) {
    console.log('interesting script snippet', s.slice(0, 300));
  }
}
// data attributes
const dataAttrs = [...html.matchAll(/data-[a-z-]+=\"[^\"]{10,}/gi)].slice(0, 20);
console.log('data attrs', dataAttrs.map((m) => m[0].slice(0, 100)));

// Try common API guesses with auth cookie
const guesses = [
  `/webapp/shifts/shift/${date}?handler=data`,
  `/webapp/shifts/api/${date}`,
  `/webapp/api/shifts?date=${date}`,
  `/api/v1/shifts?date=${date}`,
  `/api/shifts?from=${date}&to=${date}`,
  `/odata/Shifts`,
  `/webapp/shifts/shift/${date}.json`,
  `/webapp/shifts/export/${date}`,
  `/webapp/shifts/shiftplan/${date}`,
  `/hr/api/shifts`,
  `/mirus/api/shifts`,
];
for (const p of guesses) {
  const r = await req(jar, origin + p, { headers: { Accept: 'application/json, text/plain, */*' } });
  const ct = (r.headers.get('content-type') || '').split(';')[0];
  const t = await r.text();
  console.log(r.status, p, ct, t.slice(0, 80).replace(/\s+/g, ' '));
}
