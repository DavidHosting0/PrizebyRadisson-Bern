import { IsIn } from 'class-validator';

export const SETTABLE_ROOM_STATUSES = ['DIRTY', 'CLEAN', 'INSPECTED'] as const;
export type SettableRoomStatus = (typeof SETTABLE_ROOM_STATUSES)[number];

export class SetRoomStatusDto {
  @IsIn(SETTABLE_ROOM_STATUSES)
  status!: SettableRoomStatus;
}
