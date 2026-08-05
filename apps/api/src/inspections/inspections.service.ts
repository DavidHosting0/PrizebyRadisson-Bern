import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { PhotoUploadStatus, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RoomsService } from '../rooms/rooms.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { EmmaService } from '../emma/emma.service';
import { InspectionQueueService } from '../assignments/inspection-queue.service';

@Injectable()
export class InspectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rooms: RoomsService,
    private readonly realtime: RealtimeGateway,
    private readonly inspectionQueue: InspectionQueueService,
    @Optional()
    @Inject(forwardRef(() => EmmaService))
    private readonly emma?: EmmaService,
  ) {}

  async create(
    dto: { roomId: string; notes?: string; passed?: boolean; photoId?: string },
    user: User,
  ) {
    await this.inspectionQueue.assertCanInspectRoom(user, dto.roomId);

    const passed = dto.passed ?? true;
    const photoId = dto.photoId?.trim() || null;
    if (!photoId) {
      throw new BadRequestException('Inspection photo is required');
    }

    const photo = await this.prisma.roomPhoto.findFirst({
      where: {
        id: photoId,
        roomId: dto.roomId,
        uploadedByUserId: user.id,
        status: PhotoUploadStatus.READY,
      },
    });
    if (!photo) {
      throw new BadRequestException('Invalid or missing inspection photo');
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const inspection = await tx.roomInspection.create({
        data: {
          roomId: dto.roomId,
          inspectorUserId: user.id,
          notes: dto.notes,
          passed,
        },
      });
      await tx.roomPhoto.update({
        where: { id: photo.id },
        data: { roomInspectionId: inspection.id },
      });
      return inspection;
    });

    if (row.passed) {
      await this.emma?.pushRoomStatus(dto.roomId, 'INSPECTED', {
        actionAt: row.inspectedAt,
        source: 'inspections.create',
      });
      await this.inspectionQueue.completeTaskForRoom(dto.roomId, row.id);
      await this.prisma.room.update({
        where: { id: dto.roomId },
        data: { departureStickyOn: null },
      });
    }

    const room = await this.rooms.findOne(dto.roomId);
    this.realtime.emitRoomStatus(room);
    return { inspection: row, room };
  }
}
