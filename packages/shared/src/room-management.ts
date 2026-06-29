export type RoomGuestStayDto = {
  id: string;
  reservationId: string;
  mainGuestName: string | null;
  arrivalDate: string;
  departureDate: string;
  checkOut: boolean;
  presence: 'in_house' | 'departed';
  stayover: boolean;
  expectedDepartureTime: string | null;
  checkInAt: string | null;
  source: 'check_ins_done' | 'in_house' | 'backfill';
};

export type RoomInspectionHistoryDto = {
  id: string;
  inspectedAt: string;
  passed: boolean;
  notes: string | null;
  inspector: { id: string; name: string; titlePrefix: string };
};

export type RoomHousekeepingEventDto = {
  id: string;
  kind: 'MARKED_CLEAN' | 'CHECKLIST_REOPENED';
  occurredAt: string;
  user: { id: string; name: string; titlePrefix: string };
};

export type RoomAssignmentHistoryDto = {
  id: string;
  assignedAt: string;
  status: string;
  housekeeper: { id: string; name: string; titlePrefix: string };
  assigner: { id: string; name: string; titlePrefix: string } | null;
};

export type RoomManagementPhotoDto = {
  id: string;
  url: string | null;
  mime: string | null;
  takenAt: string | null;
  createdAt: string;
  roomInspectionId: string | null;
  inspection: {
    id: string;
    passed: boolean;
    notes: string | null;
    inspectedAt: string;
  } | null;
  uploadedBy: { id: string; name: string; titlePrefix: string };
};

export type RoomManagementDamageDto = {
  id: string;
  damageType: string;
  description: string;
  status: string;
  reportedAt: string;
  photoUrl: string;
  reportedBy: { id: string; name: string; titlePrefix: string };
};

export type RoomManagementLostFoundDto = {
  id: string;
  description: string;
  status: string;
  foundAt: string | null;
  storedAt: string | null;
  storedLocation: string | null;
  createdAt: string;
  photoUrl: string | null;
  reportedBy: { id: string; name: string; titlePrefix: string };
};

export type RoomManagementDetailDto = {
  room: Record<string, unknown>;
  guestStays: RoomGuestStayDto[];
  inspections: RoomInspectionHistoryDto[];
  housekeepingEvents: RoomHousekeepingEventDto[];
  assignments: RoomAssignmentHistoryDto[];
  photos: RoomManagementPhotoDto[];
  damages: RoomManagementDamageDto[];
  lostFound: RoomManagementLostFoundDto[];
};
