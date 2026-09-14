/**
 * Injects BernTicket into EMMA check-in footer toolbar (centered).
 * Falls back to a fixed strip when the SAP toolbar is missing.
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
import {
  getMessages,
  interpolate,
  loadExtensionLocale,
  watchExtensionLocale,
  type ExtensionMessages,
} from '../i18n';

let msgs: ExtensionMessages = getMessages('de');

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
    if (m) return m[1].replace(/^0+/, '') || m[1];
  }

  for (const a of document.querySelectorAll(
    'a.sapMLnk, span.sapMText, span.sapMObjStatusText, .sapMTitle, .sapMObjStatusTitle',
  )) {
    const t = (a.textContent || '').trim();
    if (/^\d{6,}$/.test(t)) return t.replace(/^0+/, '') || t;
  }

  const title = document.querySelector(
    '.sapUxAPObjectPageHeaderContent .sapMTitle, .sapFDynamicPageTitleMain .sapMTitle, .sapFDynamicPageTitleMainHeading .sapMTitle',
  );
  const tm = (title?.textContent || '').match(/\b(\d{6,})\b/);
  if (tm) return tm[1].replace(/^0+/, '') || tm[1];

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

function findCheckinHeader(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('[id$="tms.checkinheaderContent"]') ||
    document.querySelector<HTMLElement>('[id*="checkinheaderContent"]') ||
    document.querySelector<HTMLElement>('[id*="CheckInDetail"][id*="headerContent"]')
  );
}

const MONTH_MAP: Record<string, string> = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12',
};

/** Parse EMMA dates like "Mon, Sep 14, 2026", "14.09.2026", "2026-09-14". */
function parseEmmaDate(raw: string): string | null {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return null;

  const iso = s.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const eu = s.match(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b/);
  if (eu) {
    return `${eu[3]}-${eu[2].padStart(2, '0')}-${eu[1].padStart(2, '0')}`;
  }

  // Mon, Sep 14, 2026  |  Sep 14, 2026  |  Tuesday, September 15, 2026
  const en = s.match(
    /(?:[A-Za-z]{3,9},?\s+)?([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(20\d{2})\b/,
  );
  if (en) {
    const mm = MONTH_MAP[en[1].toLowerCase()];
    if (mm) return `${en[3]}-${mm}-${en[2].padStart(2, '0')}`;
  }

  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    if (y >= 2000) return `${y}-${m}-${day}`;
  }
  return null;
}

function fieldTextNearLabel(root: ParentNode, labelRe: RegExp): string | null {
  const labels = root.querySelectorAll('.sapMLabel, label, .sapMLabelTextWrapper, bdi');
  for (const lab of labels) {
    const labText = (lab.textContent || '').trim().replace(/:\s*$/, '');
    if (!labelRe.test(labText)) continue;

    // Walk up a few levels, then look for the next value field in document order.
    let scope: Element | null = lab instanceof Element ? lab : null;
    for (let i = 0; i < 6 && scope; i++) {
      const candidates = scope.querySelectorAll(
        '.sapUiCompSmartFieldValue, .sapMText, input.sapMInputBaseInner, input[type="text"], textarea',
      );
      for (const c of candidates) {
        // Prefer fields that appear after the label in the DOM.
        if (lab.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) {
          const v =
            c instanceof HTMLInputElement || c instanceof HTMLTextAreaElement
              ? c.value
              : (c.textContent || '');
          const cleaned = v.trim();
          if (cleaned && !labelRe.test(cleaned)) return cleaned;
        }
      }
      scope = scope.parentElement;
    }
  }
  return null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function scrapeStayDates(): { from: string; to: string } {
  const header = findCheckinHeader() || document.body;
  const arrivalRaw =
    fieldTextNearLabel(header, /^Arrival\s*Date$/i) ||
    fieldTextNearLabel(header, /^Anreise(datum)?$/i);
  const departureRaw =
    fieldTextNearLabel(header, /^Departure\s*Date$/i) ||
    fieldTextNearLabel(header, /^Abreise(datum)?$/i);

  const from = (arrivalRaw && parseEmmaDate(arrivalRaw)) || todayIso();
  const to = (departureRaw && parseEmmaDate(departureRaw)) || tomorrowIso();
  return { from, to };
}

function scrapePaxCount(): number {
  const header = findCheckinHeader() || document.body;
  const paxRoot =
    document.querySelector<HTMLElement>('[id*="FolioPaxTypes"]') || header;

  // Sum AD + CH + IN (adults / children / infants) from labeled inputs.
  let total = 0;
  let found = false;
  for (const re of [/^AD$/i, /^CH$/i, /^IN$/i, /^Adults?$/i, /^Children$/i, /^Infants?$/i]) {
    const raw = fieldTextNearLabel(paxRoot, re);
    if (raw == null) continue;
    const n = parseInt(raw.replace(/[^\d]/g, ''), 10);
    if (!Number.isNaN(n)) {
      total += n;
      found = true;
    }
  }

  if (!found) {
    // Fallback: all numPax smart-field inputs
    for (const input of paxRoot.querySelectorAll<HTMLInputElement>(
      '.numPax input, [class*="numPax"] input',
    )) {
      const n = parseInt((input.value || '').trim(), 10);
      if (!Number.isNaN(n)) {
        total += n;
        found = true;
      }
    }
  }

  return Math.max(1, found ? total : 1);
}

function scrapeGuestName(): string {
  // Prefer explicit guest / name fields on the check-in page
  const header = findCheckinHeader() || document.body;
  for (const re of [
    /^Guest\s*Name$/i,
    /^Guest$/i,
    /^Name$/i,
    /^Primary\s*Guest$/i,
    /^Gast(name)?$/i,
  ]) {
    const v = fieldTextNearLabel(header, re);
    if (v && v.length >= 2 && /[A-Za-zÄÖÜäöü]/.test(v)) return v.replace(/\s+/g, ' ').trim();
  }

  // Dedicated guest name inputs / smart fields
  for (const sel of [
    '[id*="guestName" i] input',
    '[id*="GuestName" i] input',
    '[id*="guest.name" i] input',
    '[id*="profile.name" i] .sapMText',
    '[id*="GuestProfile"] .sapMTitle',
    '[id*="guest"] .sapMTitle',
  ]) {
    try {
      const el = document.querySelector(sel);
      if (!el) continue;
      const v =
        el instanceof HTMLInputElement ? el.value.trim() : (el.textContent || '').trim();
      if (v.length >= 3 && /[A-Za-zÄÖÜäöü]/.test(v) && !/^\d+$/.test(v)) {
        return v.replace(/\s+/g, ' ');
      }
    } catch {
      // some browsers reject "i" flag in selectors — ignore
    }
  }

  const prefer = [
    ...document.querySelectorAll(
      [
        '.sapUxAPObjectPageHeaderContent .sapMTitle',
        '.sapFDynamicPageTitleMainHeading .sapMTitle',
        '.sapFDynamicPageTitleMain .sapMTitle',
        '[id*="CheckInDetail"] .sapMTitle',
        '.sapMObjStatusTitle',
        'a.sapMLnk',
      ].join(', '),
    ),
  ];
  for (const el of prefer) {
    const t = (el.textContent || '').trim().replace(/\s+/g, ' ');
    if (
      t.length >= 3 &&
      t.length < 90 &&
      /[A-Za-zÄÖÜäöü]/.test(t) &&
      !/check.?in|please|complete|reservation|zimmer|room|folio|arrival|departure|pax|nights/i.test(
        t,
      ) &&
      !/^\d+$/.test(t)
    ) {
      // EMMA often shows "LASTNAME, FIRSTNAME"
      if (/,/.test(t) || /\s/.test(t)) return t;
    }
  }
  return '';
}

type CreateDefaults = {
  guestName: string;
  bookingNumber: string;
  from: string;
  to: string;
  ticketsAmount: number;
};

function scrapeCreateDefaults(bookingNumber: string): CreateDefaults {
  const dates = scrapeStayDates();
  return {
    guestName: scrapeGuestName(),
    bookingNumber,
    from: dates.from,
    to: dates.to,
    ticketsAmount: scrapePaxCount(),
  };
}

function ensureStyles() {
  const existing = document.getElementById(STYLE_ID);
  if (existing) existing.remove();
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* Center BernTicket inside the flex spacer of the SAP overflow toolbar */
    .sapMTBSpacer:has(#${HOST_ID}),
    .sapMTBSpacerFlex:has(#${HOST_ID}){
      display:flex !important;
      align-items:center !important;
      justify-content:center !important;
      min-width:0 !important;
    }

    #${HOST_ID}, #${FALLBACK_ID}{
      box-sizing:border-box;
      font-family:var(--sapFontFamily,"72",system-ui,-apple-system,sans-serif);
      color:#0f172a;
      pointer-events:auto;
      z-index:5;
    }
    #${HOST_ID} *, #${FALLBACK_ID} *{box-sizing:border-box;}

    /* Compact chip in the check-in toolbar spacer */
    #${HOST_ID}{
      position:relative !important;
      margin:0 !important;
      max-width:min(420px,100%);
      display:inline-flex !important;
      flex-direction:row !important;
      align-items:center !important;
      justify-content:center !important;
      gap:8px !important;
      flex-wrap:nowrap !important;
      flex:0 1 auto !important;
      padding:4px 10px !important;
      background:rgba(255,255,255,.96) !important;
      border:1px solid rgba(45,58,79,.16) !important;
      border-radius:999px !important;
      box-shadow:0 2px 10px rgba(15,23,42,.1) !important;
      white-space:nowrap;
    }

    /* Fallback floating bar (no toolbar) */
    #${FALLBACK_ID}{
      position:fixed;left:50%;bottom:72px;transform:translateX(-50%);
      width:max-content;max-width:min(560px,calc(100vw - 28px));
      background:linear-gradient(180deg,#ffffff 0%,#f8fafc 100%);
      border:1px solid rgba(45,58,79,.14);
      border-radius:16px;
      box-shadow:0 10px 36px rgba(15,23,42,.16);
      padding:10px 14px;
      display:flex;flex-direction:column;align-items:center;gap:8px;
    }

    #${HOST_ID} .pb-bt-row, #${FALLBACK_ID} .pb-bt-row{
      display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;
    }
    #${HOST_ID} .pb-bt-brand, #${FALLBACK_ID} .pb-bt-brand{
      display:inline-flex;align-items:center;gap:6px;
      font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
      color:#1a2332;
    }
    #${HOST_ID} .pb-bt-dot, #${FALLBACK_ID} .pb-bt-dot{
      width:7px;height:7px;border-radius:999px;background:#3b6fa0;
      box-shadow:0 0 0 3px rgba(59,111,160,.18);flex-shrink:0;
    }
    #${HOST_ID} .pb-bt-code, #${FALLBACK_ID} .pb-bt-code{
      appearance:none;border:0;cursor:pointer;
      font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
      font-weight:800;letter-spacing:.1em;line-height:1;color:#991b1b;
      background:linear-gradient(180deg,#fff5f5,#fee2e2);
      border:1px solid #fecaca;border-radius:999px;
      transition:background .12s ease,box-shadow .12s ease,transform .12s ease;
    }
    #${HOST_ID} .pb-bt-code{
      font-size:14px;padding:6px 12px;min-width:7.5rem;text-align:center;
    }
    #${FALLBACK_ID} .pb-bt-code{
      font-size:18px;padding:10px 18px;min-width:9.5rem;text-align:center;border-radius:12px;
    }
    #${HOST_ID} .pb-bt-code:hover, #${FALLBACK_ID} .pb-bt-code:hover{
      background:linear-gradient(180deg,#fff1f1,#fecaca);
      box-shadow:0 3px 10px rgba(153,27,27,.12);
    }
    #${HOST_ID} .pb-bt-hint{display:none}
    #${FALLBACK_ID} .pb-bt-hint{
      font-size:10px;color:#64748b;text-align:center;line-height:1.3;
    }
    #${HOST_ID} .pb-bt-meta, #${FALLBACK_ID} .pb-bt-meta{
      font-size:10px;color:#64748b;font-variant-numeric:tabular-nums;
    }
    #${HOST_ID} .pb-bt-muted, #${FALLBACK_ID} .pb-bt-muted{
      font-size:11px;color:#475569;
    }
    #${HOST_ID} .pb-bt-btn, #${FALLBACK_ID} .pb-bt-btn{
      appearance:none;cursor:pointer;
      border:1px solid #3b6fa0;background:#3b6fa0;color:#fff;
      border-radius:999px;padding:5px 10px;font-size:11px;font-weight:600;
    }
    #${HOST_ID} .pb-bt-btn:hover, #${FALLBACK_ID} .pb-bt-btn:hover{background:#345f89}
    #${HOST_ID} .pb-bt-btn:disabled, #${FALLBACK_ID} .pb-bt-btn:disabled{opacity:.55;cursor:not-allowed}
    #${HOST_ID} .pb-bt-btn.pb-bt-ghost, #${FALLBACK_ID} .pb-bt-btn.pb-bt-ghost{
      background:#fff;color:#1a2332;border-color:#cbd5e1;
    }
    #${HOST_ID} .pb-bt-form, #${FALLBACK_ID} .pb-bt-form{
      display:flex;flex-wrap:wrap;gap:4px;align-items:center;justify-content:center;
    }
    #${HOST_ID} .pb-bt-form input, #${FALLBACK_ID} .pb-bt-form input{
      height:26px;border-radius:6px;border:1px solid #cbd5e1;
      background:#fff;color:#1a2332;padding:0 6px;font-size:11px;min-width:72px;
    }
    #${HOST_ID} .pb-bt-form input.pb-bt-name, #${FALLBACK_ID} .pb-bt-form input.pb-bt-name{min-width:110px}
    #${HOST_ID} .pb-bt-copied, #${FALLBACK_ID} .pb-bt-copied{
      font-size:10px;font-weight:600;color:#15803d;
    }
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
  host.setAttribute('data-prize-bernticket', '1');
  host.setAttribute('role', 'region');
  host.setAttribute('aria-label', 'BernTicket Aktivierungscode');

  // Prefer the flex spacer so the chip sits visually centered between left icons and Check In.
  const spacer =
    toolbar.querySelector<HTMLElement>('.sapMTBSpacer.sapMTBSpacerFlex') ||
    toolbar.querySelector<HTMLElement>('.sapMTBSpacer');
  if (spacer) {
    spacer.appendChild(host);
  } else {
    host.className = 'sapMBarChild';
    const checkIn =
      toolbar.querySelector('.sapMBtnAccept')?.closest('.sapMBtn, button') ||
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
  host.setAttribute('role', 'region');
  host.setAttribute('aria-label', 'BernTicket Aktivierungscode');
  document.documentElement.appendChild(host);
  return host;
}

