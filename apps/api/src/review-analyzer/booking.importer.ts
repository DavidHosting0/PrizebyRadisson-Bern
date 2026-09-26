/**
 * Booking.com review scraper — patterns ported from Desktop/Analyzer/scrapers/booking.py
 * (sort newest, page-number pagination, review-card field selectors, de-DE locale).
 */
import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { chromium, type Locator, type Page } from 'playwright';
import { DEFAULT_BOOKING_URL } from './taxonomy';
import { hashReviewContent, withPlaywrightMutex } from './review-utils';

export type ScrapedBookingReview = {
  externalId: string;
  reviewedAt: Date;
  stayDate: Date | null;
  score: number;
  positiveText: string | null;
  negativeText: string | null;
  fullText: string;
  language: string | null;
  guestName: string | null;
  guestCountry: string | null;
  travelType: string | null;
  stayNights: number | null;
  roomCategory: string | null;
  categoryScores: Array<{ category: string; score: number }>;
  contentHash: string;
  rawPayload: unknown;
};

export type BookingImportResult = {
  reviews: ScrapedBookingReview[];
  pagesFetched: number;
  stoppedReason: string;
};

export type BookingScrapeProgress = {
  page: number;
  collected: number;
  message: string;
};

const MONTHS: Record<string, number> = {
  januar: 0,
  january: 0,
  februar: 1,
  february: 1,
  märz: 2,
  maerz: 2,
  march: 2,
  april: 3,
  mai: 4,
  may: 4,
  juni: 5,
  june: 5,
  juli: 6,
  july: 6,
  august: 7,
  september: 8,
  oktober: 9,
  october: 9,
  november: 10,
  dezember: 11,
  december: 11,
};

const DELAY_BETWEEN_PAGES_MS = 2000;
const DELAY_AFTER_LOAD_MS = 1500;
const MAX_LOAD_RETRIES = 2;
const GOTO_TIMEOUT_MS = 45_000;

