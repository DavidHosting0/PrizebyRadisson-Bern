import { PermissionCode, UserRole, UserTitlePrefix } from '@prisma/client';

/** Every defined permission (for admin / validation). */
export const ALL_PERMISSION_CODES: PermissionCode[] = [
  PermissionCode.ROOMS_READ,
  PermissionCode.ROOMS_UPDATE,
  PermissionCode.CHECKLIST_TASK_UPDATE,
  PermissionCode.CHECKLIST_REOPEN,
  PermissionCode.PHOTO_UPLOAD,
  PermissionCode.PHOTO_TIMELINE_READ,
  PermissionCode.ASSIGNMENT_READ,
  PermissionCode.ASSIGNMENT_CREATE,
  PermissionCode.ASSIGNMENT_SUGGESTIONS,
  PermissionCode.ASSIGNMENT_RUN_AUTO,
  PermissionCode.SERVICE_REQUEST_READ,
  PermissionCode.SERVICE_REQUEST_CREATE,
  PermissionCode.SERVICE_REQUEST_CLAIM,
  PermissionCode.SERVICE_REQUEST_PATCH,
  PermissionCode.SERVICE_REQUEST_CANCEL,
  PermissionCode.LOST_FOUND_READ,
  PermissionCode.LOST_FOUND_CREATE,
  PermissionCode.LOST_FOUND_UPDATE,
  PermissionCode.INSPECTION_CREATE,
  PermissionCode.ROOM_TYPE_READ,
  PermissionCode.ROOM_TYPE_WRITE,
  PermissionCode.FLOOR_PLAN_READ,
  PermissionCode.FLOOR_PLAN_WRITE,
  PermissionCode.ANALYTICS_READ,
  PermissionCode.TEAM_CHAT_READ,
  PermissionCode.TEAM_CHAT_POST,
  PermissionCode.USERS_READ,
  PermissionCode.USERS_READ_HOUSEKEEPERS,
  PermissionCode.USERS_WRITE,
  PermissionCode.USERS_DELETE,
  PermissionCode.SETTINGS_READ,
  PermissionCode.SETTINGS_WRITE,
  PermissionCode.DAMAGE_REPORT_CREATE,
  PermissionCode.DAMAGE_REPORT_READ,
  PermissionCode.DAMAGE_REPORT_UPDATE,
];

function addCleanerBase(s: Set<PermissionCode>) {
  s.add(PermissionCode.ROOMS_READ);
  s.add(PermissionCode.CHECKLIST_TASK_UPDATE);
  s.add(PermissionCode.PHOTO_UPLOAD);
  s.add(PermissionCode.PHOTO_TIMELINE_READ);
  s.add(PermissionCode.SERVICE_REQUEST_READ);
  s.add(PermissionCode.SERVICE_REQUEST_CLAIM);
  s.add(PermissionCode.SERVICE_REQUEST_PATCH);
  s.add(PermissionCode.LOST_FOUND_READ);
  s.add(PermissionCode.LOST_FOUND_CREATE);
  s.add(PermissionCode.DAMAGE_REPORT_CREATE);
  s.add(PermissionCode.TEAM_CHAT_READ);
  s.add(PermissionCode.TEAM_CHAT_POST);
}

/** Deputy captain (HTC in Training) on HK role: broad ops, no auto-assign / room-type template edits. */
function addDeputyCaptainExtras(s: Set<PermissionCode>) {
  s.add(PermissionCode.ROOMS_UPDATE);
  s.add(PermissionCode.CHECKLIST_REOPEN);
  s.add(PermissionCode.ASSIGNMENT_READ);
  s.add(PermissionCode.ASSIGNMENT_CREATE);
  s.add(PermissionCode.ASSIGNMENT_SUGGESTIONS);
  s.add(PermissionCode.SERVICE_REQUEST_CREATE);
  s.add(PermissionCode.SERVICE_REQUEST_CANCEL);
  s.add(PermissionCode.LOST_FOUND_UPDATE);
  s.add(PermissionCode.DAMAGE_REPORT_READ);
  s.add(PermissionCode.DAMAGE_REPORT_UPDATE);
  s.add(PermissionCode.INSPECTION_CREATE);
  s.add(PermissionCode.ROOM_TYPE_READ);
  s.add(PermissionCode.FLOOR_PLAN_READ);
  s.add(PermissionCode.ANALYTICS_READ);
  s.add(PermissionCode.USERS_READ_HOUSEKEEPERS);
  s.add(PermissionCode.SETTINGS_READ);
}

/** Property maintenance mobile app: damage reports, room occupancy-style view, team chat. */
function buildTechnicianSet(): Set<PermissionCode> {
  const s = new Set<PermissionCode>();
  s.add(PermissionCode.ROOMS_READ);
  s.add(PermissionCode.DAMAGE_REPORT_READ);
  s.add(PermissionCode.DAMAGE_REPORT_UPDATE);
  s.add(PermissionCode.SERVICE_REQUEST_READ);
  s.add(PermissionCode.TEAM_CHAT_READ);
  s.add(PermissionCode.TEAM_CHAT_POST);
  return s;
}

