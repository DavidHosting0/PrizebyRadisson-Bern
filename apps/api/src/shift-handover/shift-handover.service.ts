import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ReceptionHandoverShift } from '@prisma/client';
import {
  nextHandoverShift,
  RECEPTION_HANDOVER_SHIFTS,
  SHIFT_HANDOVER_LABELS_DE,
  type ReceptionHandoverShift as ShiftType,
} from '@housekeeping/shared';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { userPublicSelect } from '../common/user-public.select';
import { PrismaService } from '../prisma/prisma.service';
import { PutShiftHandoverTemplateDto } from './dto/put-shift-handover-template.dto';
import { ShiftHandoverHandoverDto } from './dto/shift-handover-handover.dto';

type CompletionEntry = {
  completed: boolean;
  completedByUserId?: string;
  completedAt?: string;
};

type CompletionsMap = Record<string, CompletionEntry>;

function parseShiftParam(raw: string): ReceptionHandoverShift {
  const upper = raw.toUpperCase();
  if (!RECEPTION_HANDOVER_SHIFTS.includes(upper as ShiftType)) {
    throw new BadRequestException(`Invalid shift: ${raw}`);
  }
  return upper as ReceptionHandoverShift;
}

function normalizeShiftName(name: string): string {
  return name.trim().toLowerCase().normalize('NFC');
}

function shiftLabel(shift: ReceptionHandoverShift): string {
  return SHIFT_HANDOVER_LABELS_DE[shift as ShiftType];
}

function slugifyCode(label: string): string {
  const base = label
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return base || `task_${Date.now()}`;
}

