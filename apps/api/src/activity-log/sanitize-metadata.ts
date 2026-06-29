const REDACT_KEYS = new Set([
  'password',
  'passwordhash',
  'passwordHash',
  'refreshToken',
  'accessToken',
  'token',
  'apiKey',
  'apikey',
  'secret',
  'cardNumber',
  'cardnumber',
  'vccToken',
  'vcctoken',
  'cvv',
  'pin',
  'authorization',
]);

const MAX_STRING = 500;
const MAX_DEPTH = 6;
const MAX_ARRAY = 50;
const MAX_OBJECT_KEYS = 40;

function redactKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (REDACT_KEYS.has(key) || REDACT_KEYS.has(lower)) return true;
  return lower.includes('password') || lower.includes('token') || lower.includes('secret');
}

export function sanitizeMetadata(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > MAX_DEPTH) return '[truncated]';

  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    const slice = value.slice(0, MAX_ARRAY).map((v) => sanitizeMetadata(v, depth + 1));
    if (value.length > MAX_ARRAY) slice.push(`…+${value.length - MAX_ARRAY} more`);
    return slice;
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS);
    for (const [k, v] of entries) {
      out[k] = redactKey(k) ? '[redacted]' : sanitizeMetadata(v, depth + 1);
    }
    const total = Object.keys(value as Record<string, unknown>).length;
    if (total > MAX_OBJECT_KEYS) out._truncatedKeys = total - MAX_OBJECT_KEYS;
    return out;
  }

  return String(value);
}
