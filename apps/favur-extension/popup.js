const $ = (id) => document.getElementById(id);

function fmtTime(ts) {
  if (!ts) return '–';
  const d = new Date(ts);
  return d.toLocaleString('de-CH');
}

function showToast(message, type) {
  const el = $('toast');
  el.textContent = message;
  el.className = `toast ${type}`;
  el.style.display = 'block';
  setTimeout(() => {
    el.style.display = 'none';
  }, 3500);
}

function applyEnabledUi(enabled) {
  const btn = $('toggle');
  btn.textContent = enabled ? 'An' : 'Aus';
  btn.className = `btn-toggle ${enabled ? 'on' : 'off'}`;
}

async function refresh() {
  const settings = await new Promise((resolve) =>
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, resolve),
  );
  if (!settings) return;
  $('apiBase').value = settings.apiBase ?? '';
  $('apiKey').value = settings.apiKey ?? '';
  $('lastUploadAt').textContent = fmtTime(settings.lastUploadAt);
  $('lastUploadStatus').textContent = settings.lastUploadStatus ?? '–';
  $('lastUploadUrl').textContent = settings.lastUploadUrl ?? '–';
  $('uploadCount').textContent = String(settings.uploadCount ?? 0);
  $('errorCount').textContent = String(settings.errorCount ?? 0);
  applyEnabledUi(settings.enabled !== false);

  const statusEl = $('lastUploadStatus');
  statusEl.classList.remove('ok', 'err');
  if (settings.lastUploadStatus === 'ok') statusEl.classList.add('ok');
  else if (settings.lastUploadStatus && settings.lastUploadStatus !== '–')
    statusEl.classList.add('err');
}

document.addEventListener('DOMContentLoaded', async () => {
  await refresh();

  $('save').addEventListener('click', async () => {
    const patch = {
      apiBase: $('apiBase').value.trim(),
      apiKey: $('apiKey').value.trim(),
    };
    chrome.runtime.sendMessage({ type: 'SET_SETTINGS', patch }, (r) => {
      if (r?.ok) {
        showToast('Gespeichert.', 'success');
        refresh();
      } else {
        showToast(r?.error ?? 'Fehler beim Speichern', 'error');
      }
    });
  });

  $('test').addEventListener('click', async () => {
    showToast('Verbinde…', 'success');
    chrome.runtime.sendMessage({ type: 'TEST_CONNECTION' }, (r) => {
      if (r?.ok) showToast('Verbindung OK – Backend antwortet.', 'success');
      else showToast(r?.error ?? 'Test fehlgeschlagen', 'error');
      refresh();
    });
  });

  $('toggle').addEventListener('click', async () => {
    const settings = await new Promise((resolve) =>
      chrome.runtime.sendMessage({ type: 'GET_STATUS' }, resolve),
    );
    const next = !(settings?.enabled !== false);
    chrome.runtime.sendMessage(
      { type: 'SET_SETTINGS', patch: { enabled: next } },
      () => {
        applyEnabledUi(next);
        showToast(next ? 'Capture aktiviert.' : 'Capture pausiert.', 'success');
      },
    );
  });
});