@Injectable()
export class ShiftHandoverService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureState() {
    return this.prisma.shiftHandoverState.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        activeShift: ReceptionHandoverShift.NIGHT,
        completions: {},
      },
      update: {},
    });
  }

  private parseCompletions(raw: unknown): CompletionsMap {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return raw as CompletionsMap;
  }

  private async loadUsersById(ids: string[]) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return new Map<string, { id: string; name: string }>();
    const rows = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: userPublicSelect,
    });
    return new Map(rows.map((u) => [u.id, u]));
  }

  private async buildStateDto() {
    const state = await this.ensureState();
    const completions = this.parseCompletions(state.completions);

    const templateTasks = await this.prisma.shiftHandoverTemplateTask.findMany({
      where: { shift: state.activeShift },
      orderBy: { sortOrder: 'asc' },
    });

    const userIds = [
      ...Object.values(completions)
        .map((c) => c.completedByUserId)
        .filter((id): id is string => !!id),
      ...(state.lastHandoverByUserId ? [state.lastHandoverByUserId] : []),
    ];
    const users = await this.loadUsersById(userIds);

    const tasks = templateTasks.map((t) => {
      const entry = completions[t.id];
      const completed = !!entry?.completed;
      const completedById = entry?.completedByUserId;
      return {
        id: t.id,
        label: t.label,
        code: t.code,
        sortOrder: t.sortOrder,
        essential: t.essential,
        completed,
        completedAt: entry?.completedAt ?? null,
        completedBy: completedById ? users.get(completedById) ?? null : null,
      };
    });

    const completedCount = tasks.filter((t) => t.completed).length;
    const essentialTasks = tasks.filter((t) => t.essential);
    const essentialCompletedCount = essentialTasks.filter((t) => t.completed).length;
    const activeShift = state.activeShift as ShiftType;
    const nextShift = nextHandoverShift(activeShift);

    return {
      activeShift,
      activeShiftLabel: shiftLabel(state.activeShift),
      nextShift,
      nextShiftLabel: shiftLabel(nextShift as ReceptionHandoverShift),
      tasks,
      completedCount,
      totalCount: tasks.length,
      essentialCompletedCount,
      essentialTotalCount: essentialTasks.length,
      lastHandoverAt: state.lastHandoverAt?.toISOString() ?? null,
      lastHandoverBy: state.lastHandoverByUserId
        ? users.get(state.lastHandoverByUserId) ?? null
        : null,
    };
  }

  async getState() {
    return this.buildStateDto();
  }

  async updateTask(taskId: string, completed: boolean, user: AuthenticatedUser) {
    const state = await this.ensureState();
    const task = await this.prisma.shiftHandoverTemplateTask.findUnique({
      where: { id: taskId },
    });
    if (!task || task.shift !== state.activeShift) {
      throw new NotFoundException('Task not found for active shift');
    }

    const completions = this.parseCompletions(state.completions);
    if (completed) {
      completions[taskId] = {
        completed: true,
        completedByUserId: user.id,
        completedAt: new Date().toISOString(),
      };
    } else {
      delete completions[taskId];
    }

    await this.prisma.shiftHandoverState.update({
      where: { id: 'singleton' },
      data: { completions },
    });

    return this.buildStateDto();
  }

  async handover(dto: ShiftHandoverHandoverDto, user: AuthenticatedUser) {
    const state = await this.ensureState();
    const activeShift = state.activeShift as ShiftType;
    const nextShift = nextHandoverShift(activeShift);
    const expectedName = normalizeShiftName(shiftLabel(nextShift as ReceptionHandoverShift));
    const provided = normalizeShiftName(dto.confirmShiftName);

    if (provided !== expectedName) {
      throw new BadRequestException(
        `Bestätigung fehlgeschlagen. Erwartet: „${shiftLabel(nextShift as ReceptionHandoverShift)}“`,
      );
    }

    const templateTasks = await this.prisma.shiftHandoverTemplateTask.findMany({
      where: { shift: state.activeShift },
      orderBy: { sortOrder: 'asc' },
    });
    const completions = this.parseCompletions(state.completions);

    const snapshot = templateTasks.map((t) => {
      const entry = completions[t.id];
      return {
        id: t.id,
        label: t.label,
        code: t.code,
        sortOrder: t.sortOrder,
        essential: t.essential,
        completed: !!entry?.completed,
        completedAt: entry?.completedAt ?? null,
        completedByUserId: entry?.completedByUserId ?? null,
      };
    });

    const incompleteEssential = snapshot.filter((t) => t.essential && !t.completed);
    if (incompleteEssential.length > 0) {
      const labels = incompleteEssential.map((t) => t.label).join('; ');
      throw new BadRequestException(
        `Schichtübergabe blockiert: ${incompleteEssential.length} Pflichtaufgabe(n) offen — ${labels}`,
      );
    }

    const incompleteCount = snapshot.filter((t) => !t.completed).length;
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.shiftHandoverLog.create({
        data: {
          fromShift: state.activeShift,
          toShift: nextShift as ReceptionHandoverShift,
          handedOverByUserId: user.id,
          incompleteCount,
          snapshot,
        },
      }),
      this.prisma.shiftHandoverState.update({
        where: { id: 'singleton' },
        data: {
          activeShift: nextShift as ReceptionHandoverShift,
          completions: {},
          lastHandoverAt: now,
          lastHandoverByUserId: user.id,
        },
      }),
    ]);

    return {
      fromShift: activeShift,
      toShift: nextShift,
      incompleteCount,
      handedOverAt: now.toISOString(),
    };
  }

  async listTemplates() {
    const tasks = await this.prisma.shiftHandoverTemplateTask.findMany({
      orderBy: [{ shift: 'asc' }, { sortOrder: 'asc' }],
    });

    return RECEPTION_HANDOVER_SHIFTS.map((shift) => ({
      shift,
      tasks: tasks
        .filter((t) => t.shift === shift)
        .map((t) => ({
          id: t.id,
          label: t.label,
          code: t.code,
          sortOrder: t.sortOrder,
          essential: t.essential,
        })),
    }));
  }

  async putTemplate(shiftParam: string, dto: PutShiftHandoverTemplateDto) {
    const shift = parseShiftParam(shiftParam);

    const normalized = dto.tasks.map((t, i) => {
      const code = (t.code ?? slugifyCode(t.label)).toLowerCase();
      return { ...t, code, sortOrder: i };
    });

    const codes = normalized.map((t) => t.code);
    if (new Set(codes).size !== codes.length) {
      throw new BadRequestException('Duplicate task codes in request');
    }

    const existing = await this.prisma.shiftHandoverTemplateTask.findMany({
      where: { shift },
    });
    const existingById = new Map(existing.map((t) => [t.id, t]));
    const keepIds = new Set<string>();

    await this.prisma.$transaction(async (tx) => {
      for (const t of normalized) {
        if (t.id && existingById.has(t.id)) {
          keepIds.add(t.id);
          await tx.shiftHandoverTemplateTask.update({
            where: { id: t.id },
            data: {
              label: t.label,
              code: t.code,
              sortOrder: t.sortOrder,
              essential: t.essential ?? false,
            },
          });
        } else {
          const created = await tx.shiftHandoverTemplateTask.create({
            data: {
              shift,
              label: t.label,
              code: t.code,
              sortOrder: t.sortOrder,
              essential: t.essential ?? false,
            },
          });
          keepIds.add(created.id);
        }
      }

      const toDelete = existing.filter((t) => !keepIds.has(t.id));
      if (toDelete.length) {
        await tx.shiftHandoverTemplateTask.deleteMany({
          where: { id: { in: toDelete.map((t) => t.id) } },
        });
      }
    });

    const tasks = await this.prisma.shiftHandoverTemplateTask.findMany({
      where: { shift },
      orderBy: { sortOrder: 'asc' },
    });

    return {
      shift,
      tasks: tasks.map((t) => ({
        id: t.id,
        label: t.label,
        code: t.code,
        sortOrder: t.sortOrder,
        essential: t.essential,
      })),
    };
  }

  async listLog(limit = 20) {
    const rows = await this.prisma.shiftHandoverLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 50),
    });

    const userIds = rows.map((r) => r.handedOverByUserId);
    const users = await this.loadUsersById(userIds);

    return rows.map((r) => ({
      id: r.id,
      fromShift: r.fromShift as ShiftType,
      toShift: r.toShift as ShiftType,
      fromShiftLabel: shiftLabel(r.fromShift),
      toShiftLabel: shiftLabel(r.toShift),
      incompleteCount: r.incompleteCount,
      handedOverBy: users.get(r.handedOverByUserId) ?? {
        id: r.handedOverByUserId,
        name: 'Unknown',
      },
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
