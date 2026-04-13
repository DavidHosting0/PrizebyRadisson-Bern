import type { PermissionCode, User, UserPermissionGrant } from '@prisma/client';

export type AuthenticatedUser = User & {
  permissionGrants: Pick<UserPermissionGrant, 'permission'>[];
  effectivePermissions: PermissionCode[];
};
