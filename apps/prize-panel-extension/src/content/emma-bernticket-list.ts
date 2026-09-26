/**
 * BernTicket activation codes in EMMA list surfaces:
 * - Check-in list: under each reservation number
 * - Room status tiles: in the tile header title field when a guest is present
 */
import {
  clearBtCodeCache,
  copyText,
  normalizeBooking,
  peekCachedCode,
  resolveActivationCode,
} from '../lib/bt-code-cache';
import {
  getMessages,
  loadExtensionLocale,
  watchExtensionLocale,
  type ExtensionMessages,
} from '../i18n';

let msgs: ExtensionMessages = getMessages('de');

const STYLE_ID = 'prize-bt-list-style';
const CHIP_ATTR = 'data-prize-bt-chip';

let refreshTimer: number | null = null;

function isLikelyEmmaPage(): boolean {
  if (document.querySelector('.sapUiBody, .sapMShell, [data-sap-ui-area]')) return true;
  return /emma|radisson|sapui5|fiori/i.test(window.location.hostname + window.location.href);
}

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

function findRoomStatusTiles(): HTMLElement[] {
  const found = new Set<HTMLElement>();
  const selectors = [
    '.sapMGT.roomTiles',
    '.sapMGT.roomTiles2',
    '.sapMGT[id*="roomstatus.roomsHBox"]',
    '.sapMGT[id*="RoomStatus"][id*="roomsHBox"]',
    '[id*="zey_rs_room_status"] .sapMGT',
    '[id*="---RoomStatus--"] .sapMGT',
    '[id*="RoomStatus--roomstatus"] .sapMGT',
  ];
  for (const sel of selectors) {
    try {
      for (const el of document.querySelectorAll<HTMLElement>(sel)) {
        // Prefer the tile root itself
        const tile = el.classList.contains('sapMGT') ? el : el.closest<HTMLElement>('.sapMGT');
        if (tile) found.add(tile);
      }
    } catch {
      // ignore invalid selectors
    }
  }
  return [...found];
}

function ensureStyles() {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.documentElement.appendChild(style);
  }
  style.textContent = `
    [${CHIP_ATTR}]{
      display:block !important;
      margin-top:0.12rem;
      line-height:1.15;
      max-width:100%;
      pointer-events:auto;
      z-index:5;
      position:relative;
    }
    /* Keep chip visible inside clipped SAP table cells */
    .sapUiTableCellInner:has([${CHIP_ATTR}]),
    .sapMVBox:has(> [${CHIP_ATTR}]){
      overflow:visible !important;
    }
    [${CHIP_ATTR}][data-surface="room"]{
      margin-top:0.15rem;
      margin-bottom:0;
    }
    [${CHIP_ATTR}] .pb-bt-list-code{
      appearance:none;cursor:pointer;
      font-family:var(--sapFontFamily,"72",Arial,Helvetica,sans-serif);
      font-size:0.7rem;font-weight:700;letter-spacing:.03em;
      color:var(--sapIndicationColor_3,#aa0808);
      background:var(--sapIndicationColor_3_Background,#ffebeb);
      border:1px solid var(--sapIndicationColor_3_BorderColor,#f5c1c1);
      border-radius:0.15rem;
      padding:0.05rem 0.3rem;
      line-height:1.2;
      max-width:100%;
      white-space:nowrap;
      overflow:hidden;text-overflow:ellipsis;
    }
    [${CHIP_ATTR}] .pb-bt-list-code:hover{filter:brightness(0.97);}
    [${CHIP_ATTR}] .pb-bt-list-code.pb-bt-copied-flash{
      color:var(--sapPositiveColor,#256f3a);
      background:var(--sapPositiveBackground,#f5fae5);
      border-color:var(--sapPositiveBorderColor,#99cc33);
    }
    [${CHIP_ATTR}] .pb-bt-list-muted{
      font-family:var(--sapFontFamily,"72",Arial,Helvetica,sans-serif);
      font-size:0.65rem;color:#6a6d70;
    }
  `;
}

function bookingFromTexts(root: HTMLElement): string | null {
  for (const el of root.querySelectorAll('.sapMText, a.sapMLnk, .sapMLabel bdi')) {
    if (el.closest(`[${CHIP_ATTR}]`)) continue;
    const t = (el.textContent || '').trim();
    if (/^\d{6,}$/.test(t)) return normalizeBooking(t);
  }
  return null;
}

function bookingFromCell(cell: HTMLElement): string | null {
  return bookingFromTexts(cell);
}

function bookingFromRoomTile(tile: HTMLElement): string | null {
  // Guest/reservation lives in tile content — ignore room number labels (4 digits).
  const content =
    tile.querySelector<HTMLElement>('.sapMTileCntContent') ||
    tile.querySelector<HTMLElement>('.sapMGTContent') ||
    tile.querySelector<HTMLElement>('[class*="appInfo"]') ||
    tile;
  return bookingFromTexts(content);
}

