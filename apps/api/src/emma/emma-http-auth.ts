import { generateSync } from 'otplib';
import { EmmaCookieJar } from './emma-cookie-jar';
import {
  emmaLaunchpadUrl,
  emmaServerRoot,
  type EmmaLoginOpts,
} from './emma-login-types';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/** Decode &#x2f; &amp; etc. in URLs from SAP/Fiori HTML (meta refresh, form action). */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"');
}

function resolveHttpUrl(href: string, baseUrl: string): string | null {
  const decoded = decodeHtmlEntities(href.trim());
  try {
    return new URL(decoded, baseUrl).toString();
  } catch {
    return null;
  }
}

/** Fiori launchpad loaded (post-SAP) — ignore entity-encoded meta refresh in shell HTML. */
function isFioriLaunchpadShell(html: string): boolean {
  return /sap-ui-core|sap\.ushell|sapUShellFullHeight/i.test(html);
}

function extractHiddenFields(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<input[^>]+type=["']hidden["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const name = /name=["']([^"']+)["']/i.exec(tag)?.[1];
    const value = /value=["']([^"']*)["']/i.exec(tag)?.[1] ?? '';
    if (name) out[name] = decodeHtmlEntities(value);
  }
  return out;
}

function extractFormAction(html: string, baseUrl: string): string | null {
  const formMatch = /<form[^>]+action=["']([^"']+)["']/i.exec(html);
  if (!formMatch?.[1]) return null;
  return resolveHttpUrl(formMatch[1], baseUrl);
}

/** ADFS page after password accepted — MFA or SAML relay, not another login. */
function isAdfsPostAuthUrl(url: string): boolean {
  return /ssoCookie=MSISTempAuth/i.test(url);
}