function buildReceptionSet(): Set<PermissionCode> {
  const s = new Set<PermissionCode>();
  s.add(PermissionCode.ROOMS_READ);
  s.add(PermissionCode.SERVICE_REQUEST_READ);
  s.add(PermissionCode.SERVICE_REQUEST_CREATE);
  s.add(PermissionCode.SERVICE_REQUEST_PATCH);
  s.add(PermissionCode.SERVICE_REQUEST_CANCEL);
  s.add(PermissionCode.ASSIGNMENT_READ);
  s.add(PermissionCode.PHOTO_TIMELINE_READ);
  s.add(PermissionCode.LOST_FOUND_READ);
  s.add(PermissionCode.LOST_FOUND_CREATE);
  s.add(PermissionCode.LOST_FOUND_UPDATE);
  s.add(PermissionCode.DAMAGE_REPORT_READ);
  s.add(PermissionCode.DAMAGE_REPORT_UPDATE);
  s.add(PermissionCode.FLOOR_PLAN_READ);
  s.add(PermissionCode.TEAM_CHAT_READ);
  s.add(PermissionCode.TEAM_CHAT_POST);
  s.add(PermissionCode.SETTINGS_READ);
  return s;
}

function buildSupervisorSet(): Set<PermissionCode> {
  const s = new Set<PermissionCode>();
  s.add(PermissionCode.ROOMS_READ);
  s.add(PermissionCode.ROOMS_UPDATE);
  s.add(PermissionCode.CHECKLIST_TASK_UPDATE);
  s.add(PermissionCode.CHECKLIST_REOPEN);
  s.add(PermissionCode.PHOTO_UPLOAD);
  s.add(PermissionCode.PHOTO_TIMELINE_READ);
  s.add(PermissionCode.ASSIGNMENT_READ);
  s.add(PermissionCode.ASSIGNMENT_CREATE);
  s.add(PermissionCode.ASSIGNMENT_SUGGESTIONS);
  s.add(PermissionCode.ASSIGNMENT_RUN_AUTO);
  s.add(PermissionCode.SERVICE_REQUEST_READ);
  s.add(PermissionCode.SERVICE_REQUEST_CREATE);
  s.add(PermissionCode.SERVICE_REQUEST_CLAIM);
  s.add(PermissionCode.SERVICE_REQUEST_PATCH);
  s.add(PermissionCode.SERVICE_REQUEST_CANCEL);
  s.add(PermissionCode.LOST_FOUND_READ);
  s.add(PermissionCode.LOST_FOUND_CREATE);
  s.add(PermissionCode.LOST_FOUND_UPDATE);
  s.add(PermissionCode.DAMAGE_REPORT_READ);
  s.add(PermissionCode.DAMAGE_REPORT_CREATE);
  s.add(PermissionCode.DAMAGE_REPORT_UPDATE);
  s.add(PermissionCode.INSPECTION_CREATE);
  s.add(PermissionCode.ROOM_TYPE_READ);
  s.add(PermissionCode.ROOM_TYPE_WRITE);
  s.add(PermissionCode.FLOOR_PLAN_READ);
  s.add(PermissionCode.ANALYTICS_READ);
  s.add(PermissionCode.TEAM_CHAT_READ);
  s.add(PermissionCode.TEAM_CHAT_POST);
  s.add(PermissionCode.SETTINGS_READ);
  s.add(PermissionCode.USERS_READ_HOUSEKEEPERS);
  return s;
}

/**
 * Base permissions from role + title prefix (before admin-granted extras).
 */
export function defaultPermissionsForUser(role: UserRole, titlePrefix: UserTitlePrefix): Set<PermissionCode> {
  if (role === UserRole.ADMIN) {
    return new Set(ALL_PERMISSION_CODES);
  }

  if (role === UserRole.RECEPTION) {
    return buildReceptionSet();
  }

  if (role === UserRole.TECHNICIAN) {
    return buildTechnicianSet();
  }

  if (role === UserRole.SUPERVISOR) {
    const s = buildSupervisorSet();
    if (titlePrefix === UserTitlePrefix.HTC) {
      s.add(PermissionCode.SETTINGS_WRITE);
    }
    return s;
  }

  // HOUSEKEEPER
  const s = new Set<PermissionCode>();
  addCleanerBase(s);

  switch (titlePrefix) {
    case UserTitlePrefix.CLEANER:
    case UserTitlePrefix.RECEPTION:
      return s;

    case UserTitlePrefix.HTC_IN_TRAINING:
      addDeputyCaptainExtras(s);
      return s;

    case UserTitlePrefix.HTC:
      addDeputyCaptainExtras(s);
      s.add(PermissionCode.ASSIGNMENT_RUN_AUTO);
      s.add(PermissionCode.ROOM_TYPE_WRITE);
      s.add(PermissionCode.SETTINGS_READ);
      return s;

    case UserTitlePrefix.HOUSEKEEPING_SUPERVISOR:
    case UserTitlePrefix.ADMIN:
      addDeputyCaptainExtras(s);
      s.add(PermissionCode.ASSIGNMENT_RUN_AUTO);
      s.add(PermissionCode.ROOM_TYPE_WRITE);
      return s;

    default:
      return s;
  }
}

export function mergeEffective(
  role: UserRole,
  titlePrefix: UserTitlePrefix,
  extraGrants: PermissionCode[],
  rolePermissions: PermissionCode[] = [],
): PermissionCode[] {
  const base = defaultPermissionsForUser(role, titlePrefix);
  for (const g of extraGrants) base.add(g);
  for (const p of rolePermissions) base.add(p);
  return Array.from(base).sort();
}
