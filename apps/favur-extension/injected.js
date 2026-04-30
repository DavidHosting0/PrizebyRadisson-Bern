/*
 * Runs in the page's MAIN world (alongside Favur's own JS) so we can
 * monkey-patch window.fetch and XMLHttpRequest. Captured calls are pushed
 * back to the content script via window.postMessage — content scripts run
 * in an isolated world but share the page's window for postMessage.
 */
(() => {
  const TAG = '[Favur-Sync inj]';

  const originalFetch = window.fetch.bind(window);
  window.fetch = async function patchedFetch(input, init) {
    const start = Date.now();
    const reqInfo = describeFetchRequest(input, init);
    let res;
    try {
      res = await originalFetch(input, init);
    } catch (err) {
      // Network errors aren't useful captures; just rethrow.
      throw err;
    }
    if (!shouldCapture(reqInfo.url)) return res;

    // Clone so we can read the body without consuming the original response.
    const clone = res.clone();
    clone
      .text()
      .then((bodyText) => {
        const headersOut = {};
        res.headers.forEach((v, k) => {
          headersOut[k] = v;
        });
        emit({
          method: reqInfo.method,
          url: reqInfo.url,
          requestHeaders: reqInfo.headers,
          requestBody: reqInfo.body,
          responseStatus: res.status,
          responseHeaders: headersOut,
          responseSample: bodyText.slice(0, 64 * 1024),
          tookMs: Date.now() - start,
        });
      })
      .catch(() => void 0);
    return res;
  };

  // XMLHttpRequest patching — Favur may use either fetch or axios (which uses XHR
  // in some configurations). Cover both to be safe.
  const OrigXHR = window.XMLHttpRequest;
  function PatchedXHR() {
    const xhr = new OrigXHR();
    let captured = { url: '', method: 'GET', requestHeaders: {}, requestBody: null };
    const origOpen = xhr.open;
    xhr.open = function open(method, url, ...rest) {
      captured.method = (method || 'GET').toUpperCase();
      captured.url = String(url || '');
      return origOpen.call(this, method, url, ...rest);
    };
    const origSetReq = xhr.setRequestHeader;
    xhr.setRequestHeader = function setRequestHeader(name, value) {
      captured.requestHeaders[name] = value;
      return origSetReq.call(this, name, value);
    };
    const origSend = xhr.send;
    xhr.send = function send(body) {
      captured.requestBody = body == null ? null : String(body);
      this.addEventListener('loadend', () => {
        if (!shouldCapture(captured.url)) return;
        const respHeaders = parseAllResponseHeaders(this.getAllResponseHeaders());
        emit({
          method: captured.method,
          url: absoluteUrl(captured.url),
          requestHeaders: captured.requestHeaders,
          requestBody: captured.requestBody,
          responseStatus: this.status,
          responseHeaders: respHeaders,
          responseSample: typeof this.responseText === 'string'
            ? this.responseText.slice(0, 64 * 1024)
            : '',
          tookMs: 0,
        });
      });
      return origSend.call(this, body);
    };
    return xhr;
  }
  window.XMLHttpRequest = PatchedXHR;

  // Helpers ----------------------------------------------------------------

  function describeFetchRequest(input, init) {
    if (typeof input === 'string') {
      return {
        url: absoluteUrl(input),
        method: ((init && init.method) || 'GET').toUpperCase(),
        headers: headersToObject((init && init.headers) || {}),
        body: init && init.body != null ? safeStringify(init.body) : null,
      };
    }
    // Request object
    const r = input;
    const headers = {};
    try {
      r.headers.forEach((v, k) => {
        headers[k] = v;
      });
    } catch {
      /* ignore */
    }
    let body = null;
    try {
      body = init && init.body != null ? safeStringify(init.body) : null;
    } catch {
      /* ignore */
    }
    return {
      url: absoluteUrl(r.url),
      method: (r.method || 'GET').toUpperCase(),
      headers,
      body,
    };
  }

  function headersToObject(input) {
    const out = {};
    if (!input) return out;
    if (input instanceof Headers) {
      input.forEach((v, k) => {
        out[k] = v;
      });
      return out;
    }
    if (Array.isArray(input)) {
      for (const [k, v] of input) out[k] = v;
      return out;
    }
    return Object.assign({}, input);
  }

  function safeStringify(body) {
    if (typeof body === 'string') return body;
    if (body instanceof URLSearchParams) return body.toString();
    if (body instanceof FormData) {
      const obj = {};
      for (const [k, v] of body.entries()) obj[k] = String(v);
      return JSON.stringify(obj);
    }
    if (body instanceof Blob || body instanceof ArrayBuffer) return null;
    try {
      return JSON.stringify(body);
    } catch {
      return null;
    }
  }

  function parseAllResponseHeaders(raw) {
    const out = {};
    if (!raw) return out;
    raw.trim().split(/\r?\n/).forEach((line) => {
      const idx = line.indexOf(':');
      if (idx > 0) out[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
    });
    return out;
  }

  function absoluteUrl(u) {
    try {
      return new URL(u, location.href).toString();
    } catch {
      return u;
    }
  }

  /**
   * Capture filter — only forward Favur API-shaped traffic. We intentionally
   * accept anything on a *.favur.ch host that isn't asset-y, so the auto-pick
   * can find the shifts request without requiring URL knowledge upfront.
   */
  function shouldCapture(url) {
    if (!url) return false;
    let host;
    try {
      host = new URL(url, location.href).host;
    } catch {
      return false;
    }
    if (!/favur\.ch$/i.test(host)) return false;
    if (/\.(?:js|css|png|jpg|jpeg|gif|svg|woff2?|ttf|ico|map)(?:\?|$)/i.test(url)) return false;
    return true;
  }

  function emit(payload) {
    try {
      window.postMessage(
        { source: 'prize-favur-sync', kind: 'capture', payload },
        location.origin,
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(TAG, 'postMessage failed', e);
    }
  }

  // eslint-disable-next-line no-console
  console.log(TAG, 'fetch + XHR hooks installed');
})();
