import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, clearTokens, hasAccessToken, loginRequest, type Me } from './api';
import { persistPreferredLocale } from '@/i18n/core';

type AuthCtx = {
  user: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    try {
      const me = await api<Me>('/auth/me');
      setUser(me);
      void persistPreferredLocale(me.preferredLocale);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    hasAccessToken().then((has) => {
      if (!has) {
        setLoading(false);
        return;
      }
      refreshMe();
    });
  }, [refreshMe]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await loginRequest(email, password);
    setUser(data.user);
    void persistPreferredLocale(data.user.preferredLocale);
  }, []);

  const logout = useCallback(() => {
    void clearTokens();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout, refreshMe }),
    [user, loading, login, logout, refreshMe],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside provider');
  return v;
}

export function usePermission(code: string) {
  const { user } = useAuth();
  return user?.permissions?.includes(code) ?? false;
}
