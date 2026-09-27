/**
 * Room-assignment suggestion chip in EMMA:
 * - Inline in the empty Room field (Reservation / Check-in detail) — not in the header
 * - Compact chip in Check-in list Room column
 * Only when arrival is today and no fixed room is assigned.
 */
import { floorFromRoomNumber, formatFloorLabel } from '@housekeeping/shared';
import { api } from '../lib/api';
import { isDateToday, parseEmmaDate } from '../lib/emma-dates';
import { assignEmmaRoom } from './emma-room-assign';
import {
  getMessages,
  interpolate,
  loadExtensionLocale,
  watchExtensionLocale,
  type ExtensionMessages,
} from '../i18n';

let msgs: ExtensionMessages = getMessages('de');

const HOST_ID = 'prize-ra-host';
const STYLE_ID = 'prize-ra-style';
const ROW_ATTR = 'data-prize-room-assign';

type ApiRoomSuggestion = {
  reservationId: string;
  roomNumber: string;
  floor: number | null;
  category: string;
  bookedCategory: string;
  readyNow: boolean;
  reasons: string[];
};

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
    if (m) return m[1];
  }

  for (const el of document.querySelectorAll(
    '.sapMTitle, a.sapMLnk, [id*="ReservationDetail"] .sapMText, [id*="CheckInDetail"] .sapMText',
  )) {
    if (el.closest(`[${ROW_ATTR}]`)) continue;
    const t = (el.textContent || '').trim();
    if (/^\d{6,}$/.test(t)) return t;
  }
  return null;
}

function isVisibleEl(el: HTMLElement): boolean {
  if (el.classList.contains('sapUiHiddenPlaceholder')) return false;
  const r = el.getBoundingClientRect();
  return r.width > 2 && r.height > 2;
}

function normalizeRoomNumber(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '';
  return String(parseInt(digits, 10));
}

function isKnownHotelRoom(raw: string): boolean {
  const n = normalizeRoomNumber(raw);
  return floorFromRoomNumber(n) != null;
}

function scrapeAssignedRoom(): string | null {
  const selectors = [
    '[id*="ReservationDetail"][id*="tms.roomid.valuehelp-inner"]',
    '[id*="CheckInDetail"][id*="tms.checkin.roomid.valuehelp-inner"]',
    '[id*="tms.checkin.roomid.valuehelp-inner"]',
    '[id*="tms.roomid.valuehelp-inner"]',
    '[id*="roomid.valuehelp-inner"]',
    '[id*="roomid"] input.sapMInputBaseInner',
    '[id*="RoomId"] input.sapMInputBaseInner',
  ];
  for (const sel of selectors) {
    const input = document.querySelector<HTMLInputElement>(sel);
    const v = input?.value?.trim();
    if (v) {
      const n = normalizeRoomNumber(v);
      if (n) return n;
    }
  }
  return null;
}

function findRoomInput(): HTMLInputElement | null {
  const selectors = [
    '[id*="ReservationDetail"][id*="tms.roomid.valuehelp-inner"]',
    '[id*="CheckInDetail"][id*="tms.checkin.roomid.valuehelp-inner"]',
    '[id*="tms.checkin.roomid.valuehelp-inner"]',
    '[id*="tms.roomid.valuehelp-inner"]',
    '[id*="roomid.valuehelp-inner"]',
    '[id*="roomid"] input.sapMInputBaseInner',
    '[id*="RoomId"] input.sapMInputBaseInner',
  ];
  for (const sel of selectors) {
    const input = document.querySelector<HTMLInputElement>(sel);
    if (input && isVisibleEl(input)) return input;
  }
  for (const sel of selectors) {
    const input = document.querySelector<HTMLInputElement>(sel);
    if (input) return input;
  }
  return null;
}

/** Locate the EMMA Room smart-field control (where assigned room is shown). */
function findRoomFieldControl(): HTMLElement | null {
  const selectors = [
    '[id*="ReservationDetail"][id*="tms.roomid.valuehelp"]:not([id*="message"]):not([id*="-inner"])',
    '[id*="CheckInDetail"][id*="tms.checkin.roomid.valuehelp"]:not([id*="message"]):not([id*="-inner"])',
    '[id*="CheckInDetail"][id*="tms.roomid.valuehelp"]:not([id*="message"]):not([id*="-inner"])',
    '[id*="zey_tms_rs"][id*="tms.roomid.valuehelp"]:not([id*="message"]):not([id*="-inner"])',
    '[id$="tms.roomid.valuehelp"]',
    '[id$="tms.checkin.roomid.valuehelp"]',
  ];
  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el && isVisibleEl(el)) return el;
  }
  const input = findRoomInput();
  if (!input) return null;
  return (
    input.closest<HTMLElement>('[id*="roomid.valuehelp"]') ||
    input.closest<HTMLElement>('.sapUiCompSmartField') ||
    input.parentElement
  );
}

