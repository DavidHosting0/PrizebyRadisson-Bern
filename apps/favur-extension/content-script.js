/*
 * Content script: bridges the in-page injected script (which monkey-patches
 * fetch/XHR) and the extension's background service worker. Content scripts
 * run in an isolated world so we have access to chrome.* APIs but cannot
 * patch window.fetch directly.
 */

const TAG = '[Favur-Sync content]';

// 1) Inject the page-world script that hooks fetch/XHR.
const script = document.createElement('script');
script.src = chrome.runtime.getURL('injected.js');
script.onload = () => script.remove();
(document.head || document.documentElement).appendChild(script);

// 2) Listen for window.postMessage from the injected script and forward to bg.
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== 'prize-favur-sync') return;
  if (data.kind === 'capture' && data.payload) {
    chrome.runtime.sendMessage(
      { type: 'CAPTURE', payload: data.payload },
      (res) => {
        if (chrome.runtime.lastError) {
          // service worker may be sleeping; that's OK, message buffered
        }
        if (res && res.error) {
          // eslint-disable-next-line no-console
          console.warn(TAG, 'background rejected capture:', res.error);
        }
      },
    );
  }
});

console.log(TAG, 'content script ready');
