import type { ReservationDetail } from '@housekeeping/shared';

export function reservationStatus(data: ReservationDetail) {
  if (data.checkOut) return { label: 'Ausgecheckt', className: 'bg-surface-muted text-ink-muted' };
  if (data.checkIn) return { label: 'Im Haus', className: 'bg-emerald-100 text-emerald-900' };
  if (data.checkInQueue) return { label: 'Check-in Queue', className: 'bg-amber-100 text-amber-900' };
  return { label: 'Anreise offen', className: 'bg-sky-100 text-sky-900' };
}
