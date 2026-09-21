/**
 * Injects BernTicket into EMMA check-in footer toolbar (centered).
 * When that leiste is missing (e.g. reservation detail), shows a small fixed
 * chip at the bottom so the activation code is always visible for a booking.
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
const DIALOG_ID = 'prize-bt-create-dialog';

function isLikelyEmmaPage(): boolean {
  if (/ReservationId=/i.test(window.location.hash)) return true;
  if (document.querySelector('.sapUiBody, .sapMShell, [data-sap-ui-area]')) return true;
  return /emma|radisson|sapui5|fiori/i.test(window.location.hostname + window.location.href);
}

function getBookingNumber(): string | null {
  const haystack = `${window.location.hash}\n${window.location.href}\n${document.title}`;
  const patterns = [
    /ReservationId='(\d+)'/i,
    /ReservationId=(\d+)/i,
    /reservationId[=:]['"]?(\d+)/i,
  ];
  for (const re of patterns) {
    const m = haystack.match(re);
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

/** Only the real check-in footer — not generic ObjectPage footers on reservation detail. */
function findCheckinToolbar(): HTMLElement | null {
  const selectors = [
    '[id$="tms.checkinToolbar"]',
    '[id*="tms.checkinToolbar"]',
    '[id*="CheckInDetail"][id*="checkinToolbar" i]',
    '[id*="CheckInDetail"][id*="CheckinToolbar" i]',
    '[id*="checkinToolbar"]',
  ];
  for (const sel of selectors) {
    try {
      const el = document.querySelector<HTMLElement>(sel);
      if (el) return el;
    } catch {
      // some engines reject "i" in attribute selectors
    }
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
    /* Center BernTicket in the toolbar flex spacer */
    .sapMTBSpacer:has(#${HOST_ID}),
    .sapMTBSpacerFlex:has(#${HOST_ID}){
      display:flex !important;
      align-items:center !important;
      justify-content:center !important;
      min-width:0 !important;
    }

    /* Native-looking toolbar child — no extension “card” chrome */
    #${HOST_ID}.sapMBarChild,
    #${HOST_ID}{
      box-sizing:border-box;
      display:inline-flex !important;
      align-items:center !important;
      justify-content:center !important;
      gap:0.5rem !important;
      margin:0 !important;
      padding:0 !important;
      background:transparent !important;
      border:none !important;
      box-shadow:none !important;
      border-radius:0 !important;
      max-width:none !important;
      flex:0 0 auto !important;
      font-family:var(--sapFontFamily,"72",Arial,Helvetica,sans-serif);
      font-size:var(--sapFontSize,0.875rem);
      color:var(--sapContent_LabelColor,#6a6d70);
      vertical-align:middle;
      white-space:nowrap;
      pointer-events:auto;
      z-index:1;
    }
    #${HOST_ID} *{box-sizing:border-box;}
    #${HOST_ID} .pb-bt-label{
      font-family:inherit;font-size:inherit;font-weight:normal;
      color:var(--sapContent_LabelColor,#6a6d70);
      margin:0;padding:0;border:0;background:transparent;
    }
    #${HOST_ID} .pb-bt-code{
      appearance:none;cursor:pointer;
      font-family:var(--sapFontFamily,"72",Arial,Helvetica,sans-serif);
      font-size:var(--sapFontSize,0.875rem);font-weight:700;
      letter-spacing:.04em;line-height:1.2;
      color:var(--sapIndicationColor_3,#aa0808);
      background:var(--sapIndicationColor_3_Background,#ffebeb);
      border:1px solid var(--sapIndicationColor_3_BorderColor,#f5c1c1);
      border-radius:0.25rem;
      padding:0.35rem 0.6rem;
      min-width:0;text-align:center;
    }
    #${HOST_ID} .pb-bt-code:hover{
      filter:brightness(0.97);
    }
    #${HOST_ID} .pb-bt-code.pb-bt-copied-flash{
      color:var(--sapPositiveColor,#256f3a);
      background:var(--sapPositiveBackground,#f5fae5);
      border-color:var(--sapPositiveBorderColor,#99cc33);
    }
    #${HOST_ID} .pb-bt-muted{
      font-size:inherit;color:var(--sapContent_LabelColor,#6a6d70);
    }
    /* SAP-like ghost / default toolbar button */
    #${HOST_ID} .pb-bt-btn{
      appearance:none;cursor:pointer;
      font-family:inherit;font-size:inherit;font-weight:600;
      height:2.25rem;padding:0 0.75rem;
      border-radius:0.375rem;
      border:1px solid var(--sapButton_Lite_BorderColor,#0854a0);
      background:var(--sapButton_Lite_Background,transparent);
      color:var(--sapButton_Lite_TextColor,#0854a0);
    }
    #${HOST_ID} .pb-bt-btn:hover{
      background:var(--sapButton_Lite_Hover_Background,#ebf5fe);
    }
    #${HOST_ID} .pb-bt-btn:disabled{opacity:.5;cursor:not-allowed}

    /* Compact bottom chip when check-in toolbar is absent (e.g. reservation detail) */
    #${FALLBACK_ID}{
      position:fixed;left:50%;bottom:0.65rem;transform:translateX(-50%);
      z-index:2147483000;
      display:inline-flex;align-items:center;gap:0.35rem;
      padding:0.2rem 0.45rem;
      font-family:var(--sapFontFamily,"72",Arial,Helvetica,sans-serif);
      font-size:0.75rem;
      line-height:1.2;
      color:#6a6d70;
      background:rgba(255,255,255,.96);
      border:1px solid #d9d9d9;
      border-radius:0.25rem;
      box-shadow:0 0.1rem 0.35rem rgba(0,0,0,.1);
      pointer-events:auto;
      white-space:nowrap;
    }
    #${FALLBACK_ID} .pb-bt-label{font-size:inherit;color:#6a6d70;}
    #${FALLBACK_ID} .pb-bt-muted{font-size:inherit;color:#6a6d70;}
    #${FALLBACK_ID} .pb-bt-code{
      appearance:none;cursor:pointer;font-weight:700;letter-spacing:.04em;
      font-size:0.75rem;line-height:1.2;
      color:#aa0808;background:#ffebeb;border:1px solid #f5c1c1;
      border-radius:0.2rem;padding:0.15rem 0.4rem;
    }
    #${FALLBACK_ID} .pb-bt-code.pb-bt-copied-flash{
      color:#256f3a;background:#f5fae5;border-color:#99cc33;
    }
    #${FALLBACK_ID} .pb-bt-btn{
      appearance:none;cursor:pointer;font-weight:600;
      font-size:0.75rem;height:1.55rem;padding:0 0.5rem;border-radius:0.25rem;
      border:1px solid #0854a0;background:transparent;color:#0854a0;
    }

    /* Create dialog — Fiori-like modal, not toolbar cramped form */
    #${DIALOG_ID}{
      position:fixed;inset:0;z-index:2147483646;
      display:flex;align-items:center;justify-content:center;
      padding:1rem;
      font-family:var(--sapFontFamily,"72",Arial,Helvetica,sans-serif);
    }
    #${DIALOG_ID} .pb-bt-dlg-backdrop{
      position:absolute;inset:0;background:rgba(0,0,0,.45);
    }
    #${DIALOG_ID} .pb-bt-dlg{
      position:relative;z-index:1;
      width:min(420px,100%);
      background:var(--sapGroup_ContentBackground,#fff);
      border:1px solid var(--sapGroup_ContentBorderColor,#d9d9d9);
      border-radius:0.5rem;
      box-shadow:0 0.625rem 1.875rem rgba(0,0,0,.25);
      overflow:hidden;
      color:var(--sapTextColor,#32363a);
    }
    #${DIALOG_ID} .pb-bt-dlg-head{
      display:flex;align-items:center;justify-content:space-between;
      gap:0.75rem;padding:0.75rem 1rem;
      background:var(--sapPageHeader_Background,#fff);
      border-bottom:1px solid var(--sapPageHeader_BorderColor,#d9d9d9);
    }
    #${DIALOG_ID} .pb-bt-dlg-head h2{
      margin:0;font-size:1rem;font-weight:700;color:var(--sapPageHeader_TextColor,#32363a);
    }
    #${DIALOG_ID} .pb-bt-dlg-x{
      appearance:none;border:0;background:transparent;cursor:pointer;
      font-size:1.25rem;line-height:1;color:#6a6d70;padding:0.15rem 0.35rem;
    }
    #${DIALOG_ID} .pb-bt-dlg-body{padding:1rem;display:flex;flex-direction:column;gap:0.75rem;}
    #${DIALOG_ID} .pb-bt-dlg-field{display:flex;flex-direction:column;gap:0.25rem;}
    #${DIALOG_ID} .pb-bt-dlg-field label{
      font-size:0.75rem;font-weight:600;color:var(--sapContent_LabelColor,#6a6d70);
    }
    #${DIALOG_ID} .pb-bt-dlg-field input{
      height:2.25rem;padding:0 0.5rem;font-size:0.875rem;
      border:1px solid var(--sapField_BorderColor,#89919a);
      border-radius:0.25rem;background:var(--sapField_Background,#fff);
      color:var(--sapField_TextColor,#32363a);
    }
    #${DIALOG_ID} .pb-bt-dlg-row{display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;}
    #${DIALOG_ID} .pb-bt-dlg-err{font-size:0.8125rem;color:#aa0808;}
    #${DIALOG_ID} .pb-bt-dlg-foot{
      display:flex;justify-content:flex-end;gap:0.5rem;
      padding:0.75rem 1rem;border-top:1px solid #d9d9d9;
      background:#f7f7f7;
    }
    #${DIALOG_ID} .pb-bt-dlg-foot .pb-bt-btn-ghost{
      appearance:none;cursor:pointer;height:2.25rem;padding:0 0.9rem;
      border-radius:0.375rem;font-weight:600;font-size:0.875rem;
      border:1px solid #0854a0;background:#fff;color:#0854a0;
    }
    #${DIALOG_ID} .pb-bt-dlg-foot .pb-bt-btn-accept{
      appearance:none;cursor:pointer;height:2.25rem;padding:0 0.9rem;
      border-radius:0.375rem;font-weight:600;font-size:0.875rem;
      border:1px solid #256f3a;background:#256f3a;color:#fff;
    }
    #${DIALOG_ID} .pb-bt-dlg-foot .pb-bt-btn-accept:disabled{opacity:.55;cursor:not-allowed;}
  `;
  document.documentElement.appendChild(style);
}

function closeCreateDialog() {
  document.getElementById(DIALOG_ID)?.remove();
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
  host.setAttribute('aria-label', msgs.emmaBt.brand);

  // Prefer flex spacer so the control sits visually centered in the footer bar.
  const spacer =
    toolbar.querySelector<HTMLElement>('.sapMTBSpacer.sapMTBSpacerFlex') ||
    toolbar.querySelector<HTMLElement>('.sapMTBSpacer');
  if (spacer) {
    spacer.appendChild(host);
  } else {
    host.className = 'sapMBarChild';
    const checkIn =
      toolbar.querySelector('.sapMBtnAccept')?.closest('.sapMBtn, button') ||
      [...toolbar.querySelectorAll('button.sapMBtn, .sapMBtn')].find((b) =>
        /check\s*in/i.test(b.textContent || ''),
      );
    if (checkIn && checkIn.parentElement === toolbar) {
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
  host.setAttribute('aria-label', msgs.emmaBt.brand);
  document.documentElement.appendChild(host);
  return host;
}

function setHostHtml(host: HTMLElement, html: string) {
  host.innerHTML = html;
}

function shellToolbar(inner: string): string {
  return `<span class="pb-bt-label">${escapeHtml(msgs.emmaBt.brand)}</span>${inner}`;
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
  btn?.addEventListener('click', () => {
    void copyText(code).then(() => {
      if (!btn.isConnected) return;
      const prev = btn.textContent;
      btn.textContent = msgs.emmaBt.copied;
      btn.classList.add('pb-bt-copied-flash');
      window.setTimeout(() => {
        if (!btn.isConnected) return;
        btn.textContent = prev;
        btn.classList.remove('pb-bt-copied-flash');
      }, 1000);
    });
  });
}

function openCreateDialog(
  host: HTMLElement,
  bookingNumber: string,
  defaults: CreateDefaults,
  onCreated: (code: string | null) => void,
) {
  closeCreateDialog();
  const root = document.createElement('div');
  root.id = DIALOG_ID;
  root.setAttribute('data-prize-bernticket', '1');
  root.innerHTML =
    `<div class="pb-bt-dlg-backdrop" data-close="1"></div>` +
    `<div class="pb-bt-dlg" role="dialog" aria-modal="true" aria-label="${escapeAttr(msgs.emmaBt.createDialogTitle)}">` +
    `<div class="pb-bt-dlg-head"><h2>${escapeHtml(msgs.emmaBt.createDialogTitle)}</h2>` +
    `<button type="button" class="pb-bt-dlg-x" data-close="1" aria-label="${escapeAttr(msgs.emmaBt.cancel)}">×</button></div>` +
    `<div class="pb-bt-dlg-body">` +
    `<div class="pb-bt-dlg-field"><label>${escapeHtml(msgs.emmaBt.bookingLabel)}</label>` +
    `<input class="pb-bt-dlg-booking" value="${escapeAttr(defaults.bookingNumber)}" readonly /></div>` +
    `<div class="pb-bt-dlg-field"><label>${escapeHtml(msgs.emmaBt.guestNamePlaceholder)}</label>` +
    `<input class="pb-bt-dlg-name" value="${escapeAttr(defaults.guestName)}" /></div>` +
    `<div class="pb-bt-dlg-row">` +
    `<div class="pb-bt-dlg-field"><label>${escapeHtml(msgs.emmaBt.arrival)}</label>` +
    `<input class="pb-bt-dlg-from" type="date" value="${escapeAttr(defaults.from)}" /></div>` +
    `<div class="pb-bt-dlg-field"><label>${escapeHtml(msgs.emmaBt.departure)}</label>` +
    `<input class="pb-bt-dlg-to" type="date" value="${escapeAttr(defaults.to)}" /></div>` +
    `</div>` +
    `<div class="pb-bt-dlg-field"><label>${escapeHtml(msgs.emmaBt.persons)}</label>` +
    `<input class="pb-bt-dlg-amt" type="number" min="1" value="${defaults.ticketsAmount}" /></div>` +
    `<div class="pb-bt-dlg-err" hidden></div>` +
    `</div>` +
    `<div class="pb-bt-dlg-foot">` +
    `<button type="button" class="pb-bt-btn-ghost" data-close="1">${escapeHtml(msgs.emmaBt.cancel)}</button>` +
    `<button type="button" class="pb-bt-btn-accept pb-bt-dlg-submit">${escapeHtml(msgs.emmaBt.create)}</button>` +
    `</div></div>`;

  document.documentElement.appendChild(root);

  const errEl = root.querySelector('.pb-bt-dlg-err') as HTMLElement;
  const submit = root.querySelector('.pb-bt-dlg-submit') as HTMLButtonElement;

  root.querySelectorAll('[data-close="1"]').forEach((el) => {
    el.addEventListener('click', () => closeCreateDialog());
  });

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeCreateDialog();
      window.removeEventListener('keydown', onKey);
    }
  };
  window.addEventListener('keydown', onKey);

  submit.addEventListener('click', () => {
    void (async () => {
      const nameEl = root.querySelector('.pb-bt-dlg-name') as HTMLInputElement;
      const fromEl = root.querySelector('.pb-bt-dlg-from') as HTMLInputElement;
      const toEl = root.querySelector('.pb-bt-dlg-to') as HTMLInputElement;
      const amtEl = root.querySelector('.pb-bt-dlg-amt') as HTMLInputElement;
      const guestName = nameEl?.value.trim() || '';
      if (!guestName) {
        errEl.hidden = false;
        errEl.textContent = msgs.emmaBt.guestNameMissing;
        return;
      }
      submit.disabled = true;
      submit.textContent = msgs.common.ellipsis;
      errEl.hidden = true;
      try {
        const created = await btCreateTicket({
          guestName,
          bookingNumber,
          validFrom: toDateInputValue(fromEl?.value || defaults.from),
          validTo: toDateInputValue(toEl?.value || defaults.to),
          ticketsAmount: Math.max(
            1,
            parseInt(amtEl?.value || String(defaults.ticketsAmount), 10) || defaults.ticketsAmount,
          ),
        });
        closeCreateDialog();
        onCreated(getActivationCode(created));
      } catch (e) {
        if (e instanceof BtApiError && e.code === BERN_TICKET_2FA_REQUIRED) {
          const fa = window.prompt(msgs.emmaBt.twoFaPrompt);
          if (fa) {
            try {
              await btComplete2fa(fa);
              submit.disabled = false;
              submit.textContent = msgs.emmaBt.create;
              submit.click();
              return;
            } catch (e2) {
              errEl.hidden = false;
              errEl.textContent = e2 instanceof Error ? e2.message : msgs.emmaBt.twoFaFailed;
              submit.disabled = false;
              submit.textContent = msgs.emmaBt.create;
              return;
            }
          }
        }
        errEl.hidden = false;
        errEl.textContent = e instanceof Error ? e.message : msgs.emmaBt.error;
        submit.disabled = false;
        submit.textContent = msgs.emmaBt.create;
      }
    })();
  });

  // Keep host button available; dialog is independent of cramped toolbar.
  void host;
}

let lastBooking: string | null = null;
let refreshTimer: number | null = null;
let renderGen = 0;

async function renderForBooking(host: HTMLElement, bookingNumber: string, _compact: boolean) {
  const gen = ++renderGen;
  const tokens = await getBtTokens();
  if (gen !== renderGen) return;

  if (!tokens.access) {
    setHostHtml(
      host,
      shellToolbar(`<span class="pb-bt-muted">${escapeHtml(msgs.emmaBt.loginHint)}</span>`),
    );
    return;
  }

  setHostHtml(
    host,
    shellToolbar(`<span class="pb-bt-muted">${escapeHtml(msgs.emmaBt.loading)}</span>`),
  );

  try {
    const tickets = await btSearchTickets(bookingNumber);
    if (gen !== renderGen) return;
    const ticket = pickTicketForBooking(tickets, bookingNumber);
    const code = getActivationCode(ticket);
    const copyTitle = msgs.bernticket.copyCode;

    if (ticket && code) {
      setHostHtml(
        host,
        shellToolbar(
          `<button type="button" class="pb-bt-code" title="${escapeAttr(copyTitle)}">${escapeHtml(code)}</button>`,
        ),
      );
      bindCodeCopy(host, code);
      return;
    }

    if (ticket && !code) {
      const noCode = interpolate(msgs.emmaBt.noCode, { status: ticket.status });
      setHostHtml(host, shellToolbar(`<span class="pb-bt-muted">${escapeHtml(noCode)}</span>`));
      return;
    }

    const defaults = scrapeCreateDefaults(bookingNumber);
    setHostHtml(
      host,
      shellToolbar(
        `<button type="button" class="pb-bt-btn pb-bt-open-create">${escapeHtml(msgs.emmaBt.openCreate)}</button>`,
      ),
    );
    host.querySelector('.pb-bt-open-create')?.addEventListener('click', () => {
      openCreateDialog(host, bookingNumber, defaults, (newCode) => {
        if (newCode) {
          setHostHtml(
            host,
            shellToolbar(
              `<button type="button" class="pb-bt-code" title="${escapeAttr(copyTitle)}">${escapeHtml(newCode)}</button>`,
            ),
          );
          bindCodeCopy(host, newCode);
        } else {
          lastBooking = null;
          void renderForBooking(host, bookingNumber, true);
        }
      });
    });
  } catch (e) {
    if (gen !== renderGen) return;
    setHostHtml(
      host,
      shellToolbar(
        `<span class="pb-bt-muted">${escapeHtml(e instanceof Error ? e.message : msgs.emmaBt.error)}</span>` +
          `<button type="button" class="pb-bt-btn pb-bt-retry">${escapeHtml(msgs.emmaBt.retry)}</button>`,
      ),
    );
    host.querySelector('.pb-bt-retry')?.addEventListener('click', () => {
      lastBooking = null;
      void renderForBooking(host, bookingNumber, true);
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
    closeCreateDialog();
    lastBooking = null;
    return;
  }

  ensureStyles();
  const booking = getBookingNumber();
  const toolbar = findCheckinToolbar();

  // Always show the code for a reservation — in the check-in leiste when present,
  // otherwise as a small fixed chip at the bottom (reservation overview etc.).
  if (!booking) {
    document.getElementById(HOST_ID)?.remove();
    document.getElementById(FALLBACK_ID)?.remove();
    lastBooking = null;
    return;
  }

  const compact = Boolean(toolbar);
  const expectedHostId = toolbar ? HOST_ID : FALLBACK_ID;
  const host = toolbar ? mountInToolbar(toolbar) : mountFallbackBar();

  if (
    booking === lastBooking &&
    host.dataset.bound === booking &&
    host.id === expectedHostId &&
    hostStillMounted(host)
  ) {
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
          t.id === DIALOG_ID ||
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
    if (toolbar && host?.id === FALLBACK_ID) lastBooking = null;
    if (!toolbar && host?.id === HOST_ID) lastBooking = null;
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
    closeCreateDialog();
  };
}
