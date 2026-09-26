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
  const nodes = document.querySelectorAll<HTMLElement>(
    [
      '.sapMGT.roomTiles[id*="RoomStatus"]',
      '.sapMGT.roomTiles2[id*="RoomStatus"]',
      '.sapMGT[id*="RoomStatus"][id*="roomstatus.roomsHBox"]',
      '[id*="---RoomStatus--"][id*="roomstatus.roomsHBox"].sapMGT',
    ].join(', '),
  );
  return [...nodes];
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    [${CHIP_ATTR}]{
      display:block;
      margin-top:0.12rem;
      line-height:1.15;
      max-width:100%;
    }
    [${CHIP_ATTR}][data-surface="room"]{
      margin-top:0;
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
    /* Fit into empty GenericTile header title */
    .sapMGTHdrTxt [${CHIP_ATTR}],
    .sapMGTTitle [${CHIP_ATTR}],
    .sapMTextMaxLine [${CHIP_ATTR}]{
      display:inline-block;
      vertical-align:middle;
    }
  `;
  document.documentElement.appendChild(style);
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
    tile.querySelector<HTMLElement>('.sapMGTContent, .sapMTileCntContent, [id$="-content"]') ||
    tile;
  return bookingFromTexts(content);
}

function mountParentForCell(cell: HTMLElement): HTMLElement {
  return (
    cell.querySelector<HTMLElement>('.sapMVBox') ||
    cell.querySelector<HTMLElement>('.sapUiTableCellInner') ||
    cell
  );
}

function mountParentForRoomTile(tile: HTMLElement): HTMLElement | null {
  // Prefer the empty header title field the user highlighted
  const titleInner =
    tile.querySelector<HTMLElement>('[id$="-title-inner"]') ||
    tile.querySelector<HTMLElement>('.sapMGTTitle .sapMTextMaxLine') ||
    tile.querySelector<HTMLElement>('.sapMGTHdrTxt .sapMTextMaxLine');
  if (titleInner) return titleInner;

  const hdr =
    tile.querySelector<HTMLElement>('.sapMGTHdrTxt') ||
    tile.querySelector<HTMLElement>('[id$="-hdr-text"]');
  if (hdr) return hdr;

  // Fallback: after reservation-number row in content
  const resRow = [...tile.querySelectorAll<HTMLElement>('.sapMHBox')].find((box) =>
    [...box.querySelectorAll('.sapMText')].some((t) => /^\d{6,}$/.test((t.textContent || '').trim())),
  );
  return resRow || null;
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
): HTMLElement {
  let host = parent.querySelector<HTMLElement>(`:scope > [${CHIP_ATTR}]`);
  if (!host && mode === 'room') {
    host = parent.querySelector<HTMLElement>(`[${CHIP_ATTR}]`);
  }
  if (host) {
    if (host.dataset.booking !== booking) {
      host.dataset.booking = booking;
      host.dataset.state = '';
      host.innerHTML = '';
    }
    host.dataset.surface = mode;
    return host;
  }

  host = document.createElement('div');
  host.setAttribute(CHIP_ATTR, '1');
  host.dataset.booking = booking;
  host.dataset.surface = mode;

  if (mode === 'room') {
    parent.appendChild(host);
    return host;
  }

  const firstRow =
    parent.querySelector(':scope > .sapMHBox') || parent.querySelector(':scope > .sapMFlexItem');
  if (firstRow?.parentElement === parent) {
    firstRow.insertAdjacentElement('afterend', host);
  } else {
    parent.appendChild(host);
  }
  return host;
}

async function hydrateChip(host: HTMLElement, booking: string) {
  if (host.dataset.booking === booking && (host.dataset.state === 'ok' || host.dataset.state === 'none')) {
    return;
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
  if (!table) return;

  const rows = table.querySelectorAll<HTMLElement>(
    'tbody tr.sapUiTableContentRow, tbody tr.sapUiTableTr',
  );

  for (const row of rows) {
    const cell =
      row.querySelector<HTMLElement>('[id$="-col0"]') ||
      row.querySelector<HTMLElement>('td.sapUiTableCellFirst') ||
      row.querySelector<HTMLElement>('td.sapUiTableDataCell');
    if (!cell) continue;

    const booking = bookingFromCell(cell);
    if (!booking) continue;

    const parent = mountParentForCell(cell);
    const host = ensureChipHost(parent, booking, 'list');
    void hydrateChip(host, booking);
  }
}

function scanRoomStatusTiles() {
  for (const tile of findRoomStatusTiles()) {
    const booking = bookingFromRoomTile(tile);
    const existing = tile.querySelector<HTMLElement>(`[${CHIP_ATTR}]`);

    if (!booking) {
      existing?.remove();
      continue;
    }

    const parent = mountParentForRoomTile(tile);
    if (!parent) continue;

    // Drop stale chip if it ended up elsewhere in the tile
    if (existing && !parent.contains(existing)) existing.remove();

    const host = ensureChipHost(parent, booking, 'room');
    void hydrateChip(host, booking);
  }
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
