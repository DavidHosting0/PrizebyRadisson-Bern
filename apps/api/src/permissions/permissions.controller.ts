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
      {
        code: PermissionCode.ACTIVITY_LOG_READ,
        title: 'View activity log',
        description: 'Browse the audit trail of actions across the app.',
      },
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
      {
        code: PermissionCode.ROOM_MANAGEMENT_READ,
        title: 'Room management',
        description: 'Analyse room history: guests, cleaning, photos, damages, lost & found.',
      },
    ],
  },
  {
    id: 'cleaning',
    label: 'Cleaning & assignments',
    entries: [
      { code: PermissionCode.CHECKLIST_TASK_UPDATE, title: 'Update checklist tasks', description: 'Tick or untick room tasks.' },
      { code: PermissionCode.CHECKLIST_REOPEN, title: 'Reopen checklists', description: 'Send a finished checklist back.' },
      { code: PermissionCode.PHOTO_UPLOAD, title: 'Upload inspection photos', description: 'Add room photos during supervisor inspections.' },
      { code: PermissionCode.PHOTO_TIMELINE_READ, title: 'View photo timeline', description: 'See historical room photos.' },
      { code: PermissionCode.ASSIGNMENT_READ, title: 'View assignments', description: 'See who is cleaning what.' },
      { code: PermissionCode.ASSIGNMENT_CREATE, title: 'Assign rooms', description: 'Assign rooms to housekeepers.' },
      { code: PermissionCode.ASSIGNMENT_SUGGESTIONS, title: 'See auto-assign suggestions', description: 'View suggested assignments.' },
      { code: PermissionCode.ASSIGNMENT_RUN_AUTO, title: 'Run auto-assign', description: 'Trigger the auto-assign job.' },
      { code: PermissionCode.PUBLIC_AREA_MANAGE, title: 'Manage public areas', description: 'Configure public-area cleaning frequencies.' },
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
      {
        code: PermissionCode.TEAM_CHAT_DELETE,
        title: 'Delete messages',
        description: 'Delete team chat messages (reception moderation).',
      },
    ],
  },
  {
    id: 'schedule',
    label: 'Schedule',
    entries: [
      { code: PermissionCode.SHIFT_READ, title: 'View shift plan', description: 'Open the daily/weekly roster.' },
      { code: PermissionCode.SHIFT_MANAGE, title: 'Manage shift integration', description: 'Configure Mirus sync, map users, trigger manual sync.' },
    ],
  },
  {
    id: 'monitor-map',
    label: 'Monitor Map',
    entries: [
      {
        code: PermissionCode.MONITOR_MAP_READ,
        title: 'View Monitor Map',
        description: 'Open the Bern live map (news, police, aviation).',
      },
    ],
  },
  {
    id: 'arrival-check',
    label: 'Arrival Check',
    entries: [
      {
        code: PermissionCode.ARRIVAL_CHECK,
        title: 'Run Arrival Check',
        description: 'Open the Arrival Check workflow and start daily arrival runs.',
      },
    ],
  },
  {
    id: 'guides',
    label: 'Guides',
    entries: [
      {
        code: PermissionCode.GUIDE_READ,
        title: 'View guides',
        description: 'Open reception guides and procedures.',
      },
      {
        code: PermissionCode.GUIDE_WRITE,
        title: 'Manage guides',
        description: 'Create, edit, publish, and delete guides.',
      },
    ],
  },
  {
    id: 'shift-handover',
    label: 'Shift handover / To-Do',
    entries: [
      {
        code: PermissionCode.SHIFT_HANDOVER_READ,
        title: 'Use To-Do checklist',
        description: 'Open the shift To-Do checklist, tick tasks, and hand over to the next shift.',
      },
      {
        code: PermissionCode.SHIFT_HANDOVER_WRITE,
        title: 'Manage To-Do templates',
        description: 'Edit checklist tasks for night, morning, and late reception shifts.',
      },
      {
        code: PermissionCode.SHIFT_NOTES_READ,
        title: 'Read shift notes',
        description: 'View reception shift handover notes.',
      },
      {
        code: PermissionCode.SHIFT_NOTES_WRITE,
        title: 'Write shift notes',
        description: 'Create and edit reception shift handover notes.',
      },
    ],
  },
  {
    id: 'complaints-loans',
    label: 'Complaints & loans',
    entries: [
      {
        code: PermissionCode.COMPLAINTS_READ,
        title: 'View complaints',
        description: 'Open the guest complaints list and heatmap.',
      },
      {
        code: PermissionCode.COMPLAINTS_WRITE,
        title: 'Manage complaints',
        description: 'Create and resolve guest complaints.',
      },
      {
        code: PermissionCode.LOANS_READ,
        title: 'View room loans',
        description: 'See currently loaned items and deposit amounts.',
      },
      {
        code: PermissionCode.LOANS_WRITE,
        title: 'Manage room loans',
        description: 'Loan items to rooms and mark them returned.',
      },
      {
        code: PermissionCode.LOANS_CATALOG_WRITE,
        title: 'Manage loan catalog',
        description: 'Edit loanable items and deposit amounts.',
      },
    ],
  },
  {
    id: 'reservations',
    label: 'Reservations',
    entries: [
      {
        code: PermissionCode.RESERVATIONS_READ,
        title: 'View reservations',
        description: 'Open arrivals, in-house guests, and reservation lists.',
      },
      {
        code: PermissionCode.RESERVATIONS_SYNC,
        title: 'Sync reservations',
        description: 'Trigger EMMA reservation and room-status sync.',
      },
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
        labelKey: g.id,
        codes: g.entries.map((e) => e.code),
      })),
    };
  }
}
