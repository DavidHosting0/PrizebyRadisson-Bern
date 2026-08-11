import { DerivedRoomStatus } from '@housekeeping/shared';
import { Injectable } from '@nestjs/common';
import { mapEmmaToDerivedStatus } from '../emma/emma-room-status-sync';
import {
  ChecklistTaskStatus,
  Room,
  RoomChecklistTask,
  RoomInspection,
} from '@prisma/client';

export type { DerivedRoomStatus };

export type EmmaStatusForDerive = {
  statusCode: string | null;
  statusLabel: string | null;
  derivedStatus: DerivedRoomStatus | null;
  outOfOrder: boolean;
  syncedAt: string;
};

@Injectable()
export class RoomStatusService {
  /**
   * PrizeBern board status — EMMA is authoritative when synced.
   *
   * Local cleaner mark-clean / inspection only win when they are newer than the
   * last Emma sync (so PrizeBern can show CLEAN right after mark-clean until
   * Emma catches up with CL, then IN after inspect).
   */
  derive(
    room: Pick<Room, 'outOfOrder' | 'cleaningDeclaredAt'>,
    tasks: Pick<RoomChecklistTask, 'status'>[],
    inspections: Pick<RoomInspection, 'passed' | 'inspectedAt'>[],
    emma?: EmmaStatusForDerive | null,
  ): DerivedRoomStatus {
    if (room.outOfOrder || emma?.outOfOrder) return DerivedRoomStatus.OUT_OF_ORDER;

    const sorted = [...inspections].sort(
      (a, b) => b.inspectedAt.getTime() - a.inspectedAt.getTime(),
    );
    const latestPassed = sorted.find((i) => i.passed);
    const cleanAt = room.cleaningDeclaredAt?.getTime() ?? 0;
    const inspectedAt = latestPassed?.inspectedAt.getTime() ?? 0;
    const localActivityAt = Math.max(cleanAt, inspectedAt);
    const emmaSyncedAt = emma?.syncedAt ? new Date(emma.syncedAt).getTime() : 0;
    const localNewerThanEmma = emmaSyncedAt > 0 && localActivityAt > emmaSyncedAt;

    // Emma is the source of truth unless PrizeBern just changed status more recently.
    if (emma?.syncedAt && !localNewerThanEmma) {
      if (emma.derivedStatus) return emma.derivedStatus;
      const fromEmma = mapEmmaToDerivedStatus({
        statusCode: emma.statusCode,
        statusLabel: emma.statusLabel,
        outOfOrder: emma.outOfOrder || room.outOfOrder,
      });
      if (fromEmma) return fromEmma;
    }

    // Local housekeeping pipeline (no Emma, or local action newer than Emma).
    if (inspectedAt > 0 && inspectedAt >= cleanAt) return DerivedRoomStatus.INSPECTED;
    if (cleanAt > inspectedAt) return DerivedRoomStatus.CLEAN;

    if (!tasks.length) return DerivedRoomStatus.DIRTY;
    const allComplete = tasks.every((t) => t.status === ChecklistTaskStatus.COMPLETED);
    const anyProgress = tasks.some((t) => t.status !== ChecklistTaskStatus.NOT_STARTED);
    if (!allComplete) {
      if (!anyProgress) return DerivedRoomStatus.DIRTY;
      return DerivedRoomStatus.IN_PROGRESS;
    }
    return DerivedRoomStatus.IN_PROGRESS;
  }

  /**
   * Rooms that should sit on the inspection queue: board status CLEAN
   * (Emma CL, or local mark-clean newer than Emma).
   */
  isAwaitingInspection(
    room: Pick<Room, 'outOfOrder' | 'cleaningDeclaredAt'>,
    inspections: Pick<RoomInspection, 'passed' | 'inspectedAt'>[],
    emma?: EmmaStatusForDerive | null,
  ): boolean {
    if (room.outOfOrder || emma?.outOfOrder) return false;
    return this.derive(room, [], inspections, emma) === DerivedRoomStatus.CLEAN;
  }
}
