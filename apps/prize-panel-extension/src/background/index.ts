import {
  DEFAULT_API_BASE,
  PANEL_MESSAGE,
  STORAGE_KEYS,
  resolveApiBase,
  storageGet,
  storageSet,
} from '../lib/storage';

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get([STORAGE_KEYS.apiBase], (result) => {
    if (!result[STORAGE_KEYS.apiBase]) {
      void storageSet({ [STORAGE_KEYS.apiBase]: DEFAULT_API_BASE });
    }
  });
});

type ChatMsg = {
  id: string;
  body: string;
  author?: { id?: string; name?: string };
};

export type LatestChatResult = {
  ok: boolean;
  meId?: string | null;
  msg?: ChatMsg | null;
};

const CACHE_MS = 8_000;
let cache: { at: number; result: LatestChatResult } | null = null;
let inFlight: Promise<LatestChatResult> | null = null;

async function fetchLatestChat(): Promise<LatestChatResult> {
  const stored = await storageGet([
    STORAGE_KEYS.accessToken,
    STORAGE_KEYS.apiBase,
  ]);
  const token = stored.accessToken;
  if (!token) return { ok: false };

  const apiBase = resolveApiBase(stored.apiBase);
  const headers = { Authorization: `Bearer ${token}` };

  let meId: string | null = null;
  try {
    const meRes = await fetch(`${apiBase}/auth/me`, { headers });
    if (meRes.ok) {
      const me = (await meRes.json()) as { id?: string };
      meId = me.id ?? null;
    } else if (meRes.status === 401) {
      return { ok: false };
    }
  } catch {
    return { ok: false };
  }

  try {
    const chatRes = await fetch(`${apiBase}/team-chat/messages?limit=1&order=desc`, {
      headers,
    });
    if (!chatRes.ok) return { ok: false };
    const list = (await chatRes.json()) as ChatMsg[];
    const msg = Array.isArray(list) && list.length > 0 ? list[0] : null;
    return { ok: true, meId, msg };
  } catch {
    return { ok: false };
  }
}

function getLatestChat(): Promise<LatestChatResult> {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return Promise.resolve(cache.result);
  }
  if (inFlight) return inFlight;
  inFlight = fetchLatestChat()
    .then((result) => {
      cache = { at: Date.now(), result };
      return result;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== PANEL_MESSAGE.latestChat) return;
  void getLatestChat().then(sendResponse);
  return true;
});