/** Flex item that wraps the Room input, so the chip sits beside it, not inside the 6rem control. */
function roomControlSlot(): HTMLElement | null {
  const field = findRoomFieldControl();
  if (!field) return null;
  return field.closest<HTMLElement>('.sapMFlexItem') ?? field.parentElement;
}

function fieldTextNearLabel(root: ParentNode, labelRe: RegExp): string | null {
  const labels = root.querySelectorAll('.sapMLabel, label, .sapMLabelTextWrapper, bdi');
  for (const lab of labels) {
    const labText = (lab.textContent || '').trim().replace(/:\s*$/, '');
    if (!labelRe.test(labText)) continue;
    let scope: Element | null = lab instanceof Element ? lab : null;
    for (let i = 0; i < 6 && scope; i++) {
      const candidates = scope.querySelectorAll(
        '.sapUiCompSmartFieldValue, .sapMText, input.sapMInputBaseInner, input[type="text"]',
      );
      for (const c of candidates) {
        if (lab.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) {
          const v =
            c instanceof HTMLInputElement ? c.value : (c.textContent || '');
          const cleaned = v.trim();
          if (cleaned && !labelRe.test(cleaned)) return cleaned;
        }
      }
      scope = scope.parentElement;
    }
  }
  return null;
}

function scrapeDetailArrivalIso(): string | null {
  const roots: ParentNode[] = [
    document.querySelector('[id*="CheckInDetail"]') ||
      document.querySelector('[id*="ReservationDetail"]') ||
      document.body,
  ];
  const header =
    document.querySelector('[id*="checkinheaderContent"]') ||
    document.querySelector('[id*="reservationheaderContent"]');
  if (header) roots.unshift(header);

  for (const root of roots) {
    const raw =
      fieldTextNearLabel(root, /^Arrival\s*Date$/i) ||
      fieldTextNearLabel(root, /^Arrival$/i) ||
      fieldTextNearLabel(root, /^Anreise(datum)?$/i);
    if (!raw) continue;
    const iso = parseEmmaDate(raw);
    if (iso) return iso;
  }
  return null;
}

function detailEligible(): boolean {
  if (scrapeAssignedRoom()) return false;
  const arrival = scrapeDetailArrivalIso();
  if (!arrival) return true;
  return isDateToday(arrival);
}

function formatRoomForEmma(roomNumber: string, sample?: string | null): string {
  const n = normalizeRoomNumber(roomNumber);
  if (!n) return roomNumber;
  const width = sample && /^\d+$/.test(sample.trim()) ? sample.trim().length : 4;
  return n.padStart(Math.max(width, n.length), '0');
}

const CACHE_MS = 20_000;

type PlanList = {
  at: number;
  items: Array<{ reservationId: string; suggestion: ApiRoomSuggestion | null }>;
  error: string | null;
};
let planList: PlanList | null = null;
let planInflight: Promise<PlanList> | null = null;
const detailInflight = new Set<string>();
let suggestion: ApiRoomSuggestion | null = null;
let suggestionLoading = false;
let assigning = false;

function reasonLine(reasons: string[]): string {
  const labels: Record<string, string> = {
    vip: msgs.emmaRoom.reasonVip,
    premium: msgs.emmaRoom.reasonPremium,
    repeat: msgs.emmaRoom.reasonRepeat,
    one_night: msgs.emmaRoom.reasonOneNight,
    long_stay: msgs.emmaRoom.reasonLongStay,
    three_pax: msgs.emmaRoom.reasonThreePax,
    no_basement: msgs.emmaRoom.reasonNoBasement,
    not_ready: msgs.emmaRoom.reasonNotReady,
    category_not_ready: msgs.emmaRoom.reasonCategoryNotReady,
    overbook_view: msgs.emmaRoom.reasonOverbookView,
    overbook_corner: msgs.emmaRoom.reasonOverbookCorner,
    overbook_standard: msgs.emmaRoom.reasonOverbookStandard,
    wheelchair: msgs.emmaRoom.reasonWheelchair,
  };
  return reasons
    .map((reason) => labels[reason])
    .filter((label): label is string => Boolean(label))
    .slice(0, 3)
    .join(' · ');
}

function sameReservation(a: string, b: string): boolean {
  const strip = (value: string) => value.replace(/^0+/, '') || value;
  return a === b || strip(a) === strip(b);
}

function suggestionErrorText(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  if (/401|unauthorized|invalid token|jwt/i.test(raw)) return msgs.emmaRoom.signInRequired;
  return msgs.emmaRoom.loadFailed;
}