function safeText(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

/** Drop exact duplicate lines (Booking often nests the same string in parent + span). */
export function dedupeTextParts(parts: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const t = safeText(p);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** Collapse duplicated paragraphs/lines inside an already-stored blob. */
export function dedupeReviewBlob(text: string | null | undefined): string | null {
  if (text == null) return null;
  const raw = text.replace(/\r\n/g, '\n').trim();
  if (!raw) return null;
  const parts = raw.split(/\n+/).map((l) => safeText(l)).filter(Boolean);
  const unique = dedupeTextParts(parts);
  return unique.length ? unique.join('\n') : null;
}

function buildFullText(
  title: string,
  positive: string | null,
  negative: string | null,
): string {
  return dedupeTextParts([title, positive ?? '', negative ?? ''].filter(Boolean)).join('\n\n') || '—';
}

/** Normalize text for stable hashing (whitespace + lowercase + dedupe lines). */
export function normalizeForId(text: string | null | undefined): string {
  const d = dedupeReviewBlob(text) ?? '';
  return d.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Stable Booking review fingerprint — must NOT change when scrape slightly alters
 * duplicated DOM text. Used as unique externalId.
 */
export function buildReviewExternalId(parts: {
  guestName?: string | null;
  reviewedAt: Date;
  score: number;
  title?: string | null;
  positiveText?: string | null;
  negativeText?: string | null;
}): string {
  const day = parts.reviewedAt.toISOString().slice(0, 10);
  const score = String(Math.round(parts.score));
  const payload = [
    normalizeForId(parts.guestName),
    day,
    score,
    normalizeForId(parts.title).slice(0, 120),
    normalizeForId(parts.positiveText).slice(0, 200),
    normalizeForId(parts.negativeText).slice(0, 200),
  ].join('|');
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

/** Soft key for near-duplicate search (same guest + day + score). */
export function buildReviewSoftKey(parts: {
  guestName?: string | null;
  reviewedAt: Date;
  score: number;
}): string {
  return [
    normalizeForId(parts.guestName),
    parts.reviewedAt.toISOString().slice(0, 10),
    String(Math.round(parts.score)),
  ].join('|');
}

/**
 * Booking individual guest scores are whole numbers 1–10 only.
 * DOM often duplicates the digit ("10"+"10" → "1010", "9"+"9" → "99") or inserts a spurious
 * decimal ("910"/100 → 9.1 from older repair). Always return an integer in 1..10.
 */
export function parseBookingScore(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw.replace(/,/g, '.').trim();

  const digits = s.replace(/[^\d]/g, '');
  // "1010" → 10
  if (digits.length === 4 && digits.slice(0, 2) === digits.slice(2)) {
    const n = parseInt(digits.slice(0, 2), 10);
    if (n >= 1 && n <= 10) return n;
  }
  // "99" → 9
  if (digits.length === 2 && digits[0] === digits[1]) {
    const n = parseInt(digits[0]!, 10);
    if (n >= 1 && n <= 9) return n;
  }
  // "910" / "810" → leading digit (score) + trailing "10" from max scale text
  if (digits.length === 3 && digits.endsWith('10')) {
    const n = parseInt(digits[0]!, 10);
    if (n >= 1 && n <= 9) return n;
  }

  // Prefer whole numbers first (e.g. "9", "10", "9.0")
  for (const m of s.matchAll(/(\d{1,2})(?:\.0+)?(?!\d)/g)) {
    const n = parseInt(m[1]!, 10);
    if (n >= 1 && n <= 10) return n;
  }

  // Last resort: any 1..10 float, then round (Booking never stores .1 guest scores)
  for (const m of s.matchAll(/(\d{1,2}(?:\.\d+)?)/g)) {
    const n = parseFloat(m[1]!);
    if (Number.isFinite(n) && n >= 1 && n <= 10) {
      const rounded = Math.round(n);
      if (rounded >= 1 && rounded <= 10) return rounded;
    }
  }
  return null;
}

/** Fix already-stored bogus scores (e.g. 1010, 9.1 from bad /100 repair). */
export function repairStoredScore(score: number): number | null {
  if (!Number.isFinite(score)) return null;
  if (score >= 1 && score <= 10) {
    const rounded = Math.round(score);
    return rounded >= 1 && rounded <= 10 ? rounded : null;
  }
  return parseBookingScore(String(Math.round(score)));
}

/** Port of Analyzer parse_review_date — DE/EN review date strings. */
function parseReviewedDate(raw: string): Date | null {
  const s = raw
    .replace(/^Reviewed:\s*/i, '')
    .replace(/^Bewertung abgegeben:\s*/i, '')
    .trim();
  if (!s) return null;
  const iso = new Date(s);
  if (!Number.isNaN(iso.getTime()) && /\d{4}/.test(s)) return iso;

  // "9. September 2025" / "26 September 2026"
  const m = s.match(/(\d{1,2})\.?\s+([A-Za-zäöüÄÖÜ]+)\s+(\d{4})/i);
  if (m) {
    const day = parseInt(m[1]!, 10);
    const monthKey = m[2]!.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    const month = MONTHS[monthKey] ?? MONTHS[m[2]!.toLowerCase()];
    const year = parseInt(m[3]!, 10);
    if (month != null && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month, day));
    }
  }
  // "September 2026"
  const m2 = s.match(/^([A-Za-zäöüÄÖÜ]+)\s+(\d{4})$/i);
  if (m2) {
    const monthKey = m2[1]!.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    const month = MONTHS[monthKey] ?? MONTHS[m2[1]!.toLowerCase()];
    const year = parseInt(m2[2]!, 10);
    if (month != null) return new Date(Date.UTC(year, month, 1));
  }
  return null;
}

function parseNights(raw: string): number | null {
  const m = raw.match(/(\d+)\s*(?:Nacht|Nächte|night|nights)/i);
  return m ? parseInt(m[1]!, 10) : null;
}

async function dismissCookies(page: Page) {
  for (const sel of [
    '#onetrust-accept-btn-handler',
    'button:has-text("Accept")',
    'button:has-text("Accept all")',
    'button:has-text("Alle akzeptieren")',
    'button:has-text("Akzeptieren")',
  ]) {
    const btn = page.locator(sel).first();
    if ((await btn.count()) > 0 && (await btn.isVisible().catch(() => false))) {
      await btn.click({ timeout: 5000 }).catch(() => undefined);
      await page.waitForTimeout(500);
      return;
    }
  }
}

/** From Analyzer _click_guest_reviews */
async function clickGuestReviews(page: Page, logger: Logger) {
  await page.waitForTimeout(1500);
  const selectors = [
    "[data-tab='reviews']",
    "a[href*='#tab-reviews']",
    "a[href*='tab-reviews']",
    "a:has-text('Gästebewertungen')",
    "button:has-text('Gästebewertungen')",
    "a:has-text('Guest reviews')",
    "button:has-text('Guest reviews')",
    "a:has-text('Bewertungen')",
    "a:has-text('Reviews')",
    "button:has-text('Reviews')",
  ];
  for (const selector of selectors) {
    try {
      const loc = page.locator(selector).first();
      if ((await loc.count()) === 0) continue;
      await loc.scrollIntoViewIfNeeded({ timeout: 8000 });
      await loc.click({ timeout: 8000 });
      logger.log(`Clicked reviews tab (${selector.slice(0, 50)})`);
      await page.waitForTimeout(DELAY_BETWEEN_PAGES_MS);
      return;
    } catch {
      /* try next */
    }
  }
  logger.warn("Guest reviews tab not found");
}

/** From Analyzer _sort_by_newest */
async function sortByNewest(page: Page, logger: Logger) {
  await page.waitForTimeout(1000);
  const selectors = [
    'select#reviewListSorters',
    "select[data-testid='reviews-sorter-component']",
    "select[name='reviewListSorters']",
    "div[data-testid='reviews-sorter'] select",
    '.review_sort select',
  ];
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      if ((await loc.count()) === 0) continue;
      await loc.scrollIntoViewIfNeeded({ timeout: 6000 });
      try {
        await loc.selectOption({ value: 'NEWEST_FIRST' }, { timeout: 6000 });
      } catch {
        for (const label of ['Newest first', 'Neueste zuerst', 'Most recent', 'Plus récent']) {
          try {
            await loc.selectOption({ label }, { timeout: 3000 });
            break;
          } catch {
            /* next label */
          }
        }
      }
      logger.log('Sort: newest first');
      await page.waitForTimeout(DELAY_BETWEEN_PAGES_MS);
      return;
    } catch {
      /* next selector */
    }
  }
  logger.warn('Sort select not found — continuing unsorted');
}

