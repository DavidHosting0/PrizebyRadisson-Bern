import { Injectable } from '@nestjs/common';
import {
  ChecklistTaskStatus,
  Room,
  RoomChecklistTask,
  RoomInspection,
} from '@prisma/client';

export type DerivedRoomStatus =
  | 'OUT_OF_ORDER'
  | 'DIRTY'
  | 'IN_PROGRESS'
  | 'CLEAN'
  | 'INSPECTED';

@Injectable()
export class RoomStatusService {
  derive(
    room: Pick<Room, 'outOfOrder' | 'cleaningDeclaredAt'>,
    tasks: Pick<RoomChecklistTask, 'status'>[],
    inspections: Pick<RoomInspection, 'passed' | 'inspectedAt'>[],
  ): DerivedRoomStatus {
    if (room.outOfOrder) return 'OUT_OF_ORDER';
    if (!tasks.length) return 'DIRTY';
    const allComplete = tasks.every((t) => t.status === ChecklistTaskStatus.COMPLETED);
    const anyProgress = tasks.some((t) => t.status !== ChecklistTaskStatus.NOT_STARTED);
    if (!allComplete) {
      if (!anyProgress) return 'DIRTY';
      return 'IN_PROGRESS';
    }
    const sorted = [...inspections].sort(
      (a, b) => b.inspectedAt.getTime() - a.inspectedAt.getTime(),
    );
    const latest = sorted[0];
    if (latest?.passed) return 'INSPECTED';
    if (!room.cleaningDeclaredAt) return 'IN_PROGRESS';
    return 'CLEAN';
  }
}