async function loadPlanList(): Promise<PlanList> {
  const freshFor = planList?.error ? 5_000 : CACHE_MS;
  if (planList && Date.now() - planList.at < freshFor) return planList;
  if (planInflight) return planInflight;
  planInflight = (async () => {
    let next: PlanList;
    try {
      const res = await api<{ items: PlanList['items'] }>('/reservations/room-suggestions');
      next = { at: Date.now(), items: res.items ?? [], error: null };
    } catch (err) {
      next = { at: Date.now(), items: [], error: suggestionErrorText(err) };
    }
    planList = next;
    return next;
  })().finally(() => {
    planInflight = null;
  });
  return planInflight;
}

function suggestionForReservation(items: PlanList['items'], reservationId: string): ApiRoomSuggestion | null {
  return items.find((item) => sameReservation(item.reservationId, reservationId))?.suggestion ?? null;
}

function roomNumberText(cell: HTMLElement): HTMLElement | null {
  for (const el of cell.querySelectorAll<HTMLElement>('.sapMText, a.sapMLnk')) {
    if (el.closest(`[${ROW_ATTR}]`)) continue;
    return el;
  }
  return null;
}

function placeRowHost(cell: HTMLElement, host: HTMLElement) {
  const text = roomNumberText(cell);
  if (text) {
    if (text.nextElementSibling !== host) text.insertAdjacentElement('afterend', host);
    return;
  }
  const inner = cell.querySelector<HTMLElement>('.sapUiTableCellInner') || cell;
  if (host.parentElement !== inner) inner.appendChild(host);
}

function ensureRowNote(cell: HTMLElement, text: string, isError: boolean): HTMLElement {
  const textEl = roomNumberText(cell);
  let host = cell.querySelector<HTMLElement>(`[${ROW_ATTR}="row"]`);
  const placed = textEl
    ? textEl.nextElementSibling === host
    : host?.parentElement === (cell.querySelector('.sapUiTableCellInner') || cell);
  if (host && placed && host.dataset.note === text && host.dataset.error === (isError ? '1' : '0')) {
    return host;
  }
  if (!host) {
    host = document.createElement('div');
    host.setAttribute(ROW_ATTR, 'row');
  }
  placeRowHost(cell, host);
  host.dataset.error = isError ? '1' : '0';
  host.dataset.booking = '';
  host.dataset.room = '';
  host.dataset.note = text;
  host.innerHTML = '';
  const note = document.createElement('span');
  note.className = `pb-ra-row-note${isError ? ' is-error' : ''}`;
  note.textContent = text;
  note.title = text;
  host.appendChild(note);
  return host;
}

async function acceptSuggestion(row: ApiRoomSuggestion): Promise<string> {
  await assignEmmaRoom(row.reservationId, row.roomNumber);
  planList = null;
  await api(`/reservations/${encodeURIComponent(row.reservationId)}/room-suggestion/accept`, {
    method: 'POST',
    body: JSON.stringify({ roomNumber: row.roomNumber }),
  });
  planList = null;
  return row.roomNumber;
}

async function requestArrivingNow(reservationId: string): Promise<ApiRoomSuggestion | null> {
  planList = null;
  const res = await api<{ suggestion: ApiRoomSuggestion | null }>(
    `/reservations/${encodeURIComponent(reservationId)}/room-suggestion/arriving-now`,
    { method: 'POST' },
  );
  planList = null;
  return res.suggestion;
}

async function requestShift(reservationId: string, direction: 'up' | 'down'): Promise<ApiRoomSuggestion | null> {
  planList = null;
  const res = await api<{ suggestion: ApiRoomSuggestion | null }>(
    `/reservations/${encodeURIComponent(reservationId)}/room-suggestion/shift`,
    { method: 'POST', body: JSON.stringify({ direction }) },
  );
  planList = null;
  return res.suggestion;
}

