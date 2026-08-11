'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function pushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

async function postSubscription(sub: PushSubscription) {
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Invalid push subscription');
  }
  await api('/push/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      userAgent: navigator.userAgent,
    }),
  });
}

/**
 * Web Push for phone OS alerts (Android Chrome + iOS 16.4+ home-screen PWA).
 * OS default notification sound is used (custom sounds are not reliable on Web Push).
 */
export function usePushNotifications() {
  const { user } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iosNeedsInstall, setIosNeedsInstall] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ios = isIosDevice();
    const standalone = isStandaloneDisplay();
    setIosNeedsInstall(ios && !standalone);

    if (!pushSupported()) {
      setSupported(false);
      setPermission('unsupported');
      return;
    }
    setSupported(true);
    setPermission(Notification.permission);
  }, [user?.id]);

  const ensureSubscription = useCallback(async (): Promise<boolean> => {
    if (!user || !pushSupported()) return false;
    if (isIosDevice() && !isStandaloneDisplay()) {
      setIosNeedsInstall(true);
      return false;
    }
    if (Notification.permission !== 'granted') return false;

    try {
      const { publicKey } = await api<{ publicKey: string | null }>('/push/vapid-public-key');
      if (!publicKey) {
        setError('vapid');
        return false;
      }

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }
      await postSubscription(sub);
      setSubscribed(true);
      setError(null);
      return true;
    } catch {
      setError('subscribe');
      return false;
    }
  }, [user]);

  useEffect(() => {
    if (!user || permission !== 'granted') return;
    void ensureSubscription();
  }, [user, permission, ensureSubscription]);

  const subscribe = useCallback(async () => {
    if (!user) return false;
    setBusy(true);
    setError(null);
    try {
      if (!pushSupported()) {
        setPermission('unsupported');
        if (isIosDevice() && !isStandaloneDisplay()) setIosNeedsInstall(true);
        return false;
      }
      if (isIosDevice() && !isStandaloneDisplay()) {
        setIosNeedsInstall(true);
        return false;
      }

      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        if (perm === 'denied') setError('denied');
        return false;
      }

      return await ensureSubscription();
    } catch {
      setError('subscribe');
      return false;
    } finally {
      setBusy(false);
    }
  }, [user, ensureSubscription]);

  const unsubscribe = useCallback(async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await api('/push/subscriptions', {
          method: 'DELETE',
          body: JSON.stringify({ endpoint }),
        });
      }
      setSubscribed(false);
    } catch {
      /* non-fatal */
    }
  }, []);

  const canEnable = !!user && supported && !iosNeedsInstall && permission === 'default';
  const showBanner =
    !!user &&
    (iosNeedsInstall ||
      canEnable ||
      permission === 'denied' ||
      (permission === 'granted' && error === 'vapid'));

  return {
    permission,
    subscribed,
    busy,
    error,
    supported,
    iosNeedsInstall,
    /** @deprecated use canEnable — kept for older call sites */
    canPrompt: canEnable || iosNeedsInstall,
    canEnable,
    showBanner,
    subscribe,
    unsubscribe,
    ensureSubscription,
  };
}