async function openReviewsSection(page: Page, logger: Logger) {
  await clickGuestReviews(page, logger);
  await sortByNewest(page, logger);
  const section = page
    .locator(
      "[data-testid='review-container'], [data-testid='review-stay-info'], .review_list, #review_list_page_container, [data-testid='review-card']",
    )
    .first();
  await section.waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
  await section.scrollIntoViewIfNeeded({ timeout: 15000 }).catch(() => undefined);
}

/**
 * From Analyzer _parse_review_from_card — field extraction via data-testid.
 * Card root: [data-testid=review-card] or parent of aria-label Bewertung/Review card.
 */
async function parseReviewFromCard(card: Locator): Promise<ScrapedBookingReview | null> {
  try {
    // Prefer the first aria-hidden digit node (Analyzer) — avoids "1010" from duplicated text
    let score: number | null = null;
    const scoreHidden = card.locator("[data-testid='review-score'] div[aria-hidden='true']").first();
    if ((await scoreHidden.count()) > 0) {
      score = parseBookingScore(await scoreHidden.textContent());
    }
    if (score == null) {
      const scoreEl = card.locator("[data-testid='review-score']").first();
      if ((await scoreEl.count()) > 0) {
        score = parseBookingScore(await scoreEl.textContent());
      }
    }
    if (score == null) return null;

    let guestName: string | null = null;
    const authorEl = card
      .locator(
        "[data-testid='review-avatar'] .aa225776f2 > div:first-child, [data-testid='review-avatar'] div.aa225776f2 > div",
      )
      .first();
    if ((await authorEl.count()) > 0) {
      guestName = safeText(await authorEl.textContent()) || null;
    }

    let guestCountry: string | null = null;
    const imgCountry = card.locator("[data-testid='review-avatar'] img[alt]").first();
    if ((await imgCountry.count()) > 0) {
      guestCountry = safeText(await imgCountry.getAttribute('alt')) || null;
    }
    if (!guestCountry) {
      const spanCountry = card.locator("[data-testid='review-avatar'] .fff1944c52 span").first();
      if ((await spanCountry.count()) > 0) {
        guestCountry = safeText(await spanCountry.textContent()) || null;
      }
    }
    // Fallback: avatar block "Name Country"
    if (!guestName || !guestCountry) {
      const avatar = safeText(
        await card.locator("[data-testid='review-avatar']").first().textContent().catch(() => ''),
      );
      if (avatar && !guestName) {
        const parts = avatar.split(/\s+/);
        if (parts.length >= 2) {
          guestCountry = guestCountry ?? parts[parts.length - 1]!;
          guestName = parts.slice(0, -1).join(' ');
        } else {
          guestName = avatar;
        }
      }
    }

    const dateEl = card.locator("[data-testid='review-date']").first();
    const reviewDateRaw =
      (await dateEl.count()) > 0
        ? safeText(await dateEl.textContent()) ||
          (await dateEl.getAttribute('datetime')) ||
          ''
        : '';
    const reviewedAt = parseReviewedDate(reviewDateRaw) ?? new Date();

    const title = safeText(
      await card.locator("[data-testid='review-title']").first().textContent().catch(() => ''),
    );

    async function collectTexts(containerTestId: string): Promise<string | null> {
      // Prefer inner spans only — matching parent+span duplicates the same text.
      const spans = card.locator(`[data-testid='${containerTestId}'] span`);
      const spanCount = await spans.count();
      const parts: string[] = [];
      if (spanCount > 0) {
        for (let i = 0; i < spanCount; i++) {
          const t = safeText(await spans.nth(i).textContent());
          if (t) parts.push(t);
        }
      } else {
        const t = safeText(
          await card.locator(`[data-testid='${containerTestId}']`).first().textContent().catch(() => ''),
        );
        if (t) parts.push(t);
      }
      const unique = dedupeTextParts(parts);
      return unique.length ? unique.join('\n') : null;
    }

    const positiveText = await collectTexts('review-positive-text');
    const negativeText = await collectTexts('review-negative-text');
    const fullText = buildFullText(title, positiveText, negativeText);

    const roomCategory = safeText(
      await card.locator("[data-testid='review-room-name']").first().textContent().catch(() => ''),
    ) || null;
    const nightsRaw = safeText(
      await card.locator("[data-testid='review-num-nights']").first().textContent().catch(() => ''),
    );
    const stayRaw = safeText(
      await card.locator("[data-testid='review-stay-date']").first().textContent().catch(() => ''),
    );
    const travelType = safeText(
      await card
        .locator("[data-testid='review-traveler-type']")
        .first()
        .textContent()
        .catch(() => ''),
    ) || null;

    // Analyzer-style stable id (normalized) — survives text-dedupe / score-repair rescapes
    const externalId = buildReviewExternalId({
      guestName,
      reviewedAt,
      score,
      title,
      positiveText,
      negativeText,
    });

    const contentHash = hashReviewContent({
      score,
      positiveText,
      negativeText,
      fullText,
      reviewedAt: reviewedAt.toISOString().slice(0, 10),
    });

    return {
      externalId,
      reviewedAt,
      stayDate: parseReviewedDate(stayRaw),
      score,
      positiveText,
      negativeText,
      fullText,
      language: null,
      guestName,
      guestCountry,
      travelType,
      stayNights: parseNights(nightsRaw),
      roomCategory,
      categoryScores: [],
      contentHash,
      rawPayload: {
        reviewDateRaw,
        title,
        stayRaw,
        nightsRaw,
      },
    };
  } catch {
    return null;
  }
}

