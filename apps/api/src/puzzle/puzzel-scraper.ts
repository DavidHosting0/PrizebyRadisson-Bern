import { createHash } from 'node:crypto';
import { chromium, type Locator, type Page } from 'playwright';
import { generateSync } from 'otplib';

type PuzzelProgress = (message: string) => void;

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export type PuzzelScrapedRow = {
  externalKey: string;
  subject: string;
  reference: string | null;
  status: string | null;
  detailHref: string | null;
  rowSummary: string;
  metadata?: Record<string, unknown>;
};

export type PuzzelScrapedMessage = {
  externalKey: string;
  sentAtText: string | null;
  fromText: string | null;
  toText: string | null;
  direction: 'inbound' | 'outbound' | null;
  bodyText: string;
  bodyHtml: string | null;
  metadata?: Record<string, unknown>;
};

export type PuzzelScrapeOpts = {
  baseUrl: string;
  /** e.g. `/tickets` */
  ticketsPath: string;
  /** Saved search that represents the ticket scope to sync. */
  savedSearchName?: string;
  teamName?: string;
  statusName?: string;
  timePeriod?: string;
  email: string;
  password: string;
  totpSecret?: string;
  headless?: boolean;
  progress?: PuzzelProgress;
};

export type PuzzelMessageScrapeOpts = PuzzelScrapeOpts & {
  ticketUrl: string;
};

export type PuzzelTicketActionOpts = PuzzelMessageScrapeOpts & {
  replyText?: string;
  /** Local paths for Playwright `setInputFiles` (e.g. temp files from multer). */
  replyAttachmentPaths?: string[];
};

export type PuzzelBatchMessageTarget = {
  ticketId: string;
  externalKey: string;
  ticketUrl: string;
};

export type PuzzelBatchScrapedMessages = {
  ticketId: string;
  externalKey: string;
  messages: PuzzelScrapedMessage[];
};

export type PuzzelTicketActionResult = {
  ok: true;
  action: 'assign' | 'reply';
};

function normBase(url: string) {
  return url.replace(/\/+$/, '');
}

