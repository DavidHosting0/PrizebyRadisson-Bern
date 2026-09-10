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
  const existing = document.getElementById(STYLE_ID);
  if (existing) existing.remove();
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${FALLBACK_ID}{
      position:fixed;left:50%;bottom:18px;transform:translateX(-50%);
      z-index:2147483000;box-sizing:border-box;
      width:max-content;max-width:min(560px,calc(100vw - 28px));
      font-family:var(--sapFontFamily,"72",system-ui,-apple-system,sans-serif);
      color:#0f172a;
      background:linear-gradient(180deg,#ffffff 0%,#f8fafc 100%);
      border:1px solid rgba(45,58,79,.14);
      border-radius:16px;
      box-shadow:0 10px 36px rgba(15,23,42,.16),0 1px 0 rgba(255,255,255,.8) inset;
      padding:10px 14px;
      display:flex;flex-direction:column;align-items:center;gap:8px;
      pointer-events:auto;
    }
    #${FALLBACK_ID} *{box-sizing:border-box;}
    #${FALLBACK_ID} .pb-bt-row{
      display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;
      width:100%;
    }
    #${FALLBACK_ID} .pb-bt-brand{
      display:inline-flex;align-items:center;gap:7px;
      font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
      color:#1a2332;
    }
    #${FALLBACK_ID} .pb-bt-dot{
      width:8px;height:8px;border-radius:999px;background:#3b6fa0;
      box-shadow:0 0 0 3px rgba(59,111,160,.18);
      flex-shrink:0;
    }
    #${FALLBACK_ID} .pb-bt-code{
      appearance:none;border:0;cursor:pointer;
      font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
      font-size:18px;font-weight:800;letter-spacing:.12em;
      line-height:1.1;color:#991b1b;
      background:linear-gradient(180deg,#fff5f5,#fee2e2);
      border:1px solid #fecaca;
      border-radius:12px;
      padding:10px 18px;
      min-width:9.5rem;text-align:center;
      box-shadow:0 1px 2px rgba(153,27,27,.08);
      transition:transform .12s ease,background .12s ease,box-shadow .12s ease;
    }
    #${FALLBACK_ID} .pb-bt-code:hover{
      background:linear-gradient(180deg,#fff1f1,#fecaca);
      box-shadow:0 4px 14px rgba(153,27,27,.14);
      transform:translateY(-1px);
    }
    #${FALLBACK_ID} .pb-bt-code:active{transform:translateY(0)}
    #${FALLBACK_ID} .pb-bt-hint{
      font-size:10px;color:#64748b;text-align:center;line-height:1.3;
    }
    #${FALLBACK_ID} .pb-bt-meta{
      font-size:10px;color:#64748b;font-variant-numeric:tabular-nums;
    }
    #${FALLBACK_ID} .pb-bt-muted{
      font-size:12px;color:#475569;text-align:center;
    }
    #${FALLBACK_ID} .pb-bt-btn{
      appearance:none;cursor:pointer;
      border:1px solid #3b6fa0;background:#3b6fa0;color:#fff;
      border-radius:10px;padding:7px 12px;font-size:12px;font-weight:600;
      transition:background .12s ease;
    }
    #${FALLBACK_ID} .pb-bt-btn:hover{background:#345f89}
    #${FALLBACK_ID} .pb-bt-btn:disabled{opacity:.55;cursor:not-allowed}
    #${FALLBACK_ID} .pb-bt-btn.pb-bt-ghost{
      background:#fff;color:#1a2332;border-color:#cbd5e1;
    }
    #${FALLBACK_ID} .pb-bt-btn.pb-bt-ghost:hover{background:#f1f5f9}
    #${FALLBACK_ID} .pb-bt-form{
      display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:center;
      width:100%;
    }
    #${FALLBACK_ID} .pb-bt-form input{
      height:30px;border-radius:8px;border:1px solid #cbd5e1;
      background:#fff;color:#1a2332;padding:0 8px;font-size:12px;min-width:88px;
    }
    #${FALLBACK_ID} .pb-bt-form input.pb-bt-name{min-width:140px;flex:1}
    #${FALLBACK_ID} .pb-bt-copied{
      font-size:11px;font-weight:600;color:#15803d;
    }
  `;
  document.documentElement.appendChild(style);
}

function mountBar(): HTMLElement {
  document.getElementById(HOST_ID)?.remove();
  let host = document.getElementById(FALLBACK_ID) as HTMLElement | null;
  if (host) return host;
  host = document.createElement('div');
  host.id = FALLBACK_ID;
  host.setAttribute('data-prize-bernticket', '1');
  host.setAttribute('role', 'region');
  host.setAttribute('aria-label', 'BernTicket Aktivierungscode');
  document.documentElement.appendChild(host);
  return host;
}

function setHostHtml(host: HTMLElement, html: string) {
  host.innerHTML = html;
}

function shell(inner: string): string {
  return (
    `<div class="pb-bt-row"><span class="pb-bt-brand"><span class="pb-bt-dot" aria-hidden="true"></span>BernTicket</span></div>` +
    inner
  );
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // ignore
  }
}

function bindCodeCopy(host: HTMLElement, code: string) {
  const btn = host.querySelector('.pb-bt-code') as HTMLButtonElement | null;
  const hint = host.querySelector('.pb-bt-hint');
  btn?.addEventListener('click', () => {
    void copyText(code).then(() => {
      if (hint) {
        hint.innerHTML = `<span class="pb-bt-copied">Kopiert</span>`;
        window.setTimeout(() => {
          if (hint.isConnected) hint.textContent = 'Klicken zum Kopieren';
        }, 1200);
      }
    });
  });
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
      shell(
        `<div class="pb-bt-row"><span class="pb-bt-muted">Im Panel → BernTicket anmelden</span></div>` +
          `<div class="pb-bt-hint">Buchung ${escapeHtml(bookingNumber)}</div>`,
      ),
    );
    return;
  }

  setHostHtml(
    host,
    shell(`<div class="pb-bt-row"><span class="pb-bt-muted">Laden…</span></div>`),
  );

  try {
    const tickets = await btSearchTickets(bookingNumber);
    if (gen !== renderGen) return;
    const ticket = pickTicketForBooking(tickets, bookingNumber);
    const code = getActivationCode(ticket);

    if (ticket && code) {
      setHostHtml(
        host,
        shell(
          `<div class="pb-bt-row"><button type="button" class="pb-bt-code" title="Code kopieren">${escapeHtml(code)}</button></div>` +
            `<div class="pb-bt-hint">Klicken zum Kopieren · Buchung <span class="pb-bt-meta">${escapeHtml(bookingNumber)}</span></div>`,
        ),
      );
      bindCodeCopy(host, code);
      return;
    }

    if (ticket && !code) {
      setHostHtml(
        host,
        shell(
          `<div class="pb-bt-row"><span class="pb-bt-muted">Ticket ohne Code (${escapeHtml(ticket.status)})</span></div>` +
            `<div class="pb-bt-hint">Buchung ${escapeHtml(bookingNumber)}</div>`,
        ),
      );
      return;
    }

    const guest = scrapeGuestName();
    const dates = scrapeStayDates();
    setHostHtml(
      host,
      shell(
        `<div class="pb-bt-row"><span class="pb-bt-muted">Kein Ticket — erstellen</span></div>` +
          `<div class="pb-bt-form">` +
          `<input class="pb-bt-name" placeholder="Gastname" value="${escapeAttr(guest)}" />` +
          `<input class="pb-bt-from" type="date" value="${escapeAttr(dates.from)}" />` +
          `<input class="pb-bt-to" type="date" value="${escapeAttr(dates.to)}" />` +
          `<input class="pb-bt-amt" type="number" min="1" value="1" style="width:56px" title="Anzahl" />` +
          `<button type="button" class="pb-bt-btn pb-bt-create">Erstellen</button>` +
          `</div>` +
          `<div class="pb-bt-hint">Buchung ${escapeHtml(bookingNumber)}</div>`,
      ),
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
            shell(
              `<div class="pb-bt-row"><span class="pb-bt-muted">Gastname fehlt</span>` +
                `<button type="button" class="pb-bt-btn pb-bt-ghost pb-bt-retry">Nochmal</button></div>`,
            ),
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
              shell(
                `<div class="pb-bt-row"><button type="button" class="pb-bt-code" title="Code kopieren">${escapeHtml(newCode)}</button></div>` +
                  `<div class="pb-bt-hint">Klicken zum Kopieren · Buchung <span class="pb-bt-meta">${escapeHtml(bookingNumber)}</span></div>`,
              ),
            );
            bindCodeCopy(host, newCode);
          } else {
            lastBooking = null;
            await renderForBooking(host, bookingNumber);
          }
        } catch (e) {
          if (e instanceof BtApiError && e.code === BERN_TICKET_2FA_REQUIRED) {
            const fa = window.prompt('BernTicket 2FA-Code (Puma):');
            if (fa) {
              try {
                await btComplete2fa(fa);
                createBtn.disabled = false;
                createBtn.textContent = 'Erstellen';
                createBtn.click();
                return;
              } catch (e2) {
                setHostHtml(
                  host,
                  shell(
                    `<div class="pb-bt-row"><span class="pb-bt-muted">${escapeHtml(e2 instanceof Error ? e2.message : '2FA fehlgeschlagen')}</span>` +
                      `<button type="button" class="pb-bt-btn pb-bt-ghost pb-bt-retry">Nochmal</button></div>`,
                  ),
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
            shell(
              `<div class="pb-bt-row"><span class="pb-bt-muted">${escapeHtml(e instanceof Error ? e.message : 'Fehler')}</span>` +
                `<button type="button" class="pb-bt-btn pb-bt-ghost pb-bt-retry">Nochmal</button></div>`,
            ),
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
      shell(
        `<div class="pb-bt-row"><span class="pb-bt-muted">${escapeHtml(e instanceof Error ? e.message : 'Fehler')}</span>` +
          `<button type="button" class="pb-bt-btn pb-bt-ghost pb-bt-retry">Nochmal</button></div>`,
      ),
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

  const host = mountBar();

  if (!booking) {
    setHostHtml(
      host,
      shell(
        `<div class="pb-bt-row"><span class="pb-bt-muted">Keine Buchungsnr. erkannt</span></div>`,
      ),
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
    const host = document.getElementById(FALLBACK_ID);
    if (host && !hostStillMounted(host)) lastBooking = null;
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
