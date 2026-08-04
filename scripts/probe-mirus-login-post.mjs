/**
 * Dry-run Mirus login with dummy credentials to inspect response shape.
 * Usage: node scripts/probe-mirus-login-post.mjs [username] [password]
 */
import { writeFileSync } from 'node:fs';

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
      for (const attr of line.split(';').slice(1)) {
        const [k, v] = attr.trim().split('=');
        if (/^path$/i.test(k) && v) path = v.trim();
      }
      this.store.set(`${path}|${name}`, { name, value, path, raw: line.slice(0, 120) });
    }
  }
  header() {
    return [...this.store.values()].map((c) => `${c.name}=${c.value}`).join('; ');
  }
  names() {
    return [...this.store.values()].map((c) => c.name);
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
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  );
  const cookie = jar.header();
  if (cookie) headers.set('Cookie', cookie);
  const res = await fetch(url, { ...init, headers, redirect: 'manual' });
  jar.ingest(getSetCookie(res), new URL(url));
  return res;
}

async function main() {
  const username = process.argv[2] || 'probe-user';
  const password = process.argv[3] || 'probe-pass';
  const origin = 'https://neo.mirus.ch';
  const loginUrl = `${origin}/Account/Login`;
  const jar = new Jar();

  const getRes = await fetchJar(jar, loginUrl);
  const html = await getRes.text();
  const token =
    html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/i)?.[1] ||
    html.match(/value="([^"]+)"[^>]*name="__RequestVerificationToken"/i)?.[1];
  console.log('GET status', getRes.status, 'cookies', jar.names());
  console.log('token?', !!token);

  const body = new URLSearchParams({
    _handler: 'login',
    __RequestVerificationToken: token,
    'Model.UserName': username,
    'Model.Password': password,
  });

  let postRes = await fetchJar(jar, loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: origin,
      Referer: loginUrl,
      Accept: 'text/html,application/xhtml+xml',
    },
    body: body.toString(),
  });

  console.log('POST status', postRes.status);
  console.log('POST location', postRes.headers.get('location'));
  console.log('cookies after POST', jar.names());

  let hops = 0;
  while (postRes.status >= 300 && postRes.status < 400 && hops < 8) {
    const loc = postRes.headers.get('location');
    if (!loc) break;
    const next = new URL(loc, origin).toString();
    console.log('follow', postRes.status, '→', next);
    postRes = await fetchJar(jar, next, { method: 'GET' });
    hops += 1;
    console.log('  status', postRes.status, 'cookies', jar.names());
  }

  const finalHtml = await postRes.text();
  writeFileSync('scripts/mirus-login-post-result.html', finalHtml);
  console.log('final status', postRes.status, 'len', finalHtml.length);
  console.log('title', finalHtml.match(/<title[^>]*>([^<]+)/i)?.[1]);
  console.log('still login?', /Account\/Login|Anmelden/i.test(finalHtml) && /Model\.Password/i.test(finalHtml));
  const validation = [
    ...finalHtml.matchAll(/class="[^"]*validation[^"]*"[^>]*>([^<]+)/gi),
    ...finalHtml.matchAll(/alert[^>]*>([^<]{5,80})/gi),
    ...finalHtml.matchAll(/text-danger[^>]*>([^<]+)/gi),
  ].map((m) => m[1].trim());
  console.log('validation hints', [...new Set(validation)].slice(0, 10));
  console.log('cookie dump', [...jar.store.values()].map((c) => c.raw));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
