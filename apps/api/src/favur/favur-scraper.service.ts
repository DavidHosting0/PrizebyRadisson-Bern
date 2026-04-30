import { Injectable, Logger } from '@nestjs/common';

export type FavurShift = {
  favurUserId: string;
  favurDisplayName: string;
  startsAt: Date;
  endsAt: Date;
  label?: string | null;
  sourceId: string;
};

export type ActiveTemplate = {
  url: string;
  method: string;
  headers: Record<string, string>;
  cookies: string;
  body?: string | null;
};

export type ParseConfig = {
  shiftsJsonPath: string;
  fieldShiftId: string;
  fieldUserId: string;
  fieldUserName: string;
  fieldStartsAt: string;
  fieldEndsAt: string;
  fieldLabel?: string | null;
};

export type FavurFetchOptions = {
  from: Date;
  to: Date;
};

@Injectable()
export class FavurScraperService {
  private readonly logger = new Logger(FavurScraperService.name);

  /**
   * Replay the captured request and parse the response.
   *
   * Two modes:
   *   1) Favur GraphQL `teamplanWithTeams` — auto-detected, uses the specialised
   *      iterator that calls the API per day and flattens the deeply-nested
   *      `data.teamplanWithTeams[].tenants[].costCenters[].persons[].shifts[]`
   *      tree into normalised shift rows.
   *   2) Generic — replays the request once with date macros substituted in the
   *      URL/body and parses via JSONPath. Fallback for any future source.
   */
  async fetchShifts(
    template: ActiveTemplate,
    parse: ParseConfig,
    opts: FavurFetchOptions,
  ): Promise<FavurShift[]> {
    if (isFavurTeamplan(template)) {
      return this.fetchTeamplanRange(template, opts);
    }
    return this.fetchGeneric(template, parse, opts);
  }

  parseShifts(payload: unknown, parse: ParseConfig): FavurShift[] {
    if (looksLikeTeamplanResponse(payload)) {
      return parseTeamplan(payload as TeamplanResponse);
    }
    return parseGeneric(payload, parse);
  }

  // ---------------- Favur GraphQL teamplan ----------------

  private async fetchTeamplanRange(
    template: ActiveTemplate,
    opts: FavurFetchOptions,
  ): Promise<FavurShift[]> {
    const headers = this.buildReplayHeaders(template, true);
    const all: FavurShift[] = [];

    const cursor = startOfDay(opts.from);
    const last = startOfDay(opts.to); // exclusive
    let dayCount = 0;
    while (cursor < last && dayCount < 60 /* hard safety cap */) {
      const dateStr = isoDate(cursor);
      const body = setTeamplanDates(template.body ?? '{}', dateStr, dateStr);

      this.logger.log(`Favur GraphQL teamplan ${dateStr}`);
      const res = await fetch(template.url, {
        method: 'POST',
        headers,
        body,
        redirect: 'follow',
      });
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `Favur returned ${res.status} – session expired in your browser. Open web.favur.ch and log in again so the extension picks up fresh cookies.`,
        );
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Favur returned ${res.status}: ${text.slice(0, 300)}`);
      }
      const json = (await res.json()) as TeamplanResponse;
      if ((json as { errors?: unknown[] }).errors?.length) {
        throw new Error(
          `Favur GraphQL error: ${JSON.stringify((json as { errors: unknown[] }).errors).slice(0, 300)}`,
        );
      }
      all.push(...parseTeamplan(json));

      cursor.setDate(cursor.getDate() + 1);
      dayCount++;
    }
    return all;
  }

  // ---------------- generic JSONPath (fallback) ----------------

  private async fetchGeneric(
    template: ActiveTemplate,
    parse: ParseConfig,
    opts: FavurFetchOptions,
  ): Promise<FavurShift[]> {
    const url = applyDateMacros(template.url, opts);
    const body =
      template.body != null && template.body !== ''
        ? applyDateMacros(template.body, opts)
        : undefined;
    const headers = this.buildReplayHeaders(template, false);

    this.logger.log(`Favur generic fetch: ${template.method} ${url}`);
    const res = await fetch(url, {
      method: template.method || 'GET',
      headers,
      body,
      redirect: 'follow',
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Favur returned ${res.status} – session expired, log in to web.favur.ch again.`,
      );
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Favur returned ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as unknown;
    return parseGeneric(json, parse);
  }

  private buildReplayHeaders(
    template: ActiveTemplate,
    forceJson: boolean,
  ): Record<string, string> {
    const out = stripBadHeaders(template.headers);
    if (template.cookies) out['Cookie'] = template.cookies;
    // Favur's API checks Origin — and the browser auto-sets it, so it isn't in
    // the captured init.headers. Force it here.
    if (!hasHeader(out, 'origin')) out['Origin'] = 'https://web.favur.ch';
    if (!hasHeader(out, 'referer')) out['Referer'] = 'https://web.favur.ch/';
    if (forceJson && !hasHeader(out, 'content-type')) {
      out['Content-Type'] = 'application/json';
    }
    if (!hasHeader(out, 'accept')) out['Accept'] = '*/*';
    return out;
  }
}

