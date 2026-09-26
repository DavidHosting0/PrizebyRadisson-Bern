'use client';

import clsx from 'clsx';
import type { ReactNode } from 'react';

export function RaStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-card border border-sidebar-border/60 bg-sidebar/40 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-sidebar-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-sidebar-muted">{hint}</p> : null}
    </div>
  );
}

export function RaSection({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-card border border-sidebar-border/60 bg-sidebar/30">
      <div className="flex items-center justify-between gap-3 border-b border-sidebar-border/50 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function RaBadge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'positive' | 'negative' | 'neutral' | 'warn' | 'critical';
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        tone === 'positive' && 'bg-emerald-500/15 text-emerald-300',
        tone === 'negative' && 'bg-rose-500/15 text-rose-300',
        tone === 'warn' && 'bg-amber-500/15 text-amber-300',
        tone === 'critical' && 'bg-red-600/25 text-red-200',
        tone === 'neutral' && 'bg-white/10 text-sidebar-muted',
      )}
    >
      {children}
    </span>
  );
}

export function sentimentTone(s?: string | null) {
  if (s === 'POSITIVE') return 'positive' as const;
  if (s === 'NEGATIVE') return 'negative' as const;
  if (s === 'MIXED') return 'warn' as const;
  return 'neutral' as const;
}

export function priorityTone(p?: string | null) {
  if (p === 'CRITICAL') return 'critical' as const;
  if (p === 'HIGH') return 'negative' as const;
  if (p === 'MEDIUM') return 'warn' as const;
  return 'neutral' as const;
}
