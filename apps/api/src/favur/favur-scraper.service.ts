import { Injectable, Logger } from '@nestjs/common';

export type FavurShift = {
  favurUserId: string;
  favurDisplayName: string;
  startsAt: Date;
  endsAt: Date;
  label?: string | null;
  sourceId: string;
};

/**
 * Resolves a dot-notation path against a JSON value:
 *   pickPath({ user: { id: 7 } }, 'user.id') → 7
 *   pickPath({ data: { items: [...] } }, 'data.items') → [...]
 *   pickPath(value, '') → value (root)
 */
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

export type ActiveTemplate = {
  url: string;
  method: string;
  /** Plaintext header map (decrypted upstream). */
  headers: Record<string, string>;
  /** Plaintext "a=1; b=2" cookie string (decrypted upstream). */
  cookies: string;
  /** Plaintext request body (POST/PUT). */
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
   * Replay the captured request and parse the response into normalised shifts.
   *
   * Date placeholders supported in the URL and body:
   *   {fromDate}  → "YYYY-MM-DD"
   *   {toDate}    → "YYYY-MM-DD"
   *   {fromIso}   → ISO 8601
   *   {toIso}     → ISO 8601
   */
  async fetchShifts(
    template: ActiveTemplate,
    parse: ParseConfig,
    opts: FavurFetchOptions,
  ): Promise<FavurShift[]> {
    const url = applyDateMacros(template.url, opts);
    const body =
      template.body != null && template.body !== ''
        ? applyDateMacros(template.body, opts)
        : undefined;

    // Re-build headers without ones that interfere with re-issuing the request.
    const stripped = stripBadHeaders(template.headers);
    if (template.cookies) stripped['Cookie'] = template.cookies;

    this.logger.log(
      `Favur fetch: ${template.method} ${url} (${opts.from.toISOString()} → ${opts.to.toISOString()})`,
    );

    const res = await fetch(url, {
      method: template.method || 'GET',
      headers: stripped,
      body,
      redirect: 'follow',
    });

    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Favur returned ${res.status} – session likely expired, re-login in your browser so the extension picks up fresh cookies.`,
      );
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Favur returned ${res.status}: ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as unknown;
    return this.parseShifts(json, parse);
  }

  /** Public so we can re-parse stored capture samples in unit tests / preview UI. */
  parseShifts(payload: unknown, parse: ParseConfig): FavurShift[] {
    const arr = pickPath(payload, parse.shiftsJsonPath);
    if (!Array.isArray(arr)) {
      throw new Error(
        `Expected an array at "${parse.shiftsJsonPath || '(root)'}" but got ${typeof arr}. ` +
          `Adjust "Shifts JSON path" in admin → integrations.`,
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

/**
 * Strip headers that browsers/runtimes manage automatically — replaying them
 * verbatim breaks the request (e.g. mismatched content-length, host, etc.).
 */
function stripBadHeaders(headers: Record<string, string>): Record<string, string> {
  const drop = new Set([
    'host',
    'content-length',
    'connection',
    'cookie', // we set this from the cookies field
    'sec-fetch-site',
    'sec-fetch-mode',
    'sec-fetch-dest',
    'sec-ch-ua',
    'sec-ch-ua-mobile',
    'sec-ch-ua-platform',
    'pragma',
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
