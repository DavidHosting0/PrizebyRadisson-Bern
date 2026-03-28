'use client';

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import clsx from 'clsx';

type ToastItem = { id: string; message: string; tone?: 'default' | 'success' | 'warning' };

type ToastCtx = { push: (message: string, tone?: ToastItem['tone']) => void };

const Ctx = createContext<ToastCtx | null>(null);

export function useToast() {
  const v = useContext(Ctx);
  if (!v) return { push: () => {} };
  return v;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const baseId = useId();

  const push = useCallback((message: string, tone: ToastItem['tone'] = 'default') => {
    const id = `${baseId}-${Date.now()}`;
    setItems((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, [baseId]);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex max-w-sm flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={clsx(
              'pointer-events-auto rounded-card border px-4 py-3 text-sm shadow-lift transition-opacity duration-300',
              t.tone === 'success' && 'border-success/30 bg-success-muted text-ink',
              t.tone === 'warning' && 'border-warning/30 bg-warning-muted text-ink',
              (!t.tone || t.tone === 'default') && 'border-border bg-surface text-ink',
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
