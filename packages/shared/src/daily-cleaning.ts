export type DailyCleaningPlanStatus = 'DRAFT' | 'SAVED';
export type DailyCleaningTaskKind = 'ROOM' | 'PUBLIC_AREA';
export type DailyCleaningWorkType = 'DIRTY' | 'RESTANT' | 'PUBLIC';
export type DailyCleaningTaskSource = 'AUTO' | 'MANUAL';
export type PublicAreaKind = 'corridor' | 'glass' | 'elevator' | 'staff' | 'custom';

export type DailyCleaningAssignee = {
  id: string;
  name: string;
  titlePrefix: string;
  role: string;
  isLateShift: boolean;
  lateShiftSource: 'auto' | 'override' | 'none';
};

export type DailyCleaningTaskDto = {
  id: string;
  kind: DailyCleaningTaskKind;
  workType: DailyCleaningWorkType;
  roomId: string | null;
  roomNumber: string | null;
  floor: number | null;
  publicAreaId: string | null;
  publicAreaName: string | null;
  publicAreaKind: PublicAreaKind | null;
  assigneeUserId: string | null;
  pinned: boolean;
  source: DailyCleaningTaskSource;
  overdueDays: number | null;
  completedAt: string | null;
};

export type DailyCleaningSummary = {
  housekeeperId: string;
  roomCount: number;
  restantCount: number;
  publicCount: number;
  floors: number[];
};

export type DailyCleaningPlanResponse = {
  date: string;
  status: DailyCleaningPlanStatus;
  savedAt: string | null;
  suggested: boolean;
  warnings: string[];
  eligibleCleaners: DailyCleaningAssignee[];
  /** Cleaners on shift plus supervisors (for manual restant assignment). */
  manualAssignees: DailyCleaningAssignee[];
  tasks: DailyCleaningTaskDto[];
  summaries: DailyCleaningSummary[];
};

export type PublicAreaDto = {
  id: string;
  key: string;
  name: string;
  floor: number | null;
  kind: PublicAreaKind;
  frequencyDays: number;
  lastCompletedOn: string | null;
  isActive: boolean;
  isDueToday: boolean;
};

export type MyDailyTaskDto = {
  id: string;
  kind: DailyCleaningTaskKind;
  workType: DailyCleaningWorkType;
  roomId: string | null;
  roomNumber: string | null;
  floor: number | null;
  publicAreaId: string | null;
  publicAreaName: string | null;
  overdueDays: number | null;
  completedAt: string | null;
};