function ensureStyles() {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.documentElement.appendChild(style);
  }
  if (style.dataset.v === '8') return;
  style.dataset.v = '8';
  style.textContent = `
    /* Detail: inline beside the Room input, never inside the 6rem control */
    #${HOST_ID}{
      box-sizing:border-box;
      display:inline-flex;
      flex-direction:row;
      flex-wrap:wrap;
      align-items:center;
      gap:6px;
      margin:0 0 0 8px;
      max-width:none;
      font-family:var(--sapFontFamily,"72",system-ui,-apple-system,sans-serif);
      color:#0f172a;
      background:transparent;
      border:0;
      box-shadow:none;
      padding:0;
      z-index:5;
      pointer-events:auto;
      vertical-align:middle;
    }
    #${HOST_ID} *{box-sizing:border-box;}
    #${HOST_ID} .pb-ra-top{
      display:flex;align-items:center;justify-content:space-between;gap:4px;
    }
    #${HOST_ID} .pb-ra-title{
      font-size:9px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;
      color:#475569;display:inline-flex;align-items:center;gap:4px;
    }
    #${HOST_ID} .pb-ra-dot{
      width:6px;height:6px;border-radius:999px;background:#3b6fa0;
    }
    #${HOST_ID} .pb-ra-badge{
      font-size:8px;font-weight:600;color:#64748b;background:#eef2f7;
      border-radius:999px;padding:1px 5px;white-space:nowrap;
    }
    #${HOST_ID} .pb-ra-main{
      display:flex;align-items:center;gap:6px;
    }
    #${HOST_ID} .pb-ra-room{
      font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
      font-size:16px;font-weight:800;letter-spacing:.03em;line-height:1.1;
      color:#1a2332;
    }
    #${HOST_ID} .pb-ra-meta{
      font-size:9px;color:#64748b;margin-top:1px;font-weight:500;
    }
    #${HOST_ID} .pb-ra-actions{
      display:flex;align-items:center;gap:3px;flex-shrink:0;margin-left:auto;
    }
    #${HOST_ID} .pb-ra-btn{
      appearance:none;cursor:pointer;border:1px solid #cbd5e1;background:#fff;
      width:26px;height:26px;border-radius:7px;display:inline-flex;
      align-items:center;justify-content:center;color:#1a2332;padding:0;
    }
    #${HOST_ID} .pb-ra-btn:hover{background:#f1f5f9;}
    #${HOST_ID} .pb-ra-btn.pb-ra-accept{
      background:#15803d;border-color:#15803d;color:#fff;
    }
    #${HOST_ID} .pb-ra-btn svg{width:13px;height:13px;display:block;}
    #${HOST_ID} .pb-ra-nudge{display:flex;flex-direction:column;gap:2px;}
    #${HOST_ID} .pb-ra-nudge .pb-ra-btn{width:22px;height:16px;border-radius:5px;}
    #${HOST_ID} .pb-ra-nudge .pb-ra-btn svg{width:11px;height:11px;}
    #${HOST_ID} .pb-ra-actions{display:flex;align-items:center;gap:4px;}
    #${HOST_ID} .pb-ra-menu{
      padding-top:4px;border-top:1px solid #e2e8f0;
      display:flex;flex-direction:column;gap:3px;
    }
    #${HOST_ID} .pb-ra-menu.pb-ra-hidden{display:none;}
    #${HOST_ID} .pb-ra-opt{
      appearance:none;cursor:pointer;border:1px solid #e2e8f0;background:#fff;
      border-radius:6px;padding:4px 6px;text-align:left;font-size:10px;font-weight:600;
      color:#1a2332;width:100%;
    }
    #${HOST_ID} .pb-ra-status{
      font-size:9px;font-weight:600;color:#15803d;
    }
    #${HOST_ID} .pb-ra-status.pb-ra-warn{color:#b45309;}
    #${HOST_ID} .pb-ra-note{
      font-size:12px;font-weight:650;color:#9a3412;line-height:1.25;
    }

    /* Check-in list Room column — same line as the empty room number */
    .sapUiTableDataCell:has([${ROW_ATTR}="row"]) .sapUiTableCellInner,
    .sapUiTableDataCell:has([${ROW_ATTR}="row"]) .sapMVBox{
      overflow:visible !important;
      max-height:none !important;
    }
    [${ROW_ATTR}="row"]{
      display:inline-flex !important;
      align-items:center;
      gap:0.25rem;
      margin:0;
      line-height:1.15;
      max-width:100%;
      flex-shrink:0;
      position:relative;
      z-index:20;
      pointer-events:auto;
      vertical-align:middle;
    }
    [${ROW_ATTR}="row"] .pb-ra-row-code{
      appearance:none;cursor:pointer;
      font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
      font-size:0.78rem;font-weight:800;letter-spacing:.03em;
      color:#0f172a;
      background:#dbeafe;
      border:1px solid #2563eb;
      border-radius:0.25rem;
      padding:0.15rem 0.45rem;
      white-space:nowrap;
    }
    [${ROW_ATTR}="row"] .pb-ra-row-code:hover{filter:brightness(0.97);}
    [${ROW_ATTR}="row"] .pb-ra-row-note{
      display:inline-block;max-width:9.5rem;margin-left:4px;
      font-size:10px;font-weight:650;line-height:1.2;color:#9a3412;
    }
    [${ROW_ATTR}="row"] .pb-ra-row-note.is-error{color:#9b1c1c;}
    #${HOST_ID} .pb-ra-now{
      appearance:none;cursor:pointer;border:1px solid #cbd5e1;background:#fff;
      border-radius:6px;padding:3px 6px;font-size:10px;font-weight:700;color:#1a2332;
    }
    #${HOST_ID} .pb-ra-now:hover{background:#f1f5f9;}
    [${ROW_ATTR}="row"] .pb-ra-row-code.pb-ra-dirty{background:#ffedd5;border-color:#c2410c;color:#9a3412;}
    [${ROW_ATTR}="row"] .pb-ra-row-accept{
      appearance:none;cursor:pointer;border:1px solid #15803d;background:#15803d;color:#fff;
      border-radius:0.25rem;width:1.35rem;height:1.35rem;font-size:0.75rem;font-weight:800;
      line-height:1;
    }
  `;
}

