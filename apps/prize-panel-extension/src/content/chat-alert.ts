import {
  DEFAULT_API_BASE,
  STORAGE_KEYS,
  storageGet,
} from '../lib/storage';

const TOAST_HOST_ID = 'prize-panel-chat-toast';
const POLL_MS = 8_000;

type ChatMsg = {
  id: string;
  body: string;
  author?: { id?: string; name?: string };
};

function isWebsiteChatPath(pathname: string): boolean {
  // App routes: /r/chat, /r/m/chat, /s/chat, /s/m/chat, /h/chat, /t/chat
  return /\/(?:r|s|h|t)(?:\/m)?\/chat(?:\/|$)/.test(pathname);
}

/** Reception web app already shows Socket.IO chat toasts — avoid a second popup. */
function isReceptionWebAppPath(pathname: string): boolean {
  return pathname === '/r' || pathname.startsWith('/r/');
}

function previewBody(body: string, max = 72): string {
  const trimmed = body.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function dismissToast() {
  document.getElementById(TOAST_HOST_ID)?.remove();
}

function showChatToast(author: string, body: string) {
  dismissToast();
  const el = document.createElement('div');
  el.id = TOAST_HOST_ID;
  Object.assign(el.style, {
    position: 'fixed',
    top: '16px',
    right: '16px',
    zIndex: '2147483647',
    maxWidth: '320px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '12px 14px',
    borderRadius: '12px',
    background: '#1A2332',
    color: '#f8fafc',
    border: '1px solid #2D3A4F',
    boxShadow: '0 8px 28px rgba(15, 23, 42, 0.35)',
    fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
    fontSize: '13px',
    lineHeight: '1.35',
    pointerEvents: 'auto',
  });

  const text = document.createElement('div');
  text.style.minWidth = '0';
  text.style.flex = '1';
  const title = document.createElement('div');
  title.style.fontWeight = '600';
  title.style.marginBottom = '2px';
  title.textContent = `Neue Nachricht von ${author}`;
  const preview = document.createElement('div');
  preview.style.opacity = '0.9';
  preview.style.wordBreak = 'break-word';
  preview.textContent = previewBody(body);
  text.appendChild(title);
  text.appendChild(preview);

  const close = document.createElement('button');
  close.type = 'button';
  close.setAttribute('aria-label', 'Schliessen');
  close.textContent = '×';
  Object.assign(close.style, {
    border: 'none',
    background: 'transparent',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: '18px',
    lineHeight: '1',
    padding: '0 2px',
    flexShrink: '0',
  });
  close.addEventListener('click', () => dismissToast());

  el.appendChild(text);
  el.appendChild(close);
  document.documentElement.appendChild(el);

  window.setTimeout(() => {
    if (el.isConnected) el.remove();
  }, 10_000);
}

export function startChatAlertWatcher(getPanelChatOpen: () => boolean) {
  let stopped = false;
  let meIdCache: string | null = null;
  let meLoaded = false;
  /** In-memory per tab so every window can toast independently. */
  let lastSeenId: string | null = null;

  const ensureMe = async (apiBase: string, headers: HeadersInit) => {
    if (meLoaded) return;
    try {
      const meRes = await fetch(`${apiBase}/auth/me`, { headers });
      if (meRes.ok) {
        const me = (await meRes.json()) as { id?: string };
        meIdCache = me.id ?? null;
      }
    } catch {
      // retry next poll
      return;
    }
    meLoaded = true;
  };

  const tick = async () => {
    if (stopped) return;
    try {
      const stored = await storageGet([
        STORAGE_KEYS.accessToken,
        STORAGE_KEYS.apiBase,
      ]);
      const token = stored.accessToken;
      if (!token) return;

      const apiBase = (stored.apiBase ?? DEFAULT_API_BASE).replace(/\/$/, '');
      const headers = { Authorization: `Bearer ${token}` };

      await ensureMe(apiBase, headers);

      const chatRes = await fetch(`${apiBase}/team-chat/messages?limit=1&order=desc`, {
        headers,
      });
      if (!chatRes.ok) return;
      const list = (await chatRes.json()) as ChatMsg[];
      const msg = Array.isArray(list) && list.length > 0 ? list[0] : null;
      if (!msg?.id) return;

      if (lastSeenId === null) {
        lastSeenId = msg.id;
        return;
      }
      if (msg.id === lastSeenId) return;
      lastSeenId = msg.id;

      if (msg.author?.id && meIdCache && msg.author.id === meIdCache) return;
      if (getPanelChatOpen()) return;
      if (isWebsiteChatPath(window.location.pathname)) return;
      if (isReceptionWebAppPath(window.location.pathname)) return;

      const author = msg.author?.name?.trim() || 'Team';
      showChatToast(author, msg.body ?? '');
    } catch {
      // Ignore network / auth errors — next poll retries.
    }
  };

  void tick();
  const intervalId = window.setInterval(() => {
    void tick();
  }, POLL_MS);

  return () => {
    stopped = true;
    window.clearInterval(intervalId);
    dismissToast();
  };
}
