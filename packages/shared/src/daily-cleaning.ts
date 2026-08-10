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

export type DailyCleaningWorkPreview = {
  dirtyRoomCount: number;
  restantCount: number;
  publicCount: number;
};

/** Room held for a later day (supervisor skip) — not in today's auto-assign pool. */
export type DeferredRoomDto = {
  roomId: string;
  roomNumber: string;
  floor: number | null;
  deferredUntil: string;
  firstDeferredOn: string;
  overdueDays: number;
};

export type DailyCleaningPlanResponse = {
  date: string;
  status: DailyCleaningPlanStatus;
  savedAt: string | null;
  suggested: boolean;
  warnings: string[];
  /** Resolved crew for balancing / board (persisted DailyWorkingStaff or shift default). */
  workingToday: DailyCleaningAssignee[];
  /** Alias of workingToday — used by balancer and older clients. */
  eligibleCleaners: DailyCleaningAssignee[];
  /** Cleaners with overlapping shifts today (preselect hint). */
  onShiftCleaners: DailyCleaningAssignee[];
  /** All active CLEANER housekeepers. */
  allCleaners: DailyCleaningAssignee[];
  /** All cleaners plus supervisors (restant / public pickers). */
  manualAssignees: DailyCleaningAssignee[];
  /** Housekeeping staff eligible to inspect (CLEANER + supervisors; excludes HTC). */
  inspectorCandidates: DailyCleaningAssignee[];
  /** Who is on inspection duty for this date. */
  inspectorsToday: DailyCleaningAssignee[];
  /** Open work counts for the auto-assign preview. */
  workPreview: DailyCleaningWorkPreview;
  /** Rooms left for tomorrow (excluded from today's assign / auto-assign). */
  deferredRooms: DeferredRoomDto[];
  tasks: DailyCleaningTaskDto[];
  summaries: DailyCleaningSummary[];
};

/** Options chosen in the board auto-assign setup dialog. */
export type AutoAssignRunOptions = {
  date?: string;
  /** Who is on the cleaning crew today (overrides shift-only eligibility). */
  workingTodayUserIds?: string[];
  /** Who cleans all restant rooms today (cleaner or housekeeping supervisor). */
  restantAssigneeUserId?: string | null;
  /** User ids marked as late shift (fewer rooms). */
  lateShiftUserIds?: string[];
  /** Who gets public-area cleaning today. */
  publicAssigneeUserIds?: string[];
  /** Who inspects cleaned rooms today (CLEANER + supervisors; not HTC). */
  inspectorUserIds?: string[];
};

export type DailyInspectionTaskStatus = 'PENDING' | 'CLAIMED' | 'DONE' | 'CANCELLED';

export type InspectionQueueTaskDto = {
  id: string;
  date: string;
  roomId: string;
  roomNumber: string;
  floor: number | null;
  status: DailyInspectionTaskStatus;
  claimedByUserId: string | null;
  claimedByName: string | null;
  claimedAt: string | null;
  createdAt: string;
};

export type InspectionQueueResponse = {
  date: string;
  onDuty: boolean;
  duties: Array<{ id: string; name: string; titlePrefix: string }>;
  tasks: InspectionQueueTaskDto[];
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
