import type { RoomOccupancy } from '@housekeeping/shared';

export function RoomOccupancyBadges({ occupancy }: { occupancy: RoomOccupancy | null | undefined }) {
  if (!occupancy) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {occupancy.stayover && (
        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-900">
          Stayover
        </span>
      )}
      {occupancy.isDepartureToday && !occupancy.checkOut && (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-950">
          Abreise — nicht ausgecheckt
        </span>
      )}
      {occupancy.isDepartureToday && occupancy.checkOut && (
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-900">
          Ausgecheckt
        </span>
      )}
    </div>
  );
}

export function RoomOccupancyGuestLine({
  occupancy,
  compact,
}: {
  occupancy: RoomOccupancy | null | undefined;
  compact?: boolean;
}) {
  if (!occupancy?.mainGuestName?.trim()) return null;
  return (
    <p
      className={`truncate text-ink-muted ${compact ? 'text-[10px]' : 'text-xs'}`}
      title={occupancy.mainGuestName}
    >
      {occupancy.mainGuestName}
    </p>
  );
}

export function RoomOccupancySection({ occupancy }: { occupancy: RoomOccupancy | null | undefined }) {
  if (!occupancy) {
    return (
      <section className="rounded-xl border border-border bg-surface-muted/30 p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted">Gast / Belegung</h3>
        <p className="mt-2 text-sm text-ink-muted">Kein aktiver Gast in diesem Zimmer.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-surface-muted/30 p-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted">Gast / Belegung</h3>
      <dl className="mt-3 space-y-2 text-sm">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Gast</dt>
          <dd className="mt-0.5 font-medium text-ink">{occupancy.mainGuestName ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Abreise</dt>
          <dd className="mt-0.5 text-ink">
            {occupancy.departureDate}
            {occupancy.expectedDepartureTime ? ` · ${occupancy.expectedDepartureTime}` : ''}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Status</dt>
          <dd className="mt-1">
            <RoomOccupancyBadges occupancy={occupancy} />
            {!occupancy.isDepartureToday && !occupancy.stayover && (
              <span className="text-ink-muted">Im Haus</span>
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
