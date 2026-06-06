import { Injectable } from '@nestjs/common';
import type { RoomOccupancy } from '@housekeeping/shared';
import { normalizeEmmaRoomNumber } from '../emma/emma-room-status-sync';
import { SecretCipherService } from '../common/crypto/secret-cipher.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  decryptSensitivePayload,
  todayIsoDate,
} from '../reservations/reservation-sensitive';

type SnapshotRow = {
  reservationId: string;
  roomId: string | null;
  departureDate: Date;
  checkOut: boolean;
  sensitiveEnc: string;
  syncedAt: Date;
};

@Injectable()
export class RoomOccupancyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: SecretCipherService,
  ) {}

  async mapForRoomNumbers(roomNumbers: string[]): Promise<Map<string, RoomOccupancy>> {
    const out = new Map<string, RoomOccupancy>();
    if (roomNumbers.length === 0) return out;

    const normalizedToLocal = new Map<string, string>();
    for (const n of roomNumbers) {
      normalizedToLocal.set(normalizeEmmaRoomNumber(n), n);
      normalizedToLocal.set(n, n);
    }

    const today = todayIsoDate();
    const snapshots = await this.prisma.reservationSnapshot.findMany({
      where: {
        checkIn: true,
        roomId: { not: null },
        OR: [{ checkOut: false }, { departureDate: new Date(`${today}T00:00:00.000Z`) }],
      },
      select: {
        reservationId: true,
        roomId: true,
        departureDate: true,
        checkOut: true,
        sensitiveEnc: true,
        syncedAt: true,
      },
    });

    const byRoom = new Map<string, SnapshotRow[]>();
    for (const snap of snapshots) {
      const rawRoom = snap.roomId?.trim();
      if (!rawRoom) continue;
      const local = normalizedToLocal.get(normalizeEmmaRoomNumber(rawRoom));
      if (!local) continue;
      const list = byRoom.get(local) ?? [];
      list.push(snap);
      byRoom.set(local, list);
    }

    for (const [roomNumber, rows] of byRoom) {
      const picked = this.pickBestRow(rows, today);
      if (!picked) continue;
      const occ = this.toOccupancy(picked, today);
      if (occ) out.set(roomNumber, occ);
    }

    return out;
  }

  private pickBestRow(rows: SnapshotRow[], today: string): SnapshotRow | null {
    if (rows.length === 0) return null;
    const scored = [...rows].sort((a, b) => {
      const score = (r: SnapshotRow) => {
        let s = 0;
        if (!r.checkOut) s += 100;
        if (r.departureDate.toISOString().slice(0, 10) === today) s += 50;
        return s;
      };
      const diff = score(b) - score(a);
      if (diff !== 0) return diff;
      return b.syncedAt.getTime() - a.syncedAt.getTime();
    });
    return scored[0] ?? null;
  }

  private toOccupancy(row: SnapshotRow, today: string): RoomOccupancy | null {
    const sensitive = decryptSensitivePayload(this.cipher, row.sensitiveEnc);
    if (!sensitive) return null;
    const departureDate = row.departureDate.toISOString().slice(0, 10);
    return {
      reservationId: row.reservationId,
      mainGuestName: sensitive.mainGuestName,
      departureDate,
      isDepartureToday: departureDate === today,
      checkOut: row.checkOut,
      stayover: sensitive.stayover,
      expectedDepartureTime: sensitive.expectedDepartureTime,
    };
  }
}
