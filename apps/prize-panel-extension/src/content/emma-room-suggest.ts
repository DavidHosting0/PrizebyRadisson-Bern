/**
 * Room-assignment suggestion chip in EMMA:
 * - Inline in the empty Room field (Reservation / Check-in detail) — not in the header
 * - Compact chip in Check-in list Room column
 * Only when arrival is today and no fixed room is assigned.
 */
import {
  allHotelRoomNumbers,
  compareRoomNumbers,
  floorFromRoomNumber,
  formatFloorLabel,
} from '@housekeeping/shared';
import { isDateToday, parseEmmaDate } from '../lib/emma-dates';
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

type SuggestKind = 'default' | 'higher' | 'lower' | 'extra_bed';

type RoomSuggestion = {
  roomNumber: string;
  floor: number | null;
  kind: SuggestKind;
  label: string;
};

const HOTEL_ROOMS = allHotelRoomNumbers().sort(compareRoomNumbers);
const HOTEL_ROOM_SET = new Set(HOTEL_ROOMS);

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

  for (const el of document.querySelectorAll(
    '.sapMTitle, a.sapMLnk, [id*="ReservationDetail"] .sapMText, [id*="CheckInDetail"] .sapMText',
  )) {
    if (el.closest(`[${ROW_ATTR}]`)) continue;
    const t = (el.textContent || '').trim();
    if (/^\d{6,}$/.test(t)) return t.replace(/^0+/, '') || t;
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
  return Boolean(n && HOTEL_ROOM_SET.has(n));
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

/**
 * Mount parent: wrap next to / inside the room value area so it sits where
 * EMMA would show the assigned room — never in the page header.
 */
function findRoomFieldMountParent(): HTMLElement | null {
  const field = findRoomFieldControl();
  if (!field) return null;

  // Prefer the flex/content cell that holds the input value
  const content =
    field.querySelector<HTMLElement>('.sapUiCompSmartFieldValue') ||
    field.querySelector<HTMLElement>('.sapMInputBaseContentWrapper') ||
    field.querySelector<HTMLElement>('.sapMInput') ||
    field;

  // Climb to a stable VBox cell that contains Room label + value if possible
  let el: HTMLElement | null = content;
  for (let i = 0; i < 6 && el; i++) {
    if (
      el.classList.contains('sapUiVltCell') ||
      el.classList.contains('sapMVBox') ||
      el.classList.contains('sapMHBox')
    ) {
      return el;
    }
    el = el.parentElement;
  }
  return content;
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
  // If we cannot read arrival on this view, still allow when room empty + booking known
  // only when arrival parses as today; unknown arrival → hide (strict per plan)
  return isDateToday(arrival);
}

function formatRoomForEmma(roomNumber: string, sample?: string | null): string {
  const n = normalizeRoomNumber(roomNumber);
  if (!n) return roomNumber;
  const width = sample && /^\d+$/.test(sample.trim()) ? sample.trim().length : 4;
  return n.padStart(Math.max(width, n.length), '0');
}

function roomIndex(roomNumber: string): number {
  const n = normalizeRoomNumber(roomNumber);
  return HOTEL_ROOMS.findIndex((r) => r === n);
}

function mockSuggest(
  bookingNumber: string | null,
  kind: SuggestKind,
  current?: string | null,
): RoomSuggestion {
  const assigned = current ? normalizeRoomNumber(current) : null;
  let idx = 0;
  if (assigned) {
    const a = roomIndex(assigned);
    if (a >= 0) idx = a;
  } else if (bookingNumber) {
    const seed = [...bookingNumber].reduce((s, c) => s + c.charCodeAt(0), 0);
    idx = seed % HOTEL_ROOMS.length;
  }

  if (kind === 'higher') {
    idx = Math.min(HOTEL_ROOMS.length - 1, idx + 1);
  } else if (kind === 'lower') {
    idx = Math.max(0, idx - 1);
  } else if (kind === 'extra_bed') {
    idx = Math.min(HOTEL_ROOMS.length - 1, idx + 2);
  }

  const roomNumber = HOTEL_ROOMS[idx] || '101';
  const floor = floorFromRoomNumber(roomNumber);
  const labels: Record<SuggestKind, string> = {
    default: msgs.emmaRoom.labelDefault,
    higher: msgs.emmaRoom.labelHigher,
    lower: msgs.emmaRoom.labelLower,
    extra_bed: msgs.emmaRoom.labelExtraBed,
  };
  return { roomNumber, floor, kind, label: labels[kind] };
}

function ensureStyles() {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.documentElement.appendChild(style);
  }
  if (style.dataset.v === '3') return;
  style.dataset.v = '3';
  style.textContent = `
    /* Detail: compact chip inline at the Room field */
    #${HOST_ID}{
      box-sizing:border-box;
      display:inline-flex;
      flex-direction:column;
      gap:4px;
      margin:2px 0 0 0;
      max-width:min(200px,100%);
      font-family:var(--sapFontFamily,"72",system-ui,-apple-system,sans-serif);
      color:#0f172a;
      background:#fff;
      border:1px solid rgba(45,58,79,.16);
      border-radius:8px;
      box-shadow:0 1px 4px rgba(15,23,42,.08);
      padding:6px 8px;
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
      font-size:8px;color:#94a3b8;line-height:1.25;
    }

    /* Check-in list Room column — inline next to room number (cell max-height clips siblings) */
    [${ROW_ATTR}="row"]{
      display:inline-flex;
      align-items:center;
      gap:0.2rem;
      margin:0;
      line-height:1.15;
      max-width:100%;
      vertical-align:middle;
      flex-shrink:0;
    }
    [${ROW_ATTR}="row"] .pb-ra-row-code{
      appearance:none;cursor:pointer;
      font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
      font-size:0.75rem;font-weight:700;letter-spacing:.03em;
      color:#0f172a;
      background:#dbeafe;
      border:1px solid #3b82f6;
      border-radius:0.25rem;
      padding:0.12rem 0.4rem;
      white-space:nowrap;
    }
    [${ROW_ATTR}="row"] .pb-ra-row-code:hover{filter:brightness(0.97);}
    [${ROW_ATTR}="row"] .pb-ra-row-hint{
      font-size:0.6rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
      color:#3b82f6;
    }
  `;
}