// ---------------- helpers ----------------

function isFavurTeamplan(template: ActiveTemplate): boolean {
  if (!template.body) return false;
  if (!/\/graphql(?:$|[/?#])/i.test(template.url)) return false;
  return template.body.includes('teamplanWithTeams');
}

function looksLikeTeamplanResponse(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const data = (value as Record<string, unknown>).data;
  if (!data || typeof data !== 'object') return false;
  return Array.isArray((data as Record<string, unknown>).teamplanWithTeams);
}

type TeamplanShift = {
  id: string | number;
  personId: string | number;
  date: string;
  from: string;
  until: string;
  type?: string | null;
  shiftAbs?: string | null;
  timeType?: string | null;
  description?: string | null;
  shortDescription?: string | null;
  costCenterName?: string | null;
};

type TeamplanPerson = {
  id: string | number;
  firstName?: string | null;
  lastName?: string | null;
  shifts?: TeamplanShift[];
};

type TeamplanCostCenter = {
  name?: string | null;
  uuid?: string | null;
  persons?: TeamplanPerson[];
};

type TeamplanTenant = {
  id?: string | number;
  name?: string | null;
  costCenters?: TeamplanCostCenter[];
};

type TeamplanDay = {
  date: string;
  tenants?: TeamplanTenant[];
};

type TeamplanResponse = {
  data?: { teamplanWithTeams?: TeamplanDay[] };
};

/**
 * Flatten the GraphQL response into one shift per `(person, shift)` row.
 *
 * Filtering rules:
 *   - skip rows where `shiftAbs === 'absence'`   (Urlaub / krank)
 *   - skip rows where `timeType === 'pause'`     (Pause-Eintrag innerhalb einer Schicht)
 *   - keep rows where `timeType === 'work'`
 *
 * Night-shift handling:
 *   When `until < from`, the shift wraps midnight; endsAt is moved to the next day.
 */
function parseTeamplan(json: TeamplanResponse): FavurShift[] {
  const out: FavurShift[] = [];
  const days = json.data?.teamplanWithTeams ?? [];
  for (const day of days) {
    const date = day.date;
    if (!date) continue;
    for (const tenant of day.tenants ?? []) {
      for (const cc of tenant.costCenters ?? []) {
        const ccName = cc.name?.trim() || null;
        for (const person of cc.persons ?? []) {
          const personId = String(person.id);
          const fullName = [person.firstName, person.lastName]
            .filter((s) => typeof s === 'string' && s.trim())
            .map((s) => (s as string).trim())
            .join(' ')
            .trim() || personId;

          for (const shift of person.shifts ?? []) {
            if (shift.shiftAbs === 'absence') continue;
            if (shift.timeType !== 'work') continue;

            const startsAt = combineDateAndTime(date, shift.from);
            let endsAt = combineDateAndTime(date, shift.until);
            if (!startsAt || !endsAt) continue;
            if (endsAt.getTime() <= startsAt.getTime()) {
              endsAt = new Date(endsAt.getTime() + 24 * 60 * 60 * 1000);
            }

            const label =
              (shift.shortDescription || '').trim() ||
              (shift.description || '').trim() ||
              ccName ||
              null;

            out.push({
              favurUserId: personId,
              favurDisplayName: fullName,
              startsAt,
              endsAt,
              sourceId: String(shift.id),
              label,
            });
          }
        }
      }
    }
  }
  return out;
}

function setTeamplanDates(bodyJson: string, startDate: string, endDate: string): string {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(bodyJson) as Record<string, unknown>;
  } catch {
    throw new Error('Captured GraphQL body is not valid JSON');
  }
  const variables = (parsed.variables ?? {}) as Record<string, unknown>;
  variables.startDate = startDate;
  variables.endDate = endDate;
  parsed.variables = variables;
  return JSON.stringify(parsed);
}

const FAVUR_TZ = 'Europe/Zurich';

/**
 * Combine a `YYYY-MM-DD` date with a `HH:MM[:SS]` time, interpreted in
 * Europe/Zurich (Favur's timezone), and return the corresponding UTC instant.
 *
 * DST-aware: uses `Intl.DateTimeFormat` with `timeZoneName: 'shortOffset'` to
 * resolve the actual offset for the wall-clock instant in question, then
 * iterates once to be safe near DST transitions.
 */
function combineDateAndTime(dateStr: string, timeStr: string | undefined): Date | null {
  if (!dateStr || !timeStr) return null;
  const dm = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  const tm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(timeStr);
  if (!dm || !tm) return null;
  const y = Number(dm[1]);
  const mo = Number(dm[2]);
  const d = Number(dm[3]);
  const h = Number(tm[1]);
  const mi = Number(tm[2]);
  const s = Number(tm[3] ?? '0');

  // Naive UTC interpretation, then shift by the Zurich offset valid at that instant.
  const naive = Date.UTC(y, mo - 1, d, h, mi, s);
  let offsetMin = zurichOffsetMinutes(new Date(naive));
  let utc = naive - offsetMin * 60_000;
  // Re-check at the corrected instant in case we crossed a DST boundary.
  const offsetMin2 = zurichOffsetMinutes(new Date(utc));
  if (offsetMin2 !== offsetMin) {
    offsetMin = offsetMin2;
    utc = naive - offsetMin * 60_000;
  }
  const out = new Date(utc);
  return Number.isNaN(out.getTime()) ? null : out;
}

const ZURICH_OFFSET_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: FAVUR_TZ,
  timeZoneName: 'shortOffset',
  hour: 'numeric',
});

