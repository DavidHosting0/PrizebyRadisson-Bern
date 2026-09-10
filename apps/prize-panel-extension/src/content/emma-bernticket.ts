/**
 * Injects BernTicket into EMMA check-in / reservation footers.
 * Falls back to a fixed bottom strip when the SAP toolbar is missing.
 */
import {
  BERN_TICKET_2FA_REQUIRED,
  BtApiError,
  btCreateTicket,
  btComplete2fa,
  btSearchTickets,
  getActivationCode,
  getBtTokens,
  pickTicketForBooking,
  toDateInputValue,
} from '../lib/bernticket-api';

const HOST_ID = 'prize-bt-checkin-host';
const STYLE_ID = 'prize-bt-checkin-style';
const FALLBACK_ID = 'prize-bt-fallback-bar';

function isLikelyEmmaPage(): boolean {
  if (/ReservationId=/i.test(window.location.hash)) return true;
  if (document.querySelector('.sapUiBody, .sapMShell, [data-sap-ui-area]')) return true;
  return /emma|radisson|sapui5|fiori/i.test(window.location.hostname + window.location.href);
}

function getBookingNumber(): string | null {
  const hash = window.location.hash || '';
  const patterns = [
    /ReservationId='(\d+)'/i,
    /ReservationId=(\d+)/i,
    /reservationId[=:]['"]?(\d+)/i,
  ];
  for (const re of patterns) {
    const m = hash.match(re);
    if (m) return m[1].replace(/^0+/, '');
  }

  for (const a of document.querySelectorAll('a.sapMLnk, span.sapMText, span.sapMObjStatusText, .sapMTitle')) {
    const t = (a.textContent || '').trim();
    if (/^\d{6,}$/.test(t)) return t.replace(/^0+/, '');
  }

  // Object header / title often contains the id
  const title = document.querySelector('.sapUxAPObjectPageHeaderContent .sapMTitle, .sapFDynamicPageTitleMain .sapMTitle');
  const tm = (title?.textContent || '').match(/\b(\d{6,})\b/);
  if (tm) return tm[1].replace(/^0+/, '');

  return null;
}

function findCheckinToolbar(): HTMLElement | null {
  const selectors = [
    '[id$="tms.checkinToolbar"]',
    '[id*="tms.checkinToolbar"]',
    '[id*="CheckInDetail"][id*="Toolbar"]',
    '[id*="checkinToolbar"]',
    '.sapUxAPObjectPageFloatingFooter.sapMTB',
    '.sapUxAPObjectPageFloatingFooter',
    '.sapFDynamicPageFooter .sapMTB',
  ];
  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) return el;
  }
  return null;
}

function scrapeGuestName(): string {
  const prefer = [
    ...document.querySelectorAll(
      '.sapUxAPObjectPageHeaderContent .sapMTitle, .sapFDynamicPageTitleMainHeading .sapMTitle, .sapMObjStatusTitle, .sapMLnk',
    ),
  ];
  for (const el of prefer) {
    const t = (el.textContent || '').trim().replace(/\s+/g, ' ');
    if (
      t.length >= 3 &&
      t.length < 90 &&
      /[A-Za-zÄÖÜäöü]/.test(t) &&
      !/check.?in|please|complete|reservation|zimmer|room|folio/i.test(t) &&
      !/^\d+$/.test(t)
    ) {
      if (/,/.test(t) || /\s/.test(t)) return t;
    }
  }
  return '';
}

