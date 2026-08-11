'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') return;

    void navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // Pick up SW changes (sound/vibrate options) without waiting for a full reload cycle.
        void reg.update();
      })
      .catch(() => {
        // Non-fatal: install UI still works via manual Add to Home Screen
      });
  }, []);

  return null;
}
