import { ForbiddenException, Inject, Injectable, Optional, forwardRef } from '@nestjs/common';
import { User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RoomsService } from '../rooms/rooms.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { EmmaService } from '../emma/emma.service';

@Injectable()
export class InspectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rooms: RoomsService,
    private readonly realtime: RealtimeGateway,
    @Optional()
    @Inject(forwardRef(() => EmmaService))
    private readonly emma?: EmmaService,
  ) {}

  async create(
    dto: { roomId: string; notes?: string; passed?: boolean },
    user: User,
  ) {
    if (user.role !== UserRole.SUPERVISOR && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }
    const row = await this.prisma.roomInspection.create({
      data: {
        roomId: dto.roomId,
        inspectorUserId: user.id,
        notes: dto.notes,
        passed: dto.passed ?? true,
      },
    });
    const room = await this.rooms.findOne(dto.roomId);
    this.realtime.emitRoomStatus(room);
    this.emma?.scheduleRoomStatusSync('inspections.create');
    return { inspection: row, room };
  }
}