function mountInRoomField(slot: HTMLElement): HTMLElement {
  let host = document.getElementById(HOST_ID) as HTMLElement | null;
  const trapped = Boolean(host?.closest('.sapMInputBase'));
  if (host && !trapped && host.previousElementSibling === slot) return host;
  const key = host?.dataset.key;
  host?.remove();
  host = document.createElement('div');
  host.id = HOST_ID;
  host.setAttribute(ROW_ATTR, 'detail');
  host.setAttribute('role', 'region');
  host.setAttribute('aria-label', msgs.emmaRoom.title);
  if (key) host.dataset.key = key;
  slot.insertAdjacentElement('afterend', host);
  return host;
}

function iconCheck() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>`;
}

function iconArrow(direction: 'up' | 'down') {
  const path = direction === 'up' ? 'M6 14l6-6 6 6' : 'M6 10l6 6 6-6';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="${path}"/></svg>`;
}

let lastKey: string | null = null;
let refreshTimer: number | null = null;
let statusText = '';
let statusWarn = false;
let painting = false;
let tickRunning = false;
let tickQueued = false;

function applyRoomToEmma(roomNumber: string): boolean {
  const input = findRoomInput();
  if (!input) return false;
  const sample = input.value;
  const value = formatRoomForEmma(roomNumber, sample);
  input.focus();
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  input.blur();
  return true;
}

function renderHost(host: HTMLElement) {
  host.setAttribute('aria-label', msgs.emmaRoom.title);
  if (suggestionLoading && !suggestion) {
    host.innerHTML = `<div class="pb-ra-note">${escapeHtml(msgs.emmaRoom.loading)}</div>`;
    return;
  }
  if (!suggestion) {
    host.innerHTML =
      `<div class="pb-ra-note">${escapeHtml(statusText || msgs.emmaRoom.noSuggestion)}</div>`;
    return;
  }
  const floorLabel = formatFloorLabel(suggestion.floor ?? floorFromRoomNumber(suggestion.roomNumber));
  const readyLabel = suggestion.readyNow ? msgs.emmaRoom.ready : msgs.emmaRoom.dirty;
  const reasons = reasonLine(suggestion.reasons);
  const meta = [floorLabel, readyLabel, reasons].filter(Boolean).join(' · ');
  const statusHtml = statusText
    ? `<div class="pb-ra-status${statusWarn ? ' pb-ra-warn' : ''}">${escapeHtml(statusText)}</div>`
    : '';
  const accept = msgs.emmaRoom.accept;
  const higher = msgs.emmaRoom.higher;
  const lower = msgs.emmaRoom.lower;
  const arriving = msgs.emmaRoom.arrivingNow;
  host.innerHTML =
    `<div class="pb-ra-top">` +
    `<span class="pb-ra-title"><span class="pb-ra-dot" aria-hidden="true"></span>${escapeHtml(msgs.emmaRoom.title)}</span>` +
    `<span class="pb-ra-badge">${escapeHtml(readyLabel)}</span>` +
    `</div>` +
    `<div class="pb-ra-main">` +
    `<div><div class="pb-ra-room">${escapeHtml(suggestion.roomNumber)}</div>` +
    `<div class="pb-ra-meta">${escapeHtml(meta)}</div></div>` +
    `<div class="pb-ra-actions">` +
    `<div class="pb-ra-nudge">` +
    `<button type="button" class="pb-ra-btn pb-ra-up" title="${escapeAttr(higher)}" aria-label="${escapeAttr(higher)}">${iconArrow('up')}</button>` +
    `<button type="button" class="pb-ra-btn pb-ra-down" title="${escapeAttr(lower)}" aria-label="${escapeAttr(lower)}">${iconArrow('down')}</button>` +
    `</div>` +
    `<button type="button" class="pb-ra-btn pb-ra-accept" title="${escapeAttr(accept)}" aria-label="${escapeAttr(accept)}">${iconCheck()}</button>` +
    `</div></div>` +
    `<button type="button" class="pb-ra-now">${escapeHtml(arriving)}</button>` +
    statusHtml +
    `<div class="pb-ra-note">${escapeHtml(msgs.emmaRoom.previewNote)}</div>`;

  const nudge = (direction: 'up' | 'down') => {
    const booking = getBookingNumber();
    if (!booking || !suggestion || assigning) return;
    const previous = suggestion;
    assigning = true;
    suggestionLoading = true;
    renderHost(host);
    void requestShift(booking, direction)
      .then((next) => {
        suggestion = next ?? previous;
        lastKey = null;
        statusText = next ? '' : direction === 'up' ? msgs.emmaRoom.noHigher : msgs.emmaRoom.noLower;
        statusWarn = !next;
      })
      .catch((err: unknown) => {
        suggestion = previous;
        statusText = suggestionErrorText(err);
        statusWarn = true;
      })
      .finally(() => {
        assigning = false;
        suggestionLoading = false;
        renderHost(host);
        scheduleRefresh();
      });
  };
  host.querySelector('.pb-ra-up')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    nudge('up');
  });
  host.querySelector('.pb-ra-down')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    nudge('down');
  });

  host.querySelector('.pb-ra-accept')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!suggestion || assigning) return;
    const current = suggestion;
    assigning = true;
    void acceptSuggestion(current)
      .then((room) => {
        applyRoomToEmma(room);
        statusText = interpolate(msgs.emmaRoom.applied, { room });
        statusWarn = false;
        suggestion = null;
        lastKey = null;
      })
      .catch((err: unknown) => {
        statusText = err instanceof Error && err.message && err.message !== 'CSRF'
          ? `${msgs.emmaRoom.assignFailed}: ${err.message}`
          : msgs.emmaRoom.assignFailed;
        statusWarn = true;
      })
      .finally(() => {
        assigning = false;
        renderHost(host);
        scheduleRefresh();
      });
  });

  host.querySelector('.pb-ra-now')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const booking = getBookingNumber();
    if (!booking || assigning) return;
    assigning = true;
    suggestionLoading = true;
    renderHost(host);
    void requestArrivingNow(booking)
      .then((next) => {
        suggestion = next;
        lastKey = null;
        statusText = next ? '' : msgs.emmaRoom.noSuggestion;
        statusWarn = !next;
      })
      .catch((err: unknown) => {
        statusText = suggestionErrorText(err);
        statusWarn = true;
      })
      .finally(() => {
        assigning = false;
        suggestionLoading = false;
        renderHost(host);
        scheduleRefresh();
      });
  });
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

