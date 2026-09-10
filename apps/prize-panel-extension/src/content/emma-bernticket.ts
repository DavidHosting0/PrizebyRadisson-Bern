/**
 * Injects a SAP-toolbar-styled BernTicket control into EMMA check-in footer.
 * Lookup / create activation codes via bernticket.com using stored BT tokens.
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

function getBookingNumber(): string | null {
  const m = window.location.hash.match(/ReservationId='(\d+)'/i);
  if (m) return m[1].replace(/^0+/, '');
  for (const a of document.querySelectorAll('a.sapMLnk')) {
    const t = (a.textContent || '').trim();
    if (/^\d{6,}$/.test(t)) return t.replace(/^0+/, '');
  }
  return null;
}

function findCheckinToolbar(): HTMLElement | null {
  const byId = document.querySelector<HTMLElement>('[id$="tms.checkinToolbar"]');
  if (byId) return byId;
  return document.querySelector<HTMLElement>('[id*="CheckInDetail"][id*="checkinToolbar"]');
}

function scrapeGuestName(): string {
  const candidates = [
    ...document.querySelectorAll('.sapMObjStatusText, .sapMTitle, .sapMText, .sapMLnk'),
  ];
  for (const el of candidates) {
    const t = (el.textContent || '').trim();
    if (t.length >= 3 && t.length < 80 && /[A-Za-zÄÖÜäöü]/.test(t) && !/check.?in|please|complete/i.test(t)) {
      if (/,/.test(t) || /\s/.test(t)) return t.replace(/\s+/g, ' ');
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
  const dates = [...text.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map((m) => m[1]);
  if (dates.length >= 2) return { from: dates[0], to: dates[1] };
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
  style.textContent = `
    #${HOST_ID}{
      display:inline-flex;align-items:center;gap:6px;margin:0 8px;
      font-family:var(--sapFontFamily,system-ui,sans-serif);font-size:12px;
      vertical-align:middle;max-width:min(420px,46vw);
    }
    #${HOST_ID} .pb-bt-label{
      font-weight:700;color:#fff;opacity:.9;white-space:nowrap;font-size:11px;
      letter-spacing:.02em;text-transform:uppercase;
    }
    #${HOST_ID} .pb-bt-code{
      font-family:ui-monospace,monospace;font-weight:800;letter-spacing:.04em;
      background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.28);
      color:#fff;border-radius:6px;padding:4px 8px;cursor:pointer;white-space:nowrap;
    }
    #${HOST_ID} .pb-bt-code:hover{background:rgba(255,255,255,.22)}
    #${HOST_ID} .pb-bt-btn{
      border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.12);
      color:#fff;border-radius:6px;padding:4px 10px;cursor:pointer;font-weight:600;
      white-space:nowrap;
    }
    #${HOST_ID} .pb-bt-btn:hover{background:rgba(255,255,255,.2)}
    #${HOST_ID} .pb-bt-btn:disabled{opacity:.5;cursor:not-allowed}
    #${HOST_ID} .pb-bt-muted{color:rgba(255,255,255,.75);font-size:11px;white-space:nowrap}
    #${HOST_ID} .pb-bt-form{
      display:flex;flex-wrap:wrap;gap:4px;align-items:center;
      background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.2);
      border-radius:8px;padding:4px 6px;
    }
    #${HOST_ID} .pb-bt-form input{
      height:26px;border-radius:4px;border:1px solid rgba(255,255,255,.3);
      background:rgba(255,255,255,.95);color:#1a2332;padding:0 6px;font-size:11px;
      min-width:72px;
    }
    #${HOST_ID} .pb-bt-form input.pb-bt-name{min-width:110px}
  `;
  document.documentElement.appendChild(style);
}

function mountHost(toolbar: HTMLElement): HTMLElement {
  let host = document.getElementById(HOST_ID) as HTMLElement | null;
  if (host && toolbar.contains(host)) return host;
  host?.remove();
  host = document.createElement('div');
  host.id = HOST_ID;
  host.className = 'sapMBarChild';
  host.setAttribute('data-prize-bernticket', '1');

  const spacer =
    toolbar.querySelector('.sapMTBSpacer') ||
    toolbar.querySelector('[id*="footerbuttons"]')?.nextElementSibling;
  if (spacer?.parentElement === toolbar) {
    toolbar.insertBefore(host, spacer);
  } else {
    toolbar.appendChild(host);
  }
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

async function renderForBooking(host: HTMLElement, bookingNumber: string) {
  const tokens = await getBtTokens();
  if (!tokens.access) {
    setHostHtml(
      host,
      `<span class="pb-bt-label">BernTicket</span>` +
        `<span class="pb-bt-muted">Im Panel bei BernTicket anmelden</span>`,
    );
    return;
  }

  setHostHtml(
    host,
    `<span class="pb-bt-label">BernTicket</span><span class="pb-bt-muted">Laden…</span>`,
  );

  try {
    const tickets = await btSearchTickets(bookingNumber);
    const ticket = pickTicketForBooking(tickets, bookingNumber);
    const code = getActivationCode(ticket);

    if (ticket && code) {
      setHostHtml(
        host,
        `<span class="pb-bt-label">BernTicket</span>` +
          `<button type="button" class="pb-bt-code" title="Code kopieren">${escapeHtml(code)}</button>`,
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

    // No ticket → create UI
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
    setHostHtml(
      host,
      `<span class="pb-bt-label">BernTicket</span>` +
        `<span class="pb-bt-muted">${escapeHtml(e instanceof Error ? e.message : 'Fehler')}</span>`,
    );
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
  }, 400);
}

async function tick() {
  const toolbar = findCheckinToolbar();
  if (!toolbar) {
    document.getElementById(HOST_ID)?.remove();
    lastBooking = null;
    return;
  }

  ensureStyles();
  const host = mountHost(toolbar);
  const booking = getBookingNumber();
  if (!booking) {
    setHostHtml(
      host,
      `<span class="pb-bt-label">BernTicket</span><span class="pb-bt-muted">Keine Buchungsnr.</span>`,
    );
    lastBooking = null;
    return;
  }

  if (booking === lastBooking && host.dataset.bound === booking) return;
  lastBooking = booking;
  host.dataset.bound = booking;
  await renderForBooking(host, booking);
}

export function startEmmaBernTicketWatcher() {
  void tick();

  window.addEventListener('hashchange', scheduleRefresh);
  const obs = new MutationObserver(scheduleRefresh);
  obs.observe(document.documentElement, { childList: true, subtree: true });

  return () => {
    obs.disconnect();
    window.removeEventListener('hashchange', scheduleRefresh);
    if (refreshTimer) window.clearTimeout(refreshTimer);
    document.getElementById(HOST_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
  };
}
