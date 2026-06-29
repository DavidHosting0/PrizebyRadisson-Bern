import {
  PANEL_BORDER_RADIUS_PX,
  PANEL_MAX_HEIGHT_PX,
  PANEL_MESSAGE,
  PANEL_WIDTH_PX,
  SIDEBAR_BORDER,
  SIDEBAR_COLOR,
  STORAGE_KEYS,
  TAB_HEIGHT_PX,
  TAB_WIDTH_PX,
  storageGetBoolean,
  storageSet,
} from '../lib/storage';

const HOST_ID = 'prize-panel-host';

function chevronSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>`;
}

function logoSvg() {
  return `<span style="font-size:11px;font-weight:700;letter-spacing:0.04em;color:white">PB</span>`;
}

function applyCollapsed(shell: HTMLElement, tab: HTMLButtonElement, collapsed: boolean) {
  const radius = `${PANEL_BORDER_RADIUS_PX}px 0 0 ${PANEL_BORDER_RADIUS_PX}px`;

  if (collapsed) {
    shell.style.width = '0';
    shell.style.opacity = '0';
    shell.style.pointerEvents = 'none';
    tab.style.display = 'flex';
    tab.innerHTML = chevronSvg();
    tab.title = 'PrizeBern Panel öffnen';
    tab.setAttribute('aria-label', 'PrizeBern Panel öffnen');
    tab.setAttribute('aria-expanded', 'false');
  } else {
    shell.style.width = `${PANEL_WIDTH_PX}px`;
    shell.style.opacity = '1';
    shell.style.pointerEvents = 'auto';
    tab.style.display = 'none';
    tab.title = 'PrizeBern Panel';
    tab.setAttribute('aria-expanded', 'true');
  }

  shell.style.borderRadius = radius;
  tab.style.borderRadius = radius;
}

async function togglePanel(
  shell: HTMLElement,
  tab: HTMLButtonElement,
  forceCollapsed?: boolean,
) {
  const current = await storageGetBoolean(STORAGE_KEYS.panelCollapsed);
  const willCollapse = forceCollapsed !== undefined ? forceCollapsed : !current;

  await storageSet({ [STORAGE_KEYS.panelCollapsed]: willCollapse });
  applyCollapsed(shell, tab, willCollapse);

  const iframe = shell.querySelector('iframe');
  iframe?.contentWindow?.postMessage(
    { type: willCollapse ? PANEL_MESSAGE.collapsed : PANEL_MESSAGE.expanded },
    '*',
  );
}

function injectPanel() {
  if (document.getElementById(HOST_ID)) return;

  const radius = `${PANEL_BORDER_RADIUS_PX}px 0 0 ${PANEL_BORDER_RADIUS_PX}px`;

  const host = document.createElement('div');
  host.id = HOST_ID;
  Object.assign(host.style, {
    position: 'fixed',
    top: '50%',
    right: '0',
    transform: 'translateY(-50%)',
    zIndex: '2147483646',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    pointerEvents: 'none',
    fontFamily: 'system-ui, sans-serif',
  });

  const shell = document.createElement('div');
  shell.id = 'prize-panel-shell';
  Object.assign(shell.style, {
    height: `${PANEL_MAX_HEIGHT_PX}px`,
    maxHeight: 'min(72vh, 500px)',
    overflow: 'hidden',
    background: SIDEBAR_COLOR,
    border: `1px solid ${SIDEBAR_BORDER}`,
    borderRight: 'none',
    borderRadius: radius,
    boxShadow: '-4px 0 24px rgba(26, 35, 50, 0.22), -1px 0 0 rgba(45, 58, 79, 0.5)',
    transition:
      'width 220ms cubic-bezier(0.4, 0, 0.2, 1), opacity 220ms cubic-bezier(0.4, 0, 0.2, 1)',
    pointerEvents: 'auto',
  });

  const iframe = document.createElement('iframe');
  iframe.id = 'prize-panel-iframe';
  iframe.src = chrome.runtime.getURL('src/panel/index.html');
  iframe.title = 'PrizeBern Panel';
  Object.assign(iframe.style, {
    width: `${PANEL_WIDTH_PX}px`,
    height: '100%',
    border: 'none',
    display: 'block',
    background: SIDEBAR_COLOR,
  });
  shell.appendChild(iframe);

  const tab = document.createElement('button');
  tab.id = 'prize-panel-tab';
  tab.type = 'button';
  Object.assign(tab.style, {
    width: `${TAB_WIDTH_PX}px`,
    height: `${TAB_HEIGHT_PX}px`,
    minWidth: `${TAB_WIDTH_PX}px`,
    border: `1px solid ${SIDEBAR_BORDER}`,
    borderRight: 'none',
    background: `linear-gradient(180deg, ${SIDEBAR_COLOR} 0%, #141c28 100%)`,
    color: 'white',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius,
    boxShadow: '-4px 0 20px rgba(26, 35, 50, 0.25)',
    transition: 'filter 150ms ease, transform 150ms ease',
    pointerEvents: 'auto',
  });
  tab.innerHTML = logoSvg();
  tab.addEventListener('mouseenter', () => {
    tab.style.filter = 'brightness(1.12)';
  });
  tab.addEventListener('mouseleave', () => {
    tab.style.filter = '';
  });
  tab.addEventListener('click', () => {
    void togglePanel(shell, tab);
  });

  host.appendChild(shell);
  host.appendChild(tab);
  document.documentElement.appendChild(host);

  void storageGetBoolean(STORAGE_KEYS.panelCollapsed).then((collapsed) => {
    applyCollapsed(shell, tab, collapsed);
  });

  window.addEventListener('message', (event) => {
    if (event.data?.type === PANEL_MESSAGE.toggle) {
      void togglePanel(shell, tab);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectPanel);
} else {
  injectPanel();
}
