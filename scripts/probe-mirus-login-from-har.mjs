/**
 * Probe HTTP login matching the browser HAR shape.
 * Reads credentials from the HAR (not stored in repo).
 */
import { readFileSync } from 'node:fs';

class Jar {
  store = new Map();
  ingest(headers, url) {
    for (const line of headers) {
      const part = line.split(';')[0]?.trim();
      if (!part?.includes('=')) continue;
      const eq = part.indexOf('=');
      const name = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      let path = '/';
      let expired = false;
      for (const attr of line.split(';').slice(1)) {
        const [k, ...rest] = attr.trim().split('=');
        const v = rest.join('=');
        if (/^path$/i.test(k) && v) path = v.trim();
        if (/^max-age$/i.test(k) && Number(v) <= 0) expired = true;
        if (/^expires$/i.test(k) && v && Date.parse(v) <= Date.now()) expired = true;
      }
      const key = `${path}|${name}`;
      if (expired || value === '') this.store.delete(key);
      else this.store.set(key, { name, value, path, raw: line.slice(0, 180) });
    }
  }
  header() {
    return [...this.store.values()].map((c) => `${c.name}=${c.value}`).join('; ');
  }
  names() {
    return [...this.store.values()].map((c) => `${c.name}(${c.value.length})`);
  }
}

function getSetCookie(res) {
  return typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [res.headers.get('set-cookie')].filter(Boolean);
}

async function fetchJar(jar, url, init = {}) {
  const headers = new Headers(init.headers ?? {});
  headers.set(
    'User-Agent',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
  );
  const cookie = jar.header();
  if (cookie) headers.set('Cookie', cookie);
  const res = await fetch(url, { ...init, headers, redirect: 'manual' });
  jar.ingest(getSetCookie(res), new URL(url));
  return res;
}

const har = JSON.parse(readFileSync('c:/Users/ytmad/Downloads/mirus login.har', 'utf8'));
const post = har.log.entries[0].request.postData.text;
const params = new URLSearchParams(post);
const username = params.get('Model.UserName');
const password = params.get('Model.Password');
console.log('user', username);
console.log('password length', password?.length);
console.log('password has ?', password?.includes('?'));

const origin = 'https://neo.mirus.ch';
const returnUrl = '/webapp/home';
const loginUrl = `${origin}/Account/Login?ReturnUrl=${encodeURIComponent(returnUrl)}`;
const jar = new Jar();

const getRes = await fetchJar(jar, loginUrl, {
  headers: {
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-User': '?1',
    'Sec-Fetch-Dest': 'document',
  },
});
const html = await getRes.text();
const token =
  html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/i)?.[1] ||
  html.match(/value="([^"]+)"[^>]*name="__RequestVerificationToken"/i)?.[1];
console.log('GET', getRes.status, 'cookies', jar.names(), 'token', !!token);

const body = new URLSearchParams({
  _handler: 'login',
  __RequestVerificationToken: token,
  'Model.UserName': username,
  'Model.Password': password,
});
console.log('body matches encoding?', body.toString().includes('%40') && body.toString().includes('%3F'));

let postRes = await fetchJar(jar, loginUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    Origin: origin,
    Referer: loginUrl,
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Cache-Control': 'max-age=0',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-User': '?1',
    'Sec-Fetch-Dest': 'document',
  },
  body: body.toString(),
});

console.log('POST', postRes.status, 'loc', postRes.headers.get('location'));
console.log('cookies after POST', jar.names());
console.log('set-cookie raw count', getSetCookie(postRes).length);
for (const c of getSetCookie(postRes)) console.log(' set-cookie', c.slice(0, 200));

// Also try without first reading body of 302
let hops = 0;
while (postRes.status >= 300 && postRes.status < 400 && hops < 8) {
  const loc = postRes.headers.get('location');
  if (!loc) break;
  const next = new URL(loc, origin).toString();
  console.log('follow', next);
  postRes = await fetchJar(jar, next, {
    method: 'GET',
    headers: {
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      Referer: loginUrl,
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-User': '?1',
      'Sec-Fetch-Dest': 'document',
    },
  });
  hops++;
  console.log(' ', postRes.status, jar.names());
}

const finalHtml = await postRes.text();
console.log('final status', postRes.status, 'title', finalHtml.match(/<title[^>]*>([^<]+)/i)?.[1]);
console.log('has password field?', /id="password"|Model\.Password/i.test(finalHtml));
console.log('cookie dump', [...jar.store.values()].map((c) => c.raw));

// Try swagger
const sw = await fetchJar(jar, `${origin}/swagger/v1/swagger.json`, {
  headers: { Accept: 'application/json' },
});
console.log('swagger', sw.status, sw.headers.get('content-type'));
