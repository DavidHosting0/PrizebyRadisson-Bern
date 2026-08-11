export enum UserRole {
  HOUSEKEEPER = 'HOUSEKEEPER',
  SUPERVISOR = 'SUPERVISOR',
  RECEPTION = 'RECEPTION',
  ADMIN = 'ADMIN',
  TECHNICIAN = 'TECHNICIAN',
}

export enum DerivedRoomStatus {
  OUT_OF_ORDER = 'OUT_OF_ORDER',
  DIRTY = 'DIRTY',
  IN_PROGRESS = 'IN_PROGRESS',
  CLEAN = 'CLEAN',
  INSPECTED = 'INSPECTED',
}

export * from './folio-charges';
export * from './outstanding-balance';
export * from './night-audit-grace';
export * from './emma-folio-move';
export * from './guest-stay-type';
export * from './room-layout';
export * from './reservations';
export * from './reservation-analytics';
export * from './arrival-check';
export * from './occupancy';
export * from './monitor-map';
export * from './guides';
export * from './departures';
export * from './daily-cleaning';
export * from './locale';
export * from './room-management';
export * from './front-office-backup';
export * from './shift-handover';
export * from './reception-ops';

export const WS_EVENTS = {
  SERVICE_REQUEST_CREATED: 'service_request.created',
  SERVICE_REQUEST_CLAIMED: 'service_request.claimed',
  SERVICE_REQUEST_RESOLVED: 'service_request.resolved',
  ROOM_STATUS_UPDATED: 'room.status_updated',
  CHECKLIST_TASK_UPDATED: 'checklist.task_updated',
  NOTIFICATION_CREATED: 'notification.created',
  TEAM_CHAT_MESSAGE: 'team_chat.message',
} as const;

export type NotificationType = 'SERVICE_REQUEST_CREATED' | 'TEAM_CHAT_MENTION';

export type NotificationDto = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  linkPath: string;
  readAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};
