import {
  ACTION_COLOR,
  PANEL_MESSAGE,
  PANEL_WIDTH_PX,
  STORAGE_KEYS,
  TAB_WIDTH_PX,
  storageGetBoolean,
  storageSet,
} from '../lib/storage';

const HOST_ID = 'prize-panel-host';

function chevronSvg(direction: 'left' | 'right') {
  const path =
    direction === 'left'
      ? 'M15 6l-6 6 6 6'
      : 'M9 6l6 6-6 6';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;
}

function applyCollapsed(shell: HTMLElement, tab: HTMLButtonElement, collapsed: boolean) {
  if (collapsed) {
    shell.style.width = '0';
    shell.style.opacity = '0';
    shell.style.pointerEvents = 'none';
    tab.style.borderRadius = '8px 0 0 8px';
    tab.innerHTML = chevronSvg('left');
    tab.title = 'PrizeBern Panel öffnen';
    tab.setAttribute('aria-label', 'PrizeBern Panel öffnen');
    tab.setAttribute('aria-expanded', 'false');
  } else {
    shell.style.width = `${PANEL_WIDTH_PX}px`;
    shell.style.opacity = '1';
    shell.style.pointerEvents = 'auto';
    tab.style.borderRadius = '0';
    tab.innerHTML = chevronSvg('right');
    tab.title = 'PrizeBern Panel einklappen';
    tab.setAttribute('aria-label', 'PrizeBern Panel einklappen');
    tab.setAttribute('aria-expanded', 'true');
  }
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

  const host = document.createElement('div');
  host.id = HOST_ID;
  Object.assign(host.style, {
    position: 'fixed',
    top: '0',
    right: '0',
    height: '100vh',
    zIndex: '2147483646',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'stretch',
    pointerEvents: 'none',
    fontFamily: 'system-ui, sans-serif',
  });

  const shell = document.createElement('div');
  shell.id = 'prize-panel-shell';
  Object.assign(shell.style, {
    height: '100%',
    overflow: 'hidden',
    background: '#FAFAF9',
    boxShadow: '-2px 0 12px rgba(26, 35, 50, 0.12)',
    transition: 'width 200ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms cubic-bezier(0.4, 0, 0.2, 1)',
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
    background: '#FAFAF9',
  });
  shell.appendChild(iframe);

  const tab = document.createElement('button');
  tab.id = 'prize-panel-tab';
  tab.type = 'button';
  Object.assign(tab.style, {
    width: `${TAB_WIDTH_PX}px`,
    minWidth: `${TAB_WIDTH_PX}px`,
    height: 'auto',
    alignSelf: 'center',
    marginTop: '0',
    marginBottom: '0',
    border: 'none',
    background: ACTION_COLOR,
    color: 'white',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 0',
    boxShadow: '-2px 0 8px rgba(59, 111, 160, 0.35)',
    transition: 'background 150ms ease, filter 150ms ease',
    pointerEvents: 'auto',
  });
  tab.addEventListener('mouseenter', () => {
    tab.style.filter = 'brightness(1.08)';
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
