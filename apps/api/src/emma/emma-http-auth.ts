import { generateSync } from 'otplib';
import { EmmaCookieJar } from './emma-cookie-jar';
import { emmaLaunchpadUrl, type EmmaLoginOpts } from './emma-login-types';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function extractHiddenFields(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<input[^>]+type=["']hidden["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const name = /name=["']([^"']+)["']/i.exec(tag)?.[1];
    const value = /value=["']([^"']*)["']/i.exec(tag)?.[1] ?? '';
    if (name) out[name] = value;
  }
  return out;
}

function extractFormAction(html: string, baseUrl: string): string | null {
  const formMatch = /<form[^>]+action=["']([^"']+)["']/i.exec(html);
  if (!formMatch?.[1]) return null;
  try {
    return new URL(formMatch[1], baseUrl).toString();
  } catch {
    return null;
  }
}

function isAdfsPage(html: string, url: string): boolean {
  return /signon\.radissonhotels\.com/i.test(url) || /userNameInput|UserName/i.test(html);
}

function isMfaPage(html: string, title: string): boolean {
  return /RHGMFA/i.test(title) || /ChallengeQuestionAnswer/i.test(html);
}

function isSapLogonPage(html: string): boolean {
  return (
    /sap-user|name=["']sap-user["']/i.test(html) &&
    /Log On|sap-password/i.test(html)
  );
}

export type EmmaHttpFetchResult = {
  status: number;
  url: string;
  html: string;
  title: string;
};

export async function emmaHttpFetch(
  jar: EmmaCookieJar,
  url: string,
  init: RequestInit = {},
  maxRedirects = 15,
): Promise<EmmaHttpFetchResult> {
  let current = url;
  for (let i = 0; i < maxRedirects; i++) {
    const target = new URL(current);
    const headers = new Headers(init.headers ?? {});
    if (!headers.has('User-Agent')) headers.set('User-Agent', BROWSER_UA);
    const cookie = jar.headerFor(target);
    if (cookie) headers.set('Cookie', cookie);
    const res = await fetch(current, {
      ...init,
      headers,
      redirect: 'manual',
    });
    const setCookies =
      typeof res.headers.getSetCookie === 'function'
        ? res.headers.getSetCookie()
        : res.headers.get('set-cookie')
          ? [res.headers.get('set-cookie')!]
          : [];
    jar.ingestSetCookie(setCookies, target);

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) break;
      current = new URL(loc, current).toString();
      init = { method: 'GET' };
      continue;
    }
    const html = await res.text();
    const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? '';
    return { status: res.status, url: current, html, title };
  }
  throw new Error('EMMA HTTP: zu viele Redirects.');
}

async function postForm(
  jar: EmmaCookieJar,
  action: string,
  fields: Record<string, string>,
  referer?: string,
): Promise<EmmaHttpFetchResult> {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return emmaHttpFetch(jar, action, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'text/html,application/xhtml+xml',
      ...(referer ? { Referer: referer } : {}),
    },
    body: body.toString(),
  });
}

/**
 * Full EMMA login over HTTP. Same four stages as the legacy browser flow,
 * using form posts. Stage 4 (property modal) is skipped when it does not appear in HTML.
 */