function setHostHtml(host: HTMLElement, html: string) {
  host.innerHTML = html;
}

function shell(inner: string, compact = false): string {
  const brand =
    `<span class="pb-bt-brand"><span class="pb-bt-dot" aria-hidden="true"></span>${escapeHtml(msgs.emmaBt.brand)}</span>`;
  if (compact) {
    return brand + inner;
  }
  return `<div class="pb-bt-row">${brand}</div>` + inner;
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
  const brand = host.querySelector('.pb-bt-brand');
  btn?.addEventListener('click', () => {
    void copyText(code).then(() => {
      if (hint) {
        hint.innerHTML = `<span class="pb-bt-copied">${escapeHtml(msgs.emmaBt.copied)}</span>`;
        window.setTimeout(() => {
          if (hint.isConnected) hint.textContent = msgs.emmaBt.clickToCopy;
        }, 1200);
      } else if (brand) {
        const prev = brand.innerHTML;
        brand.innerHTML = `<span class="pb-bt-copied">${escapeHtml(msgs.emmaBt.copied)}</span>`;
        window.setTimeout(() => {
          if (brand.isConnected) brand.innerHTML = prev;
        }, 1000);
      }
    });
  });
}

let lastBooking: string | null = null;
let refreshTimer: number | null = null;
let renderGen = 0;

