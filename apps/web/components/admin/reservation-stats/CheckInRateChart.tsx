'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ReservationCheckInRateBucket } from '@housekeeping/shared';

export function CheckInRateChart({ buckets }: { buckets: ReservationCheckInRateBucket[] }) {
  if (buckets.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-ink-muted">
        Zu wenig Daten für Check-in-Peaks (mind. 2 Sync-Punkte nötig).
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={buckets} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: '#64748B' }}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis tick={{ fontSize: 11, fill: '#64748B' }} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            borderRadius: 10,
            border: '1px solid #E2E8F0',
            fontSize: 12,
          }}
          formatter={(value) => [value ?? 0, 'Check-ins']}
          labelFormatter={(label) => `Ab ${label}`}
        />
        <Bar dataKey="checkIns" fill="#3B6FA0" radius={[4, 4, 0, 0]} name="Check-ins" />
      </BarChart>
    </ResponsiveContainer>
  );
}
