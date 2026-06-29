import type { RoomOccupancy } from '@housekeeping/shared';
import { compareRoomNumbers, floorFromRoomNumber, formatFloorLabel } from '@housekeeping/shared';

export type TechnicianRoomRow = {
  id: string;
  roomNumber: string;
  floor: number | null;
  outOfOrder: boolean;
  occupancy?: RoomOccupancy | null;
};

export type RoomOccupancyStatus = 'free' | 'occupied' | 'ooo';

export type FloorGroup = {
  floor: number;
  label: string;
  rooms: TechnicianRoomRow[];
};

export type OccupancySummary = {
  floors: FloorGroup[];
  occupiedCount: number;
  freeCount: number;
  oooCount: number;
};

export function roomFloor(r: TechnicianRoomRow): number {
  return r.floor ?? floorFromRoomNumber(r.roomNumber) ?? Number.POSITIVE_INFINITY;
}

/** Checked-in guest still in the room (arrivals not yet checked in do not count). */
export function roomOccupancyStatus(r: TechnicianRoomRow): RoomOccupancyStatus {
  if (r.outOfOrder) return 'ooo';
  if (r.occupancy != null && !r.occupancy.checkOut) return 'occupied';
  return 'free';
}

export function isRoomOccupied(r: TechnicianRoomRow): boolean {
  return roomOccupancyStatus(r) === 'occupied';
}

export function summarizeRooms(rooms: TechnicianRoomRow[]): OccupancySummary {
  const byFloor = new Map<number, TechnicianRoomRow[]>();
  let occupiedCount = 0;
  let freeCount = 0;
  let oooCount = 0;

  for (const r of rooms) {
    const f = roomFloor(r);
    const list = byFloor.get(f) ?? [];
    list.push(r);
    byFloor.set(f, list);

    const status = roomOccupancyStatus(r);
    if (status === 'ooo') oooCount += 1;
    else if (status === 'occupied') occupiedCount += 1;
    else freeCount += 1;
  }

  const floors: FloorGroup[] = Array.from(byFloor.entries())
    .sort(([a], [b]) => a - b)
    .map(([floor, floorRooms]) => ({
      floor,
      label: formatFloorLabel(floor === Number.POSITIVE_INFINITY ? null : floor),
      rooms: [...floorRooms].sort((a, b) => compareRoomNumbers(a.roomNumber, b.roomNumber)),
    }));

  return { floors, occupiedCount, freeCount, oooCount };
}

