import { Logger } from '@nestjs/common';
import { chromium, type Browser, type Page } from 'playwright';
import type { MirusShift } from './mirus-shift.types';
import {
  addDaysLocal,
  BROWSER_UA,
  isoDateLocal,
  mirusAuthenticatedFetch,
  mirusFetchSwagger,
  mirusLogin,
  mirusScoreShiftPath,
  MirusCookieJar,
  type MirusSessionStored,
} from './mirus-http-auth';

const logger = new Logger('MirusShiftSync');

/**
 * Scrape the expanded Dienstplan day list (after clicking a team avatar).
 * Structure: `.card.card-default .row.mb-3` with name + "Arbeitszeit" + "HH:MM - HH:MM".
 */
function scrapeShiftsInBrowser(dateStr: string) {
  const TIME = /(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/;

  function combine(date: string, time: string): string | null {
    const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    const tm = /^(\d{1,2}):(\d{2})/.exec(time);
    if (!dm || !tm) return null;
    const d = new Date(
      Number(dm[1]),
      Number(dm[2]) - 1,
      Number(dm[3]),
      Number(tm[1]),
      Number(tm[2]),
    );
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  const out: Array<{
    displayName: string;
    externalUserId: string;
    startsAt: string;
    endsAt: string;
    label: string | null;
    sourceId: string;
  }> = [];
  const seen = new Set<string>();

  const WEEKDAY_DATE =
    /^(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/i;
  const LOOKS_LIKE_CALENDAR =
    /\b\d{1,2}\.\s*(januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)\b/i;

  function isPersonName(name: string): boolean {
    const n = name.trim();
    if (n.length < 3) return false;
    if (WEEKDAY_DATE.test(n)) return false;
    if (LOOKS_LIKE_CALENDAR.test(n)) return false;
    if (/^(Arbeitszeit|Pause|Anwesend|Abwesend|Absenz|Ferien)$/i.test(n)) return false;
    if (/^[A-Z]{1,4}$/.test(n)) return false;
    return true;
  }

  const rows = document.querySelectorAll('.card.card-default .row.mb-3, .card .row.mb-3');
  for (const row of rows) {
    const text = row.textContent ?? '';
    if (!/Arbeitszeit/i.test(text)) continue;
    if (/Absenztyp|Ferien|\bAbsenz\b/i.test(text) && !/Arbeitszeit/i.test(text)) continue;

    const nameEl = row.querySelector('.fw-bold, .small.fw-bold');
    let displayName = nameEl?.textContent?.trim() || '';
    if (!displayName) {
      const lines = text
        .split(/\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      displayName =
        lines.find(
          (l) =>
            isPersonName(l) &&
            !TIME.test(l),
        ) || '';
    }
    if (!isPersonName(displayName)) continue;

    const img = row.querySelector('img[src*="/Persons/"]') as HTMLImageElement | null;
    const personMatch = img?.getAttribute('src')?.match(/\/Persons\/([0-9a-f-]{36})\//i);
    const externalUserId = (personMatch?.[1] || displayName.toLowerCase().replace(/\s+/g, ' ')).trim();

    let workStart: string | null = null;
    let workEnd: string | null = null;
    let label: string | null = null;

    for (const lineRow of row.querySelectorAll('.row.mb-1')) {
      const cols = lineRow.querySelectorAll('.col-6');
      if (cols.length < 2) continue;
      const labelText = cols[0]?.textContent?.trim() ?? '';
      const valueText = cols[1]?.textContent?.trim() ?? '';
      if (/^Arbeitszeit$/i.test(labelText)) {
        const m = TIME.exec(valueText);
        if (m) {
          workStart = m[1];
          workEnd = m[2];
        }
      }
    }

    if (!workStart || !workEnd) {
      // Fallback: first time range after "Arbeitszeit" in plain text
      const idx = text.search(/Arbeitszeit/i);
      const m = idx >= 0 ? TIME.exec(text.slice(idx)) : TIME.exec(text);
      if (!m) continue;
      workStart = m[1];
      workEnd = m[2];
    }

    const badge = row.querySelector('.badge')?.textContent?.trim();
    if (badge) label = badge.replace(/\s+/g, ' ');

    const startsAt = combine(dateStr, workStart);
    let endsAt = combine(dateStr, workEnd);
    if (!startsAt || !endsAt) continue;
    if (new Date(endsAt) <= new Date(startsAt)) {
      const end = new Date(endsAt);
      end.setDate(end.getDate() + 1);
      endsAt = end.toISOString();
    }

    const key = `${externalUserId}|${startsAt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      displayName,
      externalUserId,
      startsAt,
      endsAt,
      label,
      sourceId: `${externalUserId}-${startsAt}`,
    });
  }

  // Fallback: parse body text blocks if card markup not found
  if (out.length === 0) {
    const body = document.body?.innerText || '';
    const lines = body.split(/\n/).map((l) => l.trim()).filter(Boolean);
    let i = 0;
    while (i < lines.length) {
      if (lines[i] === 'Arbeitszeit' && lines[i + 1] && TIME.test(lines[i + 1])) {
        const m = TIME.exec(lines[i + 1])!;
        let displayName = '';
        for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
          const l = lines[j];
          if (/^(Pause|Anwesend|Abwesend|K\d|H|T|F\d)$/i.test(l)) continue;
          if (/^[A-Z]{1,4}$/.test(l)) continue;
          if (TIME.test(l)) continue;
          if (!isPersonName(l)) continue;
          if (l.length > 3) {
            displayName = l;
            break;
          }
        }
        if (displayName && isPersonName(displayName)) {
          const externalUserId = displayName.toLowerCase().replace(/\s+/g, ' ');
          const startsAt = combine(dateStr, m[1]);
          let endsAt = combine(dateStr, m[2]);
          if (startsAt && endsAt) {
            if (new Date(endsAt) <= new Date(startsAt)) {
              const end = new Date(endsAt);
              end.setDate(end.getDate() + 1);
              endsAt = end.toISOString();
            }
            const key = `${externalUserId}|${startsAt}`;
            if (!seen.has(key)) {
              seen.add(key);
              out.push({
                displayName,
                externalUserId,
                startsAt,
                endsAt,
                label: null,
                sourceId: `${externalUserId}-${startsAt}`,
              });
            }
          }
        }
      }
      i += 1;
    }
  }

  return out;
}

function normalizeApiShifts(payload: unknown, dateStr: string): MirusShift[] {
  const out: MirusShift[] = [];
  const walk = (node: unknown, depth = 0): void => {
    if (depth > 8 || node == null) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (typeof node !== 'object') return;
    const o = node as Record<string, unknown>;
    const startsRaw =
      o.startsAt ?? o.start ?? o.from ?? o.begin ?? o.startTime ?? o.startDateTime;
    const endsRaw = o.endsAt ?? o.end ?? o.until ?? o.endTime ?? o.endDateTime;
    const nameRaw =
      o.displayName ??
      o.fullName ??
      o.employeeName ??
      o.userName ??
      (typeof o.user === 'object' && o.user
        ? ((o.user as Record<string, unknown>).fullName ??
          (o.user as Record<string, unknown>).name)
        : undefined) ??
      o.name;
    const idRaw = o.employeeId ?? o.userId ?? o.personId ?? o.id ?? nameRaw;

    if (startsRaw && endsRaw && nameRaw) {
      const startsAt = new Date(String(startsRaw));
      let endsAt = new Date(String(endsRaw));
      if (!Number.isNaN(startsAt.getTime()) && !Number.isNaN(endsAt.getTime())) {
        if (endsAt <= startsAt) {
          endsAt = new Date(endsAt.getTime() + 86400000);
        }
        const displayName = String(nameRaw).trim();
        const externalUserId = String(idRaw ?? displayName).trim();
        out.push({
          externalUserId,
          displayName: displayName,
          startsAt,
          endsAt,
          sourceId: String(o.id ?? `${externalUserId}-${startsAt.toISOString()}`),
          label:
            o.label != null
              ? String(o.label)
              : o.shortDescription != null
                ? String(o.shortDescription)
                : null,
        });
      }
    }

    for (const v of Object.values(o)) {
      if (v && typeof v === 'object') walk(v, depth + 1);
    }
  };
  walk(payload);
  void dateStr;
  return out;
}

async function tryApiPaths(
  jar: MirusCookieJar,
  origin: string,
  from: Date,
  to: Date,
  swaggerPaths: string[],
): Promise<MirusShift[]> {
  const scored = [...swaggerPaths]
    .map((p) => ({ p, score: mirusScoreShiftPath(p) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  const all: MirusShift[] = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(to);

  while (cursor < last) {
    const dateStr = isoDateLocal(cursor);
    for (const { p } of scored) {
      const urlPath = p
        .replace(/\{date\}/gi, dateStr)
        .replace(/\{from\}/gi, dateStr)
        .replace(/\{to\}/gi, dateStr)
        .replace(/\{startDate\}/gi, dateStr)
        .replace(/\{endDate\}/gi, dateStr);
      if (/\{[^}]+\}/.test(urlPath)) continue;
      const url = `${origin}${urlPath.startsWith('/') ? '' : '/'}${urlPath}`;
      try {
        const res = await mirusAuthenticatedFetch(jar, url, {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) continue;
        const ct = res.headers.get('content-type') ?? '';
        if (!ct.includes('json')) continue;
        const json = (await res.json()) as unknown;
        all.push(...normalizeApiShifts(json, dateStr));
      } catch {
        /* next path */
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return all;
}

async function openDayDetail(page: Page): Promise<boolean> {
  const hasDetail = async () =>
    page.evaluate(() => /Arbeitszeit\s*\n?\s*\d{1,2}:\d{2}/.test(document.body?.innerText || ''));

  if (await hasDetail()) return true;

  // Prefer in-page click — more reliable than Playwright hit-testing on Blazor layouts
  const clicked = await page.evaluate(() => {
    const el =
      document.querySelector('.team-color-container') ||
      document.querySelector('.mud-avatar') ||
      document.querySelector('.weekCalendarTableContainer');
    if (!el) return false;
    (el as HTMLElement).click();
    return true;
  });
  if (clicked) {
    await page.waitForTimeout(3000);
    if (await hasDetail()) return true;
  }

  const avatars = page.locator('.team-color-container');
  if ((await avatars.count()) > 0) {
    await avatars.first().click({ timeout: 10000, force: true }).catch(() => undefined);
    await page.waitForTimeout(3000);
    if (await hasDetail()) return true;
  }

  await page.waitForFunction(
    () => /Arbeitszeit\s*\n?\s*\d{1,2}:\d{2}/.test(document.body?.innerText || ''),
    null,
    { timeout: 15000 },
  ).catch(() => undefined);

  return hasDetail();
}

async function scrapeDay(page: Page, origin: string, dateStr: string): Promise<MirusShift[]> {
  const url = `${origin}/webapp/shifts/shift/${dateStr}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => undefined);
  // Blazor needs time to render the avatar strip
  await page.waitForSelector('.team-color-container, .card.card-default, text=Arbeitszeit', {
    timeout: 45000,
  }).catch(() => undefined);
  await page.waitForTimeout(2000);

  if (page.url().includes('/Account/Login')) {
    throw new Error('Mirus session expired while opening shift plan');
  }

  const opened = await openDayDetail(page);
  if (!opened) {
    logger.warn(`Mirus day ${dateStr}: detail list with Arbeitszeit not found`);
  } else {
    await page.waitForTimeout(1500);
  }

  const rows = await page.evaluate(scrapeShiftsInBrowser, dateStr);
  return rows.map((r) => ({
    externalUserId: r.externalUserId,
    displayName: r.displayName,
    startsAt: new Date(r.startsAt),
    endsAt: new Date(r.endsAt),
    sourceId: r.sourceId,
    label: r.label,
  }));
}

async function playwrightScrapeWithSession(
  baseUrl: string,
  jar: MirusCookieJar,
  from: Date,
  to: Date,
): Promise<MirusShift[]> {
  const origin = baseUrl.replace(/\/+$/, '');
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const context = await browser.newContext({ userAgent: BROWSER_UA, locale: 'de-CH' });
    const host = new URL(origin).hostname;
    await context.addCookies(
      jar.toJSON().map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain || host,
        path: c.path || '/',
        secure: true,
        httpOnly: /^mirusWeb$/i.test(c.name) || /Antiforgery|ARRAffinity/i.test(c.name),
      })),
    );

    const page = await context.newPage();

    await page.goto(`${origin}/webapp/Home`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (page.url().includes('/Account/Login') || (await page.locator('#password').count()) > 0) {
      throw new Error('Mirus session cookie rejected — re-save credentials and sync again');
    }

    const all: MirusShift[] = [];
    const cursor = new Date(from);
    cursor.setHours(0, 0, 0, 0);
    const last = new Date(to);

    while (cursor < last) {
      const dateStr = isoDateLocal(cursor);
      try {
        const dayShifts = await scrapeDay(page, origin, dateStr);
        logger.log(`Mirus ${dateStr}: ${dayShifts.length} shifts`);
        all.push(...dayShifts);
      } catch (err) {
        logger.warn(`Mirus ${dateStr} scrape failed: ${(err as Error).message}`);
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    return dedupeShifts(all);
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

function dedupeShifts(shifts: MirusShift[]): MirusShift[] {
  const seen = new Set<string>();
  const out: MirusShift[] = [];
  for (const s of shifts) {
    const key = `${s.externalUserId}|${s.startsAt.toISOString()}|${s.endsAt.toISOString()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

export type MirusSyncOpts = {
  baseUrl: string;
  username: string;
  password: string;
  windowDays: number;
  session: MirusSessionStored | null;
};

export type MirusSyncResult = {
  shifts: MirusShift[];
  session: MirusSessionStored;
};

export async function syncMirusShifts(opts: MirusSyncOpts): Promise<MirusSyncResult> {
  const origin = opts.baseUrl.replace(/\/+$/, '');
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = addDaysLocal(from, opts.windowDays);

  let jar: MirusCookieJar;
  const sessionFresh =
    opts.session?.savedAt &&
    Date.now() - new Date(opts.session.savedAt).getTime() < 8 * 3600_000;

  if (sessionFresh && opts.session?.cookies?.length) {
    jar = MirusCookieJar.fromJSON(opts.session.cookies);
    if (!jar.hasAuthCookie()) {
      jar = await mirusLogin(origin, opts.username, opts.password);
      logger.log('Mirus HTTP login ok (stale session replaced)');
    } else {
      logger.log('Mirus reusing stored HTTP session');
    }
  } else {
    jar = await mirusLogin(origin, opts.username, opts.password);
    logger.log('Mirus HTTP login ok');
  }

  let shifts: MirusShift[] = [];

  const swagger = await mirusFetchSwagger(jar, origin).catch(() => null);
  if (swagger?.paths.length) {
    shifts = dedupeShifts(await tryApiPaths(jar, origin, from, to, swagger.paths));
  }

  // Dienstplan is Blazor UI: open /webapp/shifts/shift/{date} with session cookies,
  // click avatar strip to expand Arbeitszeit list, scrape cards.
  if (shifts.length === 0) {
    shifts = await playwrightScrapeWithSession(origin, jar, from, to);
  }

  if (shifts.length === 0) {
    throw new Error(
      'Mirus sync found no shifts — login worked, but no Arbeitszeit rows were found on the Dienstplan',
    );
  }

  return {
    shifts,
    session: {
      cookies: jar.toJSON(),
      savedAt: new Date().toISOString(),
    },
  };
}

export { normalizeApiShifts, dedupeShifts };
