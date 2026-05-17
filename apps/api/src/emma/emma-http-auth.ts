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

/** ADFS interactive forms login (email + password) — not SAML relay-only pages. */
function isAdfsFormsLoginPage(html: string, url: string): boolean {
  if (!/signon\.radissonhotels\.com/i.test(url)) return false;
  const samlRelayOnly =
    html.includes('SAMLRequest') &&
    !/name=["']Password["']|type=["']password["']/i.test(html);
  if (samlRelayOnly) return false;
  return /name=["']UserName["']|id=["']userNameInput["']|userNameInput/i.test(html);
}

/** Radisson RHGMFA (legacy) or privacyIDEA TOTP (current ADFS). */
function isPrivacyIdeaMfaPage(html: string): boolean {
  return (
    /privacyIDEAADFSProvider/i.test(html) ||
    /one-time-password/i.test(html) ||
    /name=["']otp["']/i.test(html)
  );
}

function isLegacyRhMfaPage(html: string, title: string): boolean {
  return /RHGMFA/i.test(title) || /ChallengeQuestionAnswer/i.test(html);
}

function isMfaPage(html: string, title: string): boolean {
  return isPrivacyIdeaMfaPage(html) || isLegacyRhMfaPage(html, title);
}

function isSapLogonPage(html: string): boolean {
  return (
    /sap-user|name=["']sap-user["']/i.test(html) &&
    /Log On|sap-password/i.test(html)
  );
}

function isF5PolicyPage(url: string, html: string): boolean {
  return /\/my\.policy/i.test(url) || /BIG-IP|F5 Networks/i.test(html);
}

/**
 * Auto-submit SAML from EMMA/F5 to ADFS — never on signon.radissonhotels.com
 * (there every page has hidden fields and would loop forever).
 */
function isSamlBootstrapPage(html: string, url: string): boolean {
  if (/signon\.radissonhotels\.com/i.test(url)) return false;
  if (html.includes('SAMLRequest') || html.includes('SAMLResponse')) return true;
  if (/\/saml\/sp\/profile\/post\/acs/i.test(url)) return true;
  if (isF5PolicyPage(url, html) || isLaunchpadUrl(url) || /emma\.rhg\.radissonhotels\.com/i.test(url)) {
    const action = extractFormAction(html, url);
    return Boolean(
      action &&
        /signon\.radissonhotels\.com/i.test(action) &&
        html.includes('type="hidden"'),
    );
  }
  return false;
}

function isLaunchpadUrl(url: string): boolean {
  return /\/sap\/bc\/ui2\/flp/i.test(url);
}

function isLoginIncomplete(url: string, html: string, title: string): boolean {
  if (isAdfsFormsLoginPage(html, url) || isMfaPage(html, title) || isSapLogonPage(html)) {
    return true;
  }
  if (isF5PolicyPage(url, html)) return true;
  if (isSamlBootstrapPage(html, url)) return true;
  if (
    /signon\.radissonhotels\.com/i.test(url) &&
    !isPrivacyIdeaMfaPage(html) &&
    !isAdfsFormsLoginPage(html, url)
  ) {
    return true;
  }
  return false;
}

function extractSapLoginXsrf(html: string): string | null {
  const m =
    /name=["']sap-login-XSRF["'][^>]*value=["']([^"']+)["']/i.exec(html) ??
    /value=["']([^"']+)["'][^>]*name=["']sap-login-XSRF["']/i.exec(html);
  return m?.[1] ?? null;
}

function sapClientFromOpts(opts: EmmaLoginOpts): string {
  return opts.sapClient?.trim() || '100';
}

function extractMetaRefreshUrl(html: string, baseUrl: string): string | null {
  const m = html.match(
    /http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"'\s>]+)/i,
  );
  if (!m?.[1]) return null;
  try {
    return new URL(m[1], baseUrl).toString();
  } catch {
    return null;
  }
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

export type EmmaHttpLoginResult = {
  jar: EmmaCookieJar;
  finalUrl: string;
};

const MAX_LOGIN_ROUNDS = 18;

/**
 * Full EMMA login over HTTP (ADFS → MFA → SAP → Launchpad).
 * Loops until no further login pages appear or round limit is hit.
 * F5 `my.policy` is treated as a checkpoint, not success.
 */
export async function emmaHttpLogin(opts: EmmaLoginOpts): Promise<EmmaHttpLoginResult> {
  const jar = new EmmaCookieJar();
  const launchUrl = emmaLaunchpadUrl(opts);
  let page = await emmaHttpFetch(jar, launchUrl);
  let samlRelayCount = 0;

  for (let round = 0; round < MAX_LOGIN_ROUNDS; round++) {
    const stepHint = page.url.replace(/^https?:\/\//, '').slice(0, 72);
    opts.progress?.(`[EMMA HTTP] Runde ${round + 1}: ${stepHint}`);

    const metaRefresh = extractMetaRefreshUrl(page.html, page.url);
    if (metaRefresh && metaRefresh !== page.url) {
      page = await emmaHttpFetch(jar, metaRefresh);
      await sleep(400);
      continue;
    }

    if (isAdfsFormsLoginPage(page.html, page.url)) {
      if (!opts.adfsEmail?.trim() || !opts.adfsPassword) {
        throw new Error('EMMA HTTP Stage 1: ADFS credentials missing.');
      }
      opts.progress?.('[EMMA HTTP] Stage 1/4 ADFS');
      samlRelayCount = 0;
      page = await postForm(
        jar,
        page.url,
        {
          ...extractHiddenFields(page.html),
          UserName: opts.adfsEmail.trim(),
          Password: opts.adfsPassword,
          AuthMethod: 'FormsAuthentication',
        },
        page.url,
      );
      await sleep(1500);
      continue;
    }

    if (isSamlBootstrapPage(page.html, page.url)) {
      const action = extractFormAction(page.html, page.url);
      const hidden = extractHiddenFields(page.html);
      if (action) {
        samlRelayCount += 1;
        if (samlRelayCount > 3) {
          throw new Error(
            'EMMA HTTP: SAML-Weiterleitung zu ADFS wiederholt sich (kein Login-Formular).',
          );
        }
        opts.progress?.('[EMMA HTTP] SAML → ADFS');
        page = await postForm(jar, action, hidden, page.url);
        await sleep(1000);
        continue;
      }
    }

    if (isMfaPage(page.html, page.title)) {
      if (!opts.totpSecret?.trim()) {
        throw new Error('EMMA HTTP Stage 2: MFA required but no TOTP seed.');
      }
      const otp = generateSync({
        secret: opts.totpSecret.replace(/\s+/g, '').toUpperCase(),
      });
      opts.progress?.('[EMMA HTTP] Stage 2/4 MFA (TOTP)');
      if (isPrivacyIdeaMfaPage(page.html)) {
        page = await postForm(
          jar,
          page.url,
          {
            ...extractHiddenFields(page.html),
            AuthMethod: 'privacyIDEAADFSProvider',
            otp,
            Submit: 'Submit',
            autoSubmit: '0',
            mode: 'otp',
            pushAvailable: '0',
            otpAvailable: '1',
            webAuthnSignRequest: '',
            webAuthnSignResponse: '',
            modeChanged: '0',
            origin: '',
            authCounter: '0',
          },
          page.url,
        );
      } else {
        page = await postForm(
          jar,
          page.url,
          {
            ...extractHiddenFields(page.html),
            ChallengeQuestionAnswer: otp,
          },
          page.url,
        );
      }
      await sleep(2000);
      continue;
    }

    if (isSapLogonPage(page.html)) {
      if (!opts.sapUser?.trim() || !opts.sapPassword) {
        throw new Error('EMMA HTTP Stage 3: SAP credentials missing.');
      }
      opts.progress?.('[EMMA HTTP] Stage 3/4 SAP Logon');
      const xsrf = extractSapLoginXsrf(page.html);
      if (!xsrf) {
        throw new Error('EMMA HTTP Stage 3: sap-login-XSRF missing on logon page.');
      }
      const sapClient = sapClientFromOpts(opts);
      page = await postForm(
        jar,
        page.url,
        {
          ...extractHiddenFields(page.html),
          'sap-system-login-oninputprocessing': 'onLogin',
          'sap-urlscheme': '',
          'sap-system-login': 'onLogin',
          'sap-system-login-basic_auth': '',
          'sap-client': sapClient,
          'sap-language': 'EN',
          'sap-accessibility': '',
          'sap-login-XSRF': xsrf,
          'sap-system-login-cookie_disabled': '',
          'sap-hash': '',
          'hidden_message_to_show': '',
          'sap-user': opts.sapUser.trim(),
          'sap-password': opts.sapPassword,
        },
        page.url,
      );
      await sleep(2000);
      continue;
    }

    if (isF5PolicyPage(page.url, page.html)) {
      opts.progress?.('[EMMA HTTP] F5 my.policy — Session fortsetzen');
      const action = extractFormAction(page.html, page.url);
      if (action) {
        page = await postForm(jar, action, extractHiddenFields(page.html), page.url);
        await sleep(1200);
        continue;
      }
      page = await emmaHttpFetch(jar, launchUrl);
      await sleep(1200);
      continue;
    }

    if (isLoginIncomplete(page.url, page.html, page.title)) {
      page = await emmaHttpFetch(jar, launchUrl);
      await sleep(800);
      continue;
    }

    if (!isLaunchpadUrl(page.url)) {
      page = await emmaHttpFetch(jar, launchUrl);
      await sleep(800);
      continue;
    }

    break;
  }

  if (isLoginIncomplete(page.url, page.html, page.title)) {
    throw new Error(
      `EMMA HTTP-Login unvollständig nach ${MAX_LOGIN_ROUNDS} Schritten (letzte URL: ${page.url}).`,
    );
  }

  if (opts.operatorCode?.trim() && opts.operatorPassword) {
    const baseUrl = (opts.baseUrl || 'https://emma.rhg.radissonhotels.com').replace(/\/+$/, '');
    await emmaHttpPropertyLogin(
      jar,
      baseUrl,
      sapClientFromOpts(opts),
      opts.hotelId?.trim() || process.env.EMMA_HOTEL_ID?.trim() || 'CHBRNPR',
      opts.operatorCode.trim(),
      opts.operatorPassword,
      opts.progress,
    );
  }

  opts.progress?.(`[EMMA HTTP] Login fertig: ${page.url}`);
  return { jar, finalUrl: page.url };
}

const EMMA_ODATA_HOTEL_SRV = 'ZEYUI_HOTEL_SRV';

/** Stage 4 — property/operator via OData (from HAR capture). */
export async function emmaHttpPropertyLogin(
  jar: EmmaCookieJar,
  baseUrl: string,
  sapClient: string,
  hotelId: string,
  operatorCode: string,
  operatorPassword: string,
  progress?: (msg: string) => void,
): Promise<void> {
  progress?.('[EMMA HTTP] Stage 4/4 Property (OData)');
  const csrf = await emmaHttpFetchCsrfToken(jar, baseUrl, sapClient, EMMA_ODATA_HOTEL_SRV);
  const q = (s: string) => encodeURIComponent(`'${s}'`);
  const root = baseUrl.replace(/\/+$/, '');
  const steps = [
    `${root}/sap/opu/odata/sap/${EMMA_ODATA_HOTEL_SRV}/SetDefaultHotel?sap-client=${sapClient}&HotelId=${q(hotelId)}`,
    `${root}/sap/opu/odata/sap/${EMMA_ODATA_HOTEL_SRV}/CheckSharedUser?sap-client=${sapClient}&Employee=${q(operatorCode)}&Password=${q(operatorPassword)}&HotelId=${q(hotelId)}`,
    `${root}/sap/opu/odata/sap/${EMMA_ODATA_HOTEL_SRV}/FI_SET_EMPLOYEE_LOGIN?sap-client=${sapClient}&Employee=${q(operatorCode)}`,
  ];
  for (const url of steps) {
    const target = new URL(url);
    const headers = new Headers({
      'x-csrf-token': csrf,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': BROWSER_UA,
    });
    const cookie = jar.headerFor(target);
    if (cookie) headers.set('Cookie', cookie);
    const res = await fetch(url, { method: 'POST', headers, redirect: 'manual' });
    const setCookies =
      typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    jar.ingestSetCookie(setCookies, target);
    if (!res.ok && res.status !== 204) {
      const t = await res.text().catch(() => '');
      throw new Error(`EMMA HTTP Property step failed (${res.status}): ${t.slice(0, 300)}`);
    }
  }
}

/** Quick check: can we read OData metadata with current cookies? */
export async function emmaHttpProbeOData(
  jar: EmmaCookieJar,
  baseUrl: string,
  sapClient: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await emmaHttpFetchCsrfToken(jar, baseUrl, sapClient);
    return { ok: true };
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, reason };
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
