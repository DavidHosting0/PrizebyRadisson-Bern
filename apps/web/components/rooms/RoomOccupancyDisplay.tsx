import type { GuestStaySignals, RoomOccupancy } from '@housekeeping/shared';
import { GuestStayTypeIcons } from '@/components/reception/GuestStayTypeIcons';

function toStaySignals(occupancy: RoomOccupancy): GuestStaySignals {
  return {
    stayover: occupancy.stayover,
    isRestant: occupancy.isRestant,
    isArrivalToday: occupancy.isArrivalToday,
    isDepartureToday: occupancy.isDepartureToday,
    checkOut: occupancy.checkOut,
    ocoDone: occupancy.ocoDone,
  };
}

function occupancyHint(occupancy: RoomOccupancy): string | null {
  const guest = occupancy.mainGuestName?.trim();
  if (guest) return guest;
  if (occupancy.isArrivalToday) return 'Heute eingecheckt';
  if (occupancy.isDepartureToday) return 'Abreise heute';
  if (occupancy.isRestant) return 'Restant';
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
  return <GuestStayTypeIcons stay={toStaySignals(occupancy)} size="sm" onColor={onColor} />;
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
            {!occupancy.isDepartureToday &&
              !occupancy.isRestant &&
              !occupancy.isArrivalToday && (
              <span className="text-ink-muted">Im Haus</span>
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
