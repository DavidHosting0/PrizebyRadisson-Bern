/**
 * Room-assignment suggestion chip in EMMA reservation info headers.
 * UI + local mock suggestions for now; server suggestions come later.
 */
import {
  allHotelRoomNumbers,
  compareRoomNumbers,
  floorFromRoomNumber,
  formatFloorLabel,
} from '@housekeeping/shared';
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

type SuggestKind = 'default' | 'higher' | 'lower' | 'extra_bed';

type RoomSuggestion = {
  roomNumber: string;
  floor: number | null;
  kind: SuggestKind;
  label: string;
};

const HOTEL_ROOMS = allHotelRoomNumbers().sort(compareRoomNumbers);

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
  return null;
}

/** Reservation info bar (check-in and other reservation detail screens). */
function findReservationInfoBar(): HTMLElement | null {
  const selectors = [
    '[id$="tms.checkinheaderContent"]',
    '[id*="tms.checkinheaderContent"]',
    '[id*="checkinheaderContent"]',
    '[id$="tms.reservationheaderContent"]',
    '[id*="reservationheaderContent"]',
    '[id*="HeaderContent"][id*="tms."]',
    '[id*="CheckInDetail"][id*="headerContent"]',
    '[id*="ReservationDetail"][id*="headerContent"]',
  ];
  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el && el.offsetParent !== null) return el;
  }
  return null;
}

function normalizeRoomNumber(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '';
  return String(parseInt(digits, 10));
}

function scrapeAssignedRoom(): string | null {
  const selectors = [
    '[id*="tms.checkin.roomid.valuehelp-inner"]',
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
    '[id*="tms.checkin.roomid.valuehelp-inner"]',
    '[id*="roomid.valuehelp-inner"]',
    '[id*="roomid"] input.sapMInputBaseInner',
    '[id*="RoomId"] input.sapMInputBaseInner',
  ];
  for (const sel of selectors) {
    const input = document.querySelector<HTMLInputElement>(sel);
    if (input) return input;
  }
  return null;
}

/** Pad for EMMA display (e.g. 12 → 0012) when the field already uses leading zeros. */
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

/**
 * Local mock until the API returns per-reservation suggestions.
 * Uses booking id as a stable seed so the same reservation keeps the same default.
 */
