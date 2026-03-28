import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChecklistTaskStatus,
  ServiceRequestPriority,
  ServiceRequestStatus,
  User,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RoomsService } from '../rooms/rooms.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateServiceRequestDto } from './dto/create-service-request.dto';

@Injectable()
export class ServiceRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rooms: RoomsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async list(query: {
    status?: ServiceRequestStatus;
    roomId?: string;
    priority?: ServiceRequestPriority;
  }) {
    return this.prisma.serviceRequest.findMany({
      where: {
        status: query.status,
        roomId: query.roomId,
        priority: query.priority,
      },
      include: {
        room: { select: { id: true, roomNumber: true } },
        type: true,
        createdBy: { select: { id: true, name: true } },
        claimedBy: { select: { id: true, name: true } },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async create(dto: CreateServiceRequestDto, user: User) {
    if (user.role !== UserRole.RECEPTION && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }
    await this.rooms.ensureChecklistState(dto.roomId);
    const req = await this.prisma.$transaction(async (tx) => {
      const created = await tx.serviceRequest.create({
        data: {
          roomId: dto.roomId,
          typeId: dto.typeId,
          priority: dto.priority,
          description: dto.description,
          status: ServiceRequestStatus.OPEN,
          createdByUserId: user.id,
        },
        include: {
          room: { select: { id: true, roomNumber: true } },
          type: true,
        },
      });

      const type = await tx.serviceRequestType.findUnique({ where: { id: dto.typeId } });
      if (type?.mapsToChecklistTaskCode) {
        const state = await tx.roomChecklistState.findUnique({ where: { roomId: dto.roomId } });
        if (state) {
          const task = await tx.roomChecklistTask.findFirst({
            where: {
              stateId: state.id,
              templateTask: { code: type.mapsToChecklistTaskCode },
            },
          });
          if (task) {
            await tx.roomChecklistTask.update({
              where: { id: task.id },
              data: {
                status: ChecklistTaskStatus.NOT_STARTED,
                updatedByUserId: user.id,
              },
            });
          }
        }
      }
      return created;
    });

    const room = await this.rooms.findOne(dto.roomId);
    this.realtime.emitRoomStatus(room);
    this.realtime.emitServiceRequest('service_request.created', req);
    return req;
  }

  async claim(id: string, user: User) {
    if (user.role !== UserRole.HOUSEKEEPER && user.role !== UserRole.SUPERVISOR) {
      throw new ForbiddenException();
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const n = await tx.serviceRequest.updateMany({
        where: {
          id,
          status: ServiceRequestStatus.OPEN,
        },
        data: {
          status: ServiceRequestStatus.CLAIMED,
          claimedByUserId: user.id,
          claimedAt: new Date(),
        },
      });
      if (n.count !== 1) {
        throw new ConflictException('Request already claimed or not open');
      }
      return tx.serviceRequest.findUniqueOrThrow({
        where: { id },
        include: {
          room: { select: { id: true, roomNumber: true } },
          type: true,
          claimedBy: { select: { id: true, name: true } },
        },
      });
    });
    this.realtime.emitServiceRequest('service_request.claimed', updated);
    return updated;
  }

  async updateStatus(
    id: string,
    user: User,
    status: ServiceRequestStatus,
  ) {
    const row = await this.prisma.serviceRequest.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();

    if (status === ServiceRequestStatus.IN_PROGRESS) {
      if (row.claimedByUserId !== user.id && user.role !== UserRole.SUPERVISOR && user.role !== UserRole.ADMIN) {
        throw new ForbiddenException();
      }
    }
    if (status === ServiceRequestStatus.RESOLVED) {
      if (row.claimedByUserId !== user.id && user.role !== UserRole.SUPERVISOR && user.role !== UserRole.ADMIN) {
        throw new ForbiddenException();
      }
    }

    const updated = await this.prisma.serviceRequest.update({
      where: { id },
      data: {
        status,
        resolvedAt: status === ServiceRequestStatus.RESOLVED ? new Date() : undefined,
      },
      include: {
        room: { select: { id: true, roomNumber: true } },
        type: true,
      },
    });
    if (status === ServiceRequestStatus.RESOLVED) {
      this.realtime.emitServiceRequest('service_request.resolved', updated);
    }
    return updated;
  }

  async cancel(id: string, user: User) {
    if (user.role !== UserRole.RECEPTION && user.role !== UserRole.SUPERVISOR && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }
    return this.prisma.serviceRequest.update({
      where: { id },
      data: { status: ServiceRequestStatus.CANCELLED },
    });
  }

  types() {
    return this.prisma.serviceRequestType.findMany({ orderBy: { label: 'asc' } });
  }
}
