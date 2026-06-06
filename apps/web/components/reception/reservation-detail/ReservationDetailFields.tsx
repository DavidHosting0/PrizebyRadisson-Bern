import { formatEmmaAmount, parseEmmaNumber } from './folioFormat';

export function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value?.trim()) return null;
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{value}</dd>
    </div>
  );
}

export function BoolField({ label, value }: { label: string; value: boolean }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{value ? 'Ja' : 'Nein'}</dd>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface-muted/30 p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-muted">{title}</h3>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

export function ListSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface-muted/30 p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-muted">{title}</h3>
      {children}
    </section>
  );
}

export function formatEmmaValue(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nein';
  if (typeof value === 'number') return formatEmmaAmount(value);
  if (typeof value === 'string') {
    const m = /\/Date\((-?\d+)\)\//.exec(value);
    if (m) return new Date(parseInt(m[1], 10)).toLocaleString('de-CH');
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (parseEmmaNumber(trimmed) != null && /^-?\d+([.,]\d+)?$/.test(trimmed.replace(/\s/g, ''))) {
      return formatEmmaAmount(trimmed);
    }
    return trimmed;
  }
  return JSON.stringify(value);
}

export function RecordGrid({ rows }: { rows: Record<string, unknown>[] }) {
  if (rows.length === 0) return <p className="text-sm text-ink-muted">Keine Einträge</p>;
  return (
    <div className="space-y-3">
      {rows.map((row, i) => (
        <div key={i} className="rounded-lg border border-border/60 bg-surface p-3">
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Object.entries(row).map(([key, value]) => {
              const formatted = formatEmmaValue(value);
              if (!formatted) return null;
              return (
                <div key={key}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{key}</dt>
                  <dd className="mt-0.5 text-sm text-ink">{formatted}</dd>
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
    <div className="rounded-xl border border-dashed border-border bg-surface-muted/20 px-6 py-10 text-center">
      <p className="font-medium text-ink">{title}</p>
      <p className="mt-2 text-sm text-ink-muted">{description}</p>
    </div>
  );
}
