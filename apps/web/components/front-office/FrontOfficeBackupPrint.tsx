'use client';

import type { FrontOfficeBackupOverview } from '@housekeeping/shared';
import { formatAge, formatTimestamp } from '@/lib/format-age';

type Props = {
  data: FrontOfficeBackupOverview;
  locale: string;
};

export function FrontOfficeBackupPrint({ data, locale }: Props) {
  return (
    <div className="hidden print:block">
      <style>{`
        @media print {
          @page { margin: 14mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          aside, nav, header, [data-app-sidebar], .print\\:hidden { display: none !important; }
          main { padding: 0 !important; margin: 0 !important; max-width: none !important; }
        }
      `}</style>

      <header className="mb-8 border-b-4 border-black pb-4">
        <h1 className="text-2xl font-black uppercase tracking-wide text-black">
          EMMA IS DOWN — MANUAL BACKUP REPORT
        </h1>
        <p className="mt-3 text-sm font-bold uppercase text-red-700">
          Emergency fallback — do not treat this as live PMS data
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-black">
          This document was generated from cached PrizeBern data while EMMA is unreachable.
          Verify every room status, guest name, and outstanding balance manually before acting.
          Do not check guests in or out in EMMA until connectivity is restored.
        </p>
        <p className="mt-3 text-xs text-gray-700">
          Generated {formatTimestamp(data.freshness.generatedAt, locale)} · Reservations cache{' '}
          {formatAge(data.freshness.reservationsLastSyncedAt, locale)} · Room status sync{' '}
          {formatAge(
            data.freshness.roomsLastStatusSyncedAt ?? data.freshness.roomsNewestEmmaSyncedAt,
            locale,
          )} · Oldest room EMMA data{' '}
          {formatAge(data.freshness.roomsOldestEmmaSyncedAt, locale)}
        </p>
      </header>

      <section className="mb-8 break-inside-avoid">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">Room cleanliness</h2>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-black">
              <th className="py-1 text-left">Room</th>
              <th className="py-1 text-left">Status</th>
              <th className="py-1 text-left">EMMA</th>
              <th className="py-1 text-left">Age</th>
            </tr>
          </thead>
          <tbody>
            {data.rooms.map((room) => (
              <tr key={room.roomId} className="border-b border-gray-300">
                <td className="py-1 font-semibold">{room.roomNumber}</td>
                <td className="py-1">{room.derivedStatus}</td>
                <td className="py-1">{room.emmaStatusCode ?? '—'}</td>
                <td className="py-1">{formatAge(room.emmaSyncedAt, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mb-8 break-inside-avoid">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">Checked in (in house)</h2>
        <PrintReservationTable rows={data.checkedIn} locale={locale} />
      </section>

      <section className="mb-8 break-inside-avoid">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">
          Pending check-in — outstanding balance
        </h2>
        <PrintReservationTable rows={data.pendingCheckIn} locale={locale} showBalance />
      </section>

      <section className="break-inside-avoid">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">Shared rooms</h2>
        {data.sharedRooms.length === 0 ? (
          <p className="text-xs text-gray-600">No shared rooms detected in cache.</p>
        ) : (
          data.sharedRooms.map((group) => (
            <div key={group.roomNumber} className="mb-4">
              <p className="text-xs font-bold">Room {group.roomNumber}</p>
              <PrintReservationTable rows={group.reservations} locale={locale} showBalance embedded />
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function PrintReservationTable({
  rows,
  locale,
  showBalance,
  embedded,
}: {
  rows: FrontOfficeBackupOverview['checkedIn'];
  locale: string;
  showBalance?: boolean;
  embedded?: boolean;
}) {
  return (
    <table className={`w-full border-collapse text-xs ${embedded ? 'mt-1' : ''}`}>
      <thead>
        <tr className="border-b border-black">
          <th className="py-1 text-left">Guest</th>
          <th className="py-1 text-left">Room</th>
          <th className="py-1 text-left">Arrival</th>
          <th className="py-1 text-left">Departure</th>
          {showBalance ? <th className="py-1 text-left">Balance</th> : null}
          <th className="py-1 text-left">Age</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-b border-gray-300">
            <td className="py-1">{row.mainGuestName ?? '—'}</td>
            <td className="py-1">{row.roomNumber ?? '—'}</td>
            <td className="py-1">{row.arrivalDate}</td>
            <td className="py-1">{row.departureDate}</td>
            {showBalance ? <td className="py-1 font-semibold">{row.balance ?? '—'}</td> : null}
            <td className="py-1">
              {formatAge(showBalance ? row.balanceFetchedAt : row.syncedAt, locale)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
