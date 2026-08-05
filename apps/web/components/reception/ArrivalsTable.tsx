'use client';

import type { ReservationListItem } from '@housekeeping/shared';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';

export type ArrivalsSortKey =
  | 'guest'
  | 'reservationId'
  | 'roomId'
  | 'arrivalDate'
  | 'roomType'
  | 'numPax'
  | 'vip'
  | 'creditCard';

export type ArrivalsSortDir = 'asc' | 'desc';

export function compareArrivalRows(
  a: ReservationListItem,
  b: ReservationListItem,
  key: ArrivalsSortKey,
): number {
  const str = (v: string | null | undefined) => (v ?? '').trim().toLocaleLowerCase('de-CH');
  const num = (v: number | null | undefined) => (v == null ? null : v);

  switch (key) {
    case 'guest':
      return str(a.mainGuestName).localeCompare(str(b.mainGuestName), 'de-CH');
    case 'reservationId':
      return str(a.reservationId).localeCompare(str(b.reservationId), 'de-CH', { numeric: true });
    case 'roomId': {
      const ra = str(a.roomId);
      const rb = str(b.roomId);
      if (!ra && !rb) return 0;
      if (!ra) return 1;
      if (!rb) return -1;
      return ra.localeCompare(rb, 'de-CH', { numeric: true });
    }
    case 'arrivalDate': {
      const da = a.arrivalDate || '';
      const db = b.arrivalDate || '';
      if (da !== db) return da.localeCompare(db);
      return (a.departureDate || '').localeCompare(b.departureDate || '');
    }
    case 'roomType':
      return str(a.roomType).localeCompare(str(b.roomType), 'de-CH');
    case 'numPax': {
      const pa = num(a.numPax);
      const pb = num(b.numPax);
      if (pa == null && pb == null) return 0;
      if (pa == null) return 1;
      if (pb == null) return -1;
      return pa - pb;
    }
    case 'vip':
      return str(a.vipDesc || a.tier).localeCompare(str(b.vipDesc || b.tier), 'de-CH');
    case 'creditCard':
      return str(a.creditCard).localeCompare(str(b.creditCard), 'de-CH');
    default:
      return 0;
  }
}

export function useArrivalsSortLabel() {
  const t = useTranslations('reception');
  return (key: ArrivalsSortKey): string => {
    switch (key) {
      case 'guest':
        return t('sortGuest');
      case 'reservationId':
        return t('sortReservation');
      case 'roomId':
        return t('sortRoom');
      case 'arrivalDate':
        return t('sortDates');
      case 'roomType':
        return t('sortType');
      case 'numPax':
        return t('sortPax');
      case 'vip':
        return t('sortVip');
      case 'creditCard':
        return t('sortCreditCard');
      default:
        return key;
    }
  };
}

export function arrivalsSortLabel(key: ArrivalsSortKey): string {
  switch (key) {
    case 'guest':
      return 'Gast';
    case 'reservationId':
      return 'Res.';
    case 'roomId':
      return 'Zimmer';
    case 'arrivalDate':
      return 'An / Ab';
    case 'roomType':
      return 'Typ';
    case 'numPax':
      return 'Pax';
    case 'vip':
      return 'VIP';
    case 'creditCard':
      return 'Karte';
    default:
      return key;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: ArrivalsSortDir }) {
  return (
    <span
      className={clsx(
        'inline-flex flex-col gap-px',
        active ? 'text-white' : 'text-sidebar-muted/40',
      )}
    >
      <svg
        width="8"
        height="5"
        viewBox="0 0 8 5"
        aria-hidden
        className={clsx(active && dir === 'asc' && 'text-white')}
      >
        <path d="M4 0L8 5H0z" fill="currentColor" />
      </svg>
      <svg
        width="8"
        height="5"
        viewBox="0 0 8 5"
        aria-hidden
        className={clsx(active && dir === 'desc' && 'text-white')}
      >
        <path d="M4 5L0 0h8z" fill="currentColor" />
      </svg>
    </span>
  );
}

