const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

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
  /** Short-lived presigned GET URL for the user's profile picture, or null. */
  avatarUrl?: string | null;
  /** Effective permission codes (defaults ∪ grants ∪ assigned roles). */
  permissions?: string[];
  /** Discord-style custom roles assigned to this user, sorted top to bottom. */
  roles?: MeRole[];
};

function getTokens() {
  if (typeof window === 'undefined') return { access: null as string | null, refresh: null as string | null };
  return {
    access: localStorage.getItem('accessToken'),
    refresh: localStorage.getItem('refreshToken'),
  };
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem('accessToken', access);
  localStorage.setItem('refreshToken', refresh);
}

export function clearTokens() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}

/**
 * In-flight refresh promise, shared across the whole app so that concurrent
 * 401s only trigger one POST /auth/refresh. Without this, two parallel API
 * calls race on the same refresh token: the server invalidates the token after
 * the first request consumes it, so the second one sees 401 and the user gets
 * unceremoniously logged out.
 */
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccess(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const { refresh } = getTokens();
    if (!refresh) return null;
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { accessToken: string; refreshToken: string };
      setTokens(data.accessToken, data.refreshToken);
      return data.accessToken;
    } catch {
      return null;
    } finally {
      // Always reset so the next 401 (e.g. after a true session expiry) can try again.
      // Tiny delay so any pending callers grab the cached promise first.
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
  let access = getTokens().access;
  const headers = new Headers(rest.headers);
  if (!skipAuth && access) {
    headers.set('Authorization', `Bearer ${access}`);
  }
  if (!headers.has('Content-Type') && rest.body && typeof rest.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  let res = await fetch(`${API_BASE}${path}`, { ...rest, headers });
  if (res.status === 401 && !skipAuth) {
    access = await refreshAccess();
    if (access) {
      headers.set('Authorization', `Bearer ${access}`);
      res = await fetch(`${API_BASE}${path}`, { ...rest, headers });
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
  setTokens(data.accessToken, data.refreshToken);
  return data;
}

export { API_BASE };
