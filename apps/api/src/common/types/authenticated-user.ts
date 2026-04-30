import type { PermissionCode, Role, User, UserPermissionGrant } from '@prisma/client';

export type AuthenticatedRoleAssignment = {
  role: Pick<Role, 'id' | 'name' | 'color' | 'position'> & {
    permissions: { permission: PermissionCode }[];
  };
};

export type AuthenticatedUser = User & {
  permissionGrants: Pick<UserPermissionGrant, 'permission'>[];
  roleAssignments: AuthenticatedRoleAssignment[];
  effectivePermissions: PermissionCode[];
};