function mockSuggest(bookingNumber: string | null, kind: SuggestKind, current?: string | null): RoomSuggestion {
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
    // Prefer a nearby room that isn't the current pick (mock stand-in for "extra bed").
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
  const existing = document.getElementById(STYLE_ID);
  if (existing) existing.remove();
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${HOST_ID}{
      box-sizing:border-box;
      flex:0 0 auto;
      order:-1;
      margin:0 10px 8px 0;
      width:min(220px,100%);
      font-family:var(--sapFontFamily,"72",system-ui,-apple-system,sans-serif);
      color:#0f172a;
      background:linear-gradient(180deg,#ffffff,#f8fafc);
      border:1px solid rgba(45,58,79,.14);
      border-radius:14px;
      box-shadow:0 6px 20px rgba(15,23,42,.1);
      padding:8px 10px;
      z-index:5;
      pointer-events:auto;
      align-self:flex-start;
    }
    #${HOST_ID} *{box-sizing:border-box;}
    #${HOST_ID} .pb-ra-top{
      display:flex;align-items:center;justify-content:space-between;gap:6px;
      margin-bottom:6px;
    }
    #${HOST_ID} .pb-ra-title{
      font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
      color:#475569;display:inline-flex;align-items:center;gap:6px;
    }
    #${HOST_ID} .pb-ra-dot{
      width:7px;height:7px;border-radius:999px;background:#3b6fa0;
      box-shadow:0 0 0 3px rgba(59,111,160,.16);
    }
    #${HOST_ID} .pb-ra-badge{
      font-size:9px;font-weight:600;color:#64748b;background:#eef2f7;
      border-radius:999px;padding:2px 7px;white-space:nowrap;
    }
    #${HOST_ID} .pb-ra-main{
      display:flex;align-items:center;gap:8px;
    }
    #${HOST_ID} .pb-ra-room{
      flex:1;min-width:0;
      font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
      font-size:20px;font-weight:800;letter-spacing:.04em;line-height:1.1;
      color:#1a2332;
    }
    #${HOST_ID} .pb-ra-meta{
      font-size:10px;color:#64748b;margin-top:2px;font-weight:500;
      font-family:var(--sapFontFamily,"72",system-ui,sans-serif);
      letter-spacing:0;
    }
    #${HOST_ID} .pb-ra-actions{
      display:flex;align-items:center;gap:4px;flex-shrink:0;
    }
    #${HOST_ID} .pb-ra-btn{
      appearance:none;cursor:pointer;border:1px solid #cbd5e1;background:#fff;
      width:30px;height:30px;border-radius:9px;display:inline-flex;
      align-items:center;justify-content:center;color:#1a2332;padding:0;
      transition:background .12s ease,border-color .12s ease,transform .12s ease;
    }
    #${HOST_ID} .pb-ra-btn:hover{background:#f1f5f9;border-color:#94a3b8;}
    #${HOST_ID} .pb-ra-btn:active{transform:scale(.96);}
    #${HOST_ID} .pb-ra-btn.pb-ra-accept{
      background:#15803d;border-color:#15803d;color:#fff;
    }
    #${HOST_ID} .pb-ra-btn.pb-ra-accept:hover{background:#166534;border-color:#166534;}
    #${HOST_ID} .pb-ra-btn svg{width:15px;height:15px;display:block;}
    #${HOST_ID} .pb-ra-menu{
      margin-top:8px;padding-top:8px;border-top:1px solid #e2e8f0;
      display:flex;flex-direction:column;gap:4px;
    }
    #${HOST_ID} .pb-ra-menu.pb-ra-hidden{display:none;}
    #${HOST_ID} .pb-ra-opt{
      appearance:none;cursor:pointer;border:1px solid #e2e8f0;background:#fff;
      border-radius:8px;padding:6px 8px;text-align:left;font-size:11px;font-weight:600;
      color:#1a2332;width:100%;
    }
    #${HOST_ID} .pb-ra-opt:hover{background:#f8fafc;border-color:#cbd5e1;}
    #${HOST_ID} .pb-ra-status{
      margin-top:6px;font-size:10px;font-weight:600;color:#15803d;
    }
    #${HOST_ID} .pb-ra-status.pb-ra-warn{color:#b45309;}
    #${HOST_ID} .pb-ra-note{
      margin-top:4px;font-size:9px;color:#94a3b8;line-height:1.3;
    }
  `;
  document.documentElement.appendChild(style);
}

function mountInHeader(bar: HTMLElement): HTMLElement {
  let host = document.getElementById(HOST_ID) as HTMLElement | null;
  if (host && bar.contains(host)) return host;
  host?.remove();
  host = document.createElement('div');
  host.id = HOST_ID;
  host.setAttribute('data-prize-room-assign', '1');
  host.setAttribute('role', 'region');
  host.setAttribute('aria-label', msgs.emmaRoom.title);

  // Prefer first flex slot so it sits at the start of the info bar.
  if (bar.classList.contains('sapMFlexBox') || bar.querySelector(':scope > .sapMFlexItem')) {
    bar.insertBefore(host, bar.firstChild);
  } else {
    bar.prepend(host);
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
  // SAP UI5 often listens to these:
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

  host.querySelector('.pb-ra-accept')?.addEventListener('click', () => {
    if (!suggestion) return;
    const ok = applyRoomToEmma(suggestion.roomNumber);
    statusText = ok
      ? interpolate(msgs.emmaRoom.applied, { room: suggestion.roomNumber })
      : interpolate(msgs.emmaRoom.appliedNoField, { room: suggestion.roomNumber });
    statusWarn = !ok;
    menuOpen = false;
    renderHost(host);
  });

  host.querySelector('.pb-ra-edit')?.addEventListener('click', () => {
    menuOpen = !menuOpen;
    renderHost(host);
  });

  host.querySelectorAll<HTMLButtonElement>('.pb-ra-opt').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kind = (btn.dataset.kind || 'default') as SuggestKind;
      const booking = getBookingNumber();
      const assigned = scrapeAssignedRoom();
      suggestion = mockSuggest(booking, kind, suggestion?.roomNumber || assigned);
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

function scheduleRefresh() {
  if (refreshTimer) window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    void tick();
  }, 350);
}

async function tick() {
  if (!isLikelyEmmaPage()) {
    document.getElementById(HOST_ID)?.remove();
    lastKey = null;
    return;
  }

  const bar = findReservationInfoBar();
  const booking = getBookingNumber();

  if (!bar || !booking) {
    document.getElementById(HOST_ID)?.remove();
    lastKey = null;
    suggestion = null;
    return;
  }

  ensureStyles();
  const host = mountInHeader(bar);
  if (!bar.contains(host)) {
    lastKey = null;
    scheduleRefresh();
    return;
  }

  const key = `${booking}:${scrapeAssignedRoom() || ''}`;
  if (key !== lastKey || !suggestion || !host.querySelector('.pb-ra-room')) {
    const bookingChanged = !lastKey || !lastKey.startsWith(`${booking}:`);
    lastKey = key;
    if (bookingChanged || !suggestion) {
      menuOpen = false;
      statusText = '';
      statusWarn = false;
      suggestion = mockSuggest(booking, 'default', scrapeAssignedRoom());
    }
    renderHost(host);
  }
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
    let relevant = false;
    for (const m of mutations) {
      const t = m.target;
      if (
        t instanceof Element &&
        (t.id === HOST_ID || t.id === STYLE_ID || t.closest('[data-prize-room-assign]'))
      ) {
        continue;
      }
      relevant = true;
      break;
    }
    if (!relevant) return;

    const bar = findReservationInfoBar();
    const host = document.getElementById(HOST_ID);
    if (host && bar && !bar.contains(host)) lastKey = null;
    if (bar && !host) lastKey = null;
    scheduleRefresh();
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  return () => {
    obs.disconnect();
    if (refreshTimer) window.clearTimeout(refreshTimer);
    document.getElementById(HOST_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
  };
}
