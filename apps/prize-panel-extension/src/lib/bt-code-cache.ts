/**
 * Shared BernTicket activation-code lookup with in-memory cache.
 * Used by check-in list + room status tile injectors.
 */
import {
  btSearchTickets,
  getActivationCode,
  getBtTokens,
  pickTicketForBooking,
} from './bernticket-api';

const CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry = { code: string | null; at: number };

const codeCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<string | null>>();

export function normalizeBooking(raw: string): string {
  return raw.replace(/^0+/, '') || raw;
}

export function peekCachedCode(booking: string): { code: string | null } | null {
  const hit = codeCache.get(booking);
  if (!hit || Date.now() - hit.at >= CACHE_TTL_MS) return null;
  return { code: hit.code };
}

export function clearBtCodeCache() {
  codeCache.clear();
  inflight.clear();
}

export async function resolveActivationCode(booking: string): Promise<string | null> {
  const key = normalizeBooking(booking);
  const hit = codeCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.code;

  let pending = inflight.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        const tokens = await getBtTokens();
        if (!tokens?.accessToken) {
          codeCache.set(key, { code: null, at: Date.now() });
          return null;
        }
        const tickets = await btSearchTickets(key);
        const ticket = pickTicketForBooking(tickets, key);
        const code = getActivationCode(ticket);
        codeCache.set(key, { code, at: Date.now() });
        return code;
      } catch {
        codeCache.set(key, { code: null, at: Date.now() });
        return null;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, pending);
  }
  return pending;
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}
