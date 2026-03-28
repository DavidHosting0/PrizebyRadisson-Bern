import { Card } from '@/components/ui/Card';

export function KpiStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Card className="min-h-[100px]">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-ink">{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-muted">{sub}</p>}
    </Card>
  );
}
