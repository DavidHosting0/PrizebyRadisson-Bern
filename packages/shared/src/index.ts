export enum UserRole {
  HOUSEKEEPER = 'HOUSEKEEPER',
  SUPERVISOR = 'SUPERVISOR',
  RECEPTION = 'RECEPTION',
  ADMIN = 'ADMIN',
}

export enum DerivedRoomStatus {
  OUT_OF_ORDER = 'OUT_OF_ORDER',
  DIRTY = 'DIRTY',
  IN_PROGRESS = 'IN_PROGRESS',
  CLEAN = 'CLEAN',
  INSPECTED = 'INSPECTED',
}

export const WS_EVENTS = {
  SERVICE_REQUEST_CREATED: 'service_request.created',
  SERVICE_REQUEST_CLAIMED: 'service_request.claimed',
  SERVICE_REQUEST_RESOLVED: 'service_request.resolved',
  ROOM_STATUS_UPDATED: 'room.status_updated',
  CHECKLIST_TASK_UPDATED: 'checklist.task_updated',
} as const;
