import {
  PermissionCode,
  PrismaClient,
  UserRole,
  UserTitlePrefix,
} from '@prisma/client';
import {
  buildArrivalCheckSet,
  buildHousekeeperDeputySet,
  buildHousekeeperHtcSet,
  buildHousekeeperSet,
  buildReceptionSet,
  buildSupervisorSet,
  buildTechnicianSet,
} from './permission-defaults';

export const SYSTEM_ROLE_NAMES = {
  HOUSEKEEPER: 'Housekeeper',
  HOUSEKEEPER_DEPUTY: 'Housekeeper — Deputy',
  HOUSEKEEPER_HTC: 'Housekeeper — HTC',
  SUPERVISOR: 'Supervisor',
  RECEPTION_FULL: 'Reception — Full',
  TECHNICIAN: 'Technician',
  ARRIVAL_CHECK: 'Arrival Check',
} as const;

type SystemRoleDef = {
  name: string;
  color: string;
  position: number;
  description: string;
  permissions: Set<PermissionCode>;
};

const SYSTEM_ROLES: SystemRoleDef[] = [
  {
    name: SYSTEM_ROLE_NAMES.RECEPTION_FULL,
    color: '#5865f2',
    position: 100,
    description: 'Full reception desk access: reservations, requests, chat, and more.',
    permissions: buildReceptionSet(),
  },
  {
    name: SYSTEM_ROLE_NAMES.SUPERVISOR,
    color: '#e67e22',
    position: 90,
    description: 'Supervisor operations: assignments, inspections, analytics.',
    permissions: buildSupervisorSet(),
  },
  {
    name: SYSTEM_ROLE_NAMES.HOUSEKEEPER_HTC,
    color: '#2ecc71',
    position: 80,
    description: 'Head team captain housekeeping permissions.',
    permissions: buildHousekeeperHtcSet(),
  },
  {
    name: SYSTEM_ROLE_NAMES.HOUSEKEEPER_DEPUTY,
    color: '#1abc9c',
    position: 70,
    description: 'Deputy captain (HTC in training) housekeeping permissions.',
    permissions: buildHousekeeperDeputySet(),
  },
  {
    name: SYSTEM_ROLE_NAMES.HOUSEKEEPER,
    color: '#95a5a6',
    position: 60,
    description: 'Standard housekeeper mobile app permissions.',
    permissions: buildHousekeeperSet(),
  },
  {
    name: SYSTEM_ROLE_NAMES.TECHNICIAN,
    color: '#3498db',
    position: 50,
    description: 'Technician maintenance app permissions.',
    permissions: buildTechnicianSet(),
  },
  {
    name: SYSTEM_ROLE_NAMES.ARRIVAL_CHECK,
    color: '#9b59b6',
    position: 40,
    description: 'Arrival Check workflow only.',
    permissions: buildArrivalCheckSet(),
  },
];

function defaultSystemRoleName(
  role: UserRole,
  titlePrefix: UserTitlePrefix,
): string | null {
  if (role === UserRole.ADMIN) return null;
  if (role === UserRole.RECEPTION) return SYSTEM_ROLE_NAMES.RECEPTION_FULL;
  if (role === UserRole.TECHNICIAN) return SYSTEM_ROLE_NAMES.TECHNICIAN;
  if (role === UserRole.SUPERVISOR) return SYSTEM_ROLE_NAMES.SUPERVISOR;
  if (role === UserRole.HOUSEKEEPER) {
    switch (titlePrefix) {
      case UserTitlePrefix.HTC:
      case UserTitlePrefix.HOUSEKEEPING_SUPERVISOR:
      case UserTitlePrefix.ADMIN:
        return SYSTEM_ROLE_NAMES.HOUSEKEEPER_HTC;
      case UserTitlePrefix.HTC_IN_TRAINING:
        return SYSTEM_ROLE_NAMES.HOUSEKEEPER_DEPUTY;
      default:
        return SYSTEM_ROLE_NAMES.HOUSEKEEPER;
    }
  }
  return null;
}

/** Idempotently upsert built-in system roles and their permission sets. */
export async function ensureSystemRoles(prisma: PrismaClient): Promise<void> {
  const roleIdByName = new Map<string, string>();

  for (const def of SYSTEM_ROLES) {
    const role = await prisma.role.upsert({
      where: { name: def.name },
      create: {
        name: def.name,
        color: def.color,
        position: def.position,
        description: def.description,
        isSystem: true,
      },
      update: {
        color: def.color,
        position: def.position,
        description: def.description,
        isSystem: true,
      },
    });
    roleIdByName.set(def.name, role.id);

    const codes = Array.from(def.permissions);
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (codes.length > 0) {
      await prisma.rolePermission.createMany({
        data: codes.map((permission) => ({ roleId: role.id, permission })),
        skipDuplicates: true,
      });
    }
  }

  const users = await prisma.user.findMany({
    where: { role: { not: UserRole.ADMIN } },
    include: {
      permissionGrants: { select: { permission: true } },
      roleAssignments: {
        include: { role: { include: { permissions: { select: { permission: true } } } } },
      },
    },
  });

  for (const user of users) {
    const rolePerms = new Set(
      user.roleAssignments.flatMap((a) => a.role.permissions.map((p) => p.permission)),
    );
    const grants = user.permissionGrants.map((g) => g.permission);
    const hasEffective = rolePerms.size > 0 || grants.length > 0;

    if (hasEffective) continue;

    const systemName = defaultSystemRoleName(user.role, user.titlePrefix);
    if (!systemName) continue;

    const roleId = roleIdByName.get(systemName);
    if (!roleId) continue;

    await prisma.userRoleAssignment.upsert({
      where: { userId_roleId: { userId: user.id, roleId } },
      create: { userId: user.id, roleId },
      update: {},
    });
  }
}

/** Resolve the default system role id for a new non-admin user. */
export async function defaultSystemRoleId(
  prisma: PrismaClient,
  role: UserRole,
  titlePrefix: UserTitlePrefix,
): Promise<string | null> {
  const name = defaultSystemRoleName(role, titlePrefix);
  if (!name) return null;
  const row = await prisma.role.findUnique({ where: { name }, select: { id: true } });
  return row?.id ?? null;
}
