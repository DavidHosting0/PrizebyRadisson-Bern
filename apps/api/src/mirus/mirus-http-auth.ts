import { MirusCookieJar } from './mirus-cookie-jar';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';

/** Mirus NEO posts login with this return URL (see browser HAR). */
export const MIRUS_LOGIN_RETURN_URL = '/webapp/home';

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

/** Extract visible validation / alert text from a Mirus login HTML response. */
export function parseMirusLoginError(html: string): string | null {
  const candidates: string[] = [];
  for (const re of [
    /class="[^"]*(?:validation-summary|text-danger|alert)[^"]*"[^>]*>([\s\S]*?)<\//gi,
    /<li[^>]*>([^<]{8,160})<\/li>/gi,
  ]) {
    for (const m of html.matchAll(re)) {
      const text = m[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) candidates.push(text);
    }
  }
  const uniq = [...new Set(candidates)].filter((t) =>
    /passwort|password|benutzer|user|anmeld|login|ungültig|invalid|fehler|error|bestätig|confirm|2fa|mfa|fido|sperr/i.test(
      t,
    ),
  );
  return uniq[0]?.slice(0, 240) ?? null;
}

function navHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-User': '?1',
    'Sec-Ch-Ua': '"Chromium";v="150", "Google Chrome";v="150", "Not;A=Brand";v="8"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    ...extra,
  };
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

/**
 * HTTP login matching the browser flow:
 * GET /Account/Login?ReturnUrl=/webapp/home → POST same URL → 302 /webapp/Home + mirusWeb cookie.
 */
export async function mirusLogin(
  baseUrl: string,
  username: string,
  password: string,
  jar = new MirusCookieJar(),
): Promise<MirusCookieJar> {
  const origin = baseUrl.replace(/\/+$/, '');
  const loginUrl = `${origin}/Account/Login?ReturnUrl=${encodeURIComponent(MIRUS_LOGIN_RETURN_URL)}`;

  const getRes = await fetchWithJar(jar, loginUrl, {
    method: 'GET',
    headers: navHeaders({ 'Sec-Fetch-Site': 'none' }),
  });
  const html = await getRes.text();
  const token = parseAntiforgery(html);
  if (!token) {
    throw new Error('Mirus login page: antiforgery token not found');
  }

  // Field order matches browser HAR.
  const body = new URLSearchParams();
  body.set('_handler', 'login');
  body.set('__RequestVerificationToken', token);
  body.set('Model.UserName', username);
  body.set('Model.Password', password);

  let postRes = await fetchWithJar(jar, loginUrl, {
    method: 'POST',
    headers: {
      ...navHeaders({
        'Sec-Fetch-Site': 'same-origin',
        'Cache-Control': 'max-age=0',
      }),
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: origin,
      Referer: loginUrl,
    },
    body: body.toString(),
  });

  const location = postRes.headers.get('location');
  const redirectedHome =
    postRes.status >= 300 &&
    postRes.status < 400 &&
    !!location &&
    /\/webapp\/home/i.test(location);

  // Follow redirects (302 → /webapp/Home)
  for (let i = 0; i < 8 && postRes.status >= 300 && postRes.status < 400; i++) {
    const loc = postRes.headers.get('location');
    if (!loc) break;
    const next = new URL(loc, origin).toString();
    postRes = await fetchWithJar(jar, next, {
      method: 'GET',
      headers: navHeaders({
        'Sec-Fetch-Site': 'same-origin',
        Referer: loginUrl,
        'Cache-Control': 'max-age=0',
      }),
    });
  }

  if (jar.hasAuthCookie() || redirectedHome) {
    if (!jar.hasAuthCookie()) {
      // Redirect said success but cookie name unexpected — verify home is not login.
      const probe = await fetchWithJar(jar, `${origin}/webapp/Home`, {
        method: 'GET',
        headers: navHeaders({ 'Sec-Fetch-Site': 'same-origin', Referer: loginUrl }),
      });
      const probeHtml = await probe.text();
      if (probe.status === 200 && !/id="password"|Model\.Password/i.test(probeHtml)) {
        return jar;
      }
    } else {
      return jar;
    }
  }

  const tail = await postRes.text().catch(() => '');
  const parsed = parseMirusLoginError(tail);
  if (parsed) {
    throw new Error(`Mirus login failed: ${parsed}`);
  }
  if (/Model\.Password|id="password"/i.test(tail) || postRes.url?.includes?.('Login')) {
    throw new Error(
      'Mirus login failed — still on login page (wrong username/password or account locked)',
    );
  }
  throw new Error(
    `Mirus login did not set mirusWeb session cookie (got: ${jar.cookieNames().join(', ') || 'none'})`,
  );
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
