import { Logger } from '@nestjs/common';
import { chromium, type Page, type Response } from 'playwright';
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

function parseDateLoose(raw: unknown): Date | null {
  if (!raw) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const ms = raw > 1e12 ? raw : raw * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw !== 'string') return null;
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d;
  const m = raw.match(/(\d{1,2})\s+([A-Za-zäöüÄÖÜ]+)\s+(\d{4})/);
  if (m) {
    const d2 = new Date(`${m[2]} ${m[1]}, ${m[3]}`);
    return Number.isNaN(d2.getTime()) ? null : d2;
  }
  return null;
}

function asNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function mapReviewCard(raw: Record<string, unknown>): ScrapedBookingReview | null {
  const externalId = String(
    raw.review_id ?? raw.reviewId ?? raw.reviewUrlId ?? raw.id ?? '',
  ).trim();
  const score =
    asNum(raw.average_score ?? raw.averageScore ?? raw.review_score ?? raw.score) ?? null;
  if (!externalId || score == null) return null;

  const positiveText =
    (typeof raw.pros === 'string' && raw.pros) ||
    (typeof raw.positive_text === 'string' && raw.positive_text) ||
    null;
  const negativeText =
    (typeof raw.cons === 'string' && raw.cons) ||
    (typeof raw.negative_text === 'string' && raw.negative_text) ||
    null;
  const title = typeof raw.title === 'string' ? raw.title : '';
  const fullText = [title, positiveText, negativeText].filter(Boolean).join('\n\n').trim() || title || '—';

  const reviewedAt =
    parseDateLoose(raw.date ?? raw.reviewed_date ?? raw.completed_date ?? raw.review_date) ??
    new Date();
  const stayDate = parseDateLoose(raw.stay_date ?? raw.checkout_date ?? raw.checkin_date);

  const author = (raw.author ?? raw.guest ?? raw.reviewer) as Record<string, unknown> | undefined;
  const guestName =
    (typeof raw.author_name === 'string' && raw.author_name) ||
    (author && typeof author.name === 'string' && author.name) ||
    null;
  const guestCountry =
    (typeof raw.author_country_code === 'string' && raw.author_country_code) ||
    (typeof raw.countrycode === 'string' && raw.countrycode) ||
    (author && typeof author.country_code === 'string' && author.country_code) ||
    null;
  const travelType =
    (typeof raw.travel_purpose === 'string' && raw.travel_purpose) ||
    (typeof raw.traveller_type === 'string' && raw.traveller_type) ||
    null;
  const stayNights = asNum(raw.num_nights ?? raw.nights ?? raw.stay_length);
  const roomCategory =
    (typeof raw.room_name === 'string' && raw.room_name) ||
    (typeof raw.roomtype_name === 'string' && raw.roomtype_name) ||
    null;

  const categoryScores: Array<{ category: string; score: number }> = [];
  const cats = raw.review_og_info ?? raw.scoring ?? raw.category_scores;
  if (cats && typeof cats === 'object') {
    for (const [k, v] of Object.entries(cats as Record<string, unknown>)) {
      const s = asNum(v);
      if (s != null) categoryScores.push({ category: k, score: s });
    }
  }

  const contentHash = hashReviewContent({
    score,
    positiveText,
    negativeText,
    fullText,
    reviewedAt: reviewedAt.toISOString(),
  });

  return {
    externalId,
    reviewedAt,
    stayDate,
    score,
    positiveText,
    negativeText,
    fullText,
    language: typeof raw.language_code === 'string' ? raw.language_code : null,
    guestName,
    guestCountry,
    travelType,
    stayNights: stayNights != null ? Math.round(stayNights) : null,
    roomCategory,
    categoryScores,
    contentHash,
    rawPayload: raw,
  };
}

function extractReviewsFromJson(payload: unknown): ScrapedBookingReview[] {
  const out: ScrapedBookingReview[] = [];
  const walk = (node: unknown) => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (typeof node !== 'object') return;
    const o = node as Record<string, unknown>;
    if (
      o.review_id != null ||
      o.reviewId != null ||
      (o.average_score != null && (o.pros != null || o.cons != null || o.title != null))
    ) {
      const mapped = mapReviewCard(o);
      if (mapped) out.push(mapped);
    }
    for (const v of Object.values(o)) {
      if (v && typeof v === 'object') walk(v);
    }
  };
  walk(payload);
  return out;
}

