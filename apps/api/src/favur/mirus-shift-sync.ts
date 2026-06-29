import { chromium, type Browser } from 'playwright';
import type { FavurShift } from './favur-scraper.service';
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

/** In-page scraper (runs inside Playwright evaluate). */
function scrapeShiftsInBrowser(dateStr: string) {
  const ABSENCE =
    /\b(urlaub|krank|absence|ferien|abwesen|feiertag|frei|krankheit)\b/i;
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
    favurUserId: string;
    startsAt: string;
    endsAt: string;
    label: string | null;
    sourceId: string;
  }> = [];
  const seen = new Set<string>();

  const table = document.querySelector('.absenceplan-table');
  if (table) {
    for (const row of table.querySelectorAll('.absenceplan-table-row')) {
      if (row.classList.contains('absenceplan-team-row')) continue;
      const nameEl =
        row.querySelector('.absenceplan-team-member') ||
        row.querySelector('.absenceplan-sticky-column');
      const displayName = nameEl?.textContent?.trim();
      if (!displayName || displayName.length < 2) continue;
      const uid = displayName.toLowerCase().replace(/\s+/g, ' ');
      for (const cell of row.querySelectorAll(
        '.absenceplan-cell, .absenceplan-data-cell, .absence-plan-data-point',
      )) {
        const text = cell.textContent?.trim() ?? '';
        if (!text || ABSENCE.test(text)) continue;
        const m = TIME.exec(text);
        if (!m) continue;
        const startsAt = combine(dateStr, m[1]);
        let endsAt = combine(dateStr, m[2]);
        if (!startsAt || !endsAt) continue;
        if (new Date(endsAt) <= new Date(startsAt)) {
          const end = new Date(endsAt);
          end.setDate(end.getDate() + 1);
          endsAt = end.toISOString();
        }
        const key = `${uid}|${startsAt}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          displayName,
          favurUserId: uid,
          startsAt,
          endsAt,
          label: text.replace(TIME, '').trim() || null,
          sourceId: `${uid}-${startsAt}`,
        });
      }
    }
  }

  if (out.length === 0) {
    for (const ev of document.querySelectorAll('.k-event, .k-scheduler-event')) {
      const title = ev.textContent?.trim() ?? '';
      if (!title || ABSENCE.test(title)) continue;
      const m = TIME.exec(title);
      if (!m) continue;
      const startsAt = combine(dateStr, m[1]);
      let endsAt = combine(dateStr, m[2]);
      if (!startsAt || !endsAt) continue;
      const displayName = title.split(/\d{1,2}:\d{2}/)[0]?.trim() || 'Unknown';
      const uid = displayName.toLowerCase().replace(/\s+/g, ' ');
      out.push({
        displayName,
        favurUserId: uid,
        startsAt,
        endsAt,
        label: null,
        sourceId: `${uid}-${startsAt}`,
      });
    }
  }

  return out;
}

function normalizeApiShifts(payload: unknown, dateStr: string): FavurShift[] {
  const out: FavurShift[] = [];
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
        ? (o.user as Record<string, unknown>).fullName ??
          (o.user as Record<string, unknown>).name
        : undefined) ??
      o.name;
    const idRaw =
      o.employeeId ?? o.userId ?? o.personId ?? o.id ?? nameRaw;

    if (startsRaw && endsRaw && nameRaw) {
      const startsAt = new Date(String(startsRaw));
      let endsAt = new Date(String(endsRaw));
      if (!Number.isNaN(startsAt.getTime()) && !Number.isNaN(endsAt.getTime())) {
        if (endsAt <= startsAt) {
          endsAt = new Date(endsAt.getTime() + 86400000);
        }
        const displayName = String(nameRaw).trim();
        const favurUserId = String(idRaw ?? displayName).trim();
        out.push({
          favurUserId,
          favurDisplayName: displayName,
          startsAt,
          endsAt,
          sourceId: String(o.id ?? `${favurUserId}-${startsAt.toISOString()}`),
          label: o.label != null ? String(o.label) : o.shortDescription != null ? String(o.shortDescription) : null,
        });
      }
    }

    for (const v of Object.values(o)) {
      if (v && typeof v === 'object') walk(v, depth + 1);
    }
  };
  walk(payload);
  if (out.length === 0 && dateStr) {
    /* no-op marker for empty API body */
  }
  return out;
}

async function tryApiPaths(
  jar: MirusCookieJar,
  origin: string,
  from: Date,
  to: Date,
  swaggerPaths: string[],
): Promise<FavurShift[]> {
  const scored = [...swaggerPaths]
    .map((p) => ({ p, score: mirusScoreShiftPath(p) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  const all: FavurShift[] = [];
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

async function playwrightLoginAndScrape(
  baseUrl: string,
  username: string,
  password: string,
  from: Date,
  to: Date,
): Promise<{ shifts: FavurShift[]; jar: MirusCookieJar }> {
  const origin = baseUrl.replace(/\/+$/, '');
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: BROWSER_UA, locale: 'de-CH' });
    const page = await context.newPage();

    await page.goto(`${origin}/Account/Login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.fill('#username, input[name="Model.UserName"]', username);
    await page.fill('#password, input[name="Model.Password"]', password);
    await page.click('button[type="submit"], input[type="submit"]');
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => undefined);

    if (page.url().includes('/Account/Login')) {
      throw new Error('Mirus Playwright login failed — still on login page');
    }

    const cookies = await context.cookies();
    const jar = MirusCookieJar.fromJSON(
      cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
      })),
    );

    const capturedJson: unknown[] = [];
    page.on('response', async (res) => {
      try {
        const ct = res.headers()['content-type'] ?? '';
        if (!ct.includes('json')) return;
        if (res.status() < 200 || res.status() >= 300) return;
        const u = res.url();
        if (!/shift|schicht|duty|dienst|plan|schedule|team|employee|mitarbeiter/i.test(u)) {
          return;
        }
        capturedJson.push(await res.json());
      } catch {
        /* ignore */
      }
    });

    const all: FavurShift[] = [];
    const cursor = new Date(from);
    cursor.setHours(0, 0, 0, 0);
    const last = new Date(to);

    while (cursor < last) {
      const dateStr = isoDateLocal(cursor);
      const url = `${origin}/webapp/shifts/shift/${dateStr}`;
      await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => undefined);
      await page.waitForTimeout(2500);

      const rows = await page.evaluate(scrapeShiftsInBrowser, dateStr);
      for (const r of rows) {
        all.push({
          favurUserId: r.favurUserId,
          favurDisplayName: r.displayName,
          startsAt: new Date(r.startsAt),
          endsAt: new Date(r.endsAt),
          sourceId: r.sourceId,
          label: r.label,
        });
      }

      for (const json of capturedJson) {
        all.push(...normalizeApiShifts(json, dateStr));
      }
      capturedJson.length = 0;

      cursor.setDate(cursor.getDate() + 1);
    }

    return { shifts: dedupeShifts(all), jar };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

function dedupeShifts(shifts: FavurShift[]): FavurShift[] {
  const seen = new Set<string>();
  const out: FavurShift[] = [];
  for (const s of shifts) {
    const key = `${s.favurUserId}|${s.startsAt.toISOString()}|${s.endsAt.toISOString()}`;
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
  shifts: FavurShift[];
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
  } else {
    jar = await mirusLogin(origin, opts.username, opts.password);
  }

  let shifts: FavurShift[] = [];

  // 1) Try authenticated Swagger REST API
  const swagger = await mirusFetchSwagger(jar, origin).catch(() => null);
  if (swagger?.paths.length) {
    shifts = await tryApiPaths(jar, origin, from, to, swagger.paths);
    shifts = dedupeShifts(shifts);
  }

  // 2) Playwright: login session + intercept JSON + DOM scrape per day
  if (shifts.length === 0) {
    const pw = await playwrightLoginAndScrape(
      origin,
      opts.username,
      opts.password,
      from,
      to,
    );
    shifts = pw.shifts;
    jar = pw.jar;
  }

  if (shifts.length === 0) {
    throw new Error(
      'Mirus sync found no shifts — check credentials and that the account can view the team shift plan',
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
