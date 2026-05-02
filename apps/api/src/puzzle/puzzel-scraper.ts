import { createHash } from 'node:crypto';
import { chromium, type Page } from 'playwright';
import { generateSync } from 'otplib';

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

export type PuzzelScrapeOpts = {
  baseUrl: string;
  /** e.g. `/tickets` */
  ticketsPath: string;
  email: string;
  password: string;
  totpSecret?: string;
  headless?: boolean;
};

function normBase(url: string) {
  return url.replace(/\/+$/, '');
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
  };
}

async function tryPuzzelLogin(page: Page, opts: PuzzelScrapeOpts) {
  const userField = page
    .locator(
      '#Input_Username, input[name="Input.Username"], #userNameInput, input[name="UserName"], input[placeholder="someone@example.com"]',
    )
    .first();
  if (await userField.isVisible({ timeout: 8000 }).catch(() => false)) {
    await userField.fill(opts.email);
    const nextBtn = page
      .locator('form#mainForm button.submit-button, button.submit-button, input#submitButton, input[type="submit"], button:has-text("Next")')
      .first();
    await nextBtn.click();
    await sleep(1200);
  }

  const adfsUserField = page
    .locator('#userNameInput, input[name="UserName"], input[placeholder="someone@example.com"]')
    .first();
  if (await adfsUserField.isVisible({ timeout: 3000 }).catch(() => false)) {
    await adfsUserField.fill(opts.email);
  }

  const passField = page
    .locator(
      '#Input_Password, input[name="Input.Password"], #passwordInput, input#password, input[type="password"], input[type="password"][autocomplete="current-password"]',
    )
    .first();
  if (await passField.isVisible({ timeout: 20000 }).catch(() => false)) {
    await passField.fill(opts.password);
    const submit = page
      .locator(
        '#submitButton, input[type="submit"], form button[type="submit"], button.submit-button, button:has-text("Sign in"), button:has-text("Next")',
      )
      .first();
    await submit.click();
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
    const code = generateSync({
      secret: opts.totpSecret.replace(/\s+/g, '').toUpperCase(),
    });
    await otp.fill(code);
    const go = page
      .locator('#submitButton, input[type="submit"], button[type="submit"], button:has-text("Verify"), button:has-text("Next")')
      .first();
    await go.click();
    await sleep(2500);
  }
}

async function selectAllTicketsSearch(page: Page) {
  const allTickets = page.locator('a:has-text("All Tickets"), li:has-text("All Tickets") a').first();
  if (!(await allTickets.isVisible({ timeout: 5000 }).catch(() => false))) return false;

  const response = page
    .waitForResponse((r) => r.url().includes('/tickets/table.json') && r.status() === 200, { timeout: 30_000 })
    .catch(() => null);
  await allTickets.click();
  await response;
  await sleep(1200);
  return true;
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
      },
    });
  }

  return out;
}

async function clickNextPage(page: Page): Promise<boolean> {
  const candidates = [
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
      if (
        cls?.includes('disabled') ||
        dis !== null ||
        ariaDisabled === 'true' ||
        (await el.locator('xpath=ancestor-or-self::*[contains(@class, "disabled")]').count()) > 0
      )
        continue;
      const response = page
        .waitForResponse((r) => r.url().includes('/tickets/table.json') && r.status() === 200, { timeout: 30_000 })
        .catch(() => null);
      await el.click();
      await response;
      await sleep(600);
      return true;
    } catch {
      continue;
    }
  }
  return false;
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

    await page.goto(ticketUrl, { timeout: 120_000, waitUntil: 'domcontentloaded' });
    await tryPuzzelLogin(page, opts);

    if (page.url().includes('/Account/Login') || (await page.locator('#Input_Username').count()) > 0) {
      await tryPuzzelLogin(page, opts);
    }

    await page.goto(ticketUrl, { timeout: 120_000, waitUntil: 'domcontentloaded' });
    await sleep(2000);
    await page
      .waitForResponse((r) => r.url().includes('/tickets/table.json') && r.status() === 200, { timeout: 30_000 })
      .catch(() => {});

    await selectAllTicketsSearch(page);
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
      all.push(...batch);

      const moved = await clickNextPage(page);
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
    return [...uniq.values()];
  } finally {
    await browser.close().catch(() => {});
  }
}
