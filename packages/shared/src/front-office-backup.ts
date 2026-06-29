export type EmmaBackupModeReason = 'push' | 'reservation_sync' | 'manual';

export type EmmaBackupModeState = {
  active: boolean;
  reasons: EmmaBackupModeReason[];
  since: string | null;
  manual: boolean;
};

export type EmmaPushAlertState = {
  active: boolean;
  since: string | null;
  pendingCount: number;
  lastError: string | null;
};

export type EmmaIntegrationStatus = {
  backupMode: EmmaBackupModeState;
  pushAlert: EmmaPushAlertState;
  message: string | null;
};

export type FrontOfficeBackupFreshness = {
  generatedAt: string;
  reservationsLastSyncedAt: string | null;
  reservationsLastSyncStatus: 'ok' | 'error' | 'running' | null;
  reservationsLastSyncError: string | null;
  roomsNewestEmmaSyncedAt: string | null;
  roomsOldestEmmaSyncedAt: string | null;
};

export type FrontOfficeBackupRoomRow = {
  roomId: string;
  roomNumber: string;
  floor: number | null;
  derivedStatus: 'OUT_OF_ORDER' | 'DIRTY' | 'IN_PROGRESS' | 'CLEAN' | 'INSPECTED';
  outOfOrder: boolean;
  emmaStatusCode: string | null;
  emmaStatusLabel: string | null;
  cleaningDeclaredAt: string | null;
  emmaSyncedAt: string | null;
  updatedAt: string;
};

export type FrontOfficeBackupReservationRow = {
  id: string;
  reservationId: string;
  mainGuestName: string | null;
  roomId: string | null;
  roomNumber: string | null;
  arrivalDate: string;
  departureDate: string;
  checkIn: boolean;
  checkOut: boolean;
  checkInQueue: boolean;
  inTodayArrivals: boolean;
  balance: string | null;
  syncedAt: string;
};

export type FrontOfficeBackupSharedRoom = {
  roomNumber: string;
  reservations: FrontOfficeBackupReservationRow[];
};

export type FrontOfficeBackupOverview = {
  freshness: FrontOfficeBackupFreshness;
  rooms: FrontOfficeBackupRoomRow[];
  checkedIn: FrontOfficeBackupReservationRow[];
  pendingCheckIn: FrontOfficeBackupReservationRow[];
  sharedRooms: FrontOfficeBackupSharedRoom[];
};