/**
 * Mount next to the reservation number in the tile body (stable).
 * Do NOT use the empty GenericTile title — SAP clears / hides it.
 */
function mountAnchorForRoomTile(tile: HTMLElement): {
  parent: HTMLElement;
  after: HTMLElement | null;
} | null {
  const content =
    tile.querySelector<HTMLElement>('.sapMTileCntContent') ||
    tile.querySelector<HTMLElement>('.sapMGTContent') ||
    tile;

  let bookingEl: HTMLElement | null = null;
  for (const el of content.querySelectorAll<HTMLElement>('.sapMText')) {
    if (el.closest(`[${CHIP_ATTR}]`)) continue;
    if (/^\d{6,}$/.test((el.textContent || '').trim())) {
      bookingEl = el;
      break;
    }
  }
  if (!bookingEl) return null;

  const hbox = bookingEl.closest('.sapMHBox');
  if (hbox?.parentElement) {
    return { parent: hbox.parentElement, after: hbox as HTMLElement };
  }
  if (bookingEl.parentElement) {
    return { parent: bookingEl.parentElement, after: bookingEl };
  }
  return null;
}

function mountParentForCell(cell: HTMLElement): HTMLElement {
  return (
    cell.querySelector<HTMLElement>('.sapMVBox') ||
    cell.querySelector<HTMLElement>('.sapUiTableCellInner') ||
    cell
  );
}

function bindCopy(btn: HTMLElement, code: string) {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    void copyText(code).then(() => {
      btn.classList.add('pb-bt-copied-flash');
      const prev = btn.getAttribute('title') || '';
      btn.setAttribute('title', msgs.emmaBt.copied);
      window.setTimeout(() => {
        btn.classList.remove('pb-bt-copied-flash');
        btn.setAttribute('title', prev || msgs.emmaBt.clickToCopy);
      }, 1200);
    });
  });
}

function setChipLoading(host: HTMLElement, booking: string) {
  host.setAttribute(CHIP_ATTR, '1');
  host.dataset.booking = booking;
  host.dataset.state = 'loading';
  host.innerHTML = `<span class="pb-bt-list-muted">…</span>`;
}

function setChipCode(host: HTMLElement, booking: string, code: string) {
  host.setAttribute(CHIP_ATTR, '1');
  host.dataset.booking = booking;
  host.dataset.state = 'ok';
  host.innerHTML = '';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pb-bt-list-code';
  btn.textContent = code;
  btn.title = msgs.emmaBt.clickToCopy;
  btn.setAttribute('aria-label', `${msgs.emmaBt.brand}: ${code}`);
  bindCopy(btn, code);
  host.appendChild(btn);
}

function setChipEmpty(host: HTMLElement, booking: string) {
  host.setAttribute(CHIP_ATTR, '1');
  host.dataset.booking = booking;
  host.dataset.state = 'none';
  host.innerHTML = '';
}

function ensureChipHost(
  parent: HTMLElement,
  booking: string,
  mode: 'list' | 'room',
  after: HTMLElement | null = null,
): HTMLElement {
  let host = parent.querySelector<HTMLElement>(`:scope > [${CHIP_ATTR}]`);
  if (!host) {
    host = parent.querySelector<HTMLElement>(`[${CHIP_ATTR}]`);
  }
  if (host) {
    if (host.dataset.booking !== booking) {
      host.dataset.booking = booking;
      host.dataset.state = '';
      host.innerHTML = '';
    }
    host.dataset.surface = mode;
    if (after && after.parentElement === parent && host.previousElementSibling !== after) {
      after.insertAdjacentElement('afterend', host);
    }
    return host;
  }

  host = document.createElement('div');
  host.setAttribute(CHIP_ATTR, '1');
  host.dataset.booking = booking;
  host.dataset.surface = mode;

  if (after && after.parentElement === parent) {
    after.insertAdjacentElement('afterend', host);
  } else if (mode === 'list') {
    // Prefer after the reservation-number hbox so the chip sits under the id
    const firstRow =
      parent.querySelector(':scope > .sapMHBox') || parent.querySelector(':scope > .sapMFlexItem');
    if (firstRow?.parentElement === parent) {
      firstRow.insertAdjacentElement('afterend', host);
    } else {
      parent.appendChild(host);
    }
  } else {
    parent.appendChild(host);
  }
  return host;
}