/* ---------- Check-in list ---------- */

function findCheckInListTable(): HTMLTableElement | null {
  const selectors = [
    'table[id*="CheckInList"][id*="checkInList.table-table"]',
    'table[id*="tms.checkInList.table-table"]',
    'table[id*="checkInList.table-table"]',
  ];
  for (const sel of selectors) {
    const el = document.querySelector<HTMLTableElement>(sel);
    if (el) return el;
  }
  return null;
}

type ColMap = { room: number; arrival: number };

function resolveListColumns(table: HTMLTableElement): ColMap {
  // Defaults from EMMA CheckInList layout (Reservation, Room, …, Arrival ≈ col7)
  let room = 1;
  let arrival = 7;

  const hdrTable = table
    .closest('.sapUiTableCnt')
    ?.querySelector('table.sapUiTableCHT, table[id*="-header"]');
  if (hdrTable) {
    const cells = [
      ...hdrTable.querySelectorAll('td[role="columnheader"], .sapUiTableHeaderDataCell'),
    ];
    cells.forEach((cell, i) => {
      const t = (cell.textContent || '').replace(/:/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (t === 'room' || t === 'zimmer') room = i;
      if (t === 'arrival' || t === 'anreise') arrival = i;
    });
  }

  return { room, arrival };
}

function cellByColIndex(row: HTMLElement, colIndex: number): HTMLElement | null {
  // Prefer exact col id suffix (avoid matching -col10 when looking for -col1)
  const re = new RegExp(`-col${colIndex}$`);
  for (const el of row.querySelectorAll<HTMLElement>('[id*="-col"]')) {
    if (re.test(el.id)) return el;
  }
  const cells = row.querySelectorAll<HTMLElement>('td.sapUiTableDataCell');
  return cells[colIndex] || null;
}

function bookingFromListRow(row: HTMLElement): string | null {
  const re = /-col0$/;
  let cell: HTMLElement | null = null;
  for (const el of row.querySelectorAll<HTMLElement>('[id*="-col"]')) {
    if (re.test(el.id)) {
      cell = el;
      break;
    }
  }
  if (!cell) {
    cell =
      row.querySelector<HTMLElement>('td.sapUiTableCellFirst') ||
      row.querySelector<HTMLElement>('td.sapUiTableDataCell');
  }
  if (!cell) return null;
  for (const el of cell.querySelectorAll('.sapMText, a.sapMLnk')) {
    if (el.closest(`[${ROW_ATTR}]`)) continue;
    const t = (el.textContent || '').trim();
    if (/^\d{6,}$/.test(t)) return t;
  }
  return null;
}

function roomFromListCell(cell: HTMLElement): string | null {
  // Only pure room numbers (e.g. 0028 / 410). Never scrape digits from codes like BSTD----1K.
  for (const el of cell.querySelectorAll('.sapMText, a.sapMLnk')) {
    if (el.closest(`[${ROW_ATTR}]`)) continue;
    const t = (el.textContent || '').trim();
    if (!/^\d{1,4}$/.test(t)) continue;
    if (isKnownHotelRoom(t)) return normalizeRoomNumber(t);
  }
  return null;
}

function arrivalFromListCell(cell: HTMLElement): string | null {
  // Prefer the date line (e.g. "Sep 26, 2026"), not the time ObjStatus
  for (const el of cell.querySelectorAll('.sapMText')) {
    const t = (el.textContent || '').trim();
    const iso = parseEmmaDate(t);
    if (iso) return iso;
  }
  return parseEmmaDate((cell.textContent || '').trim());
}

/** Prefer Arrival column; fall back to any parseable date in the row. */
function arrivalIsoFromRow(row: HTMLElement, arrivalCell: HTMLElement | null): string | null {
  if (arrivalCell) {
    const iso = arrivalFromListCell(arrivalCell);
    if (iso) return iso;
  }
  for (const el of row.querySelectorAll('.sapMText')) {
    if (el.closest(`[${ROW_ATTR}]`)) continue;
    const iso = parseEmmaDate((el.textContent || '').trim());
    if (iso) return iso;
  }
  return null;
}

function ensureRowChip(cell: HTMLElement, rowSuggestion: ApiRoomSuggestion): HTMLElement {
  const booking = rowSuggestion.reservationId;
  const roomNumber = rowSuggestion.roomNumber;

  let host = cell.querySelector<HTMLElement>(`[${ROW_ATTR}="row"]`);
  const text = roomNumberText(cell);
  if (
    host &&
    host.dataset.booking === booking &&
    host.dataset.room === roomNumber &&
    host.dataset.ready === String(rowSuggestion.readyNow) &&
    text?.nextElementSibling === host
  ) {
    return host;
  }
  if (!host) {
    host = document.createElement('div');
    host.setAttribute(ROW_ATTR, 'row');
  }
  placeRowHost(cell, host);
  host.dataset.booking = booking;
  host.dataset.room = roomNumber;
  host.dataset.ready = String(rowSuggestion.readyNow);

  host.innerHTML = '';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `pb-ra-row-code${rowSuggestion.readyNow ? '' : ' pb-ra-dirty'}`;
  const display = roomNumber.padStart(4, '0');
  btn.textContent = display;
  const reason = reasonLine(rowSuggestion.reasons);
  btn.title = [msgs.emmaRoom.title, display, rowSuggestion.readyNow ? msgs.emmaRoom.ready : msgs.emmaRoom.dirty, reason]
    .filter(Boolean)
    .join(' · ');
  btn.setAttribute('aria-label', btn.title);
  const accept = document.createElement('button');
  accept.type = 'button';
  accept.className = 'pb-ra-row-accept';
  accept.textContent = '✓';
  accept.title = msgs.emmaRoom.accept;
  accept.setAttribute('aria-label', msgs.emmaRoom.accept);
  accept.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (assigning) return;
    assigning = true;
    void acceptSuggestion(rowSuggestion)
      .then(() => {
        const text = cell.querySelector<HTMLElement>('.sapMText, a.sapMLnk');
        if (text && !text.closest(`[${ROW_ATTR}]`)) text.textContent = display;
        host?.remove();
      })
      .catch(() => {
        btn.title = msgs.emmaRoom.assignFailed;
      })
      .finally(() => {
        assigning = false;
      });
  });
  host.appendChild(btn);
  host.appendChild(accept);
  return host;
}

