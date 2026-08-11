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
  if (occupancy.isDepartureToday) {
    const checkedOut = occupancy.checkOut || occupancy.ocoDone;
    const status = checkedOut ? 'Ausgecheckt' : 'Gast noch im Zimmer';
    return guest ? `${guest} · ${status}` : `Abreise heute · ${status}`;
  }
  if (guest) return guest;
  if (occupancy.isArrivalToday) return 'Heute eingecheckt';
  if (occupancy.isRestant) return 'Restant';
  return 'Belegt';
}

export function RoomOccupancyBadges({
  occupancy,
  onColor,
  size = 'sm',
}: {
  occupancy: RoomOccupancy | null | undefined;
  onColor?: boolean;
  size?: 'xs' | 'sm' | 'md';
}) {
  if (!occupancy) return null;
  return <GuestStayTypeIcons stay={toStaySignals(occupancy)} size={size} onColor={onColor} />;
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

export function RoomOccupancySection({
  occupancy,
  tone = 'light',
}: {
  occupancy: RoomOccupancy | null | undefined;
  tone?: 'light' | 'dark';
}) {
  const dark = tone === 'dark';

  if (!occupancy) {
    return (
      <section
        className={
          dark
            ? 'rounded-xl border border-sidebar-border/60 bg-sidebar p-4'
            : 'rounded-xl border border-border bg-surface-muted/30 p-4'
        }
      >
        <h3
          className={
            dark
              ? 'text-xs font-bold uppercase tracking-wider text-sidebar-muted'
              : 'text-xs font-bold uppercase tracking-wider text-ink-muted'
          }
        >
          Gast / Belegung
        </h3>
        <p className={dark ? 'mt-2 text-sm text-sidebar-muted' : 'mt-2 text-sm text-ink-muted'}>
          Kein aktiver Gast in diesem Zimmer.
        </p>
      </section>
    );
  }

  return (
    <section
      className={
        dark
          ? 'rounded-xl border border-sidebar-border/60 bg-sidebar p-4'
          : 'rounded-xl border border-border bg-surface-muted/30 p-4'
      }
    >
      <h3
        className={
          dark
            ? 'text-xs font-bold uppercase tracking-wider text-sidebar-muted'
            : 'text-xs font-bold uppercase tracking-wider text-ink-muted'
        }
      >
        Gast / Belegung
      </h3>
      <dl className="mt-3 space-y-2 text-sm">
        <div>
          <dt
            className={
              dark
                ? 'text-xs font-semibold uppercase tracking-wide text-sidebar-muted'
                : 'text-xs font-semibold uppercase tracking-wide text-ink-muted'
            }
          >
            Gast
          </dt>
          <dd className={dark ? 'mt-0.5 font-medium text-white' : 'mt-0.5 font-medium text-ink'}>
            {occupancy.mainGuestName?.trim() || '—'}
          </dd>
        </div>
        <div>
          <dt
            className={
              dark
                ? 'text-xs font-semibold uppercase tracking-wide text-sidebar-muted'
                : 'text-xs font-semibold uppercase tracking-wide text-ink-muted'
            }
          >
            Abreise
          </dt>
          <dd className={dark ? 'mt-0.5 text-white' : 'mt-0.5 text-ink'}>
            {occupancy.departureDate}
            {occupancy.expectedDepartureTime ? ` · ${occupancy.expectedDepartureTime}` : ''}
          </dd>
        </div>
        <div>
          <dt
            className={
              dark
                ? 'text-xs font-semibold uppercase tracking-wide text-sidebar-muted'
                : 'text-xs font-semibold uppercase tracking-wide text-ink-muted'
            }
          >
            Status
          </dt>
          <dd className="mt-1 flex flex-wrap items-center gap-2">
            <RoomOccupancyBadges occupancy={occupancy} />
            {occupancy.isDepartureToday && (
              <span
                className={
                  dark
                    ? occupancy.checkOut || occupancy.ocoDone
                      ? 'text-sm font-medium text-emerald-300'
                      : 'text-sm font-medium text-amber-200'
                    : occupancy.checkOut || occupancy.ocoDone
                      ? 'text-sm font-medium text-emerald-700'
                      : 'text-sm font-medium text-amber-800'
                }
              >
                {occupancy.checkOut || occupancy.ocoDone
                  ? 'Ausgecheckt'
                  : 'Gast noch im Zimmer'}
              </span>
            )}
            {!occupancy.isDepartureToday &&
              !occupancy.isRestant &&
              !occupancy.isArrivalToday && (
              <span className={dark ? 'text-sidebar-muted' : 'text-ink-muted'}>Im Haus</span>
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
