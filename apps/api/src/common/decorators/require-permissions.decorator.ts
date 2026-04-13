import { SetMetadata } from '@nestjs/common';
import { PermissionCode } from '@prisma/client';

export const PERMISSIONS_KEY = 'required_permissions';

/** Caller must have every listed permission. */
export const RequirePermissions = (...permissions: PermissionCode[]) => SetMetadata(PERMISSIONS_KEY, permissions);
