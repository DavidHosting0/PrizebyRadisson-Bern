import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AssignmentStatus, PhotoUploadStatus, User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { RoomsService } from '../rooms/rooms.service';

@Injectable()
export class PhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly realtime: RealtimeGateway,
    private readonly rooms: RoomsService,
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

  async presign(roomId: string, user: User, contentType: string) {
    await this.rooms.ensureChecklistState(roomId);
    await this.assertHousekeeperRoom(user, roomId);
    const mime = contentType || 'image/jpeg';
    const ext = mime.includes('png') ? 'png' : 'jpg';
    const key = this.s3.buildRoomPhotoKey(roomId, ext);
    const { url } = await this.s3.presignPut(key, mime);
    const photo = await this.prisma.roomPhoto.create({
      data: {
        roomId,
        uploadedByUserId: user.id,
        s3Key: key,
        mime,
        status: PhotoUploadStatus.PENDING,
      },
    });
    return { uploadUrl: url, photoId: photo.id, key };
  }

  async completePhoto(
    roomId: string,
    user: User,
    dto: { photoId: string; mime: string; bytes: number; cleaningSessionId?: string },
  ) {
    const { photoId } = dto;
    await this.assertHousekeeperRoom(user, roomId);
    const photo = await this.prisma.roomPhoto.findFirst({
      where: { id: photoId, roomId, uploadedByUserId: user.id },
    });
    if (!photo) throw new NotFoundException('Photo not found');
    await this.prisma.roomPhoto.update({
      where: { id: photoId },
      data: {
        status: PhotoUploadStatus.READY,
        mime: dto.mime,
        bytes: dto.bytes,
        takenAt: new Date(),
        cleaningSessionId: dto.cleaningSessionId,
      },
    });
    const timeline = await this.prisma.roomPhoto.findMany({
      where: { roomId, status: PhotoUploadStatus.READY },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const room = await this.rooms.findOne(roomId);
    this.realtime.emitRoomStatus(room);
    return { ok: true, timeline };
  }

  async timeline(roomId: string) {
    const rows = await this.prisma.roomPhoto.findMany({
      where: { roomId, status: PhotoUploadStatus.READY },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { uploadedBy: { select: { id: true, name: true } } },
    });
    const withUrls = await Promise.all(
      rows.map(async (p) => {
        let url: string | null = null;
        try {
          const signed = await this.s3.presignGet(p.s3Key);
          url = signed.url;
        } catch {
          url = null;
        }
        return {
          id: p.id,
          mime: p.mime,
          bytes: p.bytes,
          takenAt: p.takenAt,
          createdAt: p.createdAt,
          cleaningSessionId: p.cleaningSessionId,
          uploadedBy: p.uploadedBy,
          url,
        };
      }),
    );
    return withUrls;
  }
}
