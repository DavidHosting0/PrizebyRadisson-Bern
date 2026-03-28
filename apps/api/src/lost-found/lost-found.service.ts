import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LostFoundStatus, Prisma, User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLostFoundDto } from './dto/create-lost-found.dto';
import { UpdateLostFoundDto } from './dto/update-lost-found.dto';

@Injectable()
export class LostFoundService {
  constructor(private readonly prisma: PrismaService) {}

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
        reportedBy: { select: { id: true, name: true } },
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
