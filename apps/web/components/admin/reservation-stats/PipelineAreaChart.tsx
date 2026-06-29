'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ReservationTimelinePoint } from '@housekeeping/shared';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-CH', {
    timeZone: 'Europe/Zurich',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

type ChartRow = ReservationTimelinePoint & { timeLabel: string };

export function PipelineAreaChart({ points }: { points: ReservationTimelinePoint[] }) {
  const data: ChartRow[] = points.map((p) => ({
    ...p,
    timeLabel: formatTime(p.at),
  }));

  if (data.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-ink-muted">Keine Sync-Daten für diesen Tag.</p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
        <XAxis
          dataKey="timeLabel"
          tick={{ fontSize: 11, fill: '#64748B' }}
          interval="preserveStartEnd"
          minTickGap={40}
        />
        <YAxis tick={{ fontSize: 11, fill: '#64748B' }} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            borderRadius: 10,
            border: '1px solid #E2E8F0',
            fontSize: 12,
          }}
          labelFormatter={(_, payload) => {
            const row = payload?.[0]?.payload as ChartRow | undefined;
            return row ? formatTime(row.at) : '';
          }}
        />
        <Legend
          formatter={(value) => {
            if (value === 'checkInPending') return 'Pending';
            if (value === 'checkInQueue') return 'Queue';
            return 'Check-in erledigt';
          }}
        />
        <Area
          type="monotone"
          dataKey="checkInPending"
          stackId="pipeline"
          stroke="#C98A32"
          fill="#FDF6E8"
          name="checkInPending"
        />
        <Area
          type="monotone"
          dataKey="checkInQueue"
          stackId="pipeline"
          stroke="#3B6FA0"
          fill="#EDF3F8"
          name="checkInQueue"
        />
        <Area
          type="monotone"
          dataKey="checkInDone"
          stackId="pipeline"
          stroke="#3D9A6A"
          fill="#E8F5EE"
          name="checkInDone"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
