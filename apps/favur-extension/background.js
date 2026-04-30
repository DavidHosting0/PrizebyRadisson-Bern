/*
 * Background service worker. Receives captured Favur requests from the
 * content script, enriches them with cookies (so HttpOnly cookies — which
 * are normally invisible to page JS — are included), and POSTs them to the
 * configured PrizeBern backend.
 */

const TAG = '[Favur-Sync bg]';

const DEFAULTS = {
  apiBase: 'https://prizebern.com/api/v1',
  apiKey: '',
  enabled: true,
  lastUploadAt: null,
  lastUploadStatus: null,
  lastUploadUrl: null,
  uploadCount: 0,
  errorCount: 0,
};

async function getSettings() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return Object.assign({}, DEFAULTS, stored);
}

async function setSettings(patch) {
  await chrome.storage.local.set(patch);
}

/**
 * Read all cookies for *.favur.ch via chrome.cookies — this gives us
 * HttpOnly cookies too, which page JS cannot see.
 */
async function readFavurCookies(requestUrl) {
  const out = [];
  try {
    const url = new URL(requestUrl);
    const cookies = await chrome.cookies.getAll({ domain: 'favur.ch' });
    for (const c of cookies) {
      // Filter to cookies that would actually be sent to the request URL.
      const cookieDomain = c.domain.replace(/^\./, '');
      if (!url.hostname.endsWith(cookieDomain)) continue;
      if (c.secure && url.protocol !== 'https:') continue;
      out.push({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
      });
    }
  } catch (err) {
    console.warn(TAG, 'cookie read failed', err);
  }
  return out;
}

async function postCapture(capture) {
  const settings = await getSettings();
  if (!settings.enabled) return { skipped: true, reason: 'extension disabled' };
  if (!settings.apiKey || !settings.apiBase) {
    return { skipped: true, reason: 'not configured' };
  }

  const cookies = await readFavurCookies(capture.url);

  const body = {
    url: capture.url,
    method: capture.method,
    headers: capture.requestHeaders ?? {},
    cookies,
    body: capture.requestBody ?? undefined,
    responseStatus: capture.responseStatus,
    responseSample: capture.responseSample,
    capturedFrom: navigator.userAgent.slice(0, 150),
  };

  let res;
  try {
    res = await fetch(`${settings.apiBase.replace(/\/+$/, '')}/favur/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    await setSettings({
      lastUploadAt: Date.now(),
      lastUploadStatus: `network error: ${(err && err.message) || err}`,
      lastUploadUrl: capture.url,
      errorCount: (settings.errorCount ?? 0) + 1,
    });
    return { error: String(err) };
  }

  const okText = res.ok ? 'ok' : `http ${res.status}`;
  await setSettings({
    lastUploadAt: Date.now(),
    lastUploadStatus: okText,
    lastUploadUrl: capture.url,
    uploadCount: (settings.uploadCount ?? 0) + 1,
    errorCount: res.ok ? settings.errorCount ?? 0 : (settings.errorCount ?? 0) + 1,
  });
  return { ok: res.ok, status: res.status };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'CAPTURE' && msg.payload) {
    postCapture(msg.payload)
      .then((r) => sendResponse(r))
      .catch((err) => sendResponse({ error: String(err) }));
    return true; // async response
  }
  if (msg && msg.type === 'GET_STATUS') {
    getSettings().then((s) => sendResponse(s));
    return true;
  }
  if (msg && msg.type === 'SET_SETTINGS') {
    setSettings(msg.patch ?? {})
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ error: String(err) }));
    return true;
  }
  if (msg && msg.type === 'TEST_CONNECTION') {
    testConnection()
      .then((r) => sendResponse(r))
      .catch((err) => sendResponse({ error: String(err) }));
    return true;
  }
  return false;
});

async function testConnection() {
  const settings = await getSettings();
  if (!settings.apiKey || !settings.apiBase) {
    return { ok: false, error: 'API base + key not set' };
  }
  // Send a tiny throwaway capture so the backend can verify the key.
  const probe = {
    url: 'https://web.favur.ch/__extension_probe__',
    method: 'GET',
    headers: {},
    cookies: [],
    responseStatus: 0,
    responseSample: '{}',
    capturedFrom: 'extension test connection',
  };
  let res;
  try {
    res = await fetch(`${settings.apiBase.replace(/\/+$/, '')}/favur/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify(probe),
    });
  } catch (err) {
    return { ok: false, error: `network: ${(err && err.message) || err}` };
  }
  if (res.ok) return { ok: true };
  const txt = await res.text().catch(() => '');
  return { ok: false, error: `http ${res.status}: ${txt.slice(0, 200)}` };
}

console.log(TAG, 'service worker booted');
