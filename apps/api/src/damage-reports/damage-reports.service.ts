import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignmentStatus,
  Prisma,
  RoomDamageReportStatus,
  User,
  UserRole,
} from '@prisma/client';
import { userPublicSelect } from '../common/user-public.select';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { CreateDamageReportDto } from './dto/create-damage-report.dto';
import { UpdateDamageReportDto } from './dto/update-damage-report.dto';

@Injectable()
export class DamageReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  private async assertHousekeeperRoom(user: User, roomId: string) {
    if (user.role === UserRole.SUPERVISOR || user.role === UserRole.ADMIN) return;
    if (user.role !== UserRole.HOUSEKEEPER) throw new ForbiddenException();
    const a = await this.prisma.roomAssignment.findFirst({
      where: {
        roomId,
        housekeeperUserId: user.id,
        status: AssignmentStatus.ACTIVE,
      },
    });
    if (!a) throw new ForbiddenException('Not assigned to this room');
  }

  async presign(user: User, roomId: string, contentType: string) {
    if (user.role === UserRole.HOUSEKEEPER) {
      await this.assertHousekeeperRoom(user, roomId);
    }
    const mime = contentType || 'image/jpeg';
    const ext = mime.includes('png') ? 'png' : 'jpg';
    const key = this.s3.buildDamageReportKey(ext);
    const { url } = await this.s3.presignPut(key, mime);
    return { uploadUrl: url, key };
  }

  async list(query: { status?: RoomDamageReportStatus; q?: string }) {
    const where: Prisma.RoomDamageReportWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.q) {
      where.description = { contains: query.q, mode: 'insensitive' };
    }
    const rows = await this.prisma.roomDamageReport.findMany({
      where,
      include: {
        room: { select: { id: true, roomNumber: true } },
        reportedBy: { select: userPublicSelect },
      },
      orderBy: { reportedAt: 'desc' },
    });
    return Promise.all(
      rows.map(async (r) => ({
        ...r,
        photoUrl: (await this.s3.presignGet(r.photoS3Key)).url,
      })),
    );
  }

  async create(dto: CreateDamageReportDto, user: User) {
    if (
      user.role !== UserRole.HOUSEKEEPER &&
      user.role !== UserRole.SUPERVISOR &&
      user.role !== UserRole.ADMIN
    ) {
      throw new ForbiddenException();
    }
    if (user.role === UserRole.HOUSEKEEPER) {
      await this.assertHousekeeperRoom(user, dto.roomId);
    }
    return this.prisma.roomDamageReport.create({
      data: {
        roomId: dto.roomId,
        damageType: dto.damageType,
        description: dto.description.trim(),
        photoS3Key: dto.photoS3Key,
        reportedByUserId: user.id,
      },
      include: {
        room: { select: { id: true, roomNumber: true } },
      },
    });
  }

  async update(id: string, dto: UpdateDamageReportDto) {
    const row = await this.prisma.roomDamageReport.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    if (dto.status === undefined) {
      throw new BadRequestException('No fields to update');
    }
    return this.prisma.roomDamageReport.update({
      where: { id },
      data: { status: dto.status },
      include: {
        room: { select: { id: true, roomNumber: true } },
        reportedBy: { select: userPublicSelect },
      },
    });
  }
}
