/**
 * After successful login, probe which endpoints return useful data.
 * Credentials from HAR only — not stored.
 */
import { readFileSync } from 'node:fs';

class Jar {
  store = new Map();
  ingest(headers) {
    for (const line of headers) {
      const part = line.split(';')[0]?.trim();
      if (!part?.includes('=')) continue;
      const eq = part.indexOf('=');
      const name = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      let expired = value === '';
      for (const attr of line.split(';').slice(1)) {
        const [k, ...rest] = attr.trim().split('=');
        const v = rest.join('=');
        if (/^max-age$/i.test(k) && Number(v) <= 0) expired = true;
        if (/^expires$/i.test(k) && v && Date.parse(v) <= Date.now()) expired = true;
      }
      if (expired) this.store.delete(name);
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
const username = params.get('Model.UserName');
const password = params.get('Model.Password');
const origin = 'https://neo.mirus.ch';
const loginUrl = `${origin}/Account/Login?ReturnUrl=${encodeURIComponent('/webapp/home')}`;
const jar = new Jar();

const getHtml = await (await req(jar, loginUrl)).text();
const token =
  getHtml.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/i)?.[1] ||
  getHtml.match(/value="([^"]+)"[^>]*name="__RequestVerificationToken"/i)?.[1];
const body = new URLSearchParams({
  _handler: 'login',
  __RequestVerificationToken: token,
  'Model.UserName': username,
  'Model.Password': password,
});
let post = await req(jar, loginUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    Origin: origin,
    Referer: loginUrl,
  },
  body: body.toString(),
});
console.log('login', post.status, post.headers.get('location'), 'cookies', [...jar.store.keys()]);
if (post.status >= 300) {
  post = await req(jar, new URL(post.headers.get('location'), origin).toString());
  console.log('home', post.status);
}

const today = new Date();
const y = today.getFullYear();
const m = String(today.getMonth() + 1).padStart(2, '0');
const d = String(today.getDate()).padStart(2, '0');
const date = `${y}-${m}-${d}`;

const paths = [
  `/webapp/shifts/shift/${date}`,
  `/webapp/Home`,
  `/swagger/v1/swagger.json`,
  `/swagger/index.html`,
  `/api`,
  `/Account/Manage`,
  `/_blazor/negotiate?negotiateVersion=1`,
];

for (const p of paths) {
  const method = p.includes('negotiate') ? 'POST' : 'GET';
  const headers = p.includes('swagger.json')
    ? { Accept: 'application/json' }
    : p.includes('negotiate')
      ? { 'Content-Type': 'text/plain;charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' }
      : { Accept: 'text/html' };
  const res = await req(jar, origin + p, { method, headers, body: method === 'POST' ? '' : undefined });
  const ct = res.headers.get('content-type') ?? '';
  let loc = res.headers.get('location');
  let preview = '';
  if (res.status !== 302) {
    const t = await res.text();
    preview = t.slice(0, 120).replace(/\s+/g, ' ');
  }
  console.log(res.status, method, p, ct.split(';')[0], loc || '', preview.slice(0, 100));
}
