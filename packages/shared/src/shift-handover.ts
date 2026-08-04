export type ReceptionHandoverShift = 'NIGHT' | 'MORNING' | 'LATE';

/** Order within one calendar day: Früh → Spät → Nacht, then next day. */
export const RECEPTION_HANDOVER_SHIFTS: ReceptionHandoverShift[] = ['MORNING', 'LATE', 'NIGHT'];

export const SHIFT_HANDOVER_LABELS_DE: Record<ReceptionHandoverShift, string> = {
  NIGHT: 'Nachtschicht',
  MORNING: 'Frühschicht',
  LATE: 'Spätschicht',
};

export function nextHandoverShift(shift: ReceptionHandoverShift): ReceptionHandoverShift {
  if (shift === 'MORNING') return 'LATE';
  if (shift === 'LATE') return 'NIGHT';
  return 'MORNING';
}

/** Day advances only after Nachtschicht → Frühschicht. */
export function handoverAdvancesCalendarDay(fromShift: ReceptionHandoverShift): boolean {
  return fromShift === 'NIGHT';
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
  /** Operating calendar day for the active shift (YYYY-MM-DD). Advances only after Nacht → Früh. */
  activeDate: string;
  activeShift: ReceptionHandoverShift;
  activeShiftLabel: string;
  nextShift: ReceptionHandoverShift;
  nextShiftLabel: string;
  /** True when the next handover will roll activeDate to the following day. */
  nextHandoverAdvancesDay: boolean;
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
  fromDate: string;
  toDate: string;
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
