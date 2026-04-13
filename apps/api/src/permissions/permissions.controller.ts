import { Controller, Get } from '@nestjs/common';
import { PermissionCode } from '@prisma/client';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { ALL_PERMISSION_CODES } from './permission-defaults';

/**
 * Catalog for admin UI when editing extra grants.
 * Labels are English descriptions keyed by enum value.
 */
const LABELS: Record<PermissionCode, string> = {
  [PermissionCode.ROOMS_READ]: 'View rooms and room details',
  [PermissionCode.ROOMS_UPDATE]: 'Edit room notes, out-of-order, maintenance fields',
  [PermissionCode.CHECKLIST_TASK_UPDATE]: 'Update checklist tasks on a room',
  [PermissionCode.CHECKLIST_REOPEN]: 'Reopen a room checklist',
  [PermissionCode.PHOTO_UPLOAD]: 'Upload cleaning photos',
  [PermissionCode.PHOTO_TIMELINE_READ]: 'View room photo timeline',
  [PermissionCode.ASSIGNMENT_READ]: 'View room assignments',
  [PermissionCode.ASSIGNMENT_CREATE]: 'Assign rooms to housekeepers',
  [PermissionCode.ASSIGNMENT_SUGGESTIONS]: 'View auto-assign suggestions',
  [PermissionCode.ASSIGNMENT_RUN_AUTO]: 'Run automatic assignment job',
  [PermissionCode.SERVICE_REQUEST_READ]: 'View service requests',
  [PermissionCode.SERVICE_REQUEST_CREATE]: 'Create service requests',
  [PermissionCode.SERVICE_REQUEST_CLAIM]: 'Claim open service requests',
  [PermissionCode.SERVICE_REQUEST_PATCH]: 'Update request status or priority',
  [PermissionCode.SERVICE_REQUEST_CANCEL]: 'Cancel service requests',
  [PermissionCode.LOST_FOUND_READ]: 'View lost & found',
  [PermissionCode.LOST_FOUND_CREATE]: 'Report lost & found items',
  [PermissionCode.LOST_FOUND_UPDATE]: 'Update lost & found records',
  [PermissionCode.INSPECTION_CREATE]: 'Log room inspections',
  [PermissionCode.ROOM_TYPE_READ]: 'View room types and checklist templates',
  [PermissionCode.ROOM_TYPE_WRITE]: 'Edit room type checklist templates',
  [PermissionCode.FLOOR_PLAN_READ]: 'View floor plans',
  [PermissionCode.FLOOR_PLAN_WRITE]: 'Edit floor plan layouts',
  [PermissionCode.ANALYTICS_READ]: 'View performance / analytics',
  [PermissionCode.TEAM_CHAT_READ]: 'Read team chat',
  [PermissionCode.TEAM_CHAT_POST]: 'Post in team chat',
  [PermissionCode.USERS_READ]: 'List all users (admin)',
  [PermissionCode.USERS_READ_HOUSEKEEPERS]: 'List housekeepers for assignment',
  [PermissionCode.USERS_WRITE]: 'Create or update users',
  [PermissionCode.USERS_DELETE]: 'Delete users',
  [PermissionCode.SETTINGS_READ]: 'View hotel settings',
  [PermissionCode.SETTINGS_WRITE]: 'Edit hotel settings',
};

@Controller('permissions')
export class PermissionsController {
  @Get()
  @RequirePermissions(PermissionCode.USERS_READ)
  catalog() {
    return {
      codes: ALL_PERMISSION_CODES,
      labels: LABELS,
    };
  }
}