/** ADFS interactive forms login (email + password) — not SAML relay-only pages. */
function isAdfsFormsLoginPage(html: string, url: string): boolean {
  if (!/signon\.radissonhotels\.com/i.test(url)) return false;
  if (isAdfsPostAuthUrl(url)) return false;
  const samlRelayOnly =
    html.includes('SAMLRequest') &&
    !/name=["']Password["']|type=["']password["']/i.test(html);
  if (samlRelayOnly) return false;
  const hasUser =
    /name=["']UserName["']/i.test(html) || /id=["']userNameInput["']/i.test(html);
  const hasPassword =
    /name=["']Password["']/i.test(html) ||
    /id=["']passwordInput["']/i.test(html) ||
    /type=["']password["']/i.test(html);
  return hasUser && hasPassword;
}

/** SAMLResponse auto-post on signon after MFA (HAR: before EMMA ACS). */
function isAdfsSamlResponsePage(html: string, url: string): boolean {
  return /signon\.radissonhotels\.com/i.test(url) && html.includes('SAMLResponse');
}

/** Radisson RHGMFA (legacy) or privacyIDEA TOTP (current ADFS). */
function isPrivacyIdeaMfaPage(html: string, url = ''): boolean {
  if (isAdfsPostAuthUrl(url) && !html.includes('SAMLResponse')) {
    return true;
  }
  const hidden = extractHiddenFields(html);
  if (hidden.Context && /privacyIDEA|otp/i.test(html + JSON.stringify(hidden))) {
    return true;
  }
  return (
    /privacyIDEAADFSProvider/i.test(html) ||
    /one-time-password/i.test(html) ||
    /name=["']otp["']/i.test(html)
  );
}

function isLegacyRhMfaPage(html: string, title: string): boolean {
  return /RHGMFA/i.test(title) || /ChallengeQuestionAnswer/i.test(html);
}

function isMfaPage(html: string, title: string, url = ''): boolean {
  return isPrivacyIdeaMfaPage(html, url) || isLegacyRhMfaPage(html, title);
}

/** SAP session active — launchpad URL after successful logon (HAR: ?sap-client=…). */
function isSapSessionEstablished(url: string): boolean {
  try {
    const u = new URL(url);
    return u.searchParams.has('sap-client') && /\/sap\/bc\/ui2\/flp/i.test(u.pathname);
  } catch {
    return false;
  }
}

/**
 * SAP UI2 logon form is detected purely by HTML markers — never by URL.
 * The same URL `/sap/bc/ui2/flp?sap-client=100` may render either the launchpad
 * (after auth) or the logon form (FIP rejected, no session). Title is `Logon`
 * either way until JavaScript runs.
 */
function isSapLogonPage(html: string, _url: string): boolean {
  return (
    /name=["']sap-password["']/i.test(html) &&
    /name=["']sap-user["']/i.test(html) &&
    /name=["']sap-login-XSRF["']/i.test(html)
  );
}

/** True if the current page is the actual Fiori shell, not the logon form. */
function isSapAuthenticated(page: EmmaHttpFetchResult): boolean {
  if (isSapLogonPage(page.html, page.url)) return false;
  return isSapSessionEstablished(page.url) || isFioriLaunchpadShell(page.html);
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
  if (
    isAdfsFormsLoginPage(html, url) ||
    isMfaPage(html, title, url) ||
    isAdfsSamlResponsePage(html, url) ||
    isSapLogonPage(html, url)
  ) {
    return true;
  }
  if (isF5PolicyPage(url, html)) return true;
  if (isSamlBootstrapPage(html, url)) return true;
  if (
    /signon\.radissonhotels\.com/i.test(url) &&
    !isPrivacyIdeaMfaPage(html, url) &&
    !isAdfsFormsLoginPage(html, url) &&
    !isAdfsSamlResponsePage(html, url)
  ) {
    return true;
  }
  return false;
}

function extractAdfsLoginError(html: string): string | null {
  const m =
    /id=["']errorText["'][^>]*>([^<]+)/i.exec(html) ??
    /loginMessage["']?\s*[^>]*>([^<]{4,200})/i.exec(html);
  const msg = m?.[1]?.replace(/\s+/g, ' ').trim();
  return msg && /invalid|incorrect|failed|fehlgeschlagen|error/i.test(msg) ? msg : null;
}

function extractSapLoginError(html: string): string | null {
  const hidden = extractHiddenFields(html);
  const banner = hidden.hidden_message_to_show?.replace(/\s+/g, ' ').trim() ?? '';
  if (
    banner.length > 3 &&
    !/credit card|cleartext|tokenized|IMPORTANT|cooperation/i.test(banner)
  ) {
    return banner;
  }
  const m =
    /sap-system-login-message[^>]*>([^<]{3,400})/i.exec(html) ??
    /class=["'][^"']*sapUiMsgError[^"']*["'][^>]*>([^<]+)/i.exec(html) ??
    /id=["']LOGIN_ERROR_BLOCK["'][^>]*>([\s\S]{0,400})/i.exec(html) ??
    /loginErrorMessage["']?\s*[^>]*>([^<]{4,300})/i.exec(html) ??
    /class=["'][^"']*urMsgBar[^"']*["'][^>]*>([\s\S]{0,300})/i.exec(html);
  const msg = m?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (msg && msg.length > 3) return msg;
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  const plain = text.match(
    /(?:password|passwort|logon|anmeldung|user|benutzer).{0,40}(?:invalid|incorrect|failed|falsch|ungültig|denied|gesperrt|locked)/i,
  );
  return plain?.[0]?.replace(/\s+/g, ' ').trim() ?? null;
}

/** SAP technical users are lowercase in EMMA (HAR: chbrnprf2). */
function normalizeSapUser(user: string): string {
  return user.trim().toLowerCase();
}

function extractSapLoginXsrf(html: string): string | null {
  const m =
    /name=["']sap-login-XSRF["'][^>]*value=["']([^"']+)["']/i.exec(html) ??
    /value=["']([^"']+)["'][^>]*name=["']sap-login-XSRF["']/i.exec(html);
  return m?.[1] ?? null;
}

/** Visible text (no markup) for diagnostic dumps. */
function htmlVisibleText(html: string, max = 600): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Names of all <input> fields (any type) — for diff between SAP rounds. */
function extractInputNames(html: string): string[] {
  const names: string[] = [];
  const re = /<input[^>]+name=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    names.push(m[1]);
  }
  return names;
}

function sapClientFromOpts(opts: EmmaLoginOpts): string {
  return opts.sapClient?.trim() || '100';
}

function extractMetaRefreshUrl(html: string, baseUrl: string): string | null {
  const m = html.match(
    /http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"'\s>]+)/i,
  );
  if (!m?.[1]) return null;
  return resolveHttpUrl(m[1], baseUrl);
}

/** Build /sap/bc/ui2/flp?sap-client=… on the server root, regardless of what baseUrl contains. */
function sapLaunchpadUrl(serverRoot: string, sapClient: string, hiddenMessage?: string): string {
  const root = new URL(serverRoot).origin;
  const u = new URL(`${root}/sap/bc/ui2/flp`);
  u.searchParams.set('sap-client', sapClient);
  u.searchParams.set('sap-language', 'EN');
  if (hiddenMessage?.trim()) {
    u.searchParams.set('hidden_message_to_show', hiddenMessage.trim());
  }
  return u.toString();
}

export type EmmaHttpFetchResult = {
  status: number;
  url: string;
  html: string;
  title: string;
  /** HTTP status codes seen while following redirects (e.g. POST 302 → GET 200). */
  statusTrail: number[];
};

export async function emmaHttpFetch(
  jar: EmmaCookieJar,
  url: string,
  init: RequestInit = {},
  maxRedirects = 15,
): Promise<EmmaHttpFetchResult> {
  let current = url;
  const statusTrail: number[] = [];
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
    statusTrail.push(res.status);
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
      const next = resolveHttpUrl(loc, current);
      if (!next) break;
      current = next;
      init = { method: 'GET' };
      continue;
    }
    const html = await res.text();
    const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? '';
    return { status: res.status, url: current, html, title, statusTrail };
  }
  throw new Error('EMMA HTTP: zu viele Redirects.');
}

function encodeFormPair(key: string, value: string): string {
  return `${encodeURIComponent(key)}=${encodeURIComponent(value).replace(/%20/g, '+')}`;
}

function encodeFormBody(pairs: Array<[string, string]>): string {
  return pairs.map(([k, v]) => encodeFormPair(k, v)).join('&');
}

async function postForm(
  jar: EmmaCookieJar,
  action: string,
  fields: Record<string, string>,
  referer?: string,
  extraHeaders?: Record<string, string>,
): Promise<EmmaHttpFetchResult> {
  const pairs: Array<[string, string]> = Object.entries(fields);
  return postFormOrdered(jar, action, pairs, referer, extraHeaders);
}

async function postFormOrdered(
  jar: EmmaCookieJar,
  action: string,
  pairs: Array<[string, string]>,
  referer?: string,
  extraHeaders?: Record<string, string>,
): Promise<EmmaHttpFetchResult> {
  return emmaHttpFetch(jar, action, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Cache-Control': 'max-age=0',
      'Upgrade-Insecure-Requests': '1',
      ...(referer ? { Referer: referer, Origin: new URL(referer).origin } : {}),
      ...extraHeaders,
    },
    body: encodeFormBody(pairs),
  });
}

export type EmmaHttpLoginResult = {
  jar: EmmaCookieJar;
  finalUrl: string;
};

const MAX_LOGIN_ROUNDS = 18;

type EmmaHttpProgress = EmmaLoginOpts['progress'];

function emmaHttpDebug(
  progress: EmmaHttpProgress,
  label: string,
  page: EmmaHttpFetchResult,
  jar: EmmaCookieJar,
  extra?: Record<string, string | number | boolean | null | undefined>,
): void {
  if (!progress) return;
  let sapClientParam: string | null = null;
  try {
    sapClientParam = new URL(page.url).searchParams.get('sap-client');
  } catch {
    /* ignore */
  }
  const flags = {
    adfsLogin: isAdfsFormsLoginPage(page.html, page.url),
    mfa: isMfaPage(page.html, page.title, page.url),
    samlResponse: isAdfsSamlResponsePage(page.html, page.url),
    sapLogon: isSapLogonPage(page.html, page.url),
    sapSession: isSapSessionEstablished(page.url),
    fioriShell: isFioriLaunchpadShell(page.html),
    f5: isF5PolicyPage(page.url, page.html),
    launchpad: isLaunchpadUrl(page.url),
  };
  const trail =
    page.statusTrail.length > 0 ? ` trail=[${page.statusTrail.join('→')}]` : '';
  progress(
    `[EMMA HTTP DEBUG] ${label} status=${page.status}${trail} cookies=${jar.toJSON().length} htmlBytes=${page.html.length} sap-client=${sapClientParam ?? '—'}`,
  );
  progress(`[EMMA HTTP DEBUG] ${label} url=${page.url}`);
  if (page.title) {
    progress(`[EMMA HTTP DEBUG] ${label} title=${page.title.slice(0, 120)}`);
  }
  progress(`[EMMA HTTP DEBUG] ${label} detect=${JSON.stringify(flags)}`);
  if (extra) {
    const parts = Object.entries(extra)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}=${v}`);
    if (parts.length > 0) {
      progress(`[EMMA HTTP DEBUG] ${label} ${parts.join(' ')}`);
    }
  }
}

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
  let adfsCredentialsPosted = false;
  let sapCredentialsPosted = false;

  const dbg = opts.progress;

  for (let round = 0; round < MAX_LOGIN_ROUNDS; round++) {
    const stepHint = page.url.replace(/^https?:\/\//, '').slice(0, 72);
    opts.progress?.(`[EMMA HTTP] Runde ${round + 1}: ${stepHint}`);
    emmaHttpDebug(dbg, `runde-${round + 1}-eingang`, page, jar, {
      adfsPosted: adfsCredentialsPosted,
      sapPosted: sapCredentialsPosted,
    });

    if (isSapSessionEstablished(page.url) && !isSapLogonPage(page.html, page.url)) {
      opts.progress?.('[EMMA HTTP] Stage 3/4 SAP — Session aktiv');
      break;
    }

    const metaRefresh = extractMetaRefreshUrl(page.html, page.url);
    const skipMetaRefresh =
      isSapSessionEstablished(page.url) ||
      (sapCredentialsPosted && isFioriLaunchpadShell(page.html)) ||
      (metaRefresh?.includes('&#') ?? false);
    if (metaRefresh && metaRefresh !== page.url && !skipMetaRefresh) {
      opts.progress?.(`[EMMA HTTP] Meta-Refresh → ${metaRefresh.replace(/^https?:\/\//, '').slice(0, 100)}`);
      page = await emmaHttpFetch(jar, metaRefresh);
      emmaHttpDebug(dbg, 'nach-meta-refresh', page, jar);
      await sleep(400);
      continue;
    }
    if (metaRefresh && skipMetaRefresh) {
      opts.progress?.(
        `[EMMA HTTP] Meta-Refresh übersprungen (skip: sapSession=${isSapSessionEstablished(page.url)} fiori=${isFioriLaunchpadShell(page.html)} encoded=${metaRefresh.includes('&#')})`,
      );
    }

    if (isAdfsSamlResponsePage(page.html, page.url)) {
      const action = extractFormAction(page.html, page.url);
      const hidden = extractHiddenFields(page.html);
      if (action && hidden.SAMLResponse) {
        opts.progress?.('[EMMA HTTP] SAML Response → EMMA');
        samlRelayCount = 0;
        page = await postForm(jar, action, hidden, page.url);
        await sleep(1500);
        continue;
      }
    }

    if (isMfaPage(page.html, page.title, page.url)) {
      if (!opts.totpSecret?.trim()) {
        throw new Error('EMMA HTTP Stage 2: MFA required but no TOTP seed.');
      }
      const otp = generateSync({
        secret: opts.totpSecret.replace(/\s+/g, '').toUpperCase(),
      });
      opts.progress?.('[EMMA HTTP] Stage 2/4 MFA (TOTP)');
      if (isPrivacyIdeaMfaPage(page.html, page.url)) {
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

    if (isAdfsFormsLoginPage(page.html, page.url)) {
      if (!opts.adfsEmail?.trim() || !opts.adfsPassword) {
        throw new Error('EMMA HTTP Stage 1: ADFS credentials missing.');
      }
      if (adfsCredentialsPosted) {
        const err = extractAdfsLoginError(page.html);
        throw new Error(
          err
            ? `EMMA HTTP Stage 1: ADFS abgelehnt — ${err}`
            : 'EMMA HTTP Stage 1: ADFS-Login wiederholt sich (Passwort oder Konto prüfen).',
        );
      }
      opts.progress?.('[EMMA HTTP] Stage 1/4 ADFS');
      samlRelayCount = 0;
      adfsCredentialsPosted = true;
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
      const adfsErr = extractAdfsLoginError(page.html);
      if (adfsErr) {
        throw new Error(`EMMA HTTP Stage 1: ADFS abgelehnt — ${adfsErr}`);
      }
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

    if (isSapLogonPage(page.html, page.url)) {
      if (sapCredentialsPosted) {
        emmaHttpDebug(dbg, 'sap-wiederholung', page, jar, {
          sapUser: normalizeSapUser(opts.sapUser ?? ''),
          xsrfOnPage: Boolean(extractSapLoginXsrf(page.html)),
          pwdLen: opts.sapPassword?.trim().length ?? 0,
        });
        const err = extractSapLoginError(page.html);
        const titleHint = page.title ? ` title="${page.title.slice(0, 80)}"` : '';
        throw new Error(
          err
            ? `EMMA HTTP Stage 3: SAP abgelehnt — ${err}${titleHint}`
            : `EMMA HTTP Stage 3: SAP-Logon wiederholt sich (Benutzer/Passwort in Admin → EMMA prüfen).${titleHint} URL ohne sap-client=${!isSapSessionEstablished(page.url)} fioriShell=${isFioriLaunchpadShell(page.html)}`,
        );
      }
      const xsrf = extractSapLoginXsrf(page.html);
      if (!xsrf) {
        throw new Error('EMMA HTTP Stage 3: sap-login-XSRF missing on logon page.');
      }
      const sapClient = sapClientFromOpts(opts);
      const sapAction = extractFormAction(page.html, page.url) ?? page.url;
      const sapHidden = extractHiddenFields(page.html);
      const hiddenMsg = sapHidden.hidden_message_to_show ?? '';
      const cookieNames = jar.toJSON().map((c) => c.name);
      const isFipSession =
        cookieNames.some((n) => /sap-login-XSRF_FIP/i.test(n)) ||
        cookieNames.some((n) => /MSISAuthenticated/i.test(n));
      sapCredentialsPosted = true;

      // Stage 3a — SAP Federated Identity Provider (preferred path):
      // After SAML, jumping to the launchpad with ?sap-client=… either (i) lands
      // straight in the Fiori shell (FIP session honoured) or (ii) re-renders the
      // logon form on the new URL, in which case the credentials POST below uses
      // the fresh XSRF / form action from this URL — which is what the browser does.
      if (isFipSession) {
        opts.progress?.('[EMMA HTTP] Stage 3/4 SAP — FIP-Session erkannt, GET kanonische Launchpad-URL');
        const root = emmaServerRoot(opts);
        const canon = sapLaunchpadUrl(root, sapClient, hiddenMsg);
        opts.progress?.(
          `[EMMA HTTP] SAP FIP → GET ${canon.replace(/^https?:\/\//, '').slice(0, 110)}`,
        );
        page = await emmaHttpFetch(jar, canon, {
          headers: {
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin',
            Referer: page.url,
          },
        });
        emmaHttpDebug(dbg, 'nach-fip-canonical', page, jar, {
          authenticated: isSapAuthenticated(page),
        });
        if (isSapAuthenticated(page)) {
          opts.progress?.('[EMMA HTTP] Stage 3/4 SAP Logon OK (FIP)');
          break;
        }
        // Logon form is still showing — try a "claim FIP session" POST without
        // credentials first; if SAP still won't yield, fall through to the
        // classic credentials POST using the fresh XSRF below.
        if (isSapLogonPage(page.html, page.url)) {
          const xsrf2 = extractSapLoginXsrf(page.html) ?? xsrf;
          const action2 = extractFormAction(page.html, page.url) ?? page.url;
          const fipPairs: Array<[string, string]> = [
            ['sap-system-login-oninputprocessing', 'onLogin'],
            ['sap-urlscheme', ''],
            ['sap-system-login', 'onLogin'],
            ['sap-system-login-basic_auth', ''],
            ['sap-client', sapClient],
            ['sap-language', 'EN'],
            ['sap-accessibility', ''],
            ['sap-login-XSRF', xsrf2],
            ['sap-system-login-cookie_disabled', ''],
            ['sap-hash', ''],
            ['hidden_message_to_show', hiddenMsg],
          ];
          opts.progress?.(
            `[EMMA HTTP] SAP FIP → POST ohne Credentials xsrfLen=${xsrf2.length} action=${action2.replace(/^https?:\/\//, '').slice(0, 90)}`,
          );
          page = await postFormOrdered(jar, action2, fipPairs, page.url, {
            'Accept-Language': 'en-US,en;q=0.9,de;q=0.8',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-User': '?1',
          });
          emmaHttpDebug(dbg, 'nach-fip-post', page, jar, {
            authenticated: isSapAuthenticated(page),
          });
          if (isSapAuthenticated(page)) {
            opts.progress?.('[EMMA HTTP] Stage 3/4 SAP Logon OK (FIP-POST)');
            break;
          }
        }
        opts.progress?.('[EMMA HTTP] FIP-Pfad ohne Erfolg — Fallback mit User/Pwd auf der frischen Logon-Seite');
      }

      // Stage 3b — Classic SAP credentials POST. Uses the *current* page (which
      // may now be the canonical /flp?sap-client=100 logon form rendered after
      // the FIP attempt) — fresh XSRF, fresh form action, fresh hidden fields.
      if (!opts.sapUser?.trim() || !opts.sapPassword) {
        throw new Error(
          'EMMA HTTP Stage 3: SAP credentials missing (FIP-Pfad fehlgeschlagen, klassischer Login nicht möglich).',
        );
      }
      if (!isSapLogonPage(page.html, page.url)) {
        opts.progress?.('[EMMA HTTP] SAP-Logon-Seite verschwunden, hole sie erneut.');
        const root = emmaServerRoot(opts);
        page = await emmaHttpFetch(jar, sapLaunchpadUrl(root, sapClient, hiddenMsg), {
          headers: { Referer: page.url },
        });
        emmaHttpDebug(dbg, 'logon-refresh', page, jar);
      }
      const xsrfNow = extractSapLoginXsrf(page.html) ?? xsrf;
      const actionNow = extractFormAction(page.html, page.url) ?? sapAction;
      const hiddenNow = extractHiddenFields(page.html);
      const hiddenMsgNow = hiddenNow.hidden_message_to_show ?? hiddenMsg;
      const sapUser = normalizeSapUser(opts.sapUser ?? '');
      const sapPassword = opts.sapPassword;
      const beforePostHidden = Object.keys(hiddenNow);
      const beforePostInputs = extractInputNames(page.html);
      const beforePostBytes = page.html.length;
      opts.progress?.(
        `[EMMA HTTP] SAP POST user=${sapUser} client=${sapClient} action=${actionNow.replace(/^https?:\/\//, '').slice(0, 90)} xsrfLen=${xsrfNow.length} hiddenMsgLen=${hiddenMsgNow.length} pwdLen=${sapPassword.length} cookies=[${jar.toJSON().map((c) => c.name).join(',')}]`,
      );

      const sapPairs: Array<[string, string]> = [
        ['sap-system-login-oninputprocessing', 'onLogin'],
        ['sap-urlscheme', ''],
        ['sap-system-login', 'onLogin'],
        ['sap-system-login-basic_auth', ''],
        ['sap-client', sapClient],
        ['sap-language', 'EN'],
        ['sap-accessibility', ''],
        ['sap-login-XSRF', xsrfNow],
        ['sap-system-login-cookie_disabled', ''],
        ['sap-hash', ''],
        ['hidden_message_to_show', hiddenMsgNow],
        ['sap-user', sapUser],
        ['sap-password', sapPassword],
      ];
      page = await postFormOrdered(jar, actionNow, sapPairs, page.url, {
        'Accept-Language': 'en-US,en;q=0.9,de;q=0.8',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
      });
      emmaHttpDebug(dbg, 'nach-sap-post', page, jar, {
        sapUser,
        authenticated: isSapAuthenticated(page),
        sapLogonStill: isSapLogonPage(page.html, page.url),
        expectedRedirect: page.statusTrail.includes(302),
      });
      if (isSapAuthenticated(page)) {
        opts.progress?.('[EMMA HTTP] Stage 3/4 SAP Logon OK');
        break;
      }
      if (isFioriLaunchpadShell(page.html) && !isSapLogonPage(page.html, page.url)) {
        const root = emmaServerRoot(opts);
        const canon = sapLaunchpadUrl(root, sapClient, hiddenMsgNow);
        opts.progress?.(`[EMMA HTTP] SAP Fiori-Shell → kanonische URL ${canon.replace(/^https?:\/\//, '').slice(0, 100)}`);
        page = await emmaHttpFetch(jar, canon);
        emmaHttpDebug(dbg, 'nach-sap-kanonisch', page, jar, {
          authenticated: isSapAuthenticated(page),
        });
        if (isSapAuthenticated(page)) {
          opts.progress?.('[EMMA HTTP] Stage 3/4 SAP Logon OK');
          break;
        }
      }
      if (page.status === 200 && isSapLogonPage(page.html, page.url)) {
        const sapHint = extractSapLoginError(page.html);
        const afterInputs = extractInputNames(page.html);
        const newInputs = afterInputs.filter((n) => !beforePostInputs.includes(n));
        const lostInputs = beforePostInputs.filter((n) => !afterInputs.includes(n));
        const afterHidden = extractHiddenFields(page.html);
        const changedHidden = beforePostHidden.filter(
          (k) => hiddenNow[k] !== afterHidden[k] && k !== 'sap-login-XSRF',
        );
        const visible = htmlVisibleText(page.html, 800);
        opts.progress?.(
          `[EMMA HTTP] SAP POST → HTTP 200 ohne Redirect. bytesΔ=${page.html.length - beforePostBytes} newInputs=${JSON.stringify(newInputs)} lostInputs=${JSON.stringify(lostInputs)} changedHidden=${JSON.stringify(changedHidden)}`,
        );
        opts.progress?.(`[EMMA HTTP] SAP Antwort sichtbarer Text: ${visible}`);
        if (sapHint) {
          throw new Error(`EMMA HTTP Stage 3: SAP abgelehnt — ${sapHint}`);
        }
        throw new Error(
          `EMMA HTTP Stage 3: SAP-Logon abgelehnt (HTTP 200, kein Redirect). ` +
            `Wahrscheinlich falsches SAP-Passwort oder gesperrter Account. ` +
            `Sichtbarer Text auf der Logon-Seite: ${visible.slice(0, 240) || '(leer)'}`,
        );
      }
      const sapErr = extractSapLoginError(page.html);
      if (sapErr) {
        throw new Error(`EMMA HTTP Stage 3: SAP abgelehnt — ${sapErr}`);
      }
      opts.progress?.(
        '[EMMA HTTP] SAP POST ohne sap-client in URL — nächste Runde (Logon-Formular noch sichtbar oder Redirect fehlgeschlagen)',
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
    emmaHttpDebug(dbg, 'login-unvollständig', page, jar, {
      adfsPosted: adfsCredentialsPosted,
      sapPosted: sapCredentialsPosted,
    });
    const hint = isAdfsPostAuthUrl(page.url)
      ? ' (nach ADFS-Passwort: MFA/TOTP oder SAML — prüfe TOTP-Seed und Server-Uhrzeit)'
      : '';
    throw new Error(
      `EMMA HTTP-Login unvollständig nach ${MAX_LOGIN_ROUNDS} Schritten (letzte URL: ${page.url})${hint}.`,
    );
  }

  if (opts.operatorCode?.trim() && opts.operatorPassword) {
    const root = emmaServerRoot(opts);
    await emmaHttpPropertyLogin(
      jar,
      root,
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

/** Strip optional `/sap/...` suffix so callers can pass either origin or full launchpad URL. */
function emmaOriginOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return baseUrl.replace(/\/+$/, '').replace(/\/sap\/.*/i, '');
  }
}

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
  const root = emmaOriginOf(baseUrl);
  const csrf = await emmaHttpFetchCsrfToken(jar, root, sapClient, EMMA_ODATA_HOTEL_SRV);
  const q = (s: string) => encodeURIComponent(`'${s}'`);
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
  const root = emmaOriginOf(baseUrl);
  const url = `${root}/sap/opu/odata/sap/${service}/?sap-client=${encodeURIComponent(sapClient)}`;
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