/** From Analyzer _extract_reviews_on_page */
async function extractReviewsOnPage(page: Page): Promise<ScrapedBookingReview[]> {
  const reviews: ScrapedBookingReview[] = [];
  let cards = page.locator("[data-testid='review-card']");
  let n = await cards.count();
  if (n === 0) {
    const anchors = page.locator(
      "div[role='group'][aria-label='Bewertung'], div[role='group'][aria-label='Review card']",
    );
    n = await anchors.count();
    for (let i = 0; i < n; i++) {
      const card = anchors.nth(i).locator('xpath=..');
      const rev = await parseReviewFromCard(card);
      if (rev) reviews.push(rev);
    }
    return reviews;
  }
  for (let i = 0; i < n; i++) {
    const rev = await parseReviewFromCard(cards.nth(i));
    if (rev) reviews.push(rev);
  }
  return reviews;
}

/**
 * From Analyzer _click_next_page_number —
 * pagination via ol.a81722b979 button[aria-current=page] → next number.
 */
async function clickNextPageNumber(page: Page): Promise<boolean> {
  try {
    const currentBtn = page.locator("ol.a81722b979 button[aria-current='page']").first();
    if ((await currentBtn.count()) === 0) {
      // Fallback: Next page button
      const next = page.locator("button[aria-label='Next page'], button[aria-label='Nächste Seite']").last();
      if ((await next.count()) === 0) return false;
      const disabled =
        (await next.getAttribute('disabled')) != null ||
        (await next.getAttribute('aria-disabled')) === 'true';
      if (disabled) return false;
      await next.scrollIntoViewIfNeeded({ timeout: 5000 });
      await next.click({ timeout: 5000 });
      await page.waitForTimeout(DELAY_BETWEEN_PAGES_MS);
      return true;
    }
    await currentBtn.scrollIntoViewIfNeeded({ timeout: 5000 });
    const label = (await currentBtn.getAttribute('aria-label'))?.trim() ?? '';
    const currentNum = parseInt(label, 10);
    if (!Number.isFinite(currentNum)) return false;
    const nextNum = currentNum + 1;
    // Analyzer uses aria-label with leading space: " {n}"
    let nextBtn = page.locator(`ol.a81722b979 button[aria-label=' ${nextNum}']`).first();
    if ((await nextBtn.count()) === 0) {
      nextBtn = page.locator(`ol.a81722b979 button[aria-label='${nextNum}']`).first();
    }
    if ((await nextBtn.count()) === 0) return false;
    await nextBtn.scrollIntoViewIfNeeded({ timeout: 5000 });
    await nextBtn.click({ timeout: 5000 });
    await page.waitForTimeout(DELAY_BETWEEN_PAGES_MS);
    return true;
  } catch {
    return false;
  }
}

