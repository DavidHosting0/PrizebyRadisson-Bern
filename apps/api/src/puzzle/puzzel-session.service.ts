import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { tryPuzzelLogin, type PuzzelScrapeOpts } from './puzzel-scraper';

const LOGIN_URL_PATTERNS = [
  /\/Account\/Login/i,
  /\/adfs\/ls/i,
  /\/connect\/authorize/i,
];

const LOGIN_FIELD_SELECTOR = '#Input_Username, #userNameInput, #Input_Password, #passwordInput';

export type PuzzelSessionHelpers = {
  page: Page;
  /**
   * Navigate the existing page to the given URL and re-run the Puzzel login
   * flow if the session has expired. Subsequent calls within the same browser
   * context reuse the session cookies, so a real login only happens once.
   */
  gotoLoggedIn: (url: string) => Promise<void>;
};

/**
 * Singleton-style Puzzel browser session. Keeps a single Chromium browser and
 * BrowserContext alive across requests so cookies persist between calls.
 *
 * Tasks are serialized via a promise queue to avoid concurrent navigation in
 * the same context. The browser is recreated automatically if it crashes or
 * gets closed.
 */
@Injectable()
export class PuzzelBrowserSessionService implements OnModuleDestroy {
  private readonly log = new Logger(PuzzelBrowserSessionService.name);
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private headless = true;
  private queue: Promise<void> = Promise.resolve();

  async run<T>(
    opts: PuzzelScrapeOpts,
    fn: (helpers: PuzzelSessionHelpers) => Promise<T>,
  ): Promise<T> {
    const work = this.queue.then(async () => {
      const ctx = await this.ensureContext(opts);
      const page = await ctx.newPage();
      try {
        const gotoLoggedIn = (url: string) => this.gotoLoggedIn(page, url, opts);
        return await fn({ page, gotoLoggedIn });
      } finally {
        await page.close().catch(() => {});
      }
    });
    this.queue = work.then(
      () => undefined,
      () => undefined,
    );
    return work as Promise<T>;
  }

  /** Drop the persistent context, forcing a fresh login on the next operation. */
  async invalidateSession() {
    await this.cleanup();
  }

  async onModuleDestroy() {
    await this.cleanup();
  }

  private async ensureContext(opts: PuzzelScrapeOpts): Promise<BrowserContext> {
    const desiredHeadless = opts.headless ?? true;
    if (this.browser && this.headless !== desiredHeadless) {
      await this.cleanup();
    }
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await chromium.launch({ headless: desiredHeadless });
      this.context = null;
      this.headless = desiredHeadless;
      this.browser.on('disconnected', () => {
        this.browser = null;
        this.context = null;
      });
    }
    if (!this.context) {
      this.context = await this.browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
        locale: 'de-CH',
      });
    }
    return this.context;
  }

  private async gotoLoggedIn(page: Page, url: string, opts: PuzzelScrapeOpts) {
    opts.progress?.(`[Puzzel] Öffne Puzzel-Seite (Session reuse): ${url}`);
    await page.goto(url, { timeout: 120_000, waitUntil: 'domcontentloaded' });

    if (await this.isOnLoginScreen(page)) {
      opts.progress?.('[Puzzel] Session abgelaufen oder erstmaliger Login — neu authentifizieren');
      await tryPuzzelLogin(page, opts);
      if (await this.isOnLoginScreen(page)) {
        await tryPuzzelLogin(page, opts);
      }
      if (!page.url().includes(new URL(url).pathname)) {
        await page.goto(url, { timeout: 120_000, waitUntil: 'domcontentloaded' });
      }
      opts.progress?.(`[Puzzel] Login abgeschlossen, Zielseite: ${page.url()}`);
    } else {
      opts.progress?.(`[Puzzel] Bestehende Session genutzt: ${page.url()}`);
    }
  }

  private async isOnLoginScreen(page: Page): Promise<boolean> {
    const url = page.url();
    if (LOGIN_URL_PATTERNS.some((re) => re.test(url))) return true;
    return (await page.locator(LOGIN_FIELD_SELECTOR).count()) > 0;
  }

  private async cleanup() {
    try {
      await this.context?.close();
    } catch {
      /* ignore */
    }
    this.context = null;
    try {
      await this.browser?.close();
    } catch {
      /* ignore */
    }
    this.browser = null;
  }
}