function SortableTh({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  column: ArrivalsSortKey;
  sortKey: ArrivalsSortKey;
  sortDir: ArrivalsSortDir;
  onSort: (key: ArrivalsSortKey) => void;
  className?: string;
}) {
  const active = sortKey === column;
  return (
    <th className={clsx('px-4 py-3 font-medium', className)}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={clsx(
          'inline-flex items-center gap-1.5 text-left text-[11px] uppercase tracking-wide transition-colors',
          active ? 'text-white' : 'text-sidebar-muted hover:text-white',
        )}
      >
        {label}
        <SortIcon active={active} dir={sortDir} />
      </button>
    </th>
  );
}

export type ArrivalsTableSelection = {
  selectedIds: Set<string>;
  onToggle: (reservationId: string) => void;
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
};

export function ArrivalsTable({
  rows,
  sortKey,
  sortDir,
  onSort,
  selection,
  onView,
}: {
  rows: ReservationListItem[];
  sortKey: ArrivalsSortKey;
  sortDir: ArrivalsSortDir;
  onSort: (key: ArrivalsSortKey) => void;
  selection?: ArrivalsTableSelection;
  onView?: (reservationId: string) => void;
}) {
  const browseMode = !selection;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead className="border-b border-sidebar-border/60 bg-sidebar-hover/40">
          <tr>
            {selection && (
              <th className="w-10 px-4 py-3">
                <span className="sr-only">Auswahl</span>
              </th>
            )}
            <SortableTh
              label="Gast"
              column="guest"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
            />
            <SortableTh
              label="Res."
              column="reservationId"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
            />
            <SortableTh
              label="Zimmer"
              column="roomId"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
            />
            <SortableTh
              label="An / Ab"
              column="arrivalDate"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
            />
            <SortableTh
              label="Typ"
              column="roomType"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
            />
            <SortableTh
              label="Pax"
              column="numPax"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
            />
            {browseMode && (
              <>
                <SortableTh
                  label="VIP"
                  column="vip"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <SortableTh
                  label="Karte"
                  column="creditCard"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <th className="px-4 py-3" />
              </>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-sidebar-border/40">
          {rows.map((r) => {
            const selected = selection?.selectedIds.has(r.reservationId) ?? false;
            return (
              <tr
                key={r.id}
                className={clsx(
                  'transition-colors hover:bg-white/5',
                  selection && selected && 'bg-indigo-500/10',
                )}
              >
                {selection && (
                  <td className="px-4 py-3.5">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => selection.onToggle(r.reservationId)}
                      aria-label={`${r.mainGuestName ?? r.reservationId} auswählen`}
                      className="h-4 w-4 rounded border-sidebar-border bg-sidebar text-action focus:ring-action/30"
                    />
                  </td>
                )}
                <td className="px-4 py-3.5 font-medium text-white">
                  {r.mainGuestName ?? '—'}
                  {r.arrivalCheckCompletedAt && (
                    <span
                      title={`Anreise-Check erledigt am ${new Date(r.arrivalCheckCompletedAt).toLocaleString('de-CH')}`}
                      className="ml-2 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-emerald-300"
                    >
                      Check erledigt
                    </span>
                  )}
                </td>
                <td className="px-4 py-3.5 tabular-nums text-sidebar-muted">{r.reservationId}</td>
                <td className="px-4 py-3.5 tabular-nums text-white">{r.roomId ?? '—'}</td>
                <td className="whitespace-nowrap px-4 py-3.5 text-sidebar-muted">
                  <span className="tabular-nums">{r.arrivalDate}</span>
                  <span className="mx-1.5 text-sidebar-muted/50">→</span>
                  <span className="tabular-nums">{r.departureDate}</span>
                </td>
                <td
                  className="max-w-[10rem] truncate px-4 py-3.5 text-sidebar-muted"
                  title={r.roomType ?? undefined}
                >
                  {r.roomType ?? '—'}
                </td>
                <td className="px-4 py-3.5 tabular-nums text-white">{r.numPax ?? '—'}</td>
                {browseMode && (
                  <>
                    <td className="px-4 py-3.5 text-sidebar-muted">{r.vipDesc ?? r.tier ?? '—'}</td>
                    <td className="px-4 py-3.5 font-mono text-xs text-sidebar-muted">
                      {r.creditCard ?? '—'}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {onView && (
                        <button
                          type="button"
                          onClick={() => onView(r.reservationId)}
                          className="rounded-md px-3 py-1.5 text-xs font-medium text-sidebar-muted transition hover:bg-white/10 hover:text-white"
                        >
                          Ansehen
                        </button>
                      )}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