function mountInRoomField(parent: HTMLElement): HTMLElement {
  let host = document.getElementById(HOST_ID) as HTMLElement | null;
  if (host && parent.contains(host)) return host;
  host?.remove();
  host = document.createElement('div');
  host.id = HOST_ID;
  host.setAttribute(ROW_ATTR, 'detail');
  host.setAttribute('role', 'region');
  host.setAttribute('aria-label', msgs.emmaRoom.title);

  // Place after the input / value control so it sits where the room number is
  const inputWrap =
    parent.querySelector('.sapMInputBaseContentWrapper') ||
    parent.querySelector('.sapUiCompSmartFieldValue') ||
    parent.querySelector('input.sapMInputBaseInner')?.parentElement;
  if (inputWrap?.parentElement === parent) {
    inputWrap.insertAdjacentElement('afterend', host);
  } else if (inputWrap) {
    inputWrap.insertAdjacentElement('afterend', host);
  } else {
    parent.appendChild(host);
  }
  return host;
}

function iconCheck() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>`;
}
function iconEdit() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>`;
}

let lastKey: string | null = null;
let refreshTimer: number | null = null;
let suggestion: RoomSuggestion | null = null;
let menuOpen = false;
let statusText = '';
let statusWarn = false;

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
  if (!suggestion) return;
  host.setAttribute('aria-label', msgs.emmaRoom.title);
  const floorLabel = formatFloorLabel(suggestion.floor);
  const statusHtml = statusText
    ? `<div class="pb-ra-status${statusWarn ? ' pb-ra-warn' : ''}">${escapeHtml(statusText)}</div>`
    : '';

  const accept = msgs.emmaRoom.accept;
  const edit = msgs.emmaRoom.edit;
  host.innerHTML =
    `<div class="pb-ra-top">` +
    `<span class="pb-ra-title"><span class="pb-ra-dot" aria-hidden="true"></span>${escapeHtml(msgs.emmaRoom.title)}</span>` +
    `<span class="pb-ra-badge">${escapeHtml(suggestion.label)}</span>` +
    `</div>` +
    `<div class="pb-ra-main">` +
    `<div><div class="pb-ra-room">${escapeHtml(suggestion.roomNumber)}</div>` +
    `<div class="pb-ra-meta">${escapeHtml(floorLabel)}</div></div>` +
    `<div class="pb-ra-actions">` +
    `<button type="button" class="pb-ra-btn pb-ra-accept" title="${escapeAttr(accept)}" aria-label="${escapeAttr(accept)}">${iconCheck()}</button>` +
    `<button type="button" class="pb-ra-btn pb-ra-edit" title="${escapeAttr(edit)}" aria-label="${escapeAttr(edit)}" aria-expanded="${menuOpen}">${iconEdit()}</button>` +
    `</div></div>` +
    `<div class="pb-ra-menu${menuOpen ? '' : ' pb-ra-hidden'}">` +
    `<button type="button" class="pb-ra-opt" data-kind="higher">${escapeHtml(msgs.emmaRoom.higher)}</button>` +
    `<button type="button" class="pb-ra-opt" data-kind="lower">${escapeHtml(msgs.emmaRoom.lower)}</button>` +
    `<button type="button" class="pb-ra-opt" data-kind="extra_bed">${escapeHtml(msgs.emmaRoom.extraBed)}</button>` +
    `</div>` +
    statusHtml +
    `<div class="pb-ra-note">${escapeHtml(msgs.emmaRoom.previewNote)}</div>`;

  host.querySelector('.pb-ra-accept')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!suggestion) return;
    const ok = applyRoomToEmma(suggestion.roomNumber);
    statusText = ok
      ? interpolate(msgs.emmaRoom.applied, { room: suggestion.roomNumber })
      : interpolate(msgs.emmaRoom.appliedNoField, { room: suggestion.roomNumber });
    statusWarn = !ok;
    menuOpen = false;
    renderHost(host);
    scheduleRefresh();
  });

  host.querySelector('.pb-ra-edit')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    menuOpen = !menuOpen;
    renderHost(host);
  });

  host.querySelectorAll<HTMLButtonElement>('.pb-ra-opt').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const kind = (btn.dataset.kind || 'default') as SuggestKind;
      const booking = getBookingNumber();
      suggestion = mockSuggest(booking, kind, suggestion?.roomNumber || null);
      statusText = '';
      statusWarn = false;
      menuOpen = false;
      renderHost(host);
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
      const t = (cell.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (t === 'room' || t === 'zimmer' || t.startsWith('room ') || t.startsWith('zimmer')) {
        room = i;
      }
      if (
        t === 'arrival' ||
        t.startsWith('anreise') ||
        t.startsWith('arrival')
      ) {
        arrival = i;
      }
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
  const cell =
    row.querySelector<HTMLElement>('[id$="-col0"]') ||
    row.querySelector<HTMLElement>('td.sapUiTableCellFirst');
  if (!cell) return null;
  for (const el of cell.querySelectorAll('.sapMText, a.sapMLnk')) {
    const t = (el.textContent || '').trim();
    if (/^\d{6,}$/.test(t)) return t.replace(/^0+/, '') || t;
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

/** Mount inside the room-number line so chips are not clipped by cell max-height. */
function findListRoomChipMount(cell: HTMLElement): HTMLElement {
  for (const el of cell.querySelectorAll('.sapMText')) {
    if (el.closest(`[${ROW_ATTR}]`)) continue;
    if (el.parentElement) return el.parentElement;
  }
  const hbox = cell.querySelector('.sapMHBox') as HTMLElement | null;
  if (hbox) return hbox;
  const vbox = cell.querySelector('.sapMVBox') as HTMLElement | null;
  if (vbox) return vbox;
  return (
    (cell.querySelector('.sapUiTableCellInner') as HTMLElement | null) || cell
  );
}

function arrivalFromListCell(cell: HTMLElement): string | null {
  // Prefer the date line (e.g. "Sep 26, 2026"), not the time ObjStatus
  for (const el of cell.querySelectorAll('.sapMText')) {
    const t = (el.textContent || '').trim();
    const iso = parseEmmaDate(t);
    if (iso) return iso;
  }
  const iso = parseEmmaDate((cell.textContent || '').trim());
  return iso;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

function ensureRowChip(cell: HTMLElement, booking: string, roomNumber: string): HTMLElement {
  const mount = findListRoomChipMount(cell);
  let host = cell.querySelector<HTMLElement>(`[${ROW_ATTR}="row"]`);
  if (host && host.dataset.booking === booking && host.dataset.room === roomNumber) {
    if (host.parentElement !== mount) mount.appendChild(host);
    return host;
  }
  if (host) {
    host.dataset.booking = booking;
    host.dataset.room = roomNumber;
    if (host.parentElement !== mount) mount.appendChild(host);
  } else {
    host = document.createElement('span');
    host.setAttribute(ROW_ATTR, 'row');
    host.dataset.booking = booking;
    host.dataset.room = roomNumber;
    mount.appendChild(host);
  }

  host.innerHTML = '';
  const hint = document.createElement('span');
  hint.className = 'pb-ra-row-hint';
  hint.textContent = '→';
  hint.setAttribute('aria-hidden', 'true');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pb-ra-row-code';
  // Show padded like EMMA (4 digits) for familiar look
  const display = roomNumber.padStart(4, '0');
  btn.textContent = display;
  btn.title = `${msgs.emmaRoom.title}: ${display}`;
  btn.setAttribute('aria-label', `${msgs.emmaRoom.title} ${display}`);
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    void copyText(display);
  });
  host.appendChild(hint);
  host.appendChild(btn);
  return host;
}

function scanCheckInList() {
  const table = findCheckInListTable();
  if (!table) {
    document.querySelectorAll(`[${ROW_ATTR}="row"]`).forEach((el) => el.remove());
    return;
  }

  const cols = resolveListColumns(table);
  const rows = table.querySelectorAll<HTMLElement>(
    'tbody tr.sapUiTableContentRow, tbody tr.sapUiTableTr',
  );

  const seen = new Set<HTMLElement>();

  for (const row of rows) {
    const booking = bookingFromListRow(row);
    if (!booking) continue;

    const roomCell = cellByColIndex(row, cols.room);
    const arrivalCell = cellByColIndex(row, cols.arrival);
    if (!roomCell) continue;

    const fixed = roomFromListCell(roomCell);
    const arrivalIso = arrivalCell ? arrivalFromListCell(arrivalCell) : null;

    if (fixed || !isDateToday(arrivalIso)) {
      roomCell.querySelector(`[${ROW_ATTR}="row"]`)?.remove();
      continue;
    }

    const sug = mockSuggest(booking, 'default', null);
    const host = ensureRowChip(roomCell, booking, sug.roomNumber);
    seen.add(host);
  }

  // Clean orphaned chips in this table
  table.querySelectorAll(`[${ROW_ATTR}="row"]`).forEach((el) => {
    if (el instanceof HTMLElement && !seen.has(el)) el.remove();
  });
}

function clearDetailHost() {
  document.getElementById(HOST_ID)?.remove();
  lastKey = null;
  suggestion = null;
  menuOpen = false;
  statusText = '';
  statusWarn = false;
}

async function tickDetail() {
  const booking = getBookingNumber();
  const mountParent = findRoomFieldMountParent();

  // On list-only pages there is no room field — fine
  if (!mountParent || !booking) {
    clearDetailHost();
    return;
  }

  if (!detailEligible()) {
    clearDetailHost();
    return;
  }

  const host = mountInRoomField(mountParent);
  const key = `${booking}:empty`;
  if (key !== lastKey || !suggestion || !host.querySelector('.pb-ra-room')) {
    const bookingChanged = !lastKey || !lastKey.startsWith(`${booking}:`);
    lastKey = key;
    if (bookingChanged || !suggestion) {
      menuOpen = false;
      statusText = '';
      statusWarn = false;
      suggestion = mockSuggest(booking, 'default', null);
    }
    renderHost(host);
  }
}

async function tick() {
  if (!isLikelyEmmaPage()) {
    clearDetailHost();
    document.querySelectorAll(`[${ROW_ATTR}="row"]`).forEach((el) => el.remove());
    return;
  }

  ensureStyles();
  scanCheckInList();
  await tickDetail();
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
    scheduleRefresh();
  });

  const obs = new MutationObserver((mutations) => {
    for (const m of mutations) {
      const t = m.target;
      if (
        t instanceof Element &&
        (t.id === HOST_ID || t.id === STYLE_ID || t.closest(`[${ROW_ATTR}]`))
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
