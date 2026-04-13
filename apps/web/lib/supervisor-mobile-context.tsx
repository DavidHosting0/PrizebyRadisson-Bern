'use client';

import { createContext, useCallback, useContext, useMemo, useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const STORAGE_KEY = 'hk_supervisor_mobile_ui';

type Ctx = {
  mobileUi: boolean;
  hydrated: boolean;
  enterMobile: () => void;
  exitMobile: () => void;
};

const Context = createContext<Ctx | null>(null);

export function SupervisorMobileModeProvider({ children }: { children: React.ReactNode }) {
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
    router.push('/s/m/inspections');
  }, [persistMobile, router]);

  const exitMobile = useCallback(() => {
    persistMobile(false);
    let dest = '/s';
    if (path.startsWith('/s/m/chat')) dest = '/s/chat';
    else if (path.startsWith('/s/m/requests')) dest = '/s/requests';
    else if (path.startsWith('/s/m/inspections')) dest = '/s';
    router.replace(dest);
  }, [path, persistMobile, router]);

  const value = useMemo(
    () => ({ mobileUi, hydrated, enterMobile, exitMobile }),
    [mobileUi, hydrated, enterMobile, exitMobile],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSupervisorMobileMode() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useSupervisorMobileMode must be used within SupervisorMobileModeProvider');
  return ctx;
}