async function scrapeDomFallback(page: Page): Promise<ScrapedBookingReview[]> {
  return page.evaluate(() => {
    const cards = Array.from(
      document.querySelectorAll('[data-testid="review-card"], .review_list_new_item_block, .c-review-block'),
    );
    const results: Array<Record<string, unknown>> = [];
    for (const card of cards) {
      const text = card.textContent?.trim() ?? '';
      const scoreEl =
        card.querySelector('[aria-label*="Scored"], .bui-review-score__badge, .review-score-badge') ??
        null;
      const scoreText = scoreEl?.textContent?.replace(',', '.') ?? '';
      const score = parseFloat(scoreText);
      if (!Number.isFinite(score)) continue;
      const id =
        card.getAttribute('data-review-url') ||
        card.getAttribute('data-review-id') ||
        `${score}-${text.slice(0, 40)}`;
      results.push({
        review_id: id,
        average_score: score,
        title: text.slice(0, 200),
        pros: text,
        date: new Date().toISOString(),
      });
    }
    return results;
  }).then((rows) =>
    rows
      .map((r) => mapReviewCard(r as Record<string, unknown>))
      .filter((x): x is ScrapedBookingReview => !!x),
  );
}

export async function scrapeBookingReviews(opts: {
  url?: string;
  cutoffDate: Date;
  maxPages?: number;
  headless?: boolean;
  incrementalStopIds?: Set<string>;
}): Promise<BookingImportResult> {
  const logger = new Logger('BookingImporter');
  const url = opts.url?.trim() || DEFAULT_BOOKING_URL;
  const maxPages = opts.maxPages ?? 200;
  const headless = opts.headless !== false;

  return withPlaywrightMutex(async () => {
    const browser = await chromium.launch({ headless });
    const context = await browser.newContext({
      locale: 'en-GB',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    const collected = new Map<string, ScrapedBookingReview>();
    let pagesFetched = 0;
    let stoppedReason = 'completed';

    const onResponse = async (res: Response) => {
      try {
        const u = res.url();
        if (!/reviewlist|review.*json|dml\/review/i.test(u)) return;
        const ct = res.headers()['content-type'] ?? '';
        if (!ct.includes('json') && !ct.includes('javascript')) return;
        const json = await res.json().catch(() => null);
        if (!json) return;
        for (const r of extractReviewsFromJson(json)) {
          collected.set(r.externalId, r);
        }
      } catch {
        /* ignore parse errors */
      }
    };
    page.on('response', onResponse);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
      await page.waitForTimeout(2500);

      // Accept cookie banners if present
      for (const sel of ['#onetrust-accept-btn-handler', 'button:has-text("Accept")', 'button:has-text("Akzeptieren")']) {
        const btn = page.locator(sel).first();
        if (await btn.isVisible().catch(() => false)) {
          await btn.click().catch(() => undefined);
          break;
        }
      }

      // Try opening reviews tab
      for (const sel of ['a[href*="tab-reviews"]', 'button:has-text("Guest reviews")', 'a:has-text("Gästebewertungen")']) {
        const el = page.locator(sel).first();
        if (await el.isVisible().catch(() => false)) {
          await el.click().catch(() => undefined);
          await page.waitForTimeout(1500);
          break;
        }
      }

      for (let pageIdx = 0; pageIdx < maxPages; pageIdx++) {
        pagesFetched++;
        await page.waitForTimeout(1200 + Math.floor(Math.random() * 800));

        const domOnes = await scrapeDomFallback(page);
        for (const r of domOnes) collected.set(r.externalId, r);

        const list = [...collected.values()].sort(
          (a, b) => b.reviewedAt.getTime() - a.reviewedAt.getTime(),
        );
        if (list.length) {
          const oldest = list[list.length - 1]!;
          if (oldest.reviewedAt < opts.cutoffDate) {
            stoppedReason = 'reached_cutoff';
            break;
          }
          if (opts.incrementalStopIds?.size) {
            const known = list.filter((r) => opts.incrementalStopIds!.has(r.externalId)).length;
            if (known >= Math.min(10, list.length) && pageIdx > 0) {
              stoppedReason = 'incremental_overlap';
              break;
            }
          }
        }

        const next = page
          .locator(
            'a[aria-label*="Next"], button[aria-label*="Next"], a:has-text("Next page"), button:has-text("Weiter")',
          )
          .first();
        if (!(await next.isVisible().catch(() => false))) {
          stoppedReason = 'no_more_pages';
          break;
        }
        await next.click().catch(async () => {
          stoppedReason = 'next_click_failed';
        });
        if (stoppedReason === 'next_click_failed') break;
      }

      const reviews = [...collected.values()].filter((r) => r.reviewedAt >= opts.cutoffDate);
      logger.log(`Booking scrape: ${reviews.length} reviews in window (${pagesFetched} pages, ${stoppedReason})`);
      return { reviews, pagesFetched, stoppedReason };
    } finally {
      page.off('response', onResponse);
      await context.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
    }
  });
}