async function renderForBooking(host: HTMLElement, bookingNumber: string, compact: boolean) {
  const gen = ++renderGen;
  const tokens = await getBtTokens();
  if (gen !== renderGen) return;

  if (!tokens.access) {
    setHostHtml(
      host,
      shell(
        compact
          ? `<span class="pb-bt-muted">${escapeHtml(msgs.emmaBt.loginHint)}</span>`
          : `<div class="pb-bt-row"><span class="pb-bt-muted">${escapeHtml(msgs.emmaBt.loginHint)}</span></div>` +
              `<div class="pb-bt-hint">${escapeHtml(interpolate(msgs.emmaBt.booking, { number: bookingNumber }))}</div>`,
        compact,
      ),
    );
    return;
  }

  setHostHtml(
    host,
    shell(
      compact
        ? `<span class="pb-bt-muted">${escapeHtml(msgs.emmaBt.loading)}</span>`
        : `<div class="pb-bt-row"><span class="pb-bt-muted">${escapeHtml(msgs.emmaBt.loading)}</span></div>`,
      compact,
    ),
  );

  try {
    const tickets = await btSearchTickets(bookingNumber);
    if (gen !== renderGen) return;
    const ticket = pickTicketForBooking(tickets, bookingNumber);
    const code = getActivationCode(ticket);
    const copyTitle = msgs.bernticket.copyCode;
    const clickToCopy = msgs.emmaBt.clickToCopy;

    if (ticket && code) {
      setHostHtml(
        host,
        shell(
          compact
            ? `<button type="button" class="pb-bt-code" title="${escapeAttr(copyTitle)}">${escapeHtml(code)}</button>`
            : `<div class="pb-bt-row"><button type="button" class="pb-bt-code" title="${escapeAttr(copyTitle)}">${escapeHtml(code)}</button></div>` +
                `<div class="pb-bt-hint">${escapeHtml(clickToCopy)} · <span class="pb-bt-meta">${escapeHtml(interpolate(msgs.emmaBt.booking, { number: bookingNumber }))}</span></div>`,
          compact,
        ),
      );
      bindCodeCopy(host, code);
      return;
    }

    if (ticket && !code) {
      const noCode = interpolate(msgs.emmaBt.noCode, { status: ticket.status });
      setHostHtml(
        host,
        shell(
          compact
            ? `<span class="pb-bt-muted">${escapeHtml(noCode)}</span>`
            : `<div class="pb-bt-row"><span class="pb-bt-muted">${escapeHtml(noCode)}</span></div>`,
          compact,
        ),
      );
      return;
    }

    const defaults = scrapeCreateDefaults(bookingNumber);
    setHostHtml(
      host,
      shell(
        (compact
          ? ''
          : `<div class="pb-bt-row"><span class="pb-bt-muted">${escapeHtml(msgs.emmaBt.noTicketCreate)}</span></div>`) +
          `<div class="pb-bt-form">` +
          `<span class="pb-bt-meta" title="Reservierungsnummer">#${escapeHtml(defaults.bookingNumber)}</span>` +
          `<input class="pb-bt-name" placeholder="${escapeAttr(msgs.emmaBt.guestNamePlaceholder)}" value="${escapeAttr(defaults.guestName)}" />` +
          `<input class="pb-bt-from" type="date" value="${escapeAttr(defaults.from)}" title="Anreise" />` +
          `<input class="pb-bt-to" type="date" value="${escapeAttr(defaults.to)}" title="Abreise" />` +
          `<input class="pb-bt-amt" type="number" min="1" value="${defaults.ticketsAmount}" style="width:52px" title="Personen (Pax)" />` +
          `<button type="button" class="pb-bt-btn pb-bt-create">${escapeHtml(msgs.emmaBt.create)}</button>` +
          `</div>`,
        compact,
      ),
    );

    const createBtn = host.querySelector('.pb-bt-create') as HTMLButtonElement | null;
    createBtn?.addEventListener('click', () => {
      void (async () => {
        const nameEl = host.querySelector('.pb-bt-name') as HTMLInputElement;
        const fromEl = host.querySelector('.pb-bt-from') as HTMLInputElement;
        const toEl = host.querySelector('.pb-bt-to') as HTMLInputElement;
        const amtEl = host.querySelector('.pb-bt-amt') as HTMLInputElement;
        const guestName = nameEl?.value.trim() || defaults.guestName;
        if (!guestName) {
          setHostHtml(
            host,
            shell(
              compact
                ? `<span class="pb-bt-muted">${escapeHtml(msgs.emmaBt.guestNameMissing)}</span><button type="button" class="pb-bt-btn pb-bt-ghost pb-bt-retry">${escapeHtml(msgs.emmaBt.retry)}</button>`
                : `<div class="pb-bt-row"><span class="pb-bt-muted">${escapeHtml(msgs.emmaBt.guestNameMissing)}</span>` +
                    `<button type="button" class="pb-bt-btn pb-bt-ghost pb-bt-retry">${escapeHtml(msgs.emmaBt.retry)}</button></div>`,
              compact,
            ),
          );
          host.querySelector('.pb-bt-retry')?.addEventListener('click', () => {
            void renderForBooking(host, bookingNumber, compact);
          });
          return;
        }
        createBtn.disabled = true;
        createBtn.textContent = '…';
        try {
          const created = await btCreateTicket({
            guestName,
            bookingNumber: defaults.bookingNumber,
            validFrom: toDateInputValue(fromEl?.value || defaults.from),
            validTo: toDateInputValue(toEl?.value || defaults.to),
            ticketsAmount: Math.max(
              1,
              parseInt(amtEl?.value || String(defaults.ticketsAmount), 10) || defaults.ticketsAmount,
            ),
          });
          const newCode = getActivationCode(created);
          if (newCode) {
            setHostHtml(
              host,
              shell(
                compact
                  ? `<button type="button" class="pb-bt-code" title="${escapeAttr(copyTitle)}">${escapeHtml(newCode)}</button>`
                  : `<div class="pb-bt-row"><button type="button" class="pb-bt-code" title="${escapeAttr(copyTitle)}">${escapeHtml(newCode)}</button></div>` +
                      `<div class="pb-bt-hint">${escapeHtml(clickToCopy)} · <span class="pb-bt-meta">${escapeHtml(interpolate(msgs.emmaBt.booking, { number: bookingNumber }))}</span></div>`,
                compact,
              ),
            );
            bindCodeCopy(host, newCode);
          } else {
            lastBooking = null;
            await renderForBooking(host, bookingNumber, compact);
          }
        } catch (e) {
          if (e instanceof BtApiError && e.code === BERN_TICKET_2FA_REQUIRED) {
            const fa = window.prompt(msgs.emmaBt.twoFaPrompt);
            if (fa) {
              try {
                await btComplete2fa(fa);
                createBtn.disabled = false;
                createBtn.textContent = msgs.emmaBt.create;
                createBtn.click();
                return;
              } catch (e2) {
                setHostHtml(
                  host,
                  shell(
                    compact
                      ? `<span class="pb-bt-muted">${escapeHtml(e2 instanceof Error ? e2.message : msgs.emmaBt.twoFaFailed)}</span>` +
                          `<button type="button" class="pb-bt-btn pb-bt-ghost pb-bt-retry">${escapeHtml(msgs.emmaBt.retry)}</button>`
                      : `<div class="pb-bt-row"><span class="pb-bt-muted">${escapeHtml(e2 instanceof Error ? e2.message : msgs.emmaBt.twoFaFailed)}</span>` +
                          `<button type="button" class="pb-bt-btn pb-bt-ghost pb-bt-retry">${escapeHtml(msgs.emmaBt.retry)}</button></div>`,
                    compact,
                  ),
                );
                host.querySelector('.pb-bt-retry')?.addEventListener('click', () => {
                  void renderForBooking(host, bookingNumber, compact);
                });
                return;
              }
            }
          }
          setHostHtml(
            host,
            shell(
              compact
                ? `<span class="pb-bt-muted">${escapeHtml(e instanceof Error ? e.message : msgs.emmaBt.error)}</span>` +
                    `<button type="button" class="pb-bt-btn pb-bt-ghost pb-bt-retry">${escapeHtml(msgs.emmaBt.retry)}</button>`
                : `<div class="pb-bt-row"><span class="pb-bt-muted">${escapeHtml(e instanceof Error ? e.message : msgs.emmaBt.error)}</span>` +
                    `<button type="button" class="pb-bt-btn pb-bt-ghost pb-bt-retry">${escapeHtml(msgs.emmaBt.retry)}</button></div>`,
              compact,
            ),
          );
          host.querySelector('.pb-bt-retry')?.addEventListener('click', () => {
            void renderForBooking(host, bookingNumber, compact);
          });
        }
      })();
    });
  } catch (e) {
    if (gen !== renderGen) return;
    setHostHtml(
      host,
      shell(
        compact
          ? `<span class="pb-bt-muted">${escapeHtml(e instanceof Error ? e.message : msgs.emmaBt.error)}</span>` +
              `<button type="button" class="pb-bt-btn pb-bt-ghost pb-bt-retry">${escapeHtml(msgs.emmaBt.retry)}</button>`
          : `<div class="pb-bt-row"><span class="pb-bt-muted">${escapeHtml(e instanceof Error ? e.message : msgs.emmaBt.error)}</span>` +
              `<button type="button" class="pb-bt-btn pb-bt-ghost pb-bt-retry">${escapeHtml(msgs.emmaBt.retry)}</button></div>`,
        compact,
      ),
    );
    host.querySelector('.pb-bt-retry')?.addEventListener('click', () => {
      lastBooking = null;
      void renderForBooking(host, bookingNumber, compact);
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
  }, 350);
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

  if (!booking && !toolbar) {
    document.getElementById(HOST_ID)?.remove();
    document.getElementById(FALLBACK_ID)?.remove();
    lastBooking = null;
    return;
  }

  const compact = Boolean(toolbar);
  const host = toolbar ? mountInToolbar(toolbar) : mountFallbackBar();

  if (!booking) {
    setHostHtml(
      host,
      shell(
        compact
          ? `<span class="pb-bt-muted">${escapeHtml(msgs.emmaBt.noBooking)}</span>`
          : `<div class="pb-bt-row"><span class="pb-bt-muted">${escapeHtml(msgs.emmaBt.noBooking)}</span></div>`,
        compact,
      ),
    );
    lastBooking = null;
    host.dataset.bound = '';
    return;
  }

  if (booking === lastBooking && host.dataset.bound === booking && hostStillMounted(host)) {
    // Still ensure host is inside current toolbar after SAP rebuilds
    if (toolbar && !toolbar.contains(host)) {
      lastBooking = null;
    } else {
      return;
    }
  }
  lastBooking = booking;
  host.dataset.bound = booking;
  await renderForBooking(host, booking, compact);
}

export function startEmmaBernTicketWatcher() {
  void loadExtensionLocale().then((l) => {
    msgs = getMessages(l);
    lastBooking = null;
    scheduleRefresh();
  });
  watchExtensionLocale((l) => {
    msgs = getMessages(l);
    lastBooking = null;
    scheduleRefresh();
  });

  void tick();

  window.addEventListener('hashchange', () => {
    lastBooking = null;
    scheduleRefresh();
  });

  const obs = new MutationObserver((mutations) => {
    let relevant = false;
    for (const m of mutations) {
      const t = m.target;
      if (
        t instanceof Element &&
        (t.id === HOST_ID ||
          t.id === FALLBACK_ID ||
          t.id === STYLE_ID ||
          t.closest(`[data-prize-bernticket]`))
      ) {
        continue;
      }
      relevant = true;
      break;
    }
    if (!relevant) return;

    const toolbar = findCheckinToolbar();
    const host = document.getElementById(HOST_ID) || document.getElementById(FALLBACK_ID);
    if (host && !hostStillMounted(host)) lastBooking = null;
    if (toolbar && host?.id === HOST_ID && !toolbar.contains(host)) lastBooking = null;
    if (toolbar && !host) lastBooking = null;
    scheduleRefresh();
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

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