function scrapeStayDates(): { from: string; to: string } {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const fallback = {
    from: today.toISOString().slice(0, 10),
    to: tomorrow.toISOString().slice(0, 10),
  };
  const text = document.body?.innerText || '';
  const iso = [...text.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map((m) => m[1]);
  if (iso.length >= 2) return { from: iso[0], to: iso[1] };
  const eu = [...text.matchAll(/\b(\d{2})\.(\d{2})\.(20\d{2})\b/g)];
  if (eu.length >= 2) {
    const a = eu[0];
    const b = eu[1];
    return {
      from: `${a[3]}-${a[2]}-${a[1]}`,
      to: `${b[3]}-${b[2]}-${b[1]}`,
    };
  }
  return fallback;
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  // EMMA floating footers are typically light — use dark text for contrast.
  style.textContent = `
    #${HOST_ID}, #${FALLBACK_ID}{
      display:inline-flex;align-items:center;gap:8px;margin:0 6px;
      font-family:var(--sapFontFamily,"72",system-ui,sans-serif);font-size:12px;
      vertical-align:middle;max-width:min(560px,55vw);z-index:2147483000;
      color:#1a2332 !important;
    }
    #${FALLBACK_ID}{
      position:fixed;left:50%;bottom:12px;transform:translateX(-50%);
      max-width:min(720px,calc(100vw - 24px));width:auto;
      background:#fff;border:1px solid #c7d0dc;border-radius:10px;
      box-shadow:0 8px 28px rgba(15,23,42,.18);padding:8px 12px;
      margin:0;
    }
    #${HOST_ID} .pb-bt-label, #${FALLBACK_ID} .pb-bt-label{
      font-weight:700;color:#1a2332 !important;white-space:nowrap;font-size:11px;
      letter-spacing:.03em;text-transform:uppercase;
    }
    #${HOST_ID} .pb-bt-code, #${FALLBACK_ID} .pb-bt-code{
      font-family:ui-monospace,monospace;font-weight:800;letter-spacing:.05em;
      background:#fef2f2;border:1px solid #fecaca;color:#991b1b !important;
      border-radius:8px;padding:5px 10px;cursor:pointer;white-space:nowrap;
    }
    #${HOST_ID} .pb-bt-code:hover, #${FALLBACK_ID} .pb-bt-code:hover{background:#fee2e2}
    #${HOST_ID} .pb-bt-btn, #${FALLBACK_ID} .pb-bt-btn{
      border:1px solid #3b6fa0;background:#3b6fa0;color:#fff !important;
      border-radius:8px;padding:5px 10px;cursor:pointer;font-weight:600;white-space:nowrap;
    }
    #${HOST_ID} .pb-bt-btn:hover, #${FALLBACK_ID} .pb-bt-btn:hover{background:#345f89}
    #${HOST_ID} .pb-bt-btn:disabled, #${FALLBACK_ID} .pb-bt-btn:disabled{opacity:.55;cursor:not-allowed}
    #${HOST_ID} .pb-bt-muted, #${FALLBACK_ID} .pb-bt-muted{
      color:#475569 !important;font-size:11px;white-space:nowrap;
    }
    #${HOST_ID} .pb-bt-form, #${FALLBACK_ID} .pb-bt-form{
      display:flex;flex-wrap:wrap;gap:4px;align-items:center;
      background:#f8fafc;border:1px solid #dbe3ee;border-radius:8px;padding:4px 6px;
    }
    #${HOST_ID} .pb-bt-form input, #${FALLBACK_ID} .pb-bt-form input{
      height:26px;border-radius:4px;border:1px solid #cbd5e1;
      background:#fff;color:#1a2332;padding:0 6px;font-size:11px;min-width:72px;
    }
    #${HOST_ID} .pb-bt-form input.pb-bt-name, #${FALLBACK_ID} .pb-bt-form input.pb-bt-name{min-width:120px}
  `;
  document.documentElement.appendChild(style);
}

function mountInToolbar(toolbar: HTMLElement): HTMLElement {
  document.getElementById(FALLBACK_ID)?.remove();
  let host = document.getElementById(HOST_ID) as HTMLElement | null;
  if (host && toolbar.contains(host)) return host;
  host?.remove();
  host = document.createElement('div');
  host.id = HOST_ID;
  host.className = 'sapMBarChild';
  host.setAttribute('data-prize-bernticket', '1');

  // Prefer right side (after flex spacer), next to Check In actions.
  const spacer = toolbar.querySelector('.sapMTBSpacer');
  if (spacer?.parentElement === toolbar) {
    const after = spacer.nextElementSibling;
    if (after) toolbar.insertBefore(host, after);
    else toolbar.appendChild(host);
  } else {
    const checkIn =
      toolbar.querySelector('.sapMBtnAccept') ||
      [...toolbar.querySelectorAll('button, .sapMBtn')].find((b) =>
        /check\s*in/i.test(b.textContent || ''),
      );
    if (checkIn?.parentElement === toolbar) {
      toolbar.insertBefore(host, checkIn);
    } else {
      toolbar.appendChild(host);
    }
  }
  return host;
}

function mountFallbackBar(): HTMLElement {
  document.getElementById(HOST_ID)?.remove();
  let host = document.getElementById(FALLBACK_ID) as HTMLElement | null;
  if (host) return host;
  host = document.createElement('div');
  host.id = FALLBACK_ID;
  host.setAttribute('data-prize-bernticket', '1');
  document.documentElement.appendChild(host);
  return host;
}

function setHostHtml(host: HTMLElement, html: string) {
  host.innerHTML = html;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // ignore
  }
}

