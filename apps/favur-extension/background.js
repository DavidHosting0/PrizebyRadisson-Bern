/*
 * Background service worker. Receives captured Favur API requests or Mirus NEO
 * DOM scrapes from content scripts, enriches with cookies where needed, and
 * POSTs them to the configured PrizeBern backend.
 */

const TAG = '[Schicht-Sync bg]';

const DEFAULTS = {
  apiBase: 'https://prizebern.com/api/v1',
  apiKey: '',
  enabled: true,
  windowDays: 14,
  lastUploadAt: null,
  lastUploadStatus: null,
  lastUploadUrl: null,
  lastDomImportAt: null,
  lastDomImportCount: 0,
  uploadCount: 0,
  errorCount: 0,
  dateLoopInProgress: false,
};

async function getSettings() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return Object.assign({}, DEFAULTS, stored);
}

async function setSettings(patch) {
  await chrome.storage.local.set(patch);
}

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/**
 * Read cookies for a host via chrome.cookies — includes HttpOnly cookies.
 */
async function readCookiesForUrl(requestUrl, domainHint) {
  const out = [];
  try {
    const url = new URL(requestUrl);
    const domain = domainHint || url.hostname.replace(/^www\./, '');
    const cookies = await chrome.cookies.getAll({ domain });
    for (const c of cookies) {
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

async function readFavurCookies(requestUrl) {
  return readCookiesForUrl(requestUrl, 'favur.ch');
}

async function readMirusCookies() {
  return readCookiesForUrl('https://neo.mirus.ch/', 'mirus.ch');
}

async function postJson(path, body) {
  const settings = await getSettings();
  if (!settings.enabled) return { skipped: true, reason: 'extension disabled' };
  if (!settings.apiKey || !settings.apiBase) {
    return { skipped: true, reason: 'not configured' };
  }

  let res;
  try {
    res = await fetch(`${settings.apiBase.replace(/\/+$/, '')}${path}`, {
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
      errorCount: (settings.errorCount ?? 0) + 1,
    });
    return { error: String(err) };
  }

  const okText = res.ok ? 'ok' : `http ${res.status}`;
  return { res, ok: res.ok, status: res.status, okText };
}

async function postCapture(capture) {
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

  const settings = await getSettings();
  const result = await postJson('/favur/import', body);
  if (result.skipped || result.error) return result;

  await setSettings({
    lastUploadAt: Date.now(),
    lastUploadStatus: result.okText,
    lastUploadUrl: capture.url,
    uploadCount: (settings.uploadCount ?? 0) + 1,
    errorCount: result.ok ? settings.errorCount ?? 0 : (settings.errorCount ?? 0) + 1,
  });
  return { ok: result.ok, status: result.status };
}

async function postDomImport(payload) {
  const settings = await getSettings();
  const cookies = await readMirusCookies();
  const body = {
    date: payload.date,
    pageUrl: payload.pageUrl,
    shifts: payload.shifts ?? [],
    cookies,
    capturedFrom: payload.capturedFrom,
    trigger: payload.trigger,
  };

  const result = await postJson('/favur/import-dom', body);
  if (result.skipped || result.error) return result;

  let importCount = payload.shifts?.length ?? 0;
  if (result.res) {
    try {
      const json = await result.res.json();
      importCount = json.persisted ?? importCount;
    } catch {
      /* ignore */
    }
  }

  await setSettings({
    lastUploadAt: Date.now(),
    lastDomImportAt: Date.now(),
    lastDomImportCount: importCount,
    lastUploadStatus: result.okText,
    lastUploadUrl: payload.pageUrl ?? payload.date,
    uploadCount: (settings.uploadCount ?? 0) + 1,
    errorCount: result.ok ? settings.errorCount ?? 0 : (settings.errorCount ?? 0) + 1,
  });
  return { ok: result.ok, status: result.status, count: importCount };
}

/** Aggregate scrapes from date-loop before a single bulk upload. */
const dateLoopBuffer = new Map();

async function flushDateLoopBuffer() {
  const allShifts = [];
  for (const entry of dateLoopBuffer.values()) {
    if (entry.shifts?.length) allShifts.push(...entry.shifts);
  }
  dateLoopBuffer.clear();
  if (allShifts.length === 0) return { ok: false, reason: 'no shifts collected' };

  const settings = await getSettings();
  const cookies = await readMirusCookies();
  const from = isoDate(new Date());
  const to = isoDate(addDays(new Date(), settings.windowDays ?? 14));

  const result = await postJson('/favur/import-dom', {
    shifts: allShifts,
    fromDate: from,
    toDate: to,
    pageUrl: `https://neo.mirus.ch/webapp/shifts/shift/${from}`,
    cookies,
    capturedFrom: 'extension date-loop',
    trigger: 'date-loop',
  });

  if (result.skipped || result.error) return result;

  let importCount = allShifts.length;
  if (result.res) {
    try {
      const json = await result.res.json();
      importCount = json.persisted ?? importCount;
    } catch {
      /* ignore */
    }
  }

  await setSettings({
    lastUploadAt: Date.now(),
    lastDomImportAt: Date.now(),
    lastDomImportCount: importCount,
    lastUploadStatus: result.okText,
    lastUploadUrl: `date-loop ${from}→${to}`,
    dateLoopInProgress: false,
  });
  return { ok: result.ok, count: importCount };
}

async function scrapeDateInTab(dateStr) {
  const url = `https://neo.mirus.ch/webapp/shifts/shift/${dateStr}`;
  const tab = await chrome.tabs.create({ url, active: false });

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.runtime.onMessage.removeListener(onMessage);
      chrome.tabs.remove(tab.id).catch(() => void 0);
      resolve({ date: dateStr, shifts: [], error: 'timeout' });
    }, 35000);

    function onMessage(msg, sender) {
      if (sender.tab?.id !== tab.id) return;
      if (msg?.type !== 'MIRUS_DOM_SCRAPE') return;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.runtime.onMessage.removeListener(onMessage);
      chrome.tabs.remove(tab.id).catch(() => void 0);
      resolve(msg.payload);
    }

    function onUpdated(tabId, info) {
      if (tabId !== tab.id || info.status !== 'complete') return;
      setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_NOW' }).catch(() => void 0);
      }, 2000);
    }

    chrome.runtime.onMessage.addListener(onMessage);
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

