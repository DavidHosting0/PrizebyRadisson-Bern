import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { PhotoUploadStatus, Prisma, User, UserRole } from '@prisma/client';
import { userPublicSelect } from '../common/user-public.select';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { RoomsService } from '../rooms/rooms.service';
import { EmmaService } from '../emma/emma.service';

@Injectable()
export class PhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly realtime: RealtimeGateway,
    private readonly rooms: RoomsService,
    @Optional()
    @Inject(forwardRef(() => EmmaService))
    private readonly emma?: EmmaService,
  ) {}

  private assertInspectionPhotoUploader(user: User) {
    if (user.role === UserRole.SUPERVISOR || user.role === UserRole.ADMIN) return;
    throw new ForbiddenException('Only supervisors can upload inspection photos');
  }

  async presign(roomId: string, user: User, contentType: string) {
    this.assertInspectionPhotoUploader(user);
    await this.rooms.ensureChecklistState(roomId);
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
    dto: {
      photoId: string;
      mime: string;
      bytes: number;
      cleaningSessionId?: string;
      roomInspectionId?: string;
    },
  ) {
    this.assertInspectionPhotoUploader(user);
    const { photoId } = dto;
    const photo = await this.prisma.roomPhoto.findFirst({
      where: { id: photoId, roomId, uploadedByUserId: user.id },
    });
    if (!photo) throw new NotFoundException('Photo not found');

    const roomInspectionId = dto.roomInspectionId?.trim() ? dto.roomInspectionId.trim() : null;
    if (roomInspectionId) {
      const inspection = await this.prisma.roomInspection.findFirst({
        where: { id: roomInspectionId, roomId },
      });
      if (!inspection) throw new BadRequestException('Invalid inspection');
    }

    const cleaningSessionId = dto.cleaningSessionId?.trim() ? dto.cleaningSessionId.trim() : null;
    try {
      await this.prisma.roomPhoto.update({
        where: { id: photoId },
        data: {
          status: PhotoUploadStatus.READY,
          mime: dto.mime,
          bytes: dto.bytes,
          takenAt: new Date(),
          cleaningSessionId,
          roomInspectionId,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
        throw new BadRequestException('Invalid cleaning session or inspection');
      }
      throw e;
    }
    const timeline = await this.prisma.roomPhoto.findMany({
      where: { roomId, status: PhotoUploadStatus.READY },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const room = await this.rooms.findOne(roomId, user);
    this.realtime.emitRoomStatus(room);
    this.emma?.scheduleRoomStatusSync('photos.complete');
    return { ok: true, timeline };
  }

  async timeline(roomId: string) {
    const rows = await this.prisma.roomPhoto.findMany({
      where: { roomId, status: PhotoUploadStatus.READY },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        uploadedBy: { select: userPublicSelect },
        roomInspection: { select: { id: true, passed: true, notes: true, inspectedAt: true } },
      },
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
          roomInspectionId: p.roomInspectionId,
          inspection: p.roomInspection
            ? {
                id: p.roomInspection.id,
                passed: p.roomInspection.passed,
                notes: p.roomInspection.notes,
                inspectedAt: p.roomInspection.inspectedAt,
              }
            : null,
          uploadedBy: p.uploadedBy,
          url,
        };
      }),
    );
    return withUrls;
  }
}
