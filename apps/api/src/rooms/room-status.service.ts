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
   * PrizeBern board status: after EMMA sync, EMMA is authoritative when we have a mapped status.
   * Otherwise fall back to local checklist / inspection workflow.
   */
  derive(
    room: Pick<Room, 'outOfOrder' | 'cleaningDeclaredAt'>,
    tasks: Pick<RoomChecklistTask, 'status'>[],
    inspections: Pick<RoomInspection, 'passed' | 'inspectedAt'>[],
    emma?: EmmaStatusForDerive | null,
  ): DerivedRoomStatus {
    const sorted = [...inspections].sort(
      (a, b) => b.inspectedAt.getTime() - a.inspectedAt.getTime(),
    );
    const latestPassed = sorted.find((i) => i.passed);
    const localActivityAt = Math.max(
      room.cleaningDeclaredAt?.getTime() ?? 0,
      latestPassed?.inspectedAt.getTime() ?? 0,
    );
    const emmaSyncedAt = emma?.syncedAt ? new Date(emma.syncedAt).getTime() : 0;
    const localNewerThanEmma = emmaSyncedAt > 0 && localActivityAt > emmaSyncedAt;

    if (emma?.syncedAt && !localNewerThanEmma) {
      if (emma.outOfOrder || room.outOfOrder) return DerivedRoomStatus.OUT_OF_ORDER;
      if (emma.derivedStatus) return emma.derivedStatus;
      const fromEmma = mapEmmaToDerivedStatus({
        statusCode: emma.statusCode,
        statusLabel: emma.statusLabel,
        outOfOrder: emma.outOfOrder || room.outOfOrder,
      });
      if (fromEmma) return fromEmma;
      if (emma.outOfOrder || room.outOfOrder) return DerivedRoomStatus.OUT_OF_ORDER;
      return DerivedRoomStatus.DIRTY;
    }

    if (room.outOfOrder) return DerivedRoomStatus.OUT_OF_ORDER;

    const latest = sorted[0];
    if (latest?.passed) return DerivedRoomStatus.INSPECTED;
    if (room.cleaningDeclaredAt) return DerivedRoomStatus.CLEAN;

    if (!tasks.length) return DerivedRoomStatus.DIRTY;
    const allComplete = tasks.every((t) => t.status === ChecklistTaskStatus.COMPLETED);
    const anyProgress = tasks.some((t) => t.status !== ChecklistTaskStatus.NOT_STARTED);
    if (!allComplete) {
      if (!anyProgress) return DerivedRoomStatus.DIRTY;
      return DerivedRoomStatus.IN_PROGRESS;
    }
    return DerivedRoomStatus.IN_PROGRESS;
  }
}
