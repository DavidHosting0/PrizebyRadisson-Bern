import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AssignmentStatus, LostFoundStatus, Prisma, User, UserRole } from '@prisma/client';
import { userPublicSelect } from '../common/user-public.select';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { CreateLostFoundDto } from './dto/create-lost-found.dto';
import { UpdateLostFoundDto } from './dto/update-lost-found.dto';

@Injectable()
export class LostFoundService {
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

  async presign(user: User, roomId: string | undefined, contentType: string) {
    if (user.role === UserRole.HOUSEKEEPER) {
      if (!roomId) throw new BadRequestException('roomId is required');
      await this.assertHousekeeperRoom(user, roomId);
    }
    const mime = contentType || 'image/jpeg';
    const ext = mime.includes('png') ? 'png' : 'jpg';
    const key = this.s3.buildLostFoundKey(ext);
    const { url } = await this.s3.presignPut(key, mime);
    return { uploadUrl: url, key };
  }

  async list(query: { status?: LostFoundStatus; q?: string }) {
    const where: Prisma.LostFoundItemWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.q) {
      where.description = { contains: query.q, mode: 'insensitive' };
    }
    return this.prisma.lostFoundItem.findMany({
      where,
      include: {
        room: { select: { id: true, roomNumber: true } },
        reportedBy: { select: userPublicSelect },
      },
      orderBy: { foundAt: 'desc' },
    });
  }

  async create(dto: CreateLostFoundDto, user: User) {
    if (
      user.role !== UserRole.HOUSEKEEPER &&
      user.role !== UserRole.SUPERVISOR &&
      user.role !== UserRole.ADMIN
    ) {
      throw new ForbiddenException();
    }
    if (user.role === UserRole.HOUSEKEEPER && dto.roomId) {
      await this.assertHousekeeperRoom(user, dto.roomId);
    }
    return this.prisma.lostFoundItem.create({
      data: {
        roomId: dto.roomId ?? undefined,
        description: dto.description,
        photoS3Key: dto.photoS3Key,
        status: dto.status ?? LostFoundStatus.FOUND,
        reportedByUserId: user.id,
      },
      include: {
        room: { select: { id: true, roomNumber: true } },
      },
    });
  }

  async update(id: string, dto: UpdateLostFoundDto, user: User) {
    if (user.role !== UserRole.RECEPTION && user.role !== UserRole.SUPERVISOR && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }
    const row = await this.prisma.lostFoundItem.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    return this.prisma.lostFoundItem.update({
      where: { id },
      data: {
        status: dto.status,
        storedLocation: dto.storedLocation,
        claimedByGuestInfo: dto.claimedByGuestInfo === undefined ? undefined : (dto.claimedByGuestInfo as object),
      },
      include: {
        room: { select: { id: true, roomNumber: true } },
      },
    });
  }
}
