import type { RoomOccupancy } from '@housekeeping/shared';

function occupancyHint(occupancy: RoomOccupancy): string | null {
  const guest = occupancy.mainGuestName?.trim();
  if (guest) return guest;
  if (occupancy.isDepartureToday) return 'Abreise heute';
  if (occupancy.stayover) return 'Stayover';
  return 'Belegt';
}

export function RoomOccupancyBadges({
  occupancy,
  onColor,
}: {
  occupancy: RoomOccupancy | null | undefined;
  onColor?: boolean;
}) {
  if (!occupancy) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-1">
      {occupancy.stayover && (
        <span
          className={
            onColor
              ? 'rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white'
              : 'rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-900'
          }
        >
          Stayover
        </span>
      )}
      {occupancy.isDepartureToday && !occupancy.checkOut && (
        <span
          className={
            onColor
              ? 'rounded-full bg-amber-300/90 px-1.5 py-0.5 text-[9px] font-semibold text-amber-950'
              : 'rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-950'
          }
        >
          Abreise — nicht ausgecheckt
        </span>
      )}
      {occupancy.isDepartureToday && occupancy.checkOut && (
        <span
          className={
            onColor
              ? 'rounded-full bg-emerald-300/90 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-950'
              : 'rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-900'
          }
        >
          Ausgecheckt
        </span>
      )}
    </div>
  );
}

export function RoomOccupancyGuestLine({
  occupancy,
  compact,
  onColor,
}: {
  occupancy: RoomOccupancy | null | undefined;
  compact?: boolean;
  onColor?: boolean;
}) {
  if (!occupancy) return null;
  const text = occupancyHint(occupancy);
  if (!text) return null;
  return (
    <p
      className={`truncate font-medium ${onColor ? 'text-white/95' : 'text-ink-muted'} ${compact ? 'text-[10px] leading-tight' : 'text-xs'}`}
      title={occupancy.mainGuestName?.trim() || text}
    >
      {text}
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
          <dd className="mt-0.5 font-medium text-ink">{occupancy.mainGuestName?.trim() || '—'}</dd>
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
