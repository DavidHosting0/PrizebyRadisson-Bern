import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChecklistTaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PutRoomTypeChecklistDto } from './dto/put-room-type-checklist.dto';

@Injectable()
export class RoomTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.roomType.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { rooms: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      roomCount: r._count.rooms,
      defaultChecklistTemplateId: r.defaultChecklistTemplateId,
    }));
  }

  async getChecklistTemplate(roomTypeId: string) {
    const rt = await this.prisma.roomType.findUnique({
      where: { id: roomTypeId },
    });
    if (!rt) throw new NotFoundException('Room type not found');

    const templateId = await this.resolveTemplateId(rt);
    const template = await this.prisma.checklistTemplate.findUnique({
      where: { id: templateId },
    });
    if (!template) throw new NotFoundException('Checklist template not found');

    const tasks = await this.prisma.checklistTemplateTask.findMany({
      where: { templateId },
      orderBy: { sortOrder: 'asc' },
    });

    return {
      roomType: { id: rt.id, name: rt.name, code: rt.code },
      template: {
        id: template.id,
        name: template.name,
        version: template.version,
      },
      tasks: tasks.map((t) => ({
        id: t.id,
        label: t.label,
        code: t.code,
        sortOrder: t.sortOrder,
        required: t.required,
      })),
    };
  }

  async putChecklistTemplate(roomTypeId: string, dto: PutRoomTypeChecklistDto) {
    const normalized = dto.tasks.map((t) => ({
      ...t,
      code: t.code.toLowerCase(),
    }));
    const codes = normalized.map((t) => t.code);
    if (new Set(codes).size !== codes.length) {
      throw new BadRequestException('Duplicate task codes in request');
    }

    const rt = await this.prisma.roomType.findUnique({
      where: { id: roomTypeId },
    });
    if (!rt) throw new NotFoundException('Room type not found');

    const templateId = await this.resolveTemplateId(rt);

    const existing = await this.prisma.checklistTemplateTask.findMany({
      where: { templateId },
    });
    const existingIds = new Set(existing.map((e) => e.id));

    for (const t of normalized) {
      if (t.id && !existingIds.has(t.id)) {
        throw new BadRequestException(`Unknown task id: ${t.id}`);
      }
    }

    const incomingIds = new Set(
      normalized.map((t) => t.id).filter((id): id is string => Boolean(id)),
    );

    return this.prisma.$transaction(async (tx) => {
      for (const ex of existing) {
        if (!incomingIds.has(ex.id)) {
          await tx.roomChecklistTask.deleteMany({
            where: { templateTaskId: ex.id },
          });
          await tx.checklistTemplateTask.delete({ where: { id: ex.id } });
        }
      }

      const sorted = [...normalized].sort((a, b) => a.sortOrder - b.sortOrder);
      const newlyCreated: { id: string }[] = [];

      for (const row of sorted) {
        if (row.id) {
          await tx.checklistTemplateTask.update({
            where: { id: row.id },
            data: {
              label: row.label,
              code: row.code,
              sortOrder: row.sortOrder,
              required: row.required,
            },
          });
        } else {
          const created = await tx.checklistTemplateTask.create({
            data: {
              templateId,
              label: row.label,
              code: row.code,
              sortOrder: row.sortOrder,
              required: row.required,
            },
          });
          newlyCreated.push(created);
        }
      }

      if (newlyCreated.length) {
        const states = await tx.roomChecklistState.findMany({
          where: { templateId },
        });
        for (const tt of newlyCreated) {
          if (states.length) {
            await tx.roomChecklistTask.createMany({
              data: states.map((s) => ({
                stateId: s.id,
                templateTaskId: tt.id,
                status: ChecklistTaskStatus.NOT_STARTED,
              })),
            });
          }
        }
      }

      await tx.checklistTemplate.update({
        where: { id: templateId },
        data: { version: { increment: 1 } },
      });

      const template = await tx.checklistTemplate.findUniqueOrThrow({
        where: { id: templateId },
      });
      const tasks = await tx.checklistTemplateTask.findMany({
        where: { templateId },
        orderBy: { sortOrder: 'asc' },
      });

      return {
        roomType: { id: rt.id, name: rt.name, code: rt.code },
        template: {
          id: template.id,
          name: template.name,
          version: template.version,
        },
        tasks: tasks.map((t) => ({
          id: t.id,
          label: t.label,
          code: t.code,
          sortOrder: t.sortOrder,
          required: t.required,
        })),
      };
    });
  }

  /** Ensures the room type has a default checklist template and returns its id. */
  private async resolveTemplateId(rt: {
    id: string;
    name: string;
    defaultChecklistTemplateId: string | null;
  }): Promise<string> {
    if (rt.defaultChecklistTemplateId) {
      return rt.defaultChecklistTemplateId;
    }

    const linked = await this.prisma.checklistTemplate.findFirst({
      where: { roomTypeId: rt.id },
      orderBy: { version: 'desc' },
    });

    if (linked) {
      await this.prisma.roomType.update({
        where: { id: rt.id },
        data: { defaultChecklistTemplateId: linked.id },
      });
      return linked.id;
    }

    const created = await this.prisma.checklistTemplate.create({
      data: {
        name: `${rt.name} checklist`,
        roomTypeId: rt.id,
        version: 1,
      },
    });
    await this.prisma.roomType.update({
      where: { id: rt.id },
      data: { defaultChecklistTemplateId: created.id },
    });
    return created.id;
  }
}
