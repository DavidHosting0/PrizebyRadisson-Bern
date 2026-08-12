export const STORAGE_KEYS = {
  accessToken: 'accessToken',
  refreshToken: 'refreshToken',
  apiBase: 'apiBase',
  panelCollapsed: 'panelCollapsed',
  rememberEmail: 'rememberEmail',
} as const;

export const DEFAULT_API_BASE =
  import.meta.env.VITE_API_URL ?? 'https://prizebern.com/api/v1';

/** Only PrizeBern production + local API — store-safe credential destination allowlist. */
export const ALLOWED_API_ORIGINS = new Set([
  'https://prizebern.com',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
]);

/** Normalize and validate an API base (`…/api/v1`). Throws if origin is not allowlisted. */
export function normalizeApiBase(url: string): string {
  const trimmed = url.trim().replace(/\/$/, '');
  if (!trimmed) throw new Error('API-URL fehlt');
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Ungültige API-URL');
  }
  if (!ALLOWED_API_ORIGINS.has(parsed.origin)) {
    throw new Error('Nur prizebern.com oder localhost:3001 erlaubt');
  }
  const path = parsed.pathname.replace(/\/$/, '') || '';
  if (path !== '/api/v1') {
    throw new Error('API-URL muss auf /api/v1 enden');
  }
  return `${parsed.origin}/api/v1`;
}

export function resolveApiBase(raw: string | undefined): string {
  try {
    return normalizeApiBase(raw ?? DEFAULT_API_BASE);
  } catch {
    return DEFAULT_API_BASE;
  }
}

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
  /** Panel iframe → content script: user is viewing team chat in this tab's panel. */
  chatOpen: 'prize-panel:chat-open',
  chatClosed: 'prize-panel:chat-closed',
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
