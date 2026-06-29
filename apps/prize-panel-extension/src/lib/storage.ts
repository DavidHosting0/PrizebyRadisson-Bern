export const STORAGE_KEYS = {
  accessToken: 'accessToken',
  refreshToken: 'refreshToken',
  apiBase: 'apiBase',
  panelCollapsed: 'panelCollapsed',
  rememberEmail: 'rememberEmail',
} as const;

export const DEFAULT_API_BASE =
  import.meta.env.VITE_API_URL ?? 'https://prizebern.com/api/v1';

export const PANEL_WIDTH_PX = 300;
export const PANEL_MAX_HEIGHT_PX = 500;
export const PANEL_BORDER_RADIUS_PX = 20;
export const TAB_WIDTH_PX = 40;
export const TAB_HEIGHT_PX = 72;
/** Dark navy — main extension chrome (matches web sidebar). */
export const SIDEBAR_COLOR = '#1A2332';
export const SIDEBAR_BORDER = '#2D3A4F';
export const ACTION_COLOR = '#3B6FA0';

export const PANEL_MESSAGE = {
  toggle: 'prize-panel:toggle',
  collapsed: 'prize-panel:collapsed',
  expanded: 'prize-panel:expanded',
} as const;

export async function storageGet<T extends string>(
  keys: T[],
): Promise<Record<T, string | undefined>> {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => {
      resolve(result as Record<T, string | undefined>);
    });
  });
}

export async function storageGetBoolean(key: string): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      resolve(Boolean(result[key]));
    });
  });
}

export async function storageSet(values: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(values, () => resolve());
  });
}

export async function storageRemove(keys: string[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(keys, () => resolve());
  });
}
