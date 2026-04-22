const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export type Me = {
  id: string;
  email: string;
  role: string;
  name: string;
  phone?: string | null;
  titlePrefix?: string | null;
  /** Short-lived presigned GET URL for the user's profile picture, or null. */
  avatarUrl?: string | null;
  /** Effective permission codes (defaults ∪ admin grants). */
  permissions?: string[];
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

async function refreshAccess(): Promise<string | null> {
  const { refresh } = getTokens();
  if (!refresh) return null;
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: refresh }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  setTokens(data.accessToken, data.refreshToken);
  return data.accessToken;
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
