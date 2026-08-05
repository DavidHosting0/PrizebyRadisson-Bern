import clsx from 'clsx';
import { Card } from '@/components/ui/Card';
import { APP_DARK_CARD } from '@/components/nav/AppPageChrome';

export function KpiStat({
  label,
  value,
  sub,
  tone = 'light',
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'light' | 'dark';
}) {
  if (tone === 'dark') {
    return (
      <div className={clsx(APP_DARK_CARD, 'min-h-[108px] p-5')}>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">{label}</p>
        <p className="mt-2 font-mono text-3xl font-semibold tabular-nums tracking-tight text-white">{value}</p>
        {sub && <p className="mt-1.5 text-xs text-sidebar-muted">{sub}</p>}
      </div>
    );
  }

  return (
    <Card className="min-h-[108px]">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{label}</p>
      <p className="mt-2 font-mono text-3xl font-semibold tabular-nums tracking-tight text-ink">{value}</p>
      {sub && <p className="mt-1.5 text-xs text-ink-muted">{sub}</p>}
    </Card>
  );
}
