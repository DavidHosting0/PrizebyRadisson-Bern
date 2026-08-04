import type { ReceptionHandoverShift } from './shift-handover';

export type ShiftNoteDto = {
  id: string;
  forDate: string;
  /** Kept for API compat; notes are day-scoped (all shifts). */
  shifts: ReceptionHandoverShift[];
  body: string;
  createdBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
};

export type CreateShiftNotePayload = {
  forDate: string;
  body: string;
  /** Optional; server defaults to all shifts for the day. */
  shifts?: ReceptionHandoverShift[];
};

export type UpdateShiftNotePayload = {
  forDate?: string;
  body?: string;
  shifts?: ReceptionHandoverShift[];
};

export type ShiftNoteDaySummaryDto = {
  date: string;
  count: number;
};

export type GuestComplaintCategory = 'ROOM' | 'OTHER';
export type GuestComplaintStatus = 'OPEN' | 'RESOLVED';

export type GuestComplaintDto = {
  id: string;
  category: GuestComplaintCategory;
  room: { id: string; roomNumber: string } | null;
  description: string;
  status: GuestComplaintStatus;
  createdBy: { id: string; name: string };
  resolvedAt: string | null;
  resolvedBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateGuestComplaintPayload = {
  category: GuestComplaintCategory;
  roomId?: string | null;
  description: string;
};

export type UpdateGuestComplaintPayload = {
  description?: string;
  status?: GuestComplaintStatus;
};

export type ComplaintHeatmapEntryDto = {
  roomId: string;
  roomNumber: string;
  count: number;
};

export type LoanCatalogItemDto = {
  id: string;
  name: string;
  depositCents: number;
  active: boolean;
  sortOrder: number;
};

export type UpsertLoanCatalogItemPayload = {
  name: string;
  depositCents: number;
  active?: boolean;
  sortOrder?: number;
};

export type RoomLoanDto = {
  id: string;
  room: { id: string; roomNumber: string };
  catalogItem: { id: string; name: string };
  depositCents: number;
  loanedAt: string;
  loanedBy: { id: string; name: string };
  returnedAt: string | null;
  returnedBy: { id: string; name: string } | null;
};

export type CreateRoomLoanPayload = {
  roomId: string;
  catalogItemId: string;
};