export async function scrapeBookingReviews(opts: {
  url?: string;
  cutoffDate: Date;
  maxPages?: number;
  headless?: boolean;
  incrementalStopIds?: Set<string>;
  onProgress?: (p: BookingScrapeProgress) => void | Promise<void>;
}): Promise<BookingImportResult> {
  const logger = new Logger('BookingImporter');
  const progress = async (message: string, page = 0, collected = 0) => {
    logger.log(message);
    await opts.onProgress?.({ page, collected, message });
  };

  let hotelUrl = (opts.url?.trim() || DEFAULT_BOOKING_URL)
    .replace(/\.en-gb\.html/i, '.de.html')
    .replace(/\.en\.html/i, '.de.html');
  if (!hotelUrl.includes('tab-reviews')) {
    hotelUrl = hotelUrl.includes('#') ? hotelUrl : `${hotelUrl}#tab-reviews`;
  }
  const maxPages = opts.maxPages ?? 200;
  const headless = opts.headless !== false;

  await progress(`opening Booking: ${hotelUrl.slice(0, 80)}…`);

  return withPlaywrightMutex(
    async () => {
      await progress('Playwright lock acquired — launching Chromium…');
      let browser;
      try {
        browser = await chromium.launch({ headless });
      } catch (e) {
        const msg = (e as Error).message;
        await progress(
          `Chromium launch failed: ${msg}. On server run: cd apps/api && npx playwright install chromium`,
        );
        throw e;
      }
      const context = await browser.newContext({
        locale: 'de-DE',
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      });
      const page = await context.newPage();
      const collected = new Map<string, ScrapedBookingReview>();
      let pagesFetched = 0;
      let stoppedReason = 'completed';

      try {
        let loaded = false;
        let lastError = '';
        for (let attempt = 0; attempt <= MAX_LOAD_RETRIES && !loaded; attempt++) {
          try {
            await progress(`loading hotel page (attempt ${attempt + 1}/${MAX_LOAD_RETRIES + 1})…`);
            await page.goto(hotelUrl, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT_MS });
            await page.waitForTimeout(DELAY_AFTER_LOAD_MS);
            await progress(`page loaded: ${page.url().slice(0, 90)} — cookies/reviews tab…`);
            await dismissCookies(page);
            if (!page.url().includes('booking.com')) {
              throw new Error(`Unexpected redirect: ${page.url()}`);
            }
            await openReviewsSection(page, logger);
            await progress('reviews section opened — waiting for cards…');
            await page
              .waitForSelector("[data-testid='review-card']", { timeout: 20_000 })
              .catch(() => undefined);
            const n = await page.locator("[data-testid='review-card']").count();
            await progress(`found ${n} review cards on first view`);
            if (n === 0) {
              throw new Error('No review-card elements found (blocked or layout change?)');
            }
            loaded = true;
          } catch (e) {
            lastError = (e as Error).message;
            logger.warn(`Load attempt ${attempt + 1} failed: ${lastError}`);
            await progress(`load failed (${attempt + 1}): ${lastError}`);
            await page.waitForTimeout(3000);
          }
        }
        if (!loaded) {
          return {
            reviews: [],
            pagesFetched: 0,
            stoppedReason: `load_failed: ${lastError}`,
          };
        }

        for (let pageIdx = 0; pageIdx < maxPages; pageIdx++) {
          pagesFetched++;
          const pageReviews = await extractReviewsOnPage(page);
          let newOnPage = 0;
          for (const r of pageReviews) {
            if (!collected.has(r.externalId)) {
              collected.set(r.externalId, r);
              newOnPage++;
            }
          }
          const msg = `page ${pagesFetched}: +${newOnPage} new / ${pageReviews.length} on page (total ${collected.size})`;
          await progress(msg, pagesFetched, collected.size);

          const list = [...collected.values()].sort(
            (a, b) => b.reviewedAt.getTime() - a.reviewedAt.getTime(),
          );
          if (list.length) {
            const oldest = list[list.length - 1]!;
            if (oldest.reviewedAt < opts.cutoffDate) {
              stoppedReason = 'reached_cutoff';
              break;
            }
            if (opts.incrementalStopIds?.size && pageIdx > 0) {
              const known = list.filter((r) => opts.incrementalStopIds!.has(r.externalId)).length;
              if (known >= Math.min(8, list.length) && newOnPage === 0) {
                stoppedReason = 'incremental_overlap';
                break;
              }
            }
          }

          if (pageReviews.length === 0 && pageIdx === 0) {
            stoppedReason = 'no_cards';
            break;
          }

          const moved = await clickNextPageNumber(page);
          if (!moved) {
            stoppedReason = 'no_more_pages';
            break;
          }
          await page.waitForTimeout(1000);
        }

        const reviews = [...collected.values()].filter((r) => r.reviewedAt >= opts.cutoffDate);
        await progress(
          `done: ${reviews.length} in window / ${collected.size} total (${pagesFetched} pages, ${stoppedReason})`,
          pagesFetched,
          collected.size,
        );
        return { reviews, pagesFetched, stoppedReason };
      } finally {
        await context.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
      }
    },
    (msg) => progress(msg),
  );
}
