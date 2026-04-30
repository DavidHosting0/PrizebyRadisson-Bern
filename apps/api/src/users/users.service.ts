import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const userRolesInclude = {
  permissionGrants: { select: { permission: true } },
  roleAssignments: {
    include: {
      role: { select: { id: true, name: true, color: true, position: true } },
    },
  },
} as const;

type UserWithRoles = Prisma.UserGetPayload<{ include: typeof userRolesInclude }>;

/** Map a User loaded with permissionGrants + roleAssignments into the API DTO. */
function toUserDto(u: UserWithRoles) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    phone: u.phone,
    role: u.role,
    titlePrefix: u.titlePrefix,
    isActive: u.isActive,
    createdAt: u.createdAt,
    permissionGrants: u.permissionGrants.map((g) => ({ permission: g.permission })),
    roles: u.roleAssignments
      .map((a) => a.role)
      .sort((a, b) => b.position - a.position || a.name.localeCompare(b.name)),
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  /** Resolve a short-lived GET URL for an avatar key, if any. */
  async resolveAvatarUrl(key: string | null | undefined): Promise<string | null> {
    if (!key) return null;
    try {
      return (await this.s3.presignGet(key)).url;
    } catch {
      return null;
    }
  }

  /** Presign a PUT URL so the user can upload a new avatar directly. */
  async presignOwnAvatar(userId: string, contentType: string | undefined) {
    const mime = (contentType || '').toLowerCase();
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const key = this.s3.buildAvatarKey(userId, ext);
    const { url } = await this.s3.presignPut(key, mime || 'image/jpeg');
    return { uploadUrl: url, key };
  }

  /** Save a new avatar key on the current user's record. Pass null to clear. */
  async setOwnAvatar(userId: string, key: string | null) {
    if (key !== null && typeof key === 'string' && !key.startsWith('avatars/')) {
      throw new BadRequestException('Invalid avatar key');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarS3Key: key },
    });
    const fresh = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, avatarS3Key: true },
    });
    const avatarUrl = await this.resolveAvatarUrl(fresh.avatarS3Key);
    return { id: fresh.id, avatarUrl };
  }

  async listHousekeepers() {
    return this.prisma.user.findMany({
      where: { role: UserRole.HOUSEKEEPER, isActive: true },
      select: { id: true, name: true, email: true, titlePrefix: true },
      orderBy: { name: 'asc' },
    });
  }

  async list() {
    const rows = await this.prisma.user.findMany({
      orderBy: { email: 'asc' },
      include: userRolesInclude,
    });
    return rows.map(toUserDto);
  }

  async create(dto: CreateUserDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (exists) throw new ConflictException('Email already registered');

    if (dto.roleIds?.length) {
      const found = await this.prisma.role.findMany({
        where: { id: { in: dto.roleIds } },
        select: { id: true },
      });
      if (found.length !== new Set(dto.roleIds).size) {
        throw new BadRequestException('One or more roles do not exist');
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const created = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        name: dto.name,
        phone: dto.phone,
        role: dto.role,
        titlePrefix: dto.titlePrefix,
        permissionGrants: dto.permissionGrants?.length
          ? { create: dto.permissionGrants.map((permission) => ({ permission })) }
          : undefined,
        roleAssignments: dto.roleIds?.length
          ? { create: dto.roleIds.map((roleId) => ({ roleId })) }
          : undefined,
      },
      include: userRolesInclude,
    });
    return toUserDto(created);
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException();

    if (dto.role != null && dto.role !== UserRole.ADMIN && user.role === UserRole.ADMIN) {
      const otherAdmins = await this.prisma.user.count({
        where: { role: UserRole.ADMIN, id: { not: id } },
      });
      if (otherAdmins === 0) {
        throw new BadRequestException('Cannot change role of the only admin account');
      }
    }

    if (dto.isActive === false && user.role === UserRole.ADMIN) {
      const otherActiveAdmins = await this.prisma.user.count({
        where: { role: UserRole.ADMIN, isActive: true, id: { not: id } },
      });
      if (otherActiveAdmins === 0) {
        throw new BadRequestException('Cannot disable the last active admin account');
      }
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.titlePrefix !== undefined) data.titlePrefix = dto.titlePrefix;
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    if (dto.roleIds?.length) {
      const found = await this.prisma.role.findMany({
        where: { id: { in: dto.roleIds } },
        select: { id: true },
      });
      if (found.length !== new Set(dto.roleIds).size) {
        throw new BadRequestException('One or more roles do not exist');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.user.update({ where: { id }, data });
      }
      if (dto.permissionGrants !== undefined) {
        await tx.userPermissionGrant.deleteMany({ where: { userId: id } });
        if (dto.permissionGrants.length > 0) {
          await tx.userPermissionGrant.createMany({
            data: dto.permissionGrants.map((permission) => ({ userId: id, permission })),
          });
        }
      }
      if (dto.roleIds !== undefined) {
        await tx.userRoleAssignment.deleteMany({ where: { userId: id } });
        if (dto.roleIds.length > 0) {
          await tx.userRoleAssignment.createMany({
            data: dto.roleIds.map((roleId) => ({ userId: id, roleId })),
            skipDuplicates: true,
          });
        }
      }
    });

    const fresh = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      include: userRolesInclude,
    });
    return toUserDto(fresh);
  }

  async remove(id: string, actorId: string) {
    if (id === actorId) {
      throw new BadRequestException('You cannot delete your own account');
    }
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException();

    if (target.role === UserRole.ADMIN) {
      const adminCount = await this.prisma.user.count({ where: { role: UserRole.ADMIN } });
      if (adminCount <= 1) {
        throw new BadRequestException('Cannot delete the only admin account');
      }
    }

    try {
      await this.prisma.user.delete({ where: { id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
        throw new ConflictException(
          'This user is linked to operational history. Disable the account instead of deleting it.',
        );
      }
      throw e;
    }
  }
}