let lastBooking: string | null = null;
let refreshTimer: number | null = null;
let renderGen = 0;

async function renderForBooking(host: HTMLElement, bookingNumber: string) {
  const gen = ++renderGen;
  const tokens = await getBtTokens();
  if (gen !== renderGen) return;

  if (!tokens.access) {
    setHostHtml(
      host,
      `<span class="pb-bt-label">BernTicket</span>` +
        `<span class="pb-bt-muted">Im Panel → BernTicket anmelden</span>`,
    );
    return;
  }

  setHostHtml(
    host,
    `<span class="pb-bt-label">BernTicket</span><span class="pb-bt-muted">Laden…</span>`,
  );

  try {
    const tickets = await btSearchTickets(bookingNumber);
    if (gen !== renderGen) return;
    const ticket = pickTicketForBooking(tickets, bookingNumber);
    const code = getActivationCode(ticket);

    if (ticket && code) {
      setHostHtml(
        host,
        `<span class="pb-bt-label">BernTicket</span>` +
          `<button type="button" class="pb-bt-code" title="Code kopieren">${escapeHtml(code)}</button>` +
          `<span class="pb-bt-muted">${escapeHtml(bookingNumber)}</span>`,
      );
      host.querySelector('.pb-bt-code')?.addEventListener('click', () => {
        void copyText(code);
      });
      return;
    }

    if (ticket && !code) {
      setHostHtml(
        host,
        `<span class="pb-bt-label">BernTicket</span>` +
          `<span class="pb-bt-muted">Ticket ohne Code (${escapeHtml(ticket.status)})</span>`,
      );
      return;
    }

    const guest = scrapeGuestName();
    const dates = scrapeStayDates();
    setHostHtml(
      host,
      `<span class="pb-bt-label">BernTicket</span>` +
        `<div class="pb-bt-form">` +
        `<input class="pb-bt-name" placeholder="Gastname" value="${escapeAttr(guest)}" />` +
        `<input class="pb-bt-from" type="date" value="${escapeAttr(dates.from)}" />` +
        `<input class="pb-bt-to" type="date" value="${escapeAttr(dates.to)}" />` +
        `<input class="pb-bt-amt" type="number" min="1" value="1" style="width:52px" title="Anzahl" />` +
        `<button type="button" class="pb-bt-btn pb-bt-create">Ticket erstellen</button>` +
        `</div>`,
    );

    const createBtn = host.querySelector('.pb-bt-create') as HTMLButtonElement | null;
    createBtn?.addEventListener('click', () => {
      void (async () => {
        const nameEl = host.querySelector('.pb-bt-name') as HTMLInputElement;
        const fromEl = host.querySelector('.pb-bt-from') as HTMLInputElement;
        const toEl = host.querySelector('.pb-bt-to') as HTMLInputElement;
        const amtEl = host.querySelector('.pb-bt-amt') as HTMLInputElement;
        const guestName = nameEl?.value.trim() || '';
        if (!guestName) {
          setHostHtml(
            host,
            `<span class="pb-bt-label">BernTicket</span><span class="pb-bt-muted">Gastname fehlt</span>` +
              `<button type="button" class="pb-bt-btn pb-bt-retry">Nochmal</button>`,
          );
          host.querySelector('.pb-bt-retry')?.addEventListener('click', () => {
            void renderForBooking(host, bookingNumber);
          });
          return;
        }
        createBtn.disabled = true;
        createBtn.textContent = '…';
        try {
          const created = await btCreateTicket({
            guestName,
            bookingNumber,
            validFrom: toDateInputValue(fromEl?.value || dates.from),
            validTo: toDateInputValue(toEl?.value || dates.to),
            ticketsAmount: Math.max(1, parseInt(amtEl?.value || '1', 10) || 1),
          });
          const newCode = getActivationCode(created);
          if (newCode) {
            setHostHtml(
              host,
              `<span class="pb-bt-label">BernTicket</span>` +
                `<button type="button" class="pb-bt-code" title="Code kopieren">${escapeHtml(newCode)}</button>`,
            );
            host.querySelector('.pb-bt-code')?.addEventListener('click', () => {
              void copyText(newCode);
            });
          } else {
            lastBooking = null;
            await renderForBooking(host, bookingNumber);
          }
        } catch (e) {
          if (e instanceof BtApiError && e.code === BERN_TICKET_2FA_REQUIRED) {
            const code = window.prompt('BernTicket 2FA-Code (Puma):');
            if (code) {
              try {
                await btComplete2fa(code);
                createBtn.disabled = false;
                createBtn.textContent = 'Ticket erstellen';
                createBtn.click();
                return;
              } catch (e2) {
                setHostHtml(
                  host,
                  `<span class="pb-bt-label">BernTicket</span>` +
                    `<span class="pb-bt-muted">${escapeHtml(e2 instanceof Error ? e2.message : '2FA fehlgeschlagen')}</span>` +
                    `<button type="button" class="pb-bt-btn pb-bt-retry">Nochmal</button>`,
                );
                host.querySelector('.pb-bt-retry')?.addEventListener('click', () => {
                  void renderForBooking(host, bookingNumber);
                });
                return;
              }
            }
          }
          setHostHtml(
            host,
            `<span class="pb-bt-label">BernTicket</span>` +
              `<span class="pb-bt-muted">${escapeHtml(e instanceof Error ? e.message : 'Fehler')}</span>` +
              `<button type="button" class="pb-bt-btn pb-bt-retry">Nochmal</button>`,
          );
          host.querySelector('.pb-bt-retry')?.addEventListener('click', () => {
            void renderForBooking(host, bookingNumber);
          });
        }
      })();
    });
  } catch (e) {
    if (gen !== renderGen) return;
    setHostHtml(
      host,
      `<span class="pb-bt-label">BernTicket</span>` +
        `<span class="pb-bt-muted">${escapeHtml(e instanceof Error ? e.message : 'Fehler')}</span>` +
        `<button type="button" class="pb-bt-btn pb-bt-retry">Nochmal</button>`,
    );
    host.querySelector('.pb-bt-retry')?.addEventListener('click', () => {
      lastBooking = null;
      void renderForBooking(host, bookingNumber);
    });
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

function scheduleRefresh() {
  if (refreshTimer) window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    void tick();
  }, 500);
}

