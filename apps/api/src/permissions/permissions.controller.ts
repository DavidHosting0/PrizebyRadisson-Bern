import { Controller, Get } from '@nestjs/common';
import { PermissionCode } from '@prisma/client';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { ALL_PERMISSION_CODES } from './permission-defaults';

type Entry = { code: PermissionCode; title: string; description: string };

/**
 * Permission catalog grouped into Discord-style sections so the role editor
 * can render labelled groups instead of one long flat list.
 */
const GROUPS: { id: string; label: string; entries: Entry[] }[] = [
  {
    id: 'general',
    label: 'General',
    entries: [
      { code: PermissionCode.SETTINGS_READ, title: 'View settings', description: 'Read hotel settings.' },
      { code: PermissionCode.SETTINGS_WRITE, title: 'Manage settings', description: 'Edit hotel settings.' },
      { code: PermissionCode.ANALYTICS_READ, title: 'View performance', description: 'Open analytics dashboards.' },
    ],
  },
  {
    id: 'users',
    label: 'Members',
    entries: [
      { code: PermissionCode.USERS_READ, title: 'View members', description: 'List every user account.' },
      { code: PermissionCode.USERS_READ_HOUSEKEEPERS, title: 'View housekeepers', description: 'List housekeepers for assignment.' },
      { code: PermissionCode.USERS_WRITE, title: 'Manage members', description: 'Create or edit user accounts.' },
      { code: PermissionCode.USERS_DELETE, title: 'Delete members', description: 'Permanently remove user accounts.' },
    ],
  },
  {
    id: 'rooms',
    label: 'Rooms & layout',
    entries: [
      { code: PermissionCode.ROOMS_READ, title: 'View rooms', description: 'Open the rooms list and details.' },
      { code: PermissionCode.ROOMS_UPDATE, title: 'Edit rooms', description: 'Notes, out-of-order, maintenance fields.' },
      { code: PermissionCode.ROOM_TYPE_READ, title: 'View room types', description: 'See checklist templates and types.' },
      { code: PermissionCode.ROOM_TYPE_WRITE, title: 'Manage room types', description: 'Edit checklist templates.' },
      { code: PermissionCode.FLOOR_PLAN_READ, title: 'View floor plans', description: 'Open floor plan layouts.' },
      { code: PermissionCode.FLOOR_PLAN_WRITE, title: 'Edit floor plans', description: 'Rearrange floor layouts.' },
    ],
  },
  {
    id: 'cleaning',
    label: 'Cleaning & assignments',
    entries: [
      { code: PermissionCode.CHECKLIST_TASK_UPDATE, title: 'Update checklist tasks', description: 'Tick or untick room tasks.' },
      { code: PermissionCode.CHECKLIST_REOPEN, title: 'Reopen checklists', description: 'Send a finished checklist back.' },
      { code: PermissionCode.PHOTO_UPLOAD, title: 'Upload cleaning photos', description: 'Add room photos.' },
      { code: PermissionCode.PHOTO_TIMELINE_READ, title: 'View photo timeline', description: 'See historical room photos.' },
      { code: PermissionCode.ASSIGNMENT_READ, title: 'View assignments', description: 'See who is cleaning what.' },
      { code: PermissionCode.ASSIGNMENT_CREATE, title: 'Assign rooms', description: 'Assign rooms to housekeepers.' },
      { code: PermissionCode.ASSIGNMENT_SUGGESTIONS, title: 'See auto-assign suggestions', description: 'View suggested assignments.' },
      { code: PermissionCode.ASSIGNMENT_RUN_AUTO, title: 'Run auto-assign', description: 'Trigger the auto-assign job.' },
      { code: PermissionCode.INSPECTION_CREATE, title: 'Log inspections', description: 'Record supervisor inspections.' },
    ],
  },
  {
    id: 'service-requests',
    label: 'Service requests',
    entries: [
      { code: PermissionCode.SERVICE_REQUEST_READ, title: 'View requests', description: 'Open the service request list.' },
      { code: PermissionCode.SERVICE_REQUEST_CREATE, title: 'Create requests', description: 'File new service requests.' },
      { code: PermissionCode.SERVICE_REQUEST_CLAIM, title: 'Claim requests', description: 'Take ownership of an open request.' },
      { code: PermissionCode.SERVICE_REQUEST_PATCH, title: 'Update requests', description: 'Change status or priority.' },
      { code: PermissionCode.SERVICE_REQUEST_CANCEL, title: 'Cancel requests', description: 'Close requests as cancelled.' },
    ],
  },
  {
    id: 'lost-found',
    label: 'Lost & found',
    entries: [
      { code: PermissionCode.LOST_FOUND_READ, title: 'View lost & found', description: 'See storage and unsorted items.' },
      { code: PermissionCode.LOST_FOUND_CREATE, title: 'Report items', description: 'Add new lost & found items.' },
      { code: PermissionCode.LOST_FOUND_UPDATE, title: 'Manage items', description: 'Update storage / status / claim.' },
    ],
  },
  {
    id: 'damage',
    label: 'Damage reports',
    entries: [
      { code: PermissionCode.DAMAGE_REPORT_CREATE, title: 'Report damage', description: 'File new damage reports.' },
      { code: PermissionCode.DAMAGE_REPORT_READ, title: 'View damage reports', description: 'Open the damage list.' },
      { code: PermissionCode.DAMAGE_REPORT_UPDATE, title: 'Manage damage reports', description: 'Acknowledge or resolve.' },
    ],
  },
  {
    id: 'team-chat',
    label: 'Team chat',
    entries: [
      { code: PermissionCode.TEAM_CHAT_READ, title: 'Read team chat', description: 'See team chat messages.' },
      { code: PermissionCode.TEAM_CHAT_POST, title: 'Send messages', description: 'Post messages and reactions.' },
    ],
  },
];

const LABELS: Record<PermissionCode, string> = Object.fromEntries(
  GROUPS.flatMap((g) => g.entries.map((e) => [e.code, e.title])),
) as Record<PermissionCode, string>;

const DESCRIPTIONS: Record<PermissionCode, string> = Object.fromEntries(
  GROUPS.flatMap((g) => g.entries.map((e) => [e.code, e.description])),
) as Record<PermissionCode, string>;

@Controller('permissions')
export class PermissionsController {
  @Get()
  @RequirePermissions(PermissionCode.USERS_READ)
  catalog() {
    return {
      codes: ALL_PERMISSION_CODES,
      labels: LABELS,
      descriptions: DESCRIPTIONS,
      groups: GROUPS.map((g) => ({
        id: g.id,
        label: g.label,
        codes: g.entries.map((e) => e.code),
      })),
    };
  }
}