function isCheckInListPage(): boolean {
  return Boolean(
    document.querySelector(
      '[id*="CheckInList"], [id*="checkInList.table"], [id*="tms.checkInList"]',
    ),
  );
}

async function scanCheckInList() {
  const table = findCheckInListTable();
  if (!table) {
    if (!isCheckInListPage()) {
      document.querySelectorAll(`[${ROW_ATTR}="row"]`).forEach((el) => el.remove());
    }
    return;
  }

  const cols = resolveListColumns(table);
  const rows = table.querySelectorAll<HTMLElement>(
    'tbody tr.sapUiTableContentRow, tbody tr.sapUiTableTr',
  );
  const rowSet = new Set(rows);
  const seen = new Set<HTMLElement>();
  const usedRooms = new Set<string>();
  const plan = await loadPlanList();

  for (const row of rows) {
    const booking = bookingFromListRow(row);
    if (!booking) continue;

    const roomCell = cellByColIndex(row, cols.room);
    const arrivalCell = cellByColIndex(row, cols.arrival);
    if (!roomCell) continue;

    const fixed = roomFromListCell(roomCell);
    const existing = roomCell.querySelector<HTMLElement>(`[${ROW_ATTR}="row"]`);

    if (fixed) {
      existing?.remove();
      continue;
    }

    const arrivalIso = arrivalIsoFromRow(row, arrivalCell);
    if (arrivalIso && !isDateToday(arrivalIso)) {
      existing?.remove();
      continue;
    }

    if (plan.error) {
      seen.add(ensureRowNote(roomCell, plan.error, true));
      continue;
    }

    const item = plan.items.find((rowItem) => sameReservation(rowItem.reservationId, booking));
    const roomKey = item?.suggestion ? item.suggestion.roomNumber.replace(/^0+/, '') : '';
    if (!item?.suggestion || (roomKey && usedRooms.has(roomKey))) {
      if (item) seen.add(ensureRowNote(roomCell, msgs.emmaRoom.noSuggestion, false));
      else existing?.remove();
      continue;
    }
    usedRooms.add(roomKey);

    seen.add(ensureRowChip(roomCell, item.suggestion));
  }

  document.querySelectorAll(`[${ROW_ATTR}="row"]`).forEach((el) => {
    if (!(el instanceof HTMLElement) || seen.has(el)) return;
    const row = el.closest('tr.sapUiTableContentRow, tr.sapUiTableTr');
    if (!row || !rowSet.has(row as HTMLElement)) el.remove();
  });
}

