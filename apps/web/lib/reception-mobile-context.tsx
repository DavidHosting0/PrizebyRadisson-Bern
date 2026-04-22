'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const STORAGE_KEY = 'hk_reception_mobile_ui';

type Ctx = {
  mobileUi: boolean;
  hydrated: boolean;
  enterMobile: () => void;
  exitMobile: () => void;
};

const Context = createContext<Ctx | null>(null);

/**
 * Preference-persisted mobile/desktop mode for the Reception surface.
 * Mirrors the Supervisor implementation so the two roles behave the same way.
 */
export function ReceptionMobileModeProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [mobileUi, setMobileUiState] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setMobileUiState(typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1');
    setHydrated(true);
  }, []);

  const persistMobile = useCallback((v: boolean) => {
    setMobileUiState(v);
    if (typeof window !== 'undefined') {
      if (v) localStorage.setItem(STORAGE_KEY, '1');
      else localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const enterMobile = useCallback(() => {
    persistMobile(true);
    router.push('/r/m/requests');
  }, [persistMobile, router]);

  const exitMobile = useCallback(() => {
    persistMobile(false);
    let dest = '/r';
    if (path.startsWith('/r/m/chat')) dest = '/r/chat';
    else if (path.startsWith('/r/m/requests')) dest = '/r/requests';
    else if (path.startsWith('/r/m/rooms')) dest = '/r/rooms';
    else if (path.startsWith('/r/m/lost')) dest = '/r/lost';
    router.replace(dest);
  }, [path, persistMobile, router]);

  const value = useMemo(
    () => ({ mobileUi, hydrated, enterMobile, exitMobile }),
    [mobileUi, hydrated, enterMobile, exitMobile],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useReceptionMobileMode() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useReceptionMobileMode must be used within ReceptionMobileModeProvider');
  return ctx;
}
