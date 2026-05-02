import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from 'playwright';
import {
  emmaIsOnLoginScreen,
  emmaLaunchpadUrl,
  emmaLogin,
  type EmmaLoginOpts,
} from './emma-scraper';

export type EmmaSessionHelpers = {
  page: Page;
  /**
   * Navigate the existing page to the given URL and re-run the EMMA login
   * flow if the persistent session has expired. Subsequent calls within the
   * same browser context reuse the session cookies, so a real login only
   * happens once per process lifetime (or until invalidated).
   */
  gotoLoggedIn: (url: string) => Promise<void>;
};

/**
 * Shared Chromium session for EMMA. Mirrors the architecture used by the
 * Puzzel scraper: a single persistent browser + context kept alive across
 * requests so the SAP cookies survive between tasks. Tasks are serialised via
 * a promise queue to avoid concurrent navigation in the same context.
 */
@Injectable()
export class EmmaBrowserSessionService implements OnModuleDestroy {
  private readonly log = new Logger(EmmaBrowserSessionService.name);
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private headless = true;
  private queue: Promise<void> = Promise.resolve();

  async run<T>(
    opts: EmmaLoginOpts,
    fn: (helpers: EmmaSessionHelpers) => Promise<T>,
    runOpts: { headless?: boolean } = {},
  ): Promise<T> {
    const work = this.queue.then(async () => {
      const ctx = await this.ensureContext(runOpts.headless ?? true);
      const page = await ctx.newPage();
      try {
        const gotoLoggedIn = (url: string) =>
          this.gotoLoggedIn(page, url, opts);
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

  private async ensureContext(desiredHeadless: boolean): Promise<BrowserContext> {
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
        viewport: { width: 1440, height: 900 },
      });
    }
    return this.context;
  }

  private async gotoLoggedIn(page: Page, url: string, opts: EmmaLoginOpts) {
    opts.progress?.(`[EMMA] Öffne (Session-Reuse): ${url}`);
    await page.goto(url, { timeout: 120_000, waitUntil: 'domcontentloaded' });

    if (await emmaIsOnLoginScreen(page)) {
      opts.progress?.(
        '[EMMA] Session abgelaufen oder erstmaliger Login — neu authentifizieren',
      );
      await emmaLogin(page, opts);
      if (await emmaIsOnLoginScreen(page)) {
        // Some redirects deliver us back to the launchpad URL but stop on a
        // residual prompt; one more pass usually clears it.
        await emmaLogin(page, opts);
      }
      const target = new URL(url);
      const here = new URL(page.url());
      if (here.host !== target.host || here.pathname !== target.pathname) {
        await page.goto(url, {
          timeout: 120_000,
          waitUntil: 'domcontentloaded',
        });
      }
      opts.progress?.(`[EMMA] Login abgeschlossen: ${page.url()}`);
    } else {
      opts.progress?.(`[EMMA] Bestehende Session genutzt: ${page.url()}`);
    }
  }

  /** Convenience: open the EMMA Fiori launchpad logged in. */
  async openLaunchpad<T>(
    opts: EmmaLoginOpts,
    fn: (helpers: EmmaSessionHelpers) => Promise<T>,
  ): Promise<T> {
    return this.run(opts, async (helpers) => {
      await helpers.gotoLoggedIn(emmaLaunchpadUrl(opts));
      return fn(helpers);
    });
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
