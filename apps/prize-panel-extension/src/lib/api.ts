import {
  DEFAULT_API_BASE,
  STORAGE_KEYS,
  normalizeApiBase,
  resolveApiBase,
  storageGet,
  storageRemove,
  storageSet,
} from './storage';

export type MeRole = {
  id: string;
  name: string;
  color: string;
  position: number;
};

export type Me = {
  id: string;
  email: string;
  role: string;
  name: string;
  phone?: string | null;
  titlePrefix?: string | null;
  preferredLocale?: string;
  avatarUrl?: string | null;
  permissions?: string[];
  roles?: MeRole[];
};

let cachedApiBase: string | null = null;

export { normalizeApiBase };

export async function getApiBase(): Promise<string> {
  if (cachedApiBase) return cachedApiBase;
  const stored = await storageGet([STORAGE_KEYS.apiBase]);
  cachedApiBase = resolveApiBase(stored.apiBase);
  return cachedApiBase;
}

export async function setApiBase(url: string): Promise<void> {
  cachedApiBase = normalizeApiBase(url);
  await storageSet({ [STORAGE_KEYS.apiBase]: cachedApiBase });
}

async function getTokens() {
  const stored = await storageGet([STORAGE_KEYS.accessToken, STORAGE_KEYS.refreshToken]);
  return {
    access: stored.accessToken ?? null,
    refresh: stored.refreshToken ?? null,
  };
}

export async function setTokens(access: string, refresh: string) {
  await storageSet({
    [STORAGE_KEYS.accessToken]: access,
    [STORAGE_KEYS.refreshToken]: refresh,
  });
}

export async function clearTokens() {
  await storageRemove([STORAGE_KEYS.accessToken, STORAGE_KEYS.refreshToken]);
}

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccess(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const { refresh } = await getTokens();
    if (!refresh) return null;
    try {
      const apiBase = await getApiBase();
      const res = await fetch(`${apiBase}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { accessToken: string; refreshToken: string };
      await setTokens(data.accessToken, data.refreshToken);
      return data.accessToken;
    } catch {
      return null;
    } finally {
      setTimeout(() => {
        refreshInFlight = null;
      }, 50);
    }
  })();
  return refreshInFlight;
}

export async function api<T>(
  path: string,
  init: RequestInit & { skipAuth?: boolean } = {},
): Promise<T> {
  const { skipAuth, ...rest } = init;
  const apiBase = await getApiBase();
  let { access } = await getTokens();
  const headers = new Headers(rest.headers);
  if (!skipAuth && access) {
    headers.set('Authorization', `Bearer ${access}`);
  }
  if (!headers.has('Content-Type') && rest.body && typeof rest.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  let res = await fetch(`${apiBase}${path}`, { ...rest, headers });
  if (res.status === 401 && !skipAuth) {
    access = await refreshAccess();
    if (access) {
      headers.set('Authorization', `Bearer ${access}`);
      res = await fetch(`${apiBase}${path}`, { ...rest, headers });
    }
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function loginRequest(email: string, password: string) {
  const data = await api<{
    accessToken: string;
    refreshToken: string;
    user: Me;
  }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    skipAuth: true,
  });
  await setTokens(data.accessToken, data.refreshToken);
  return data;
}

export async function hasAccessToken(): Promise<boolean> {
  const { access } = await getTokens();
  return Boolean(access);
}
