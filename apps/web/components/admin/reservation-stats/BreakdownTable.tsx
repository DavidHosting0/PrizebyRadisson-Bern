import type { ReservationBreakdownGroup } from '@housekeeping/shared';

export function BreakdownTable({
  title,
  groups,
  emptyLabel,
}: {
  title: string;
  groups: ReservationBreakdownGroup[];
  emptyLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {groups.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">{emptyLabel}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                <th className="pb-2 pr-4">Kategorie</th>
                <th className="pb-2 pr-4 text-right">Anzahl</th>
                <th className="pb-2 text-right">Pax</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.key} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-4 text-ink">{g.key}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-ink">{g.count}</td>
                  <td className="py-2 text-right tabular-nums text-ink-muted">{g.totalPax}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
