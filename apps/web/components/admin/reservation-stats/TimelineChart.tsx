'use client';

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ReservationTimelinePoint } from '@housekeeping/shared';

const CHART_COLORS = {
  remaining: '#3B6FA0',
  done: '#3D9A6A',
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-CH', {
    timeZone: 'Europe/Zurich',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

type ChartRow = ReservationTimelinePoint & { timeLabel: string };

export function TimelineChart({ points }: { points: ReservationTimelinePoint[] }) {
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
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
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
          formatter={(value, name) => [
            value ?? 0,
            name === 'remainingCheckIns' ? 'Offen' : 'Check-in erledigt',
          ]}
        />
        <Legend
          formatter={(value) =>
            value === 'remainingCheckIns' ? 'Offene Check-ins' : 'Check-ins erledigt'
          }
        />
        <Line
          type="monotone"
          dataKey="remainingCheckIns"
          stroke={CHART_COLORS.remaining}
          strokeWidth={2}
          dot={false}
          name="remainingCheckIns"
        />
        <Line
          type="monotone"
          dataKey="checkInDone"
          stroke={CHART_COLORS.done}
          strokeWidth={2}
          dot={false}
          name="checkInDone"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