async function hydrateChip(host: HTMLElement, booking: string) {
  if (host.dataset.booking === booking && host.dataset.state === 'ok') {
    return;
  }
  // Allow retry when previous lookup wrongly cached null (e.g. token bug)
  if (host.dataset.booking === booking && host.dataset.state === 'none') {
    const cached = peekCachedCode(booking);
    if (cached && cached.code === null) return;
    host.dataset.state = '';
  }

  const cached = peekCachedCode(booking);
  if (cached) {
    if (cached.code) setChipCode(host, booking, cached.code);
    else setChipEmpty(host, booking);
    return;
  }

  setChipLoading(host, booking);
  const code = await resolveActivationCode(booking);
  if (host.dataset.booking !== booking) return;
  if (!document.documentElement.contains(host)) return;
  if (code) setChipCode(host, booking, code);
  else setChipEmpty(host, booking);
}

function scanCheckInList() {
  const table = findCheckInListTable();
  if (!table) {
    document.querySelectorAll(`[${CHIP_ATTR}][data-surface="list"]`).forEach((el) => el.remove());
    return;
  }

  const rows = table.querySelectorAll<HTMLElement>(
    'tbody tr.sapUiTableContentRow, tbody tr.sapUiTableTr',
  );
  const keep = new Set<HTMLElement>();

  for (const row of rows) {
    const cell =
      row.querySelector<HTMLElement>('[id$="-col0"]') ||
      row.querySelector<HTMLElement>('td.sapUiTableCellFirst') ||
      row.querySelector<HTMLElement>('td.sapUiTableDataCell');
    if (!cell) continue;

    const booking = bookingFromCell(cell);
    if (!booking) continue;

    const parent = mountParentForCell(cell);
    // Insert directly under the reservation-number hbox
    const after =
      parent.querySelector<HTMLElement>(':scope > .sapMHBox') ||
      cell.querySelector<HTMLElement>('.sapMHBox');
    const host = ensureChipHost(parent, booking, 'list', after);
    keep.add(host);
    void hydrateChip(host, booking);
  }

  document.querySelectorAll<HTMLElement>(`[${CHIP_ATTR}][data-surface="list"]`).forEach((el) => {
    if (!keep.has(el)) el.remove();
  });
}

function scanRoomStatusTiles() {
  const tiles = findRoomStatusTiles();
  const keep = new Set<HTMLElement>();

  for (const tile of tiles) {
    const booking = bookingFromRoomTile(tile);
    const existing = tile.querySelector<HTMLElement>(`[${CHIP_ATTR}]`);

    if (!booking) {
      existing?.remove();
      continue;
    }

    const anchor = mountAnchorForRoomTile(tile);
    if (!anchor) {
      existing?.remove();
      continue;
    }

    // Drop stale chip if it ended up elsewhere in the tile
    if (existing && !anchor.parent.contains(existing)) existing.remove();

    const host = ensureChipHost(anchor.parent, booking, 'room', anchor.after);
    keep.add(host);
    void hydrateChip(host, booking);
  }

  // Remove orphan room chips not in current tile set
  document.querySelectorAll<HTMLElement>(`[${CHIP_ATTR}][data-surface="room"]`).forEach((el) => {
    if (!keep.has(el)) el.remove();
  });
}

function scanAndMount() {
  if (!isLikelyEmmaPage()) {
    document.querySelectorAll(`[${CHIP_ATTR}]`).forEach((el) => el.remove());
    return;
  }

  ensureStyles();
  scanCheckInList();
  scanRoomStatusTiles();
}

function scheduleRefresh() {
  if (refreshTimer) window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    scanAndMount();
  }, 280);
}

export function startEmmaBernTicketListWatcher() {
  void loadExtensionLocale().then((l) => {
    msgs = getMessages(l);
    scheduleRefresh();
  });
  watchExtensionLocale((l) => {
    msgs = getMessages(l);
    document.querySelectorAll(`[${CHIP_ATTR}]`).forEach((el) => {
      if (el instanceof HTMLElement) el.dataset.state = '';
    });
    scheduleRefresh();
  });

  scanAndMount();

  window.addEventListener('hashchange', () => scheduleRefresh());

  const obs = new MutationObserver((mutations) => {
    for (const m of mutations) {
      const t = m.target;
      if (
        t instanceof Element &&
        (t.id === STYLE_ID || t.closest(`[${CHIP_ATTR}]`))
      ) {
        continue;
      }
      scheduleRefresh();
      return;
    }
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.btAccessToken || changes.btRefreshToken) {
        clearBtCodeCache();
        document.querySelectorAll(`[${CHIP_ATTR}]`).forEach((el) => {
          if (el instanceof HTMLElement) el.dataset.state = '';
        });
        scheduleRefresh();
      }
    });
  } catch {
    // ignore
  }

  return () => {
    obs.disconnect();
    if (refreshTimer) window.clearTimeout(refreshTimer);
    document.getElementById(STYLE_ID)?.remove();
    document.querySelectorAll(`[${CHIP_ATTR}]`).forEach((el) => el.remove());
  };
}
