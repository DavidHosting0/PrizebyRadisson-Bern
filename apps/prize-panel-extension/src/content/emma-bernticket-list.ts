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
  if (style.dataset.v === '5') return;
  style.dataset.v = '5';
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
    /* Check-in list: inline next to reservation number (cell max-height clips below) */
    [${CHIP_ATTR}][data-surface="list"]{
      display:inline-flex !important;
      align-items:center;
      margin:0 0 0 0.25rem !important;
      vertical-align:middle;
      max-width:none;
      flex-shrink:0;
    }
    .sapUiTableCellInner:has([${CHIP_ATTR}]),
    .sapMVBox:has([${CHIP_ATTR}]),
    .sapMHBox:has([${CHIP_ATTR}]){
      overflow:visible !important;
    }
    /* Room Status: chip on tile root so SAP content re-renders do not wipe it */
    .sapMGT.roomTiles,
    .sapMGT.roomTiles2,
    .sapMGT[id*="roomsHBox"]{
      position:relative !important;
      overflow:visible !important;
    }
    [${CHIP_ATTR}][data-surface="room"]{
      position:absolute !important;
      left:0.35rem;
      bottom:0.3rem;
      margin:0 !important;
      z-index:30;
      max-width:calc(100% - 0.7rem);
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
 * Mount on the tile root (.sapMGT), not inside .sapMGTContent.
 * SAP frequently re-renders tile body and would wipe chips mounted there.
 */
function ensureRoomTileChip(tile: HTMLElement, booking: string): HTMLElement {
  // Prefer direct child of tile root (survives content refresh)
  let host = tile.querySelector<HTMLElement>(`:scope > [${CHIP_ATTR}]`);
  if (!host) {
    // Migrate old chips that were injected into content
    const nested = tile.querySelector<HTMLElement>(`[${CHIP_ATTR}]`);
    if (nested) {
      host = nested;
      tile.appendChild(host);
    }
  }
  if (host) {
    if (host.dataset.booking !== booking) {
      host.dataset.booking = booking;
      host.dataset.state = '';
      host.innerHTML = '';
    }
    host.dataset.surface = 'room';
    if (host.parentElement !== tile) tile.appendChild(host);
    return host;
  }

  host = document.createElement('div');
  host.setAttribute(CHIP_ATTR, '1');
  host.dataset.booking = booking;
  host.dataset.surface = 'room';
  tile.appendChild(host);
  return host;
}

function tileLooksOccupied(tile: HTMLElement): boolean {
  return Boolean(
    tile.querySelector(
      '.sapFAvatar, .sapMAvatar, [class*="Avatar"], .roomTitle, .sapMObjStatus',
    ),
  );
}

function reservationCellFromRow(row: HTMLElement): HTMLElement | null {
  // Exact -col0 (avoid matching -col10 via loose selectors)
  const re = /-col0$/;
  for (const el of row.querySelectorAll<HTMLElement>('[id*="-col"]')) {
    if (re.test(el.id)) return el;
  }
  return (
    row.querySelector<HTMLElement>('td.sapUiTableCellFirst') ||
    row.querySelector<HTMLElement>('td.sapUiTableDataCell')
  );
}

/**
 * Mount inline next to the reservation number so the chip stays inside the
 * clipped sapUiTableCellInner (max-height ~65px).
 */
function ensureListRowChip(cell: HTMLElement, booking: string): HTMLElement {
  let bookingEl: HTMLElement | null = null;
  for (const el of cell.querySelectorAll<HTMLElement>('.sapMText, a.sapMLnk')) {
    if (el.closest(`[${CHIP_ATTR}]`)) continue;
    if (/^\d{6,}$/.test((el.textContent || '').trim())) {
      bookingEl = el;
      break;
    }
  }

  const mountParent =
    (bookingEl?.closest('.sapMHBox') as HTMLElement | null) ||
    bookingEl?.parentElement ||
    cell.querySelector<HTMLElement>('.sapMVBox') ||
    cell.querySelector<HTMLElement>('.sapUiTableCellInner') ||
    cell;

  let host = cell.querySelector<HTMLElement>(`[${CHIP_ATTR}]`);
  if (host) {
    if (host.dataset.booking !== booking) {
      host.dataset.booking = booking;
      host.dataset.state = '';
      host.innerHTML = '';
    }
    host.dataset.surface = 'list';
    if (host.parentElement !== mountParent) {
      // Prefer after the booking text node/element
      if (bookingEl && bookingEl.parentElement === mountParent) {
        bookingEl.insertAdjacentElement('afterend', host);
      } else {
        mountParent.appendChild(host);
      }
    }
    return host;
  }

  host = document.createElement('span');
  host.setAttribute(CHIP_ATTR, '1');
  host.dataset.booking = booking;
  host.dataset.surface = 'list';
  if (bookingEl && bookingEl.parentElement === mountParent) {
    bookingEl.insertAdjacentElement('afterend', host);
  } else if (bookingEl?.parentElement) {
    bookingEl.parentElement.appendChild(host);
  } else {
    mountParent.appendChild(host);
  }
  return host;
}

function isCheckInListPage(): boolean {
  return Boolean(
    document.querySelector(
      '[id*="CheckInList"], [id*="checkInList.table"], [id*="tms.checkInList"]',
    ),
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
    if (!isCheckInListPage()) {
      document.querySelectorAll(`[${CHIP_ATTR}][data-surface="list"]`).forEach((el) => el.remove());
    }
    return;
  }

  const rows = table.querySelectorAll<HTMLElement>(
    'tbody tr.sapUiTableContentRow, tbody tr.sapUiTableTr',
  );
  const keep = new Set<HTMLElement>();
  const rowSet = new Set(rows);

  for (const row of rows) {
    const cell = reservationCellFromRow(row);
    if (!cell) continue;

    const booking = bookingFromCell(cell);
    const existing = cell.querySelector<HTMLElement>(`[${CHIP_ATTR}]`);

    if (!booking) {
      if (existing?.dataset.state === 'ok') keep.add(existing);
      continue;
    }

    const host = ensureListRowChip(cell, booking);
    keep.add(host);
    void hydrateChip(host, booking);
  }

  document.querySelectorAll<HTMLElement>(`[${CHIP_ATTR}][data-surface="list"]`).forEach((el) => {
    if (keep.has(el)) return;
    const row = el.closest('tr.sapUiTableContentRow, tr.sapUiTableTr');
    if (!row || !rowSet.has(row as HTMLElement)) el.remove();
  });
}

function isRoomStatusPage(): boolean {
  return Boolean(
    document.querySelector(
      [
        '[id*="RoomStatus"]',
        '[id*="zey_rs_room_status"]',
        '[id*="roomstatus.roomsHBox"]',
        '.sapMGT.roomTiles',
        '.sapMGT.roomTiles2',
      ].join(', '),
    ),
  );
}

function scanRoomStatusTiles() {
  const tiles = findRoomStatusTiles();
  const tileSet = new Set(tiles);

  // Do not wipe chips when tile query briefly returns empty mid-render
  if (tiles.length === 0) {
    if (!isRoomStatusPage()) {
      document.querySelectorAll(`[${CHIP_ATTR}][data-surface="room"]`).forEach((el) => el.remove());
    }
    return;
  }

  const keep = new Set<HTMLElement>();

  for (const tile of tiles) {
    const booking = bookingFromRoomTile(tile);
    const existing = tile.querySelector<HTMLElement>(`[${CHIP_ATTR}]`);

    if (!booking) {
      // Mid-render: keep an already-resolved chip on occupied-looking tiles
      if (existing?.dataset.state === 'ok' && tileLooksOccupied(tile)) {
        keep.add(existing);
        continue;
      }
      existing?.remove();
      continue;
    }

    const host = ensureRoomTileChip(tile, booking);
    keep.add(host);
    void hydrateChip(host, booking);
  }

  document.querySelectorAll<HTMLElement>(`[${CHIP_ATTR}][data-surface="room"]`).forEach((el) => {
    if (keep.has(el)) return;
    const tile = el.closest('.sapMGT');
    // Only drop orphans that are not on a live room tile
    if (!tile || !tileSet.has(tile as HTMLElement)) el.remove();
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
      if (!(t instanceof Element)) continue;
      // Ignore our chips / style, and ignore mutations that only touch our chip subtrees
      if (t.id === STYLE_ID || t.closest(`[${CHIP_ATTR}]`)) continue;
      if (
        m.type === 'childList' &&
        [...m.addedNodes, ...m.removedNodes].every(
          (n) =>
            n instanceof Element &&
            (n.matches(`[${CHIP_ATTR}]`) || n.closest(`[${CHIP_ATTR}]`)),
        )
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