async function runDateLoop() {
  const settings = await getSettings();
  if (!settings.enabled || settings.dateLoopInProgress) return;
  await setSettings({ dateLoopInProgress: true });

  try {
    dateLoopBuffer.clear();
    const days = Math.min(Math.max(settings.windowDays ?? 14, 1), 60);
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    for (let i = 0; i < days; i++) {
      const dateStr = isoDate(addDays(start, i));
      const payload = await scrapeDateInTab(dateStr);
      if (payload?.shifts?.length) {
        dateLoopBuffer.set(dateStr, payload);
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    await flushDateLoopBuffer();
  } finally {
    await setSettings({ dateLoopInProgress: false });
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'CAPTURE' && msg.payload) {
    postCapture(msg.payload)
      .then((r) => sendResponse(r))
      .catch((err) => sendResponse({ error: String(err) }));
    return true;
  }
  if (msg && msg.type === 'MIRUS_DOM_SCRAPE' && msg.payload) {
    // During date-loop, buffer per-day scrapes; otherwise upload immediately
    getSettings().then((settings) => {
      if (settings.dateLoopInProgress) {
        if (msg.payload.date) {
          dateLoopBuffer.set(msg.payload.date, msg.payload);
        }
        sendResponse({ buffered: true });
      } else {
        postDomImport(msg.payload)
          .then((r) => sendResponse(r))
          .catch((err) => sendResponse({ error: String(err) }));
      }
    });
    return true;
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
  if (msg && msg.type === 'RUN_DATE_LOOP') {
    runDateLoop()
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
  const probe = {
    url: 'https://neo.mirus.ch/__extension_probe__',
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

// Every 15 minutes: scrape the next 14 days via background tabs (Mirus NEO mode)
chrome.alarms.create('mirus-date-loop', { periodInMinutes: 15 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'mirus-date-loop') {
    runDateLoop().catch((err) => console.warn(TAG, 'date loop failed', err));
  }
});

console.log(TAG, 'service worker booted');