export async function emmaHttpLogin(
  opts: EmmaLoginOpts,
): Promise<EmmaCookieJar> {
  const jar = new EmmaCookieJar();
  const launchUrl = emmaLaunchpadUrl(opts);
  let page = await emmaHttpFetch(jar, launchUrl);

  if (page.html.includes('SAMLRequest') || page.html.includes('type="hidden"')) {
    const action = extractFormAction(page.html, page.url);
    const hidden = extractHiddenFields(page.html);
    if (action) {
      opts.progress?.('[EMMA HTTP] SAML → ADFS');
      page = await postForm(jar, action, hidden, page.url);
    }
  }

  if (isAdfsPage(page.html, page.url)) {
    if (!opts.adfsEmail?.trim() || !opts.adfsPassword) {
      throw new Error('EMMA HTTP Stage 1: ADFS credentials missing.');
    }
    opts.progress?.('[EMMA HTTP] Stage 1/4 ADFS');
    const fields = {
      ...extractHiddenFields(page.html),
      UserName: opts.adfsEmail.trim(),
      Password: opts.adfsPassword,
      AuthMethod: 'FormsAuthentication',
    };
    page = await postForm(jar, page.url, fields, page.url);
    await sleep(1200);
  }

  if (isMfaPage(page.html, page.title)) {
    if (!opts.totpSecret?.trim()) {
      throw new Error('EMMA HTTP Stage 2: MFA required but no TOTP seed.');
    }
    opts.progress?.('[EMMA HTTP] Stage 2/4 MFA');
    const code = generateSync({
      secret: opts.totpSecret.replace(/\s+/g, '').toUpperCase(),
    });
    const fields = {
      ...extractHiddenFields(page.html),
      ChallengeQuestionAnswer: code,
    };
    page = await postForm(jar, page.url, fields, page.url);
    await sleep(2000);
  }

  if (isSapLogonPage(page.html)) {
    if (!opts.sapUser?.trim() || !opts.sapPassword) {
      throw new Error('EMMA HTTP Stage 3: SAP credentials missing.');
    }
    opts.progress?.('[EMMA HTTP] Stage 3/4 SAP Logon');
    const fields = {
      ...extractHiddenFields(page.html),
      'sap-user': opts.sapUser.trim(),
      'sap-password': opts.sapPassword,
    };
    page = await postForm(jar, page.url, fields, page.url);
    await sleep(2000);
  }

  if (!page.url.includes('emma.rhg.radissonhotels.com')) {
    page = await emmaHttpFetch(jar, launchUrl);
  }

  opts.progress?.(`[EMMA HTTP] Login fertig: ${page.url}`);
  return jar;
}

/** Quick check: can we read OData metadata with current cookies? */
export async function emmaHttpProbeOData(
  jar: EmmaCookieJar,
  baseUrl: string,
  sapClient: string,
): Promise<boolean> {
  try {
    await emmaHttpFetchCsrfToken(jar, baseUrl, sapClient);
    return true;
  } catch {
    return false;
  }
}

/** GET service root with `x-csrf-token: Fetch` — returns token from response headers. */
export async function emmaHttpFetchCsrfToken(
  jar: EmmaCookieJar,
  baseUrl: string,
  sapClient: string,
  service = 'ZEYUI_RSRVS_SRV',
): Promise<string> {
  const url = `${baseUrl.replace(/\/+$/, '')}/sap/opu/odata/sap/${service}/?sap-client=${encodeURIComponent(sapClient)}`;
  const target = new URL(url);
  const headers = new Headers({
    'x-csrf-token': 'Fetch',
    Accept: 'application/json',
    'User-Agent': BROWSER_UA,
    'X-Requested-With': 'XMLHttpRequest',
  });
  const cookie = jar.headerFor(target);
  if (cookie) headers.set('Cookie', cookie);
  const res = await fetch(url, { method: 'GET', headers, redirect: 'manual' });
  const setCookies =
    typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  jar.ingestSetCookie(setCookies, target);
  const token = res.headers.get('x-csrf-token');
  if (!token) {
    throw new Error('EMMA HTTP: CSRF token missing (session expired?).');
  }
  if (!res.ok && res.status !== 401) {
    const t = await res.text().catch(() => '');
    throw new Error(`EMMA HTTP CSRF fetch failed: HTTP ${res.status} ${t.slice(0, 200)}`);
  }
  if (res.status === 401) {
    throw new Error('EMMA HTTP: Session abgelaufen (401). Bitte Session erneuern.');
  }
  return token;
}

export async function emmaHttpPostBatch(
  jar: EmmaCookieJar,
  baseUrl: string,
  service: string,
  sapClient: string,
  csrfToken: string,
  body: string,
  contentType: string,
): Promise<string> {
  const url = `${baseUrl.replace(/\/+$/, '')}/sap/opu/odata/sap/${service}/$batch?sap-client=${encodeURIComponent(sapClient)}`;
  const target = new URL(url);
  const headers = new Headers({
    Accept: 'multipart/mixed',
    'Content-Type': contentType,
    'x-csrf-token': csrfToken,
    'DataServiceVersion': '2.0',
    'MaxDataServiceVersion': '2.0',
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': BROWSER_UA,
  });
  const cookie = jar.headerFor(target);
  if (cookie) headers.set('Cookie', cookie);
  const res = await fetch(url, { method: 'POST', headers, body, redirect: 'manual' });
  const text = await res.text();
  if (!res.ok && res.status !== 202) {
    throw new Error(`EMMA OData $batch HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  return text;
}
