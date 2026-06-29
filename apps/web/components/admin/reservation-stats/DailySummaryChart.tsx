'use client';

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ReservationDailySummaryRow } from '@housekeeping/shared';

function formatDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00.000Z`);
  return d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit' });
}

export function DailySummaryChart({ days }: { days: ReservationDailySummaryRow[] }) {
  const data = days
    .filter((d) => d.syncCount > 0)
    .map((d) => ({
      ...d,
      dayLabel: formatDay(d.date),
    }));

  if (data.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-ink-muted">
        Keine Tagesdaten im gewählten Zeitraum.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
        <XAxis dataKey="dayLabel" tick={{ fontSize: 11, fill: '#64748B' }} />
        <YAxis tick={{ fontSize: 11, fill: '#64748B' }} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            borderRadius: 10,
            border: '1px solid #E2E8F0',
            fontSize: 12,
          }}
        />
        <Legend
          formatter={(value) => {
            if (value === 'arrivals') return 'Anreisen';
            if (value === 'checkInDone') return 'Check-ins erledigt';
            return value;
          }}
        />
        <Bar dataKey="arrivals" fill="#EDF3F8" stroke="#3B6FA0" name="arrivals" radius={[4, 4, 0, 0]} />
        <Line
          type="monotone"
          dataKey="checkInDone"
          stroke="#3D9A6A"
          strokeWidth={2}
          dot={{ r: 3 }}
          name="checkInDone"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
