import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  forwardRef,
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
import { EmmaService } from '../emma/emma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class DamageReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly realtime: RealtimeGateway,
    @Optional()
    @Inject(forwardRef(() => EmmaService))
    private readonly emma?: EmmaService,
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

  async list(query: { status?: string; q?: string; roomId?: string }) {
    const where: Prisma.RoomDamageReportWhereInput = {};
    if (query.status === 'OPEN') {
      where.status = {
        in: [RoomDamageReportStatus.REPORTED, RoomDamageReportStatus.ACKNOWLEDGED],
      };
    } else if (query.status) {
      if (!Object.values(RoomDamageReportStatus).includes(query.status as RoomDamageReportStatus)) {
        throw new BadRequestException('Invalid status');
      }
      where.status = query.status as RoomDamageReportStatus;
    }
    if (query.roomId) where.roomId = query.roomId;
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
    const row = await this.prisma.roomDamageReport.create({
      data: {
        roomId: dto.roomId,
        damageType: dto.damageType,
        description: dto.description.trim(),
        photoS3Key: dto.photoS3Key,
        reportedByUserId: user.id,
      },
      include: {
        room: { select: { id: true, roomNumber: true } },
        reportedBy: { select: userPublicSelect },
      },
    });
    this.realtime.emitDamageReport('damage_report.created', row);
    this.emma?.scheduleRoomStatusSync('damageReports.create');
    return row;
  }

  async update(id: string, dto: UpdateDamageReportDto) {
    const row = await this.prisma.roomDamageReport.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    if (dto.status === undefined) {
      throw new BadRequestException('No fields to update');
    }
    const updated = await this.prisma.roomDamageReport.update({
      where: { id },
      data: { status: dto.status },
      include: {
        room: { select: { id: true, roomNumber: true } },
        reportedBy: { select: userPublicSelect },
      },
    });
    this.realtime.emitDamageReport('damage_report.updated', updated);
    this.emma?.scheduleRoomStatusSync('damageReports.update');
    return updated;
  }
}
