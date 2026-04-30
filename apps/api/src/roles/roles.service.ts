import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PermissionCode, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import {
  CreateRoleDto,
  ReorderRolesDto,
  SetRoleMembersDto,
  UpdateRoleDto,
  UpdateRolePositionDto,
} from './dto/role.dto';

const memberSelect = {
  id: true,
  email: true,
  name: true,
  titlePrefix: true,
  role: true,
  isActive: true,
  avatarS3Key: true,
} as const;

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  /** List all roles with their permission codes and member counts. */
  async list() {
    const rows = await this.prisma.role.findMany({
      orderBy: [{ position: 'desc' }, { createdAt: 'asc' }],
      include: {
        permissions: { select: { permission: true } },
        _count: { select: { members: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      position: r.position,
      description: r.description,
      isSystem: r.isSystem,
      memberCount: r._count.members,
      permissions: r.permissions.map((p) => p.permission).sort(),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  /** Detail with permissions + full member list (used when opening the role editor). */
  async get(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: { select: { permission: true } },
        members: {
          select: {
            user: { select: memberSelect },
          },
        },
      },
    });
    if (!role) throw new NotFoundException('Role not found');

    const members = await Promise.all(
      role.members.map(async (m) => ({
        ...m.user,
        avatarS3Key: undefined,
        avatarUrl: await this.resolveAvatar(m.user.avatarS3Key),
      })),
    );
    return {
      id: role.id,
      name: role.name,
      color: role.color,
      position: role.position,
      description: role.description,
      isSystem: role.isSystem,
      permissions: role.permissions.map((p) => p.permission).sort(),
      members: members
        .map(({ avatarS3Key: _drop, ...rest }) => rest) // strip raw key
        .sort((a, b) => a.name.localeCompare(b.name)),
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

  async create(dto: CreateRoleDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Name is required');
    const exists = await this.prisma.role.findUnique({ where: { name } });
    if (exists) throw new ConflictException('A role with that name already exists');

    // New roles go to the top of the list (highest position + 1).
    const top = await this.prisma.role.aggregate({ _max: { position: true } });
    const nextPosition = (top._max.position ?? 0) + 1;

    const created = await this.prisma.role.create({
      data: {
        name,
        color: dto.color ?? '#99aab5',
        description: dto.description?.trim() || null,
        position: nextPosition,
        permissions: dto.permissions?.length
          ? { create: dto.permissions.map((permission) => ({ permission })) }
          : undefined,
      },
    });
    return this.get(created.id);
  }

  async update(id: string, dto: UpdateRoleDto) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');

    if (role.isSystem && dto.isSystem === false) {
      // Allow conversion only for safety scenarios (kept minimal).
    }

    const data: Prisma.RoleUpdateInput = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Name cannot be empty');
      data.name = name;
    }
    if (dto.color !== undefined) data.color = dto.color;
    if (dto.description !== undefined) {
      data.description = dto.description ? dto.description.trim() : null;
    }
    if (dto.isSystem !== undefined) data.isSystem = dto.isSystem;

    try {
      await this.prisma.$transaction(async (tx) => {
        if (Object.keys(data).length > 0) {
          await tx.role.update({ where: { id }, data });
        }
        if (dto.permissions !== undefined) {
          await tx.rolePermission.deleteMany({ where: { roleId: id } });
          if (dto.permissions.length > 0) {
            await tx.rolePermission.createMany({
              data: dto.permissions.map((permission) => ({ roleId: id, permission })),
            });
          }
        }
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('A role with that name already exists');
      }
      throw e;
    }
    return this.get(id);
  }

  async remove(id: string) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new ForbiddenException('System roles cannot be deleted');
    await this.prisma.role.delete({ where: { id } });
    return { ok: true };
  }

  async setPosition(id: string, dto: UpdateRolePositionDto) {
    await this.prisma.role.update({ where: { id }, data: { position: dto.position } });
    return this.get(id);
  }

  /** Bulk reorder. Highest-position role goes first in the array (top of the list). */
  async reorder(dto: ReorderRolesDto) {
    if (!dto.ids.length) return this.list();
    const total = dto.ids.length;
    await this.prisma.$transaction(
      dto.ids.map((roleId, idx) =>
        this.prisma.role.update({
          where: { id: roleId },
          data: { position: total - idx },
        }),
      ),
    );
    return this.list();
  }

  async assignMember(roleId: string, userId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    await this.prisma.userRoleAssignment.upsert({
      where: { userId_roleId: { userId, roleId } },
      create: { userId, roleId },
      update: {},
    });
    return this.get(roleId);
  }

  async removeMember(roleId: string, userId: string) {
    await this.prisma.userRoleAssignment
      .delete({ where: { userId_roleId: { userId, roleId } } })
      .catch((e) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return null;
        throw e;
      });
    return this.get(roleId);
  }

  /** Replace the entire member list of a role in one call. */
  async setMembers(roleId: string, dto: SetRoleMembersDto) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found');

    const desired = new Set(dto.userIds);
    const existing = await this.prisma.userRoleAssignment.findMany({
      where: { roleId },
      select: { userId: true },
    });
    const existingSet = new Set(existing.map((e) => e.userId));

    const toAdd = [...desired].filter((u) => !existingSet.has(u));
    const toRemove = [...existingSet].filter((u) => !desired.has(u));

    await this.prisma.$transaction(async (tx) => {
      if (toRemove.length) {
        await tx.userRoleAssignment.deleteMany({
          where: { roleId, userId: { in: toRemove } },
        });
      }
      if (toAdd.length) {
        // Skip duplicates defensively even though we filtered above.
        await tx.userRoleAssignment.createMany({
          data: toAdd.map((userId) => ({ userId, roleId })),
          skipDuplicates: true,
        });
      }
    });

    return this.get(roleId);
  }

  /** Replace the full set of role memberships for a single user. */
  async setUserRoles(userId: string, roleIds: string[]) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (roleIds.length) {
      const found = await this.prisma.role.findMany({
        where: { id: { in: roleIds } },
        select: { id: true },
      });
      if (found.length !== new Set(roleIds).size) {
        throw new BadRequestException('One or more roles do not exist');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userRoleAssignment.deleteMany({ where: { userId } });
      if (roleIds.length > 0) {
        await tx.userRoleAssignment.createMany({
          data: roleIds.map((roleId) => ({ userId, roleId })),
          skipDuplicates: true,
        });
      }
    });
  }

  /** Convenience: roles the API has already loaded for a user (e.g., in users.list). */
  async listForUser(userId: string) {
    const rows = await this.prisma.userRoleAssignment.findMany({
      where: { userId },
      include: {
        role: {
          select: { id: true, name: true, color: true, position: true },
        },
      },
    });
    return rows
      .map((r) => r.role)
      .sort((a, b) => b.position - a.position || a.name.localeCompare(b.name));
  }

  /**
   * Aggregate every PermissionCode granted to a user via any of their custom roles.
   * Returns a deduplicated list.
   */
  async permissionsForUser(userId: string): Promise<PermissionCode[]> {
    const rows = await this.prisma.userRoleAssignment.findMany({
      where: { userId },
      include: { role: { include: { permissions: { select: { permission: true } } } } },
    });
    const codes = new Set<PermissionCode>();
    for (const r of rows) for (const p of r.role.permissions) codes.add(p.permission);
    return Array.from(codes);
  }

  private async resolveAvatar(key: string | null | undefined): Promise<string | null> {
    if (!key) return null;
    try {
      return (await this.s3.presignGet(key)).url;
    } catch {
      return null;
    }
  }
}
