import { DEFAULT_API_BASE, STORAGE_KEYS, storageSet } from '../lib/storage';

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get([STORAGE_KEYS.apiBase], (result) => {
    if (!result[STORAGE_KEYS.apiBase]) {
      void storageSet({ [STORAGE_KEYS.apiBase]: DEFAULT_API_BASE });
    }
  });
});