function clearDetailHost() {
  document.getElementById(HOST_ID)?.remove();
  lastKey = null;
  suggestion = null;
  suggestionLoading = false;
  statusText = '';
  statusWarn = false;
}

async function tickDetail() {
  const booking = getBookingNumber();
  const slot = roomControlSlot();

  if (!slot || !booking) {
    clearDetailHost();
    return;
  }

  if (!detailEligible()) {
    clearDetailHost();
    return;
  }

  const alreadyPlaced =
    document.getElementById(HOST_ID)?.previousElementSibling === slot &&
    !document.getElementById(HOST_ID)?.closest('.sapMInputBase');
  const host = mountInRoomField(slot);
  const key = booking;
  if (!alreadyPlaced && host.dataset.key === key) renderHost(host);
  if (host.dataset.key === key || detailInflight.has(key)) return;
  detailInflight.add(key);
  const bookingChanged = lastKey !== key;
  lastKey = key;
  if (bookingChanged) {
    statusText = '';
    statusWarn = false;
  }
  suggestionLoading = true;
  renderHost(host);
  try {
    const plan = await loadPlanList();
    if (lastKey !== key) return;
    if (plan.error) {
      suggestion = null;
      statusText = plan.error;
      statusWarn = true;
    } else {
      suggestion = suggestionForReservation(plan.items, booking);
      if (!suggestion) {
        statusText = msgs.emmaRoom.noSuggestion;
        statusWarn = true;
      }
    }
    host.dataset.key = key;
  } catch (err) {
    if (lastKey !== key) return;
    suggestion = null;
    statusText = suggestionErrorText(err);
    statusWarn = true;
    host.dataset.key = key;
  } finally {
    suggestionLoading = false;
    detailInflight.delete(key);
  }
  if (lastKey === key) renderHost(host);
}

async function tick() {
  if (tickRunning) {
    tickQueued = true;
    return;
  }
  tickRunning = true;
  painting = true;
  try {
    if (!isLikelyEmmaPage()) {
      clearDetailHost();
      document.querySelectorAll(`[${ROW_ATTR}="row"]`).forEach((el) => el.remove());
      return;
    }

    ensureStyles();
    await scanCheckInList();
    await tickDetail();
  } finally {
    tickRunning = false;
    window.setTimeout(() => {
      painting = false;
      if (tickQueued) {
        tickQueued = false;
        scheduleRefresh();
      }
    }, 0);
  }
}

function scheduleRefresh() {
  if (refreshTimer) window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    void tick();
  }, 350);
}

export function startEmmaRoomSuggestWatcher() {
  void loadExtensionLocale().then((l) => {
    msgs = getMessages(l);
    lastKey = null;
    scheduleRefresh();
  });
  watchExtensionLocale((l) => {
    msgs = getMessages(l);
    lastKey = null;
    scheduleRefresh();
  });

  void tick();

  window.addEventListener('hashchange', () => {
    lastKey = null;
    suggestion = null;
    document.getElementById(HOST_ID)?.removeAttribute('data-key');
    scheduleRefresh();
  });

  const obs = new MutationObserver((mutations) => {
    if (painting) return;
    for (const m of mutations) {
      const t = m.target;
      if (
        t instanceof Element &&
        (t.id === HOST_ID || t.id === STYLE_ID || t.closest(`[${ROW_ATTR}]`))
      ) {
        continue;
      }
      const added = [...m.addedNodes];
      if (
        added.length > 0 &&
        added.every(
          (node) =>
            node instanceof Element &&
            (node.id === HOST_ID || node.id === STYLE_ID || node.hasAttribute(ROW_ATTR)),
        )
      ) {
        continue;
      }
      scheduleRefresh();
      return;
    }
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  return () => {
    obs.disconnect();
    if (refreshTimer) window.clearTimeout(refreshTimer);
    clearDetailHost();
    document.querySelectorAll(`[${ROW_ATTR}="row"]`).forEach((el) => el.remove());
    document.getElementById(STYLE_ID)?.remove();
  };
}
