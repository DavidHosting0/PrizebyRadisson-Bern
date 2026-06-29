import { MirusCookieJar } from './mirus-cookie-jar';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export type MirusSessionStored = {
  cookies: ReturnType<MirusCookieJar['toJSON']>;
  savedAt: string;
};

function collectSetCookie(res: Response): string[] {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  const single = res.headers.get('set-cookie');
  return single ? [single] : [];
}

function parseAntiforgery(html: string): string | null {
  return (
    html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/i)?.[1] ||
    html.match(/value="([^"]+)"[^>]*name="__RequestVerificationToken"/i)?.[1] ||
    null
  );
}

async function fetchWithJar(
  jar: MirusCookieJar,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const u = new URL(url);
  const headers = new Headers(init.headers ?? {});
  if (!headers.has('user-agent')) headers.set('User-Agent', BROWSER_UA);
  const cookie = jar.headerFor(u);
  if (cookie) headers.set('Cookie', cookie);
  const res = await fetch(url, { ...init, headers, redirect: 'manual' });
  jar.ingestSetCookie(collectSetCookie(res), u);
  return res;
}

export async function mirusLogin(
  baseUrl: string,
  username: string,
  password: string,
  jar = new MirusCookieJar(),
): Promise<MirusCookieJar> {
  const origin = baseUrl.replace(/\/+$/, '');
  const loginUrl = `${origin}/Account/Login`;

  const getRes = await fetchWithJar(jar, loginUrl, { method: 'GET' });
  const html = await getRes.text();
  const token = parseAntiforgery(html);
  if (!token) {
    throw new Error('Mirus login page: antiforgery token not found');
  }

  const body = new URLSearchParams({
    _handler: 'login',
    __RequestVerificationToken: token,
    'Model.UserName': username,
    'Model.Password': password,
  });

  let postRes = await fetchWithJar(jar, loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: origin,
      Referer: loginUrl,
    },
    body: body.toString(),
    redirect: 'manual',
  });

  // Follow redirects (success → app home or return URL)
  for (let i = 0; i < 5 && postRes.status >= 300 && postRes.status < 400; i++) {
    const loc = postRes.headers.get('location');
    if (!loc) break;
    const next = new URL(loc, origin).toString();
    postRes = await fetchWithJar(jar, next, { method: 'GET' });
  }

  if (!jar.hasAuthCookie()) {
    const tail = await postRes.text().catch(() => '');
    if (/invalid|ungültig|failed|fehlgeschlagen/i.test(tail)) {
      throw new Error('Mirus login failed — check username and password');
    }
    throw new Error(
      'Mirus login did not set a session cookie — credentials may be wrong or 2FA required',
    );
  }

  return jar;
}

export async function mirusAuthenticatedFetch(
  jar: MirusCookieJar,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  let res = await fetchWithJar(jar, url, init);
  if (res.status === 401 || res.status === 403) {
    throw new Error(`Mirus request unauthorized (${res.status}): ${url}`);
  }
  // Follow redirects for GET
  if (
    (init.method ?? 'GET').toUpperCase() === 'GET' &&
    res.status >= 300 &&
    res.status < 400
  ) {
    const loc = res.headers.get('location');
    if (loc) {
      res = await fetchWithJar(jar, new URL(loc, url).toString(), { method: 'GET' });
    }
  }
  return res;
}

export async function mirusFetchJson(
  jar: MirusCookieJar,
  url: string,
): Promise<unknown> {
  const res = await mirusAuthenticatedFetch(jar, url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Mirus ${res.status} ${url}: ${text.slice(0, 200)}`);
  }
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('json')) {
    throw new Error(`Mirus expected JSON at ${url}, got ${ct}`);
  }
  return res.json() as Promise<unknown>;
}

export async function mirusFetchSwagger(jar: MirusCookieJar, baseUrl: string): Promise<{
  paths: string[];
  raw: unknown;
} | null> {
  const origin = baseUrl.replace(/\/+$/, '');
  const candidates = [`${origin}/swagger/v1/swagger.json`, `${origin}/swagger/v1/swagger.yaml`];
  for (const url of candidates) {
    try {
      const res = await mirusAuthenticatedFetch(jar, url, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) continue;
      const raw = (await res.json()) as { paths?: Record<string, unknown> };
      const paths = Object.keys(raw.paths ?? {});
      if (paths.length) return { paths, raw };
    } catch {
      /* try next */
    }
  }
  return null;
}

export function mirusScoreShiftPath(path: string): number {
  const p = path.toLowerCase();
  let score = 0;
  if (/shift|schicht|duty|dienst|schedule|plan|team|roster|employee|mitarbeiter/.test(p)) {
    score += 10;
  }
  if (p.includes('shift')) score += 5;
  if (p.includes('/api/')) score += 3;
  if (/\{.*date/i.test(p)) score += 2;
  if (/export|pdf|ical/.test(p)) score -= 5;
  return score;
}

export function isoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDaysLocal(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export { MirusCookieJar, BROWSER_UA };
