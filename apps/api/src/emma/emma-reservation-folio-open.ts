import type { Page } from 'playwright';
import {
  EMMA_SHELL_RESERVATION_SEARCHBOX_NAME,
  emmaSearchReservationDateFiltersWithTicketFallback,
} from './emma-reservation-search';

export type EmmaReservationFolioOpenParams = {
  /**
   * Value for the shell search field “Reservation, Room, Guest, Client, RR number”
   * (e.g. OTA confirmation, not necessarily the PMS id).
   */
  shellSearch: string;
  /**
   * PMS reservation id as shown in the results grid (e.g. `161707119`). Used to pick
   * the row; leading zeros may differ from the hash route.
   */
  gridReservationId: string;
  checkInDate?: string | null;
  checkOutDate?: string | null;
};

/** Stable step ids for UI progress (German copy is chosen on the client). */
export type EmmaOpenFolioProgressStep =
  | 'session_launch'
  | 'session_login'
  | 'session_ready'
  | 'search_tile'
  | 'filters_restore'
  | 'fill_shell_search'
  | 'fill_date_filters'
  | 'search_go'
  | 'open_reservation_row'
  | 'open_folio_management';

export type EmmaOpenFolioProgressEvent = {
  step: EmmaOpenFolioProgressStep;
  /** Short technical / log line (often German server logs). */
  message: string;
};

export type EmmaOpenFolioOnStep = (event: EmmaOpenFolioProgressEvent) => void;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Launchpad tiles live on Fiori home (`#Shell-home`); other hashes hide them. */
async function ensureEmmaHomeForTiles(page: Page) {
  const u = page.url();
  if (!/emma\.rhg\.radissonhotels\.com/i.test(u)) {
    throw new Error(`EMMA Launchpad erwartet, aktuelle URL: ${u}`);
  }
  const parsed = new URL(u);
  if (!/#Shell-home/i.test(parsed.hash)) {
    parsed.hash = 'Shell-home';
    await page.goto(parsed.toString(), {
      timeout: 90_000,
      waitUntil: 'domcontentloaded',
    });
    await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => undefined);
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Match EMMA grid display with or without leading zeros. */
function reservationIdMatcher(gridReservationId: string): RegExp {
  const digits = gridReservationId.replace(/\D/g, '');
  const trimmed = digits.replace(/^0+/, '') || '0';
  return new RegExp(`\\b0*${escapeRegExp(trimmed)}\\b`);
}

/**
 * From an authenticated Fiori **Home** launchpad: open **Search Reservations**, run
 * a proper search (shell box + date filters + **Go**), open the reservation from the
 * grid via a **double-click** on the reservation column cell, then click **Folio
 * Management** on the object header.
 *
 * Uses UI navigation only (no `ReservationDetail` hash URLs).
 */
export async function runEmmaSearchReservationAndOpenFolio(
  page: Page,
  params: EmmaReservationFolioOpenParams,
  onStep?: EmmaOpenFolioOnStep,
): Promise<{ url: string; title: string }> {
  const emit = (step: EmmaOpenFolioProgressStep, message: string) =>
    onStep?.({ step, message });

  emit('search_tile', 'Search Reservations öffnen …');
  await page.waitForLoadState('domcontentloaded');
  await ensureEmmaHomeForTiles(page);

  const searchTile = page
    .getByRole('link', { name: /Search[\s\u00ad]*Reser[\u00ad\s]*vations?/i })
    .first();
  try {
    await searchTile.waitFor({ state: 'visible', timeout: 30_000 });
    await searchTile.scrollIntoViewIfNeeded().catch(() => undefined);
    await searchTile.click({ timeout: 60_000 });
  } catch {
    await ensureEmmaHomeForTiles(page);
    await searchTile.scrollIntoViewIfNeeded().catch(() => undefined);
    await searchTile.click({ timeout: 60_000 });
  }

  const shell = page.getByRole('searchbox', {
    name: EMMA_SHELL_RESERVATION_SEARCHBOX_NAME,
  });
  await shell.waitFor({ state: 'visible', timeout: 90_000 });

  const restore = page.getByRole('button', { name: 'Restore' });
  if (await restore.isVisible().catch(() => false)) {
    emit('filters_restore', 'Filter mit Restore zurücksetzen …');
    await restore.click();
    await sleep(400);
  }

  const filters = emmaSearchReservationDateFiltersWithTicketFallback(
    params.checkInDate,
    params.checkOutDate,
    new Date(),
  );

  emit('fill_shell_search', `Shell-Suche: ${params.shellSearch}`);
  await shell.click();
  await shell.fill('');
  await shell.fill(params.shellSearch);

  emit('fill_date_filters', `Anreise / Abreise: ${filters.arrivalRange} · ${filters.departureRange}`);
  await page.getByRole('textbox', { name: 'Arrival Date' }).fill(filters.arrivalRange);
  await page.getByRole('textbox', { name: 'Departure Date' }).fill(filters.departureRange);

  emit('search_go', 'Go — Ergebnisse laden …');
  await page.getByRole('button', { name: 'Go' }).click();
  await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => undefined);
  await sleep(800);

  const idRe = reservationIdMatcher(params.gridReservationId);
  let cell = page
    .locator('td.sapUiTableCell[id*="reservationList.table-rows-"][id$="-col1"]')
    .filter({ hasText: idRe })
    .first();

  if (!(await cell.isVisible().catch(() => false))) {
    cell = page
      .locator('td.sapUiTableCell[id*="reservationList.table-rows-"]')
      .filter({ hasText: idRe })
      .first();
  }

  await cell.waitFor({ state: 'visible', timeout: 90_000 });
  emit('open_reservation_row', `Reservation ${params.gridReservationId} — Doppelklick …`);
  await cell.dblclick({
    position: { x: 150, y: 14 },
    timeout: 60_000,
  });

  await page.waitForURL(/\/ReservationDetail\/Reservations\(/, { timeout: 90_000 });

  emit('open_folio_management', 'Folio Management öffnen …');
  const folio = page.getByRole('button', { name: 'Folio Management' });
  await folio.waitFor({ state: 'visible', timeout: 60_000 });
  await folio.click();

  await page.waitForURL(/zey_tms_reservations_folio-display/, { timeout: 90_000 });
  await page.waitForFunction(
    () => document.title.toLowerCase().includes('folio'),
    { timeout: 30_000 },
  );

  return { url: page.url(), title: await page.title() };
}