const STATUS_LABEL: Record<RoomOccupancyStatus, string> = {
  free: 'Free',
  occupied: 'Occupied',
  ooo: 'Out of order',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatReportTimestamp(date: Date): string {
  return date.toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function filenameTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

export function buildOccupancyReportHtml(
  summary: OccupancySummary,
  options?: { generatedAt?: Date; hotelName?: string },
): string {
  const generatedAt = options?.generatedAt ?? new Date();
  const hotelName = options?.hotelName ?? 'Prize by Radisson Bern';
  const { floors, occupiedCount, freeCount, oooCount } = summary;
  const total = occupiedCount + freeCount + oooCount;

  const floorSections = floors
    .map((group) => {
      const rows = group.rooms
        .map((r) => {
          const status = roomOccupancyStatus(r);
          return `<tr class="row-${status}">
  <td class="room">${escapeHtml(r.roomNumber)}</td>
  <td><span class="badge badge-${status}">${STATUS_LABEL[status]}</span></td>
</tr>`;
        })
        .join('\n');

      return `<section class="floor">
  <h2>${escapeHtml(group.label)}</h2>
  <table>
    <thead>
      <tr>
        <th>Room</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>
</section>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Room occupancy — ${escapeHtml(hotelName)}</title>
  <style>
    :root {
      --ink: #1a1a1a;
      --muted: #5c5c5c;
      --border: #d8d4cb;
      --surface: #f7f5f0;
      --green: #16a34a;
      --green-bg: #dcfce7;
      --red: #dc2626;
      --red-bg: #fee2e2;
      --grey: #52525b;
      --grey-bg: #e4e4e7;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 32px 40px 48px;
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      color: var(--ink);
      background: #fff;
      line-height: 1.45;
    }
    header {
      border-bottom: 2px solid var(--ink);
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    h1 {
      margin: 0 0 6px;
      font-size: 1.65rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .meta {
      margin: 0;
      color: var(--muted);
      font-size: 0.92rem;
    }
    .summary {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin: 0 0 28px;
    }
    .summary-card {
      min-width: 140px;
      padding: 12px 16px;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: var(--surface);
    }
    .summary-card strong {
      display: block;
      font-size: 1.5rem;
      line-height: 1.1;
      margin-bottom: 2px;
    }
    .summary-card span {
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      font-weight: 600;
    }
    .summary-card.total strong { color: var(--ink); }
    .summary-card.free strong { color: var(--green); }
    .summary-card.occupied strong { color: var(--red); }
    .summary-card.ooo strong { color: var(--grey); }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      margin: 0 0 28px;
      font-size: 0.88rem;
      color: var(--muted);
    }
    .legend-item { display: inline-flex; align-items: center; gap: 8px; }
    .legend-swatch {
      width: 14px;
      height: 14px;
      border-radius: 4px;
      border: 1px solid rgba(0,0,0,0.12);
    }
    .legend-swatch.free { background: var(--green-bg); border-color: var(--green); }
    .legend-swatch.occupied { background: var(--red-bg); border-color: var(--red); }
    .legend-swatch.ooo { background: var(--grey-bg); border-color: var(--grey); }
    .floor { margin-bottom: 28px; break-inside: avoid; }
    .floor h2 {
      margin: 0 0 10px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--border);
      font-size: 0.82rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.95rem;
    }
    th, td {
      text-align: left;
      padding: 8px 10px;
      border-bottom: 1px solid var(--border);
    }
    th {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      font-weight: 600;
    }
    td.room {
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      width: 120px;
    }
    tr.row-free { background: var(--green-bg); }
    tr.row-occupied { background: var(--red-bg); }
    tr.row-ooo { background: var(--grey-bg); }
    .badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .badge-free { color: var(--green); background: #fff; border: 1px solid var(--green); }
    .badge-occupied { color: var(--red); background: #fff; border: 1px solid var(--red); }
    .badge-ooo { color: var(--grey); background: #fff; border: 1px solid var(--grey); }
    footer {
      margin-top: 36px;
      padding-top: 12px;
      border-top: 1px solid var(--border);
      font-size: 0.8rem;
      color: var(--muted);
    }
    @media print {
      body { padding: 16px 20px 24px; }
      .summary-card, .floor { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Room occupancy list</h1>
    <p class="meta">${escapeHtml(hotelName)} · Generated ${escapeHtml(formatReportTimestamp(generatedAt))}</p>
    <p class="meta">Based on PMS check-in status. Reservations not yet checked in are shown as free.</p>
  </header>

  <div class="summary">
    <div class="summary-card total"><strong>${total}</strong><span>Total rooms</span></div>
    <div class="summary-card free"><strong>${freeCount}</strong><span>Free</span></div>
    <div class="summary-card occupied"><strong>${occupiedCount}</strong><span>Occupied</span></div>
    ${oooCount > 0 ? `<div class="summary-card ooo"><strong>${oooCount}</strong><span>Out of order</span></div>` : ''}
  </div>

  <div class="legend">
    <span class="legend-item"><span class="legend-swatch free" aria-hidden="true"></span> Free — vacant</span>
    <span class="legend-item"><span class="legend-swatch occupied" aria-hidden="true"></span> Occupied — guest checked in</span>
    <span class="legend-item"><span class="legend-swatch ooo" aria-hidden="true"></span> Out of order</span>
  </div>

  ${floorSections}

  <footer>
  Housekeeping · Room occupancy report · ${escapeHtml(formatReportTimestamp(generatedAt))}
  </footer>
</body>
</html>`;
}

export function downloadOccupancyReport(
  rooms: TechnicianRoomRow[],
  options?: { generatedAt?: Date; hotelName?: string },
): void {
  const generatedAt = options?.generatedAt ?? new Date();
  const summary = summarizeRooms(rooms);
  const html = buildOccupancyReportHtml(summary, { generatedAt, hotelName: options?.hotelName });
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `room-occupancy-${filenameTimestamp(generatedAt)}.html`;
  link.click();
  URL.revokeObjectURL(url);
}