function hostStillMounted(host: HTMLElement): boolean {
  return document.documentElement.contains(host);
}

async function tick() {
  if (!isLikelyEmmaPage()) {
    document.getElementById(HOST_ID)?.remove();
    document.getElementById(FALLBACK_ID)?.remove();
    lastBooking = null;
    return;
  }

  ensureStyles();
  const booking = getBookingNumber();
  const toolbar = findCheckinToolbar();

  // No reservation context → hide UI
  if (!booking && !toolbar) {
    document.getElementById(HOST_ID)?.remove();
    document.getElementById(FALLBACK_ID)?.remove();
    lastBooking = null;
    return;
  }

  const host = toolbar ? mountInToolbar(toolbar) : mountFallbackBar();

  if (!booking) {
    setHostHtml(
      host,
      `<span class="pb-bt-label">BernTicket</span><span class="pb-bt-muted">Keine Buchungsnr. erkannt</span>`,
    );
    lastBooking = null;
    host.dataset.bound = '';
    return;
  }

  // Remount / re-render if detached or booking changed
  if (booking === lastBooking && host.dataset.bound === booking && hostStillMounted(host)) {
    return;
  }
  lastBooking = booking;
  host.dataset.bound = booking;
  await renderForBooking(host, booking);
}

export function startEmmaBernTicketWatcher() {
  void tick();

  window.addEventListener('hashchange', () => {
    lastBooking = null;
    scheduleRefresh();
  });

  const obs = new MutationObserver((mutations) => {
    for (const m of mutations) {
      const t = m.target as Node;
      if (
        (t instanceof Element && t.closest(`[data-prize-bernticket]`)) ||
        (t instanceof Element && (t.id === HOST_ID || t.id === FALLBACK_ID || t.id === STYLE_ID))
      ) {
        return;
      }
    }
    // If SAP rebuilt the footer, force rebind
    const host = document.getElementById(HOST_ID) || document.getElementById(FALLBACK_ID);
    if (host && !hostStillMounted(host)) lastBooking = null;
    if (host && findCheckinToolbar() && host.id === HOST_ID && !findCheckinToolbar()!.contains(host)) {
      lastBooking = null;
    }
    scheduleRefresh();
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  // Storage login from panel should refresh EMMA UI
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.btAccessToken || changes.btRefreshToken) {
        lastBooking = null;
        scheduleRefresh();
      }
    });
  } catch {
    // ignore
  }

  return () => {
    obs.disconnect();
    if (refreshTimer) window.clearTimeout(refreshTimer);
    document.getElementById(HOST_ID)?.remove();
    document.getElementById(FALLBACK_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
  };
}
