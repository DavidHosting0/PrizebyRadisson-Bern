import { STORAGE_KEYS, storageGet, storageRemove, storageSet } from './storage';

export const BT_API_BASE = 'https://bernticket.com/api';
export const BERN_TICKET_2FA_REQUIRED = 'BERN_TICKET_2FA_REQUIRED';

export type BtUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  theme?: string;
};

export type BtTicket = {
  id: string;
  guestName: string;
  bookingNumber?: string | null;
  otaNumber?: string | null;
  validFrom: string;
  validTo: string;
  ticketsAmount: number;
  status: string;
  platformState?: string | null;
  externalId?: string | null;
  rawData?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type BtTicketCreateBody = {
  guestName: string;
  bookingNumber?: string;
  otaNumber?: string;
  validFrom: string;
  validTo: string;
  ticketsAmount?: number;
};

export type BtTicketUpdateBody = Partial<BtTicketCreateBody>;

export class BtApiError extends Error {
  code?: string;
  status: number;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'BtApiError';
    this.status = status;
    this.code = code;
  }
}

export function getActivationCode(ticket: BtTicket | null | undefined): string | null {
  if (!ticket?.rawData) return null;
  try {
    const d = JSON.parse(ticket.rawData) as { activationCode?: string; codes?: string[] };
    if (d.activationCode) return String(d.activationCode);
    if (Array.isArray(d.codes) && d.codes[0]) return String(d.codes[0]);
  } catch {
    // ignore
  }
  return null;
}

export async function getBtTokens() {
  const stored = await storageGet([STORAGE_KEYS.btAccessToken, STORAGE_KEYS.btRefreshToken]);
  return {
    access: stored.btAccessToken ?? null,
    refresh: stored.btRefreshToken ?? null,
  };
}

export async function setBtTokens(access: string, refresh: string) {
  await storageSet({
    [STORAGE_KEYS.btAccessToken]: access,
    [STORAGE_KEYS.btRefreshToken]: refresh,
  });
}

export async function clearBtTokens() {
  await storageRemove([STORAGE_KEYS.btAccessToken, STORAGE_KEYS.btRefreshToken]);
}

export async function getBtRememberEmail(): Promise<string | undefined> {
  const stored = await storageGet([STORAGE_KEYS.btEmail]);
  return stored.btEmail;
}

export async function setBtRememberEmail(email: string | null) {
  if (email) await storageSet({ [STORAGE_KEYS.btEmail]: email });
  else await storageRemove([STORAGE_KEYS.btEmail]);
}

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccess(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const { refresh } = await getBtTokens();
    if (!refresh) return null;
    try {
      const res = await fetch(`${BT_API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        accessToken?: string;
        refreshToken?: string;
        error?: string;
      };
      if (!res.ok || !data.accessToken) {
        await clearBtTokens();
        return null;
      }
      await setBtTokens(data.accessToken, data.refreshToken || refresh);
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

export async function btLogin(email: string, password: string): Promise<BtUser> {
  const res = await fetch(`${BT_API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    accessToken?: string;
    refreshToken?: string;
    user?: BtUser;
    error?: string;
  };
  if (!res.ok || !data.accessToken || !data.refreshToken || !data.user) {
    throw new BtApiError(data.error || 'Anmeldung fehlgeschlagen', res.status);
  }
  await setBtTokens(data.accessToken, data.refreshToken);
  await setBtRememberEmail(data.user.email);
  return data.user;
}

export async function btLogout(): Promise<void> {
  try {
    const { access } = await getBtTokens();
    if (access) {
      await fetch(`${BT_API_BASE}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${access}`,
        },
      });
    }
  } catch {
    // ignore
  }
  await clearBtTokens();
}

export async function btMe(): Promise<BtUser | null> {
  try {
    return await btApi<BtUser>('/auth/me');
  } catch {
    return null;
  }
}

export async function btApi<T>(
  path: string,
  init: RequestInit & { skipAuth?: boolean } = {},
): Promise<T> {
  const { skipAuth, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (!headers.has('Content-Type') && rest.body && typeof rest.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  let { access } = await getBtTokens();
  if (!skipAuth && access) headers.set('Authorization', `Bearer ${access}`);

  let res = await fetch(`${BT_API_BASE}${path}`, { ...rest, headers });

  if (res.status === 401 && !skipAuth) {
    access = await refreshAccess();
    if (access) {
      headers.set('Authorization', `Bearer ${access}`);
      res = await fetch(`${BT_API_BASE}${path}`, { ...rest, headers });
    }
  }

  const data = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!res.ok) {
    const errObj = data as { error?: string; code?: string };
    throw new BtApiError(errObj.error || res.statusText || 'Anfrage fehlgeschlagen', res.status, errObj.code);
  }
  return data as T;
}

export async function btSearchTickets(search: string): Promise<BtTicket[]> {
  const q = encodeURIComponent(search.trim());
  const data = await btApi<BtTicket[] | { items: BtTicket[] }>(`/tickets?search=${q}`);
  return Array.isArray(data) ? data : data.items ?? [];
}

export async function btGetTicket(id: string): Promise<BtTicket> {
  return btApi<BtTicket>(`/tickets/${id}`);
}

export async function btCreateTicket(body: BtTicketCreateBody): Promise<BtTicket> {
  return btApi<BtTicket>('/tickets', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function btUpdateTicket(id: string, body: BtTicketUpdateBody): Promise<BtTicket> {
  return btApi<BtTicket>(`/tickets/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function btInvalidateTicket(id: string): Promise<BtTicket> {
  return btApi<BtTicket>(`/tickets/${id}/invalidate`, { method: 'POST' });
}

export async function btComplete2fa(code: string): Promise<void> {
  await btApi('/bernticket/complete-2fa', {
    method: 'POST',
    body: JSON.stringify({ code: code.trim() }),
  });
}

export function pickTicketForBooking(tickets: BtTicket[], bookingNumber: string): BtTicket | null {
  const bnr = bookingNumber.replace(/^0+/, '');
  if (!bnr) return tickets[0] ?? null;
  const match = tickets.find((t) => t.bookingNumber && t.bookingNumber.replace(/^0+/, '').includes(bnr));
  return match ?? tickets[0] ?? null;
}

export function toDateInputValue(isoOrDate: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(isoOrDate)) return isoOrDate.slice(0, 10);
  try {
    return new Date(isoOrDate).toISOString().slice(0, 10);
  } catch {
    return isoOrDate.slice(0, 10);
  }
}
