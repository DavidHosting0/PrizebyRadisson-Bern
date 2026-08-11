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
   * PrizeBern board status.
   *
   * Housekeeping pipeline (local, wins over EMMA):
 * - Cleaner mark-clean → CLEAN in PrizeBern and push CL to EMMA
 * - Passed inspection → INSPECTED (EMMA gets IN on inspect)
   *
   * EMMA is used when the room is not in that local clean→inspect pipeline
   * (e.g. overnight dirty from PMS).
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

    // Cleaner declared clean more recently than the last passed inspection →
    // awaiting inspection. Prefer local CLEAN so a lagging Emma Dirty sync cannot hide it.
    if (cleanAt > inspectedAt) {
      return DerivedRoomStatus.CLEAN;
    }

    if (emma?.syncedAt) {
      if (emma.derivedStatus) return emma.derivedStatus;
      const fromEmma = mapEmmaToDerivedStatus({
        statusCode: emma.statusCode,
        statusLabel: emma.statusLabel,
        outOfOrder: emma.outOfOrder || room.outOfOrder,
      });
      if (fromEmma) return fromEmma;
    }

    if (inspectedAt > 0) return DerivedRoomStatus.INSPECTED;

    if (!tasks.length) return DerivedRoomStatus.DIRTY;
    const allComplete = tasks.every((t) => t.status === ChecklistTaskStatus.COMPLETED);
    const anyProgress = tasks.some((t) => t.status !== ChecklistTaskStatus.NOT_STARTED);
    if (!allComplete) {
      if (!anyProgress) return DerivedRoomStatus.DIRTY;
      return DerivedRoomStatus.IN_PROGRESS;
    }
    return DerivedRoomStatus.IN_PROGRESS;
  }

  /** True when PrizeBern has a local clean awaiting inspection (not from EMMA). */
  isAwaitingInspection(
    room: Pick<Room, 'outOfOrder' | 'cleaningDeclaredAt'>,
    inspections: Pick<RoomInspection, 'passed' | 'inspectedAt'>[],
  ): boolean {
    if (room.outOfOrder) return false;
    const cleanAt = room.cleaningDeclaredAt?.getTime() ?? 0;
    if (!cleanAt) return false;
    const latestPassed = [...inspections]
      .filter((i) => i.passed)
      .sort((a, b) => b.inspectedAt.getTime() - a.inspectedAt.getTime())[0];
    const inspectedAt = latestPassed?.inspectedAt.getTime() ?? 0;
    return cleanAt > inspectedAt;
  }
}
