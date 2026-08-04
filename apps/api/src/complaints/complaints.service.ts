import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GuestComplaintCategory,
  GuestComplaintStatus,
  Prisma,
} from '@prisma/client';
import type {
  ComplaintHeatmapEntryDto,
  CreateGuestComplaintPayload,
  GuestComplaintDto,
  UpdateGuestComplaintPayload,
} from '@housekeeping/shared';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';

function mapComplaint(row: {
  id: string;
  category: GuestComplaintCategory;
  description: string;
  status: GuestComplaintStatus;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  room: { id: string; roomNumber: string } | null;
  createdBy: { id: string; name: string };
  resolvedBy: { id: string; name: string } | null;
}): GuestComplaintDto {
  return {
    id: row.id,
    category: row.category,
    room: row.room,
    description: row.description,
    status: row.status,
    createdBy: row.createdBy,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolvedBy: row.resolvedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class ComplaintsService {
  constructor(private readonly prisma: PrismaService) {}

  private include = {
    room: { select: { id: true, roomNumber: true } },
    createdBy: { select: { id: true, name: true } },
    resolvedBy: { select: { id: true, name: true } },
  } as const;

  async list(params: { category?: string; status?: string; roomId?: string }) {
    const where: Prisma.GuestComplaintWhereInput = {};
    if (params.category === 'ROOM' || params.category === 'OTHER') {
      where.category = params.category;
    }
    if (params.status === 'OPEN' || params.status === 'RESOLVED') {
      where.status = params.status;
    }
    if (params.roomId) where.roomId = params.roomId;
    const rows = await this.prisma.guestComplaint.findMany({
      where,
      include: this.include,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map(mapComplaint);
  }

  async create(dto: CreateGuestComplaintPayload, user: AuthenticatedUser) {
    if (!dto.description?.trim()) throw new BadRequestException('description required');
    if (dto.category === 'ROOM') {
      if (!dto.roomId) throw new BadRequestException('roomId required for ROOM complaints');
      const room = await this.prisma.room.findUnique({ where: { id: dto.roomId } });
      if (!room) throw new NotFoundException('Room not found');
    }
    const row = await this.prisma.guestComplaint.create({
      data: {
        category: dto.category,
        roomId: dto.category === 'ROOM' ? dto.roomId! : null,
        description: dto.description.trim(),
        createdByUserId: user.id,
      },
      include: this.include,
    });
    return mapComplaint(row);
  }

  async update(id: string, dto: UpdateGuestComplaintPayload, user: AuthenticatedUser) {
    const existing = await this.prisma.guestComplaint.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Complaint not found');
    const data: Prisma.GuestComplaintUpdateInput = {};
    if (dto.description !== undefined) data.description = dto.description.trim();
    if (dto.status === 'RESOLVED' && existing.status !== 'RESOLVED') {
      data.status = GuestComplaintStatus.RESOLVED;
      data.resolvedAt = new Date();
      data.resolvedBy = { connect: { id: user.id } };
    } else if (dto.status === 'OPEN' && existing.status !== 'OPEN') {
      data.status = GuestComplaintStatus.OPEN;
      data.resolvedAt = null;
      data.resolvedBy = { disconnect: true };
    }
    const row = await this.prisma.guestComplaint.update({
      where: { id },
      data,
      include: this.include,
    });
    return mapComplaint(row);
  }

  async heatmap(): Promise<ComplaintHeatmapEntryDto[]> {
    const grouped = await this.prisma.guestComplaint.groupBy({
      by: ['roomId'],
      where: { category: GuestComplaintCategory.ROOM, roomId: { not: null } },
      _count: { _all: true },
    });
    const roomIds = grouped.map((g) => g.roomId!).filter(Boolean);
    const rooms = await this.prisma.room.findMany({
      where: { id: { in: roomIds } },
      select: { id: true, roomNumber: true },
    });
    const byId = new Map(rooms.map((r) => [r.id, r.roomNumber]));
    return grouped
      .filter((g) => g.roomId)
      .map((g) => ({
        roomId: g.roomId!,
        roomNumber: byId.get(g.roomId!) ?? '?',
        count: g._count._all,
      }))
      .sort((a, b) => b.count - a.count);
  }
}
