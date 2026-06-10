import { Injectable } from '@nestjs/common';
import { PermissionCode, UserRole, UserTitlePrefix } from '@prisma/client';
import { mergeEffective } from './permission-defaults';

@Injectable()
export class PermissionsService {
  /**
   * Compute the full effective permission set.
   *
   * ADMIN receives every permission. Everyone else gets the union of:
   *  - assigned custom Role permissions (RolePermission)
   *  - per-user grants (UserPermissionGrant)
   *
   * Account type (UserRole) controls UI shell only — not feature permissions.
   */
  effectiveFor(
    role: UserRole,
    titlePrefix: UserTitlePrefix,
    grants: PermissionCode[],
    rolePermissions: PermissionCode[] = [],
  ): PermissionCode[] {
    return mergeEffective(role, titlePrefix, grants, rolePermissions);
  }

  has(effective: PermissionCode[], code: PermissionCode): boolean {
    return effective.includes(code);
  }

  hasAll(effective: PermissionCode[], codes: PermissionCode[]): boolean {
    return codes.every((c) => effective.includes(c));
  }
}
