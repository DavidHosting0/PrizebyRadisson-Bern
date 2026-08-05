import type { ReservationDetail } from '@housekeeping/shared';

export function reservationStatus(data: ReservationDetail) {
  if (data.checkOut) return { label: 'Ausgecheckt', className: 'bg-white/10 text-sidebar-muted' };
  if (data.checkIn) return { label: 'Im Haus', className: 'bg-emerald-500/15 text-emerald-300' };
  if (data.checkInQueue) return { label: 'Check-in Queue', className: 'bg-amber-500/15 text-amber-300' };
  return { label: 'Anreise offen', className: 'bg-sky-500/15 text-sky-300' };
}
