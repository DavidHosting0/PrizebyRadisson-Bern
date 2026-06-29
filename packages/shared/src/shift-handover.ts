export type ReceptionHandoverShift = 'NIGHT' | 'MORNING' | 'LATE';

export const RECEPTION_HANDOVER_SHIFTS: ReceptionHandoverShift[] = ['NIGHT', 'MORNING', 'LATE'];

export const SHIFT_HANDOVER_LABELS_DE: Record<ReceptionHandoverShift, string> = {
  NIGHT: 'Nachtschicht',
  MORNING: 'Frühschicht',
  LATE: 'Spätschicht',
};

export function nextHandoverShift(shift: ReceptionHandoverShift): ReceptionHandoverShift {
  if (shift === 'NIGHT') return 'MORNING';
  if (shift === 'MORNING') return 'LATE';
  return 'NIGHT';
}

export type ShiftHandoverTaskDto = {
  id: string;
  label: string;
  code: string;
  sortOrder: number;
  essential: boolean;
  completed: boolean;
  completedAt: string | null;
  completedBy: { id: string; name: string } | null;
};

export type ShiftHandoverStateDto = {
  activeShift: ReceptionHandoverShift;
  activeShiftLabel: string;
  nextShift: ReceptionHandoverShift;
  nextShiftLabel: string;
  tasks: ShiftHandoverTaskDto[];
  completedCount: number;
  totalCount: number;
  essentialCompletedCount: number;
  essentialTotalCount: number;
  lastHandoverAt: string | null;
  lastHandoverBy: { id: string; name: string } | null;
};

export type ShiftHandoverTemplateTaskDto = {
  id: string;
  label: string;
  code: string;
  sortOrder: number;
  essential: boolean;
};

export type ShiftHandoverTemplateDto = {
  shift: ReceptionHandoverShift;
  tasks: ShiftHandoverTemplateTaskDto[];
};

export type ShiftHandoverHandoverResultDto = {
  fromShift: ReceptionHandoverShift;
  toShift: ReceptionHandoverShift;
  incompleteCount: number;
  handedOverAt: string;
};

export type ShiftHandoverLogEntryDto = {
  id: string;
  fromShift: ReceptionHandoverShift;
  toShift: ReceptionHandoverShift;
  fromShiftLabel: string;
  toShiftLabel: string;
  incompleteCount: number;
  handedOverBy: { id: string; name: string };
  createdAt: string;
};

export type PutShiftHandoverTemplatePayload = {
  tasks: Array<{
    id?: string;
    label: string;
    code?: string;
    sortOrder: number;
    essential?: boolean;
  }>;
};

export type ShiftHandoverHandoverPayload = {
  confirmShiftName: string;
};

export type ShiftHandoverTaskUpdatePayload = {
  completed: boolean;
};