function zurichOffsetMinutes(at: Date): number {
  const parts = ZURICH_OFFSET_FORMATTER.formatToParts(at);
  const tz = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+0';
  // Examples: "GMT+1", "GMT+2", "GMT+02:00", "GMT-1:30"
  const m = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(tz);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  const hours = Number(m[2]);
  const mins = Number(m[3] ?? '0');
  return sign * (hours * 60 + mins);
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// ---------------- generic-mode helpers ----------------

function pickPath(input: unknown, path: string): unknown {
  if (!path) return input;
  let cur: unknown = input;
  for (const seg of path.split('.')) {
    if (cur == null) return undefined;
    if (typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return null;
}

function parseGeneric(payload: unknown, parse: ParseConfig): FavurShift[] {
  const arr = pickPath(payload, parse.shiftsJsonPath);
  if (!Array.isArray(arr)) {
    throw new Error(
      `Expected an array at "${parse.shiftsJsonPath || '(root)'}" but got ${typeof arr}.`,
    );
  }
  const out: FavurShift[] = [];
  for (const item of arr) {
    const startsAt = asDate(pickPath(item, parse.fieldStartsAt));
    const endsAt = asDate(pickPath(item, parse.fieldEndsAt));
    const userId = asString(pickPath(item, parse.fieldUserId));
    const userName =
      asString(pickPath(item, parse.fieldUserName)) ?? userId ?? 'Unknown';
    const shiftId = asString(pickPath(item, parse.fieldShiftId));
    const label = parse.fieldLabel
      ? asString(pickPath(item, parse.fieldLabel))
      : null;
    if (!startsAt || !endsAt || !userId || !shiftId) continue;
    out.push({
      favurUserId: userId,
      favurDisplayName: userName,
      startsAt,
      endsAt,
      sourceId: shiftId,
      label,
    });
  }
  return out;
}

function applyDateMacros(input: string, opts: FavurFetchOptions): string {
  const fromIso = opts.from.toISOString();
  const toIso = opts.to.toISOString();
  const fromDate = fromIso.slice(0, 10);
  const toDate = toIso.slice(0, 10);
  return input
    .replace(/\{fromDate\}/g, fromDate)
    .replace(/\{toDate\}/g, toDate)
    .replace(/\{fromIso\}/g, fromIso)
    .replace(/\{toIso\}/g, toIso);
}

function stripBadHeaders(headers: Record<string, string>): Record<string, string> {
  const drop = new Set([
    'host',
    'content-length',
    'connection',
    'cookie',
    'sec-fetch-site',
    'sec-fetch-mode',
    'sec-fetch-dest',
    'sec-ch-ua',
    'sec-ch-ua-mobile',
    'sec-ch-ua-platform',
    'pragma',
    'priority',
    ':authority',
    ':method',
    ':path',
    ':scheme',
  ]);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (!k) continue;
    if (drop.has(k.toLowerCase())) continue;
    if (k.startsWith(':')) continue;
    out[k] = v;
  }
  return out;
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const lower = name.toLowerCase();
  return Object.keys(headers).some((k) => k.toLowerCase() === lower);
}
