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
import { useTranslations } from 'next-intl';

type ToastItem = {
  id: string;
  message: string;
  tone?: 'default' | 'success' | 'warning';
  /** Auto-dismiss delay in ms; 0 = stay until dismissed. Default 4200. */
  durationMs?: number;
};

type ToastCtx = {
  push: (message: string, tone?: ToastItem['tone'], durationMs?: number) => void;
  dismiss: (id: string) => void;
};

const Ctx = createContext<ToastCtx | null>(null);

export function useToast() {
  const v = useContext(Ctx);
  if (!v) return { push: () => {}, dismiss: () => {} };
  return v;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const tToast = useTranslations('toast');
  const [items, setItems] = useState<ToastItem[]>([]);
  const baseId = useId();

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, tone: ToastItem['tone'] = 'default', durationMs = 4200) => {
      const id = `${baseId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setItems((prev) => [...prev, { id, message, tone, durationMs }]);
      if (durationMs > 0) {
        window.setTimeout(() => {
          setItems((prev) => prev.filter((t) => t.id !== id));
        }, durationMs);
      }
    },
    [baseId],
  );

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex max-w-sm flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={clsx(
              'pointer-events-auto flex items-start gap-2 rounded-card border px-4 py-3 text-sm shadow-lift transition-opacity duration-300',
              t.tone === 'success' && 'border-success/30 bg-success-muted text-ink',
              t.tone === 'warning' && 'border-warning/30 bg-warning-muted text-ink',
              (!t.tone || t.tone === 'default') && 'border-border bg-surface text-ink',
            )}
          >
            <p className="min-w-0 flex-1 whitespace-pre-wrap break-words">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="shrink-0 rounded p-0.5 text-ink/50 transition hover:bg-black/5 hover:text-ink"
              aria-label={tToast('dismiss')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
