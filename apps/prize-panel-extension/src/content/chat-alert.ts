import {
  ACTION_COLOR,
  PANEL_MESSAGE,
  SIDEBAR_BORDER,
  SIDEBAR_COLOR,
  STORAGE_KEYS,
  storageGetBoolean,
} from '../lib/storage';
import {
  getMessages,
  interpolate,
  loadExtensionLocale,
  watchExtensionLocale,
  type ExtensionMessages,
} from '../i18n';

let msgs: ExtensionMessages = getMessages('de');

const TOAST_HOST_ID = 'prize-panel-chat-toast';
const TOAST_STYLE_ID = 'prize-panel-chat-toast-style';
const POLL_MS = 8_000;
const AUTO_DISMISS_MS = 7_000;

type LatestChatResult = {
  ok: boolean;
  meId?: string | null;
  msg?: { id: string; body: string; author?: { id?: string; name?: string } } | null;
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

function ensureToastStyles() {
  if (document.getElementById(TOAST_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = TOAST_STYLE_ID;
  style.textContent = `
    @keyframes prize-chat-toast-in {
      from { opacity: 0; transform: translateY(14px) scale(.96); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes prize-chat-toast-out {
      from { opacity: 1; transform: translateY(0) scale(1); }
      to { opacity: 0; transform: translateY(10px) scale(.96); }
    }
    #${TOAST_HOST_ID}{
      position:fixed;left:16px;bottom:16px;z-index:2147483647;
      width:min(320px,calc(100vw - 32px));
      display:flex;align-items:flex-start;gap:10px;
      padding:12px 12px 12px 10px;
      border-radius:16px;
      background:linear-gradient(180deg, ${SIDEBAR_COLOR} 0%, #141c28 100%);
      color:#f8fafc;
      border:1px solid ${SIDEBAR_BORDER};
      box-shadow:0 12px 32px rgba(15,23,42,.38), 0 0 0 1px rgba(255,255,255,.04) inset;
      font-family:system-ui,-apple-system,"Segoe UI",sans-serif;
      font-size:13px;line-height:1.35;
      pointer-events:auto;
      animation:prize-chat-toast-in .28s cubic-bezier(.22,1,.36,1) both;
    }
    #${TOAST_HOST_ID}.prize-chat-toast-leave{
      animation:prize-chat-toast-out .22s ease forwards;
    }
    #${TOAST_HOST_ID} .pb-ct-logo{
      width:28px;height:28px;flex-shrink:0;object-fit:contain;
      filter:brightness(0) invert(1);margin-top:1px;
    }
    #${TOAST_HOST_ID} .pb-ct-body{min-width:0;flex:1;}
    #${TOAST_HOST_ID} .pb-ct-eyebrow{
      font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
      color:${ACTION_COLOR};margin-bottom:2px;
    }
    #${TOAST_HOST_ID} .pb-ct-title{
      font-weight:600;color:#fff;margin-bottom:2px;
    }
    #${TOAST_HOST_ID} .pb-ct-preview{
      color:#94a3b8;word-break:break-word;font-size:12px;
    }
    #${TOAST_HOST_ID} .pb-ct-close{
      appearance:none;border:none;background:transparent;color:#94a3b8;
      cursor:pointer;font-size:18px;line-height:1;padding:0 2px;flex-shrink:0;
      border-radius:6px;
    }
    #${TOAST_HOST_ID} .pb-ct-close:hover{color:#fff;background:rgba(255,255,255,.08);}
  `;
  document.documentElement.appendChild(style);
}

let dismissTimer: number | null = null;

function dismissToast(animated = true) {
  const el = document.getElementById(TOAST_HOST_ID);
  if (!el) return;
  if (dismissTimer) {
    window.clearTimeout(dismissTimer);
    dismissTimer = null;
  }
  if (!animated) {
    el.remove();
    return;
  }
  el.classList.add('prize-chat-toast-leave');
  window.setTimeout(() => el.remove(), 220);
}

function playNotificationSound() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.1, now + 0.02);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    master.connect(ctx.destination);

    const tone = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.9, start + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    };

    tone(784, now, 0.14);
    tone(1046.5, now + 0.12, 0.22);

    window.setTimeout(() => {
      void ctx.close();
    }, 600);
  } catch {
    // Autoplay policies / missing AudioContext — ignore
  }
}

function showChatToast(author: string, body: string) {
  ensureToastStyles();
  dismissToast(false);

  const el = document.createElement('div');
  el.id = TOAST_HOST_ID;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');

  const logo = document.createElement('img');
  logo.className = 'pb-ct-logo';
  logo.alt = '';
  logo.src = chrome.runtime.getURL('PrizeByRadisson.png');

  const text = document.createElement('div');
  text.className = 'pb-ct-body';
  text.innerHTML =
    `<div class="pb-ct-eyebrow"></div>` +
    `<div class="pb-ct-title"></div>` +
    `<div class="pb-ct-preview"></div>`;
  const eyebrowEl = text.querySelector('.pb-ct-eyebrow') as HTMLElement;
  const titleEl = text.querySelector('.pb-ct-title') as HTMLElement;
  const previewEl = text.querySelector('.pb-ct-preview') as HTMLElement;
  eyebrowEl.textContent = msgs.toast.eyebrow;
  titleEl.textContent = interpolate(msgs.toast.newMessageFrom, { author });
  previewEl.textContent = previewBody(body);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'pb-ct-close';
  close.setAttribute('aria-label', msgs.toast.close);
  close.textContent = '×';
  close.addEventListener('click', (e) => {
    e.stopPropagation();
    dismissToast(true);
  });

  el.addEventListener('click', () => dismissToast(true));

  el.appendChild(logo);
  el.appendChild(text);
  el.appendChild(close);
  document.documentElement.appendChild(el);

  playNotificationSound();

  dismissTimer = window.setTimeout(() => {
    dismissToast(true);
  }, AUTO_DISMISS_MS);
}

function askLatestChat(): Promise<LatestChatResult> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: PANEL_MESSAGE.latestChat }, (res) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false });
          return;
        }
        resolve((res as LatestChatResult) ?? { ok: false });
      });
    } catch {
      resolve({ ok: false });
    }
  });
}

export function startChatAlertWatcher(getPanelChatOpen: () => boolean) {
  let stopped = false;
  /** In-memory per tab so every window can toast independently. */
  let lastSeenId: string | null = null;
  let notificationsEnabled = true;

  void loadExtensionLocale().then((locale) => {
    msgs = getMessages(locale);
  });
  const unwatchLocale = watchExtensionLocale((locale) => {
    msgs = getMessages(locale);
  });

  void storageGetBoolean(STORAGE_KEYS.chatNotificationsEnabled, true).then((v) => {
    notificationsEnabled = v;
  });

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes[STORAGE_KEYS.chatNotificationsEnabled]) {
        const next = changes[STORAGE_KEYS.chatNotificationsEnabled].newValue;
        notificationsEnabled = next === undefined ? true : Boolean(next);
        if (!notificationsEnabled) dismissToast(false);
      }
    });
  } catch {
    // ignore
  }

  const tick = async () => {
    if (stopped) return;
    try {
      if (!notificationsEnabled) return;

      const result = await askLatestChat();
      if (!result.ok) return;
      const msg = result.msg;
      if (!msg?.id) return;

      if (lastSeenId === null) {
        lastSeenId = msg.id;
        return;
      }
      if (msg.id === lastSeenId) return;
      lastSeenId = msg.id;

      if (msg.author?.id && result.meId && msg.author.id === result.meId) return;
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
    unwatchLocale();
    dismissToast(false);
  };
}