/** Hostname from any full URL, lowercased (empty if invalid). */
export function puzzelUrlHostname(fullUrl: string): string {
  try {
    return new URL(fullUrl).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** URLs that indicate we are not yet on the Puzzel app shell. */
const PUZZEL_IDP_URL_REGEXES = [
  /\/Account\/Login/i,
  /\/adfs\/ls/i,
  /\/connect\/authorize/i,
  /login\.microsoftonline\.com/i,
  /login\.microsoft\.com/i,
];

/**
 * True while still on an IdP / login URL or a visible username/password step.
 * Used to decide whether to continue the login flow and to assert session is valid.
 */
export async function puzzelPageIndicatesLoginRequired(page: Page): Promise<boolean> {
  const url = page.url();
  if (PUZZEL_IDP_URL_REGEXES.some((re) => re.test(url))) {
    return true;
  }
  const visibleLogin = page
    .locator(
      '#Input_Username:visible, #Input_Password:visible, #userNameInput:visible, #passwordInput:visible, input#i0116:visible, input#i0118:visible',
    )
    .first();
  return visibleLogin.isVisible({ timeout: 800 }).catch(() => false);
}

function hrefKey(href: string | null, base: string): string {
  if (!href) return '';
  try {
    const u = new URL(href, base);
    return `${u.pathname}${u.search}`;
  } catch {
    return href.slice(0, 500);
  }
}

function rowHash(pageIdx: number, i: number, text: string) {
  return createHash('sha256')
    .update(`${pageIdx}:${i}:${text}`)
    .digest('hex')
    .slice(0, 32);
}

const KNOWN_STATUSES = new Set(['OPEN', 'PENDING', 'ON HOLD', 'CLOSED', 'ERROR', 'RESOLVED']);
const PRIORITIES = new Set(['JUNK', 'LOWEST', 'LOW', 'NORMAL', 'HIGH', 'HIGHEST']);

function normalizeCellText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function progress(opts: Pick<PuzzelScrapeOpts, 'progress'>, message: string) {
  opts.progress?.(`[Puzzel] ${message}`);
}

/**
 * IdP login screens (Entra / ADFS / Puzzel) change often. Try several known
 * controls instead of one compound selector (which times out if none match).
 */
async function clickFirstAuthSubmit(
  page: Page,
  opts: Pick<PuzzelScrapeOpts, 'progress'>,
  context: string,
  prepend: Locator[] = [],
): Promise<void> {
  const candidates: Locator[] = [
    ...prepend,
    page.locator('form#mainForm button.submit-button'),
    page.locator('button.submit-button'),
    /** Microsoft Entra / login.microsoftonline.com */
    page.locator('#idSIButton9'),
    page.locator('input.win-button.button_primary[type="submit"]'),
    page.locator('input#submitButton'),
    page.getByRole('button', { name: /^next$/i }),
    page.getByRole('button', { name: /^weiter$/i }),
    page.getByRole('button', { name: /^continue$/i }),
    page.getByRole('button', { name: /sign in|log in|anmelden|einloggen|absenden/i }),
    page.locator('form button[type="submit"]'),
    page.locator('button[type="submit"]'),
    page.locator('input[type="submit"]'),
  ];

  for (const loc of candidates) {
    const el = loc.first();
    try {
      await el.waitFor({ state: 'visible', timeout: 2000 });
      await el.scrollIntoViewIfNeeded().catch(() => {});
      await el.click({ timeout: 8000 });
      progress(opts, `${context}: Fortfahren geklickt`);
      return;
    } catch {
      continue;
    }
  }

  throw new Error(
    `${context}: Kein Weiter-/Submit-Button gefunden. Tipp: API mit PUZZEL_HEADLESS=false starten und manuell prüfen. URL: ${page.url()}`,
  );
}

function mapTicketColumns(parts: string[], rowText: string) {
  const clean = parts.map(normalizeCellText).filter(Boolean);
  const ticketIdIdx = clean.findIndex((p) => /^\d{5,}$/.test(p));
  const statusIdx = clean.findIndex((p) => KNOWN_STATUSES.has(p.toUpperCase()));
  const priorityIdx = clean.findIndex((p) => PRIORITIES.has(p.toUpperCase()));

  const reference = ticketIdIdx >= 0 ? clean[ticketIdIdx].slice(0, 128) : null;
  const status = statusIdx >= 0 ? clean[statusIdx] : null;

  let subject = '';
  if (ticketIdIdx >= 0) {
    const afterId = clean.slice(ticketIdIdx + 1);
    const stopIdx = afterId.findIndex((p) => KNOWN_STATUSES.has(p.toUpperCase()));
    subject = (stopIdx >= 0 ? afterId.slice(0, stopIdx) : afterId.slice(0, 1)).join(' · ');
  }
  if (!subject && statusIdx >= 0) {
    subject = clean
      .slice(statusIdx + 1)
      .find((p) => !/^in \d+ (minutes?|hours?|days?)$/i.test(p) && !PRIORITIES.has(p.toUpperCase())) ?? '';
  }
  if (!subject) subject = clean.find((p, idx) => idx !== ticketIdIdx && idx !== statusIdx && idx !== priorityIdx) ?? rowText;

  return {
    clean,
    reference,
    subject: subject || rowText,
    status,
    priority: priorityIdx >= 0 ? clean[priorityIdx] : null,
    responseTarget: statusIdx >= 0 ? clean[statusIdx + 1] ?? null : null,
    resolveTarget: statusIdx >= 0 ? clean[statusIdx + 2] ?? null : null,
    team: priorityIdx >= 0 ? clean[priorityIdx + 1] ?? null : null,
    lastInboundActivity: priorityIdx >= 0 ? clean[priorityIdx + 2] ?? null : null,
    lastActivity: priorityIdx >= 0 ? clean[priorityIdx + 3] ?? null : null,
  };
}

function ticketFingerprint(mapped: ReturnType<typeof mapTicketColumns>, rowText: string) {
  return createHash('sha256')
    .update(
      [
        mapped.reference,
        mapped.status,
        mapped.subject,
        mapped.team,
        mapped.lastInboundActivity,
        mapped.lastActivity,
        rowText,
      ].join('|'),
    )
    .digest('hex');
}

export async function tryPuzzelLogin(page: Page, opts: PuzzelScrapeOpts) {
  progress(opts, `Login prüfen: ${page.url()}`);
  const userField = page
    .locator(
      '#Input_Username, input[name="Input.Username"], #userNameInput, input[name="UserName"], input[placeholder="someone@example.com"]',
    )
    .first();
  if (await userField.isVisible({ timeout: 8000 }).catch(() => false)) {
    progress(opts, 'Login Schritt 1/4: Puzzel E-Mail eintragen');
    await userField.fill(opts.email);
    await clickFirstAuthSubmit(page, opts, 'Login Schritt 1/4');
    progress(opts, 'Login Schritt 1/4: Puzzel E-Mail gesendet');
    await sleep(1200);
  }

  const adfsUserField = page
    .locator('#userNameInput, input[name="UserName"], input[placeholder="someone@example.com"]')
    .first();
  if (await adfsUserField.isVisible({ timeout: 3000 }).catch(() => false)) {
    progress(opts, 'Login Schritt 2/4: ADFS E-Mail eintragen');
    await adfsUserField.fill(opts.email);
  }

  const passField = page
    .locator(
      '#Input_Password, input[name="Input.Password"], #passwordInput, input#password, input[type="password"], input[type="password"][autocomplete="current-password"]',
    )
    .first();
  if (await passField.isVisible({ timeout: 20000 }).catch(() => false)) {
    progress(opts, 'Login Schritt 3/4: Passwort eintragen');
    await passField.fill(opts.password);
    await clickFirstAuthSubmit(page, opts, 'Login Schritt 3/4');
    progress(opts, 'Login Schritt 3/4: Passwort gesendet');
    await sleep(2000);
  }

  const otp = page
    .locator(
      '#challengeQuestionInput, input[autocomplete="one-time-code"], input[name*="otp" i], input[name*="code" i], input[placeholder*="code" i], input[type="tel"], input[type="text"]',
    )
    .first();
  if (
    opts.totpSecret &&
    (await otp.isVisible({ timeout: 6000 }).catch(() => false))
  ) {
    progress(opts, 'Login Schritt 4/4: 2FA-Code generieren und eintragen');
    const code = generateSync({
      secret: opts.totpSecret.replace(/\s+/g, '').toUpperCase(),
    });
    await otp.fill(code);
    await clickFirstAuthSubmit(page, opts, 'Login Schritt 4/4', [
      page.getByRole('button', { name: /^verify$/i }),
      page.getByRole('button', { name: /verify|bestätigen|abschließen/i }),
    ]);
    progress(opts, 'Login Schritt 4/4: 2FA-Code gesendet');
    await sleep(2500);
  }
}

export async function openLoggedInPage(page: Page, url: string, opts: PuzzelScrapeOpts) {
  const appHost = puzzelUrlHostname(normBase(opts.baseUrl));
  const targetPrefix = normBase(url);

  for (let round = 0; round < 3; round++) {
    progress(opts, `Öffne Puzzel-Ziel (${round + 1}/3): ${url}`);
    await page.goto(url, { timeout: 120_000, waitUntil: 'domcontentloaded' });

    for (let attempt = 0; attempt < 2; attempt++) {
      await tryPuzzelLogin(page, opts);
      await page.waitForLoadState('domcontentloaded').catch(() => undefined);
      await sleep(attempt === 0 ? 1400 : 900);
      if (!(await puzzelPageIndicatesLoginRequired(page))) {
        break;
      }
      progress(opts, 'Anmeldemaske oder IdP noch aktiv — Login erneut ausführen');
    }

    const host = puzzelUrlHostname(page.url());
    if (appHost && host === appHost && !(await puzzelPageIndicatesLoginRequired(page))) {
      if (!page.url().startsWith(targetPrefix)) {
        progress(opts, 'Zur Ziel-URL nach Anmeldung navigieren');
        await page.goto(url, { timeout: 120_000, waitUntil: 'domcontentloaded' });
        await sleep(700);
      }
      if (!(await puzzelPageIndicatesLoginRequired(page)) && puzzelUrlHostname(page.url()) === appHost) {
        progress(opts, `Puzzel-Session bestätigt (App-Host ${appHost}): ${page.url()}`);
        return;
      }
    }
  }

  throw new Error(
    `Puzzel: Anmeldung nicht bestätigt. Erwarteter App-Host: ${appHost}, aktuell: ${puzzelUrlHostname(page.url())} — ${page.url()}`,
  );
}

async function selectSavedSearch(page: Page, name: string) {
  const candidates = [
    page.getByText(name, { exact: true }).first(),
    page.locator('a').filter({ hasText: name }).first(),
    page.locator('li').filter({ hasText: name }).locator('a').first(),
    page.locator('li').filter({ hasText: name }).first(),
  ];

  let savedSearch = candidates[0];
  let found = false;
  for (const candidate of candidates) {
    if (await candidate.isVisible({ timeout: 1500 }).catch(() => false)) {
      savedSearch = candidate;
      found = true;
      break;
    }
  }

  if (!found) {
    const savedSearchButton = page.locator('button:has-text("Saved Searches"), .dropdown-toggle:has-text("Saved Searches")').first();
    if (await savedSearchButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await savedSearchButton.click().catch(() => {});
      await sleep(500);
    }

    for (const candidate of candidates) {
      if (await candidate.isVisible({ timeout: 1500 }).catch(() => false)) {
        savedSearch = candidate;
        found = true;
        break;
      }
    }
  }

  if (!found) {
    // Some sessions already restore the correct filter but do not render the saved-search list.
    // Continue instead of failing the whole sync; the table scrape below still validates rows.
    return false;
  }

  const response = page
    .waitForResponse((r) => r.url().includes('/tickets/table.json') && r.status() === 200, { timeout: 30_000 })
    .catch(() => null);
  await savedSearch.click();
  await response;
  await sleep(1200);
  return true;
}

async function validateRelevantFilter(page: Page, opts: PuzzelScrapeOpts) {
  const teamName = opts.teamName ?? 'PZ | Billing Bern';
  const statusName = opts.statusName ?? 'Open';
  const timePeriod = opts.timePeriod ?? 'All Time';
  const bodyText = normalizeCellText(await page.locator('body').innerText().catch(() => ''));

  const hasTeam = bodyText.includes(teamName);
  const hasStatus =
    new RegExp(`\\bStatus:\\s*${statusName}\\b|\\b${statusName}\\s+Priority:`, 'i').test(bodyText) ||
    bodyText.includes(statusName);
  const hasTimePeriod =
    new RegExp(`\\bTime Period:\\s*${timePeriod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(bodyText) ||
    bodyText.includes(timePeriod);
  const hasTickets = /\bTickets list\b/i.test(bodyText);

  return {
    hasTeam,
    hasStatus,
    hasTimePeriod,
    hasTickets,
    ok: hasTeam && hasStatus && hasTimePeriod && hasTickets,
  };
}

async function setPageSizeTo100(page: Page): Promise<boolean> {
  const selectors = [
    async () => page.locator('select').filter({ has: page.locator('option[value="100"]') }).first(),
    async () => page.locator('select').filter({ has: page.locator('option:text-matches("^100$")') }).first(),
  ];

  for (const getSel of selectors) {
    const sel = await getSel();
    if ((await sel.count()) === 0) continue;
    try {
      const response = page
        .waitForResponse((r) => r.url().includes('/tickets/table.json') && r.status() === 200, { timeout: 30_000 })
        .catch(() => null);
      await sel.selectOption({ value: '100' });
      await response;
      await sleep(900);
      return true;
    } catch {
      /* try label */
    }
    try {
      const response = page
        .waitForResponse((r) => r.url().includes('/tickets/table.json') && r.status() === 200, { timeout: 30_000 })
        .catch(() => null);
      await sel.selectOption({ label: '100' });
      await response;
      await sleep(900);
      return true;
    } catch {
      /* next */
    }
  }

  const combo = page.getByRole('combobox').first();
  if (await combo.isVisible({ timeout: 2500 }).catch(() => false)) {
    try {
      await combo.click();
      const opt = page.getByRole('option', { name: /^100$/ });
      if (await opt.isVisible({ timeout: 2000 }).catch(() => false)) {
        const response = page
          .waitForResponse((r) => r.url().includes('/tickets/table.json') && r.status() === 200, { timeout: 30_000 })
          .catch(() => null);
        await opt.click();
        await response;
        await sleep(800);
        return true;
      }
    } catch {
      /* ignore */
    }
  }

  return false;
}

async function extractTableLikeRows(page: Page, pageIdx: number, baseUrl: string): Promise<PuzzelScrapedRow[]> {
  const out: PuzzelScrapedRow[] = [];
  const tableRows = page.locator('table:visible tbody tr:visible');
  const n = await tableRows.count();
  if (n > 0) {
    for (let i = 0; i < n; i++) {
      const row = tableRows.nth(i);
      const text = (await row.innerText()).replace(/\s+/g, ' ').trim();
      if (!text || text.toLowerCase() === 'no data available') continue;

      const link = row.locator('a[href]').first();
      let rawHref: string | null = null;
      if ((await link.count()) > 0) {
        rawHref = await link.getAttribute('href');
      }

      const cells = row.locator('td:visible');
      const cellCount = await cells.count();
      const parts: string[] = [];
      for (let c = 0; c < cellCount; c++) {
        const value = normalizeCellText(await cells.nth(c).innerText().catch(() => ''));
        if (value) parts.push(value);
      }

      const mapped = mapTicketColumns(parts, text);

      const keyHref = rawHref ? hrefKey(rawHref, baseUrl) : '';
      const externalKey = keyHref ? `href:${keyHref}` : `row:${pageIdx}:${i}:${rowHash(pageIdx, i, text)}`;

      let detailHref = rawHref;
      if (rawHref && !rawHref.startsWith('http')) {
        detailHref = new URL(rawHref, baseUrl).toString();
      }

      out.push({
        externalKey,
        subject: mapped.subject.slice(0, 2000),
        reference: mapped.reference,
        status: mapped.status,
        detailHref,
        rowSummary: text.slice(0, 8000),
        metadata: {
          cols: mapped.clean,
          pageIdx,
          priority: mapped.priority,
          responseTarget: mapped.responseTarget,
          resolveTarget: mapped.resolveTarget,
          team: mapped.team,
          lastInboundActivity: mapped.lastInboundActivity,
          lastActivity: mapped.lastActivity,
          syncFingerprint: ticketFingerprint(mapped, text),
        },
      });
    }
    return out;
  }

  /* AG Grid / aria grid */
  const gridRows = page.locator('[role="row"]:visible').filter({ has: page.locator('[role="gridcell"]') });
  const m = await gridRows.count();
  for (let i = 1; i < m; i++) {
    /* skip header row 0 heuristic */
    const row = gridRows.nth(i);
    const cells = row.locator('[role="gridcell"]:visible');
    const texts: string[] = [];
    const cc = await cells.count();
    for (let z = 0; z < cc; z++) {
      const value = normalizeCellText(await cells.nth(z).innerText().catch(() => ''));
      if (value) texts.push(value);
    }
    const text = texts.join(' · ');
    if (!text) continue;
    const anchor = row.locator('a[href]').first();
    let rawHref: string | null = null;
    if ((await anchor.count()) > 0) rawHref = await anchor.getAttribute('href');
    const keyHref = rawHref ? hrefKey(rawHref, baseUrl) : '';
    const externalKey = keyHref ? `href:${keyHref}` : `grid:${pageIdx}:${i}:${rowHash(pageIdx, i, text)}`;
    let detailHref = rawHref;
    if (rawHref && !rawHref.startsWith('http')) {
      try {
        detailHref = new URL(rawHref, baseUrl).toString();
      } catch {
        detailHref = rawHref;
      }
    }
    const mapped = mapTicketColumns(texts, text);
    out.push({
      externalKey,
      subject: mapped.subject.slice(0, 2000),
      reference: mapped.reference,
      status: mapped.status,
      detailHref,
      rowSummary: text.slice(0, 8000),
      metadata: {
        gridCells: mapped.clean,
        pageIdx,
        priority: mapped.priority,
        responseTarget: mapped.responseTarget,
        resolveTarget: mapped.resolveTarget,
        team: mapped.team,
        lastInboundActivity: mapped.lastInboundActivity,
        lastActivity: mapped.lastActivity,
        syncFingerprint: ticketFingerprint(mapped, text),
      },
    });
  }

  return out;
}

async function clickNextPage(page: Page): Promise<boolean> {
  const candidates = [
    page.locator('.dataTables_paginate a:has-text("Next"):visible'),
    page.locator('.pagination a:has-text("Next"):visible'),
    page.locator('ul.pagination li:not(.disabled) a:has-text("Next"):visible'),
    page.locator('a:has-text("Next"):visible'),
    page.locator('.paginate_button.next:not(.disabled)'),
    page.locator('[aria-label="Next"]:not([disabled])'),
    page.locator('button:has-text("Next"):not([disabled])'),
    page.locator('a[rel="next"]'),
    page.locator('li.page-next:not(.disabled) a'),
    page.locator('[class*="Pagination"] button:right-of(:text("Next"))'),
  ];

  for (const loc of candidates) {
    try {
      const el = loc.first();
      if (!(await el.isVisible({ timeout: 800 }).catch(() => false))) continue;
      const cls = await el.getAttribute('class');
      const dis = await el.getAttribute('disabled');
      const ariaDisabled = await el.getAttribute('aria-disabled');
      const disabledByParent = await el.evaluate((node) =>
        Boolean(node.closest('.disabled, [aria-disabled="true"]')),
      );
      if (
        cls?.includes('disabled') ||
        dis !== null ||
        ariaDisabled === 'true' ||
        disabledByParent
      )
        continue;
      const response = page
        .waitForResponse((r) => r.url().includes('/tickets/table.json') && r.status() === 200, { timeout: 30_000 })
        .catch(() => null);
      await el.scrollIntoViewIfNeeded().catch(() => {});
      await el.click({ force: true });
      await response;
      await sleep(1500);
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

/**
 * Scrape ticket rows on an already logged-in page. The page is navigated to the
 * tickets URL by this function. Browser lifecycle is owned by the caller.
 */
export async function scrapePuzzelTicketsOnPage(
  page: Page,
  opts: PuzzelScrapeOpts,
  gotoLoggedIn: (url: string) => Promise<void>,
): Promise<PuzzelScrapedRow[]> {
  const baseUrl = normBase(opts.baseUrl);
  const ticketUrl = `${baseUrl}${opts.ticketsPath.startsWith('/') ? '' : '/'}${opts.ticketsPath}`;

  progress(opts, 'Ticketlisten-Sync startet');
  await gotoLoggedIn(ticketUrl);
  await sleep(2000);
  await page
    .waitForResponse((r) => r.url().includes('/tickets/table.json') && r.status() === 200, { timeout: 30_000 })
    .catch(() => {});

  const savedSearchName = opts.savedSearchName ?? "My Favourite Team's Open Tickets";
  progress(opts, `Saved Search auswählen: ${savedSearchName}`);
  const savedSearchSelected = await selectSavedSearch(page, savedSearchName);
  progress(opts, savedSearchSelected ? 'Saved Search ausgewählt' : 'Saved Search nicht gefunden, aktueller Filter wird genutzt');
  const filterState = await validateRelevantFilter(page, opts);
  progress(
    opts,
    `Filterstatus: Team=${filterState.hasTeam ? 'ok' : 'fehlt'}, Status=${filterState.hasStatus ? 'ok' : 'fehlt'}, Zeitraum=${filterState.hasTimePeriod ? 'ok' : 'fehlt'}, Tickets=${filterState.hasTickets ? 'ok' : 'fehlt'}`,
  );
  progress(opts, 'Setze Ticketliste auf 100 Einträge pro Seite');
  await setPageSizeTo100(page);
  await page
    .waitForSelector('table:visible tbody tr:visible, [role="row"]:visible [role="gridcell"]', { timeout: 30_000 })
    .catch(() => {});

  const all: PuzzelScrapedRow[] = [];
  const maxPages = 400;
  let lastFingerprint = '';

  for (let p = 0; p < maxPages; p++) {
    await sleep(500);
    let batch = await extractTableLikeRows(page, p, baseUrl);
    if (batch.length === 0 && p === 0) {
      await sleep(2500);
      batch = await extractTableLikeRows(page, p, baseUrl);
    }
    const fp = `${batch.length}:${batch[0]?.rowSummary.slice(0, 120) ?? ''}`;
    if (!batch.length && p > 0) break;
    if (fp === lastFingerprint && p > 0) break;
    lastFingerprint = fp;
    progress(opts, `Ticketseite ${p + 1}: ${batch.length} Tickets erkannt (${all.length + batch.length} gesamt bisher)`);
    all.push(
      ...batch.map((row) => ({
        ...row,
        metadata: {
          ...(row.metadata ?? {}),
          filterState,
        },
      })),
    );

    const moved = await clickNextPage(page);
    progress(opts, moved ? `Wechsle auf Ticketseite ${p + 2}` : 'Keine weitere Ticketseite gefunden');
    if (!moved) break;
  }

  if (!all.length) {
    throw new Error('Keine Ticket-Zeilen gefunden — DOM-Abweichung oder kein Ticket-Zugang nach Login.');
  }

  const uniq = new Map<string, PuzzelScrapedRow>();
  for (const row of all) {
    uniq.set(row.externalKey, row);
  }
  progress(opts, `Ticketlisten-Sync fertig: ${uniq.size} eindeutige Tickets erkannt`);
  return [...uniq.values()];
}

/**
 * Headless scrape: establishes a fresh browser session per call.
 * Caller must persist rows; timeouts assume relatively fast CM instance.
 */
export async function scrapePuzzelTickets(opts: PuzzelScrapeOpts): Promise<PuzzelScrapedRow[]> {
  const baseUrl = normBase(opts.baseUrl);
  const ticketUrl = `${baseUrl}${opts.ticketsPath.startsWith('/') ? '' : '/'}${opts.ticketsPath}`;

  const browser = await chromium.launch({
    headless: opts.headless ?? true,
  });

  try {
    const ctx = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
      locale: 'de-CH',
    });
    const page = await ctx.newPage();

    progress(opts, 'Ticketlisten-Sync startet');
    await openLoggedInPage(page, ticketUrl, opts);
    await sleep(2000);
    await page
      .waitForResponse((r) => r.url().includes('/tickets/table.json') && r.status() === 200, { timeout: 30_000 })
      .catch(() => {});

    const savedSearchName = opts.savedSearchName ?? "My Favourite Team's Open Tickets";
    progress(opts, `Saved Search auswählen: ${savedSearchName}`);
    const savedSearchSelected = await selectSavedSearch(page, savedSearchName);
    progress(opts, savedSearchSelected ? 'Saved Search ausgewählt' : 'Saved Search nicht gefunden, aktueller Filter wird genutzt');
    const filterState = await validateRelevantFilter(page, opts);
    progress(
      opts,
      `Filterstatus: Team=${filterState.hasTeam ? 'ok' : 'fehlt'}, Status=${filterState.hasStatus ? 'ok' : 'fehlt'}, Zeitraum=${filterState.hasTimePeriod ? 'ok' : 'fehlt'}, Tickets=${filterState.hasTickets ? 'ok' : 'fehlt'}`,
    );
    progress(opts, 'Setze Ticketliste auf 100 Einträge pro Seite');
    await setPageSizeTo100(page);
    await page
      .waitForSelector('table:visible tbody tr:visible, [role="row"]:visible [role="gridcell"]', { timeout: 30_000 })
      .catch(() => {});

    const all: PuzzelScrapedRow[] = [];
    const maxPages = 400;
    let lastFingerprint = '';

    for (let p = 0; p < maxPages; p++) {
      await sleep(500);
      let batch = await extractTableLikeRows(page, p, baseUrl);
      if (batch.length === 0 && p === 0) {
        await sleep(2500);
        batch = await extractTableLikeRows(page, p, baseUrl);
      }
      const fp = `${batch.length}:${batch[0]?.rowSummary.slice(0, 120) ?? ''}`;
      if (!batch.length && p > 0) break;
      if (fp === lastFingerprint && p > 0) break;
      lastFingerprint = fp;
      progress(opts, `Ticketseite ${p + 1}: ${batch.length} Tickets erkannt (${all.length + batch.length} gesamt bisher)`);
      all.push(
        ...batch.map((row) => ({
          ...row,
          metadata: {
            ...(row.metadata ?? {}),
            filterState,
          },
        })),
      );

      const moved = await clickNextPage(page);
      progress(opts, moved ? `Wechsle auf Ticketseite ${p + 2}` : 'Keine weitere Ticketseite gefunden');
      if (!moved) break;
    }

    if (!all.length) {
      throw new Error(
        'Keine Ticket-Zeilen gefunden — DOM-Abweichung oder kein Ticket-Zugang nach Login.',
      );
    }

    const uniq = new Map<string, PuzzelScrapedRow>();
    for (const row of all) {
      uniq.set(row.externalKey, row);
    }
    progress(opts, `Ticketlisten-Sync fertig: ${uniq.size} eindeutige Tickets erkannt`);
    return [...uniq.values()];
  } finally {
    await browser.close().catch(() => {});
  }
}

function parseTimelineSummary(summary: string): Pick<
  PuzzelScrapedMessage,
  'sentAtText' | 'fromText' | 'toText' | 'direction'
> {
  const text = normalizeCellText(summary);
  const fromMatch = text.match(/\bFrom:\s*(.*?)\s+\bTo:/i);
  const toMatch = text.match(/\bTo:\s*(.*?)\s+(?:Download EML|Quote this Message|$)/i);
  const sentAtMatch = text.match(/^(.+?)\s+\bFrom:/i);
  const fromText = fromMatch?.[1]?.trim() || null;
  const toText = toMatch?.[1]?.trim() || null;
  const direction = fromText?.toLowerCase().includes('billing.bern@prizebyradisson.com')
    ? 'outbound'
    : toText?.toLowerCase().includes('billing.bern@prizebyradisson.com')
      ? 'inbound'
      : null;
  return {
    sentAtText: sentAtMatch?.[1]?.trim() || null,
    fromText,
    toText,
    direction,
  };
}

export async function extractPuzzelMessagesFromPage(page: Page): Promise<PuzzelScrapedMessage[]> {
  await page
    .waitForSelector('iframe[src*="/emails/"], text=Timeline', { timeout: 45_000 })
    .catch(() => {});
  await sleep(2000);

  const summaries = await page
    .locator('li:has-text("Download EML"), .timeline li:has-text("Download EML")')
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).innerText || el.textContent || ''))
    .catch(() => [] as string[]);

  const emailFrames = page
    .frames()
    .filter((frame) => /\/emails\/\d+(?:$|\?)/.test(frame.url()) && !frame.url().includes('/email_headers'));

  const messages: PuzzelScrapedMessage[] = [];
  for (let i = 0; i < emailFrames.length; i++) {
    const frame = emailFrames[i];
    const idMatch = frame.url().match(/\/emails\/(\d+)/);
    const bodyText = await frame.locator('body').innerText().catch(() => '');
    const bodyHtml = await frame.locator('body').innerHTML().catch(() => null);
    const normalizedBody = normalizeCellText(bodyText);
    if (!normalizedBody && !bodyHtml) continue;

    const parsed = parseTimelineSummary(summaries[i] ?? '');
    messages.push({
      externalKey: `email:${idMatch?.[1] ?? createHash('sha256').update(frame.url()).digest('hex').slice(0, 24)}`,
      sentAtText: parsed.sentAtText,
      fromText: parsed.fromText,
      toText: parsed.toText,
      direction: parsed.direction,
      bodyText: bodyText.slice(0, 50_000),
      bodyHtml: bodyHtml?.slice(0, 200_000) ?? null,
      metadata: {
        frameUrl: frame.url(),
        summary: summaries[i] ?? null,
        index: i,
      },
    });
  }

  if (!messages.length) {
    throw new Error('Keine Puzzel-Nachrichten im Ticket gefunden.');
  }
  return messages;
}

export async function scrapePuzzelTicketMessages(opts: PuzzelMessageScrapeOpts): Promise<PuzzelScrapedMessage[]> {
  const browser = await chromium.launch({
    headless: opts.headless ?? true,
  });

  try {
    const ctx = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
      locale: 'de-CH',
    });
    const page = await ctx.newPage();
    progress(opts, 'Einzelnes Ticket für Nachrichten öffnen');
    await openLoggedInPage(page, opts.ticketUrl, opts);
    const messages = await extractPuzzelMessagesFromPage(page);
    progress(opts, `Nachrichten im Ticket erkannt: ${messages.length}`);
    return messages;
  } finally {
    await browser.close().catch(() => {});
  }
}

export async function scrapePuzzelTicketMessagesBatch(
  opts: PuzzelScrapeOpts,
  tickets: PuzzelBatchMessageTarget[],
): Promise<PuzzelBatchScrapedMessages[]> {
  if (tickets.length === 0) return [];

  const browser = await chromium.launch({
    headless: opts.headless ?? true,
  });

  try {
    const ctx = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
      locale: 'de-CH',
    });
    const page = await ctx.newPage();
    progress(opts, `Nachrichten-Sync startet: ${tickets.length} Tickets müssen geprüft werden`);
    await openLoggedInPage(page, tickets[0].ticketUrl, opts);

    const out: PuzzelBatchScrapedMessages[] = [];
    for (let i = 0; i < tickets.length; i++) {
      const target = tickets[i];
      progress(opts, `Nachrichten-Sync ${i + 1}/${tickets.length}: Ticket ${target.externalKey}`);
      if (i > 0) {
        await page.goto(target.ticketUrl, { timeout: 120_000, waitUntil: 'domcontentloaded' });
      }
      const messages = await extractPuzzelMessagesFromPage(page).catch((e) => {
        progress(opts, `Nachrichten-Sync ${i + 1}/${tickets.length}: fehlgeschlagen (${(e as Error).message ?? String(e)})`);
        return [] as PuzzelScrapedMessage[];
      });
      progress(opts, `Nachrichten-Sync ${i + 1}/${tickets.length}: ${messages.length} Nachrichten erkannt`);
      out.push({
        ticketId: target.ticketId,
        externalKey: target.externalKey,
        messages,
      });
    }
    progress(opts, `Nachrichten-Sync fertig: ${out.length} Tickets geprüft`);
    return out;
  } finally {
    await browser.close().catch(() => {});
  }
}

async function clickFirstVisible(root: Page | Locator, selectors: string[], timeout = 3000) {
  for (const selector of selectors) {
    try {
      const loc = root.locator(selector).first();
      if (await loc.isVisible({ timeout }).catch(() => false)) {
        await loc.scrollIntoViewIfNeeded().catch(() => {});
        await loc.click({ force: true });
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

async function fillFirstVisible(root: Page | Locator, selectors: string[], value: string, timeout = 3000) {
  for (const selector of selectors) {
    try {
      const loc = root.locator(selector).first();
      if (await loc.isVisible({ timeout }).catch(() => false)) {
        await loc.scrollIntoViewIfNeeded().catch(() => {});
        await loc.fill(value);
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

/**
 * Quill / contenteditable reply composers often do not apply `fill()` to the document model.
 * Focus the field and use `keyboard.insertText` so the UI submits real body text.
 */
async function fillReplyComposerText(composer: Locator, page: Page, value: string): Promise<boolean> {
  const selectors = [
    '[contenteditable="true"]:visible',
    '.ql-editor:visible',
    '[role="textbox"]:visible',
    'textarea:visible',
  ];

  for (const selector of selectors) {
    const loc = composer.locator(selector).first();
    if (!(await loc.isVisible({ timeout: 2500 }).catch(() => false))) continue;
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    const tag = await loc.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');

    try {
      if (tag === 'textarea' || tag === 'input') {
        await loc.fill(value);
        return true;
      }
      await loc.click({ timeout: 4000 });
      await page.keyboard.insertText(value);
      return true;
    } catch {
      try {
        await loc.click({ timeout: 4000 });
        await page.keyboard.type(value);
        return true;
      } catch {
        continue;
      }
    }
  }
  return false;
}

/**
 * Nach Klick auf „Reply“ öffnet Puzzel zuerst ein Modal/Overlay mit dem Editor — nicht inline auf der Timeline.
 */
async function waitForPuzzelReplyComposerRoot(
  page: Page,
  opts: PuzzelTicketActionOpts,
  timeoutMs = 20_000,
): Promise<Locator> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const dialog = page
      .getByRole('dialog')
      .filter({
        has: page.locator('textarea, [contenteditable="true"], [role="textbox"]'),
      })
      .first();
    if (await dialog.isVisible().catch(() => false)) {
      progress(opts, 'Ticket-Aktion: Reply-Fenster (Dialog) bereit');
      return dialog;
    }
    const anyModal = page
      .locator(
        '[aria-modal="true"]:visible, .modal-dialog:visible, [class*="modal"]:visible, [class*="compose"]:visible, [class*="Compose"]:visible',
      )
      .filter({
        has: page.locator('textarea:visible, [contenteditable="true"]:visible'),
      })
      .first();
    if (await anyModal.isVisible().catch(() => false)) {
      progress(opts, 'Ticket-Aktion: Reply-Composer-Panel bereit');
      return anyModal;
    }
    await sleep(200);
  }
  progress(opts, 'Ticket-Aktion: Kein separates Reply-Fenster — Editor auf Seite');
  return page.locator('body');
}

/** Puzzel reply composer: „Attach File“ + `input[type=file]`; viele UIs erlauben nur eine Datei pro Durchgang — dann sequentiell. */
async function attachFilesToPuzzelReplyComposer(
  composer: Locator,
  page: Page,
  paths: string[],
  opts: PuzzelTicketActionOpts,
) {
  const clean = paths.filter((p) => p?.trim());
  if (clean.length === 0) return;

  progress(opts, `Ticket-Aktion: ${clean.length} Datei(en) an Puzzel anhängen`);

  const trySet = async (files: string[]): Promise<boolean> => {
    for (const root of [composer, page.locator('body')]) {
      const inputs = root.locator('input[type="file"]');
      const n = await inputs.count();
      for (let i = n - 1; i >= 0; i--) {
        try {
          await inputs.nth(i).setInputFiles(files);
          return true;
        } catch {
          continue;
        }
      }
    }
    return false;
  };

  const attachBtn = composer.getByRole('button', { name: /Attach File/i }).first();

  if (await trySet(clean)) {
    await sleep(800);
    return;
  }

  if (await attachBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await attachBtn.scrollIntoViewIfNeeded().catch(() => {});
    await attachBtn.click();
    await sleep(600);
    if (await trySet(clean)) {
      await sleep(800);
      return;
    }
  }

  for (let idx = 0; idx < clean.length; idx++) {
    if (idx > 0) {
      if (await attachBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
        await attachBtn.click();
        await sleep(600);
      }
    }
    if (!(await trySet([clean[idx]]))) {
      throw new Error(
        `Puzzel: Datei ${idx + 1} von ${clean.length} konnte nicht angehängt werden.`,
      );
    }
    await sleep(500);
  }
}

async function clickPuzzelComposerSend(composer: Locator, page: Page): Promise<boolean> {
  const sendLink = composer.getByRole('link', { name: /^Send$/i }).first();
  if (await sendLink.isVisible({ timeout: 2000 }).catch(() => false)) {
    await sendLink.scrollIntoViewIfNeeded().catch(() => {});
    await sendLink.click({ force: true });
    return true;
  }
  const sendBtn = composer.getByRole('button', { name: /^Send$/i }).first();
  if (await sendBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await sendBtn.scrollIntoViewIfNeeded().catch(() => {});
    await sendBtn.click({ force: true });
    return true;
  }
  if (
    await clickFirstVisible(composer, [
      'button:has-text("Send reply")',
      'button:has-text("Send follow-up")',
      'a:has-text("Send reply")',
      'a:has-text("Send follow-up")',
      'button:has-text("Send")',
      'a:has-text("Send")',
      'button:has-text("Submit")',
      'button:has-text("Senden")',
      'button:has-text("Antwort senden")',
      '[aria-label*="Send" i]',
    ], 4000)
  ) {
    return true;
  }
  return clickFirstVisible(page, [
    'button:has-text("Send reply")',
    'button:has-text("Send follow-up")',
    'a:has-text("Send")',
    'button:has-text("Send")',
    'button:has-text("Submit")',
    'button:has-text("Senden")',
    'button:has-text("Antwort senden")',
    '[aria-label*="Send" i]',
  ], 3500);
}

export async function assignPuzzelTicketToMeOnPage(page: Page, opts: PuzzelTicketActionOpts) {
  return assignTicketToLoggedInUser(page, opts);
}

export async function replyToPuzzelTicketOnPage(page: Page, opts: PuzzelTicketActionOpts) {
  return replyToTicket(page, opts);
}

/** Nach Self-Assign: primärer pinker „Reply“-Button in der Timeline-Leiste (exakter Name). */
function puzzelTimelineReplyButton(page: Page) {
  return page.getByRole('button', { name: /^Reply$/i }).first();
}

async function waitForPuzzelReplyOrFollowUp(
  page: Page,
  opts: PuzzelTicketActionOpts,
  timeoutMs = 25_000,
) {
  const replyBtn = puzzelTimelineReplyButton(page);
  const followUp = page.getByRole('link', { name: /Add Follow-Up/i }).first();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await replyBtn.isVisible().catch(() => false)) {
      progress(opts, 'Ticket-Aktion: Reply-Button in der Timeline sichtbar');
      return;
    }
    if (await followUp.isVisible().catch(() => false)) {
      progress(opts, 'Ticket-Aktion: Add Follow-Up sichtbar');
      return;
    }
    await sleep(350);
  }
  progress(
    opts,
    'Ticket-Aktion: Weder Reply noch Follow-Up nach Zuweisung — Composer wird trotzdem versucht',
  );
}

async function assignTicketToLoggedInUser(page: Page, opts: PuzzelTicketActionOpts) {
  progress(opts, 'Ticket-Aktion: "Assign to me" suchen');
  const directAssign = page.getByRole('button', { name: /assign to me/i }).first();
  if (await directAssign.isVisible({ timeout: 2500 }).catch(() => false)) {
    await directAssign.scrollIntoViewIfNeeded().catch(() => {});
    await directAssign.click();
    await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    await sleep(1200);
    await puzzelTimelineReplyButton(page)
      .waitFor({ state: 'visible', timeout: 25_000 })
      .catch(() => undefined);
    progress(opts, 'Ticket-Aktion: Ticket wurde an den eingeloggten Puzzel-User zugewiesen');
    return;
  }

  const openedMenu = await clickFirstVisible(page, [
    'button:has-text("Assign")',
    'a:has-text("Assign")',
    'button:has-text("Zuweisen")',
    'a:has-text("Zuweisen")',
    '[aria-label*="Assign" i]',
  ], 1500);

  const assigned = await clickFirstVisible(page, [
    'button:has-text("Assign to me")',
    'button:has-text("Assign To Me")',
    'a:has-text("Assign to me")',
    'a:has-text("Assign To Me")',
    'button:has-text("Assign ticket to me")',
    'a:has-text("Assign ticket to me")',
    'button:has-text("Take ownership")',
    'a:has-text("Take ownership")',
    'button:has-text("Me")',
    'a:has-text("Me")',
    'button:has-text("Mir zuweisen")',
    'a:has-text("Mir zuweisen")',
  ], openedMenu ? 5000 : 2000);

  if (!assigned) {
    throw new Error('Puzzel Assign-to-me Button nicht gefunden.');
  }
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await sleep(1200);
  await puzzelTimelineReplyButton(page)
    .waitFor({ state: 'visible', timeout: 25_000 })
    .catch(() => undefined);
  progress(opts, 'Ticket-Aktion: Ticket wurde an den eingeloggten Puzzel-User zugewiesen');
}

async function replyToTicket(page: Page, opts: PuzzelTicketActionOpts) {
  const rawText = opts.replyText?.trim() ?? '';
  const attachPaths = opts.replyAttachmentPaths?.filter(Boolean) ?? [];
  if (!rawText && attachPaths.length === 0) {
    throw new Error('Reply: Text oder mindestens eine Datei erforderlich.');
  }

  const replyAlready = await puzzelTimelineReplyButton(page).isVisible({ timeout: 2000 }).catch(() => false);
  const followUpAlready = await page
    .getByRole('link', { name: /Add Follow-Up/i })
    .first()
    .isVisible({ timeout: 500 })
    .catch(() => false);
  if (!replyAlready && !followUpAlready) {
    progress(opts, 'Ticket-Aktion: Vor dem Antworten an eingeloggten Agent zuweisen');
    try {
      await assignTicketToLoggedInUser(page, opts);
    } catch (e) {
      progress(
        opts,
        `Ticket-Aktion: Assign-to-me fehlgeschlagen — weiter mit Antwort (${(e as Error).message})`,
      );
    }
  } else {
    progress(opts, 'Ticket-Aktion: Reply/Follow-Up bereits sichtbar — Zuweisung übersprungen');
  }
  await waitForPuzzelReplyOrFollowUp(page, opts);

  progress(opts, 'Ticket-Aktion: Antwort-Composer öffnen');
  // Nach Zuweisung: Timeline-Kopf mit exakt „Reply“ (Button, pink) — vorher nur Follow-Up/Note.
  let opened = false;
  const primaryReply = puzzelTimelineReplyButton(page);
  if (await primaryReply.isVisible({ timeout: 4000 }).catch(() => false)) {
    await primaryReply.scrollIntoViewIfNeeded().catch(() => {});
    await primaryReply.click();
    opened = true;
  }
  if (!opened) {
    opened = await clickFirstVisible(
      page,
      [
        'a:has-text("Reply")',
        'button:has-text("Reply all")',
        'a:has-text("Reply all")',
        'button:has-text("Antworten")',
        'a:has-text("Antworten")',
        '[aria-label*="Reply" i]',
      ],
      3000,
    );
  }
  if (!opened) {
    opened = await clickFirstVisible(page, [
      'a:has-text("Add Follow-Up")',
      'button:has-text("Add Follow-Up")',
      'a:has-text("Follow-Up")',
      'button:has-text("Follow-Up")',
      '[aria-label*="Follow-Up" i]',
      'a:has-text("Add follow-up")',
    ], 6000);
  }
  if (!opened) {
    const followUp = page.getByRole('link', { name: /Add Follow-Up/i }).first();
    if (await followUp.isVisible({ timeout: 3000 }).catch(() => false)) {
      await followUp.scrollIntoViewIfNeeded().catch(() => {});
      await followUp.click({ force: true }).catch(() => {});
      opened = true;
    }
  }
  if (!opened) {
    throw new Error(
      'Puzzel Reply / Add Follow-Up nicht gefunden — Ticket-Oberfläche abweichend.',
    );
  }

  const composer = await waitForPuzzelReplyComposerRoot(page, opts);
  await sleep(300);

  if (rawText) {
    progress(opts, 'Ticket-Aktion: Antworttext eintragen');
    let filled = await fillReplyComposerText(composer, page, rawText);
    if (!filled) {
      const frame = page.frames().find((f) => /reply|editor|compose|tinymce|ckeditor/i.test(f.url()));
      const frameBody = frame?.locator('body').first();
      if (frameBody && (await frameBody.isVisible({ timeout: 2000 }).catch(() => false))) {
        await frameBody.click();
        await page.keyboard.insertText(rawText);
        filled = true;
      }
    }
    if (!filled) {
      throw new Error('Puzzel Antwortfeld nicht gefunden.');
    }
    await sleep(250);
  } else {
    progress(opts, 'Ticket-Aktion: Nur Anhänge (ohne Nachrichtentext)');
  }

  if (attachPaths.length > 0) {
    await attachFilesToPuzzelReplyComposer(composer, page, attachPaths, opts);
  }

  progress(opts, 'Ticket-Aktion: Antwort senden');
  const sent = await clickPuzzelComposerSend(composer, page);
  if (!sent) {
    throw new Error('Puzzel Send Button nicht gefunden.');
  }
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await sleep(800);
  progress(opts, 'Ticket-Aktion: Antwort wurde gesendet');
}

/**
 * Some tenants show **Resolve** only under Actions / ⋮ — open menu then pick item.
 */
async function tryResolveFromOverflowMenu(page: Page): Promise<boolean> {
  const opened = await clickFirstVisible(
    page,
    [
      'button:has-text("Actions")',
      'a:has-text("Actions")',
      '[aria-label*="Actions"]',
      '[aria-label*="actions"]',
      'button:has-text("More")',
      '[aria-label*="More options"]',
      '[aria-label*="more options"]',
    ],
    1500,
  );
  if (!opened) {
    return false;
  }
  await sleep(450);
  const picked = await clickFirstVisible(
    page,
    [
      '[role="menuitem"]:has-text("Resolve Ticket")',
      '[role="menuitem"]:has-text("Resolve")',
      'li:has-text("Resolve Ticket")',
      'li:has-text("Resolve ticket")',
      'a:has-text("Resolve Ticket")',
      'button:has-text("Resolve Ticket")',
      '[role="option"]:has-text("Resolve")',
    ],
    4000,
  );
  if (!picked) {
    await page.keyboard.press('Escape').catch(() => undefined);
    return false;
  }
  return true;
}

/**
 * Clicks Puzzel’s primary **Resolve Ticket** control (same label as in CM), then any confirm dialog.
 */
export async function resolvePuzzelTicketOnPage(page: Page, opts: PuzzelTicketActionOpts) {
  progress(opts, 'Ticket-Aktion: „Resolve“ / Ticket abschließen suchen');
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => undefined);
  await sleep(400);

  const tryResolve = async (): Promise<boolean> => {
    const idBtn = page.locator('#resolve-ticket-btn').first();
    if (await idBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await idBtn.scrollIntoViewIfNeeded().catch(() => {});
      await idBtn.click({ timeout: 10_000 });
      return true;
    }

    const candidates: Locator[] = [
      page.getByRole('button', { name: /^Resolve Ticket$/i }),
      page.getByRole('button', { name: /resolve ticket/i }),
      page.getByRole('button', { name: /^Resolve$/i }),
      page.getByRole('button', { name: /mark as resolved/i }),
      page.getByRole('button', { name: /set to resolved/i }),
      page.getByRole('button', { name: /close ticket/i }),
      page.getByRole('link', { name: /resolve ticket/i }),
      page.getByRole('link', { name: /^Resolve$/i }),
      page.getByRole('button', { name: /ticket abschließen/i }),
      page.getByRole('button', { name: /als erledigt/i }),
      page.getByRole('button', { name: /^Abschließen$/i }),
    ];
    for (const loc of candidates) {
      const el = loc.first();
      if (await el.isVisible({ timeout: 2500 }).catch(() => false)) {
        await el.scrollIntoViewIfNeeded().catch(() => {});
        await el.click({ timeout: 10_000 });
        return true;
      }
    }

    const cssHit = await clickFirstVisible(
      page,
      [
        '#resolve-ticket-btn',
        'a#resolve-ticket-btn',
        'a.btn-primary-ruby:has-text("Resolve Ticket")',
        'a.btn-primary-ruby:has-text("Resolve ticket")',
        'a:has-text("Resolve Ticket")',
        'a:has-text("Resolve ticket")',
        'button:has-text("Resolve Ticket")',
        'button:has-text("Resolve ticket")',
        '[aria-label*="Resolve Ticket"]',
        '[aria-label*="Resolve ticket"]',
        '[aria-label*="resolve ticket"]',
        'button[title*="Resolve Ticket"]',
        'button[title*="Resolve ticket"]',
        '[title*="Resolve ticket"]',
        'button:has-text("Mark as resolved")',
        'button:has-text("Set to Resolved")',
        'button:has-text("Ticket abschließen")',
        'a:has-text("Ticket abschließen")',
        '[aria-label*="Resolve"]',
      ],
      2500,
    );
    if (cssHit) {
      return true;
    }

    return tryResolveFromOverflowMenu(page);
  };

  if (!(await tryResolve())) {
    progress(opts, 'Ticket-Aktion: Resolve noch nicht sichtbar — ggf. „Assign to me“');
    try {
      await assignTicketToLoggedInUser(page, opts);
    } catch (e) {
      progress(opts, `Ticket-Aktion: Assign vor Resolve fehlgeschlagen (${(e as Error).message})`);
    }
    if (!(await tryResolve())) {
      throw new Error(
        'Puzzel: Steuerung „Resolve Ticket“ nicht gefunden (auch nicht unter Actions/Menü). Bitte exaktes UI-Label melden.',
      );
    }
  }

  await sleep(600);
  const dialog = page.getByRole('dialog');
  if (await dialog.isVisible({ timeout: 2500 }).catch(() => false)) {
    const confirm = dialog
      .getByRole('button', { name: /^(yes|ok|confirm|resolve|bestätigen|weiter)$/i })
      .first();
    if (await confirm.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirm.click();
    }
  } else {
    const confirmPatterns = [/^(yes|ok)$/i, /confirm/i, /bestätigen/i, /resolve/i];
    for (const pattern of confirmPatterns) {
      const b = page.getByRole('button', { name: pattern }).first();
      if (await b.isVisible({ timeout: 600 }).catch(() => false)) {
        await b.click();
        break;
      }
    }
  }
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await sleep(800);
  progress(opts, 'Ticket-Aktion: „Resolve Ticket“ ausgeführt');
}

export async function assignPuzzelTicketToMe(opts: PuzzelTicketActionOpts): Promise<PuzzelTicketActionResult> {
  const browser = await chromium.launch({ headless: opts.headless ?? true });
  try {
    const ctx = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
      locale: 'de-CH',
    });
    const page = await ctx.newPage();
    await openLoggedInPage(page, opts.ticketUrl, opts);
    await assignTicketToLoggedInUser(page, opts);
    return { ok: true, action: 'assign' };
  } finally {
    await browser.close().catch(() => {});
  }
}

export async function replyToPuzzelTicket(opts: PuzzelTicketActionOpts): Promise<PuzzelTicketActionResult> {
  const browser = await chromium.launch({ headless: opts.headless ?? true });
  try {
    const ctx = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
      locale: 'de-CH',
    });
    const page = await ctx.newPage();
    await openLoggedInPage(page, opts.ticketUrl, opts);
    await replyToTicket(page, opts);
    return { ok: true, action: 'reply' };
  } finally {
    await browser.close().catch(() => {});
  }
}
