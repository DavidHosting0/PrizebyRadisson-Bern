'use client';

import type { SupportedLocale } from '@housekeeping/shared';
import { useTranslations } from 'next-intl';
import { APP_DARK_CARD } from '@/components/nav/AppPageChrome';
import { formatDateTime } from '@/lib/format-locale';
import { useLocale } from '@/lib/locale-context';
import { formatEmmaAmount, parseEmmaNumber } from './folioFormat';

export function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value?.trim()) return null;
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-sidebar-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-white">{value}</dd>
    </div>
  );
}

export function BoolField({ label, value }: { label: string; value: boolean }) {
  const tCommon = useTranslations('common');
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-sidebar-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-white">{value ? tCommon('yes') : tCommon('no')}</dd>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={`${APP_DARK_CARD} p-4`}>
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-sidebar-muted">{title}</h3>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

export function ListSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`${APP_DARK_CARD} p-4`}>
      <div className="mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-sidebar-muted">{title}</h3>
        {subtitle && <p className="mt-1 text-xs text-sidebar-muted">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

export type EmmaValueLabels = {
  yes: string;
  no: string;
  locale: SupportedLocale;
};

export function formatEmmaValue(value: unknown, labels?: EmmaValueLabels): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'boolean') return value ? labels?.yes ?? 'Yes' : labels?.no ?? 'No';
  if (typeof value === 'number') return formatEmmaAmount(value);
  if (typeof value === 'string') {
    const m = /\/Date\((-?\d+)\)\//.exec(value);
    if (m) {
      return formatDateTime(new Date(parseInt(m[1], 10)), labels?.locale ?? 'en');
    }
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (parseEmmaNumber(trimmed) != null && /^-?\d+([.,]\d+)?$/.test(trimmed.replace(/\s/g, ''))) {
      return formatEmmaAmount(trimmed);
    }
    return trimmed;
  }
  return JSON.stringify(value);
}

export function useEmmaValueFormatter() {
  const tCommon = useTranslations('common');
  const { locale } = useLocale();
  const labels: EmmaValueLabels = { yes: tCommon('yes'), no: tCommon('no'), locale };
  return (value: unknown) => formatEmmaValue(value, labels);
}

export function RecordGrid({ rows }: { rows: Record<string, unknown>[] }) {
  const t = useTranslations('reception.reservationDetail');
  const format = useEmmaValueFormatter();
  if (rows.length === 0) return <p className="text-sm text-sidebar-muted">{t('noEntries')}</p>;
  return (
    <div className="space-y-3">
      {rows.map((row, i) => (
        <div key={i} className="rounded-lg border border-sidebar-border/60 bg-white/5 p-3">
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Object.entries(row).map(([key, value]) => {
              const formatted = format(value);
              if (!formatted) return null;
              return (
                <div key={key}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-sidebar-muted">{key}</dt>
                  <dd className="mt-0.5 text-sm text-white">{formatted}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-sidebar-border/60 bg-white/5 px-6 py-10 text-center">
      <p className="font-medium text-white">{title}</p>
      <p className="mt-2 text-sm text-sidebar-muted">{description}</p>
    </div>
  );
}
