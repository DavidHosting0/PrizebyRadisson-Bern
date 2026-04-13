import { Injectable } from '@nestjs/common';
import { PermissionCode, UserRole, UserTitlePrefix } from '@prisma/client';
import { mergeEffective } from './permission-defaults';

@Injectable()
export class PermissionsService {
  effectiveFor(role: UserRole, titlePrefix: UserTitlePrefix, grants: PermissionCode[]): PermissionCode[] {
    return mergeEffective(role, titlePrefix, grants);
  }

  has(effective: PermissionCode[], code: PermissionCode): boolean {
    return effective.includes(code);
  }

  hasAll(effective: PermissionCode[], codes: PermissionCode[]): boolean {
    return codes.every((c) => effective.includes(c));
  }
}
