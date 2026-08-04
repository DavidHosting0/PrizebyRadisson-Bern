import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ReceptionHandoverShift, UserRole } from '@prisma/client';
import type {
  CreateShiftNotePayload,
  ShiftNoteDaySummaryDto,
  ShiftNoteDto,
  UpdateShiftNotePayload,
} from '@housekeeping/shared';
import { RECEPTION_HANDOVER_SHIFTS } from '@housekeeping/shared';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';

function toDateOnly(isoOrDate: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoOrDate.trim());
  if (!m) throw new BadRequestException('Invalid date (expected YYYY-MM-DD)');
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function formatDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const ALL_SHIFTS = [...RECEPTION_HANDOVER_SHIFTS] as ReceptionHandoverShift[];

const noteInclude = {
  createdBy: { select: { id: true, name: true } },
  completedBy: { select: { id: true, name: true } },
} as const;

function mapNote(row: {
  id: string;
  forDate: Date;
  shifts: ReceptionHandoverShift[];
  body: string;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { id: string; name: string };
  completedBy: { id: string; name: string } | null;
}): ShiftNoteDto {
  return {
    id: row.id,
    forDate: formatDateOnly(row.forDate),
    shifts: row.shifts as ShiftNoteDto['shifts'],
    body: row.body,
    completed: row.completedAt != null,
    completedAt: row.completedAt?.toISOString() ?? null,
    completedBy: row.completedBy,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class ShiftNotesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: { date?: string }) {
    const where: Prisma.ShiftNoteWhereInput = {};
    if (params.date) {
      where.forDate = toDateOnly(params.date);
    } else {
      const state = await this.prisma.shiftHandoverState.findUnique({
        where: { id: 'singleton' },
      });
      if (state?.activeDate) {
        where.forDate = state.activeDate;
      } else {
        const today = new Date();
        const y = today.getFullYear();
        const mo = String(today.getMonth() + 1).padStart(2, '0');
        const da = String(today.getDate()).padStart(2, '0');
        where.forDate = toDateOnly(`${y}-${mo}-${da}`);
      }
    }
    const rows = await this.prisma.shiftNote.findMany({
      where,
      include: noteInclude,
      orderBy: [{ completedAt: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
    // Open notes first (completedAt null sorts first with asc in Postgres? Actually nulls first/last varies)
    // Sort in JS for consistent open-first ordering.
    const mapped = rows.map(mapNote);
    return mapped.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  /** Distinct days that already have notes (newest first). */
  async listDays(): Promise<ShiftNoteDaySummaryDto[]> {
    const grouped = await this.prisma.shiftNote.groupBy({
      by: ['forDate'],
      _count: { _all: true },
      orderBy: { forDate: 'desc' },
      take: 120,
    });
    return grouped.map((g) => ({
      date: formatDateOnly(g.forDate),
      count: g._count._all,
    }));
  }

  async browse(params: { cursor?: string; limit?: number }) {
    const take = Math.min(Math.max(params.limit ?? 30, 1), 100);
    const rows = await this.prisma.shiftNote.findMany({
      take: take + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      include: noteInclude,
      orderBy: [{ forDate: 'desc' }, { createdAt: 'desc' }],
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return {
      items: items.map(mapNote),
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
    };
  }

  async create(dto: CreateShiftNotePayload, user: AuthenticatedUser) {
    if (!dto.body?.trim()) throw new BadRequestException('body required');
    let shifts = dto.shifts?.length ? dto.shifts : ALL_SHIFTS;
    for (const s of shifts) {
      if (!RECEPTION_HANDOVER_SHIFTS.includes(s)) {
        throw new BadRequestException(`Invalid shift: ${s}`);
      }
    }
    // Day-scoped: always attach to all shifts so every Schicht sees the same notes.
    shifts = ALL_SHIFTS;
    const row = await this.prisma.shiftNote.create({
      data: {
        forDate: toDateOnly(dto.forDate),
        shifts: shifts as ReceptionHandoverShift[],
        body: dto.body.trim(),
        createdByUserId: user.id,
      },
      include: noteInclude,
    });
    return mapNote(row);
  }

  private assertCanEditBody(note: { createdByUserId: string }, user: AuthenticatedUser) {
    if (user.role === UserRole.ADMIN) return;
    if (note.createdByUserId !== user.id) {
      throw new ForbiddenException('Nur der Autor darf diese Notiz bearbeiten');
    }
  }

  async update(id: string, dto: UpdateShiftNotePayload, user: AuthenticatedUser) {
    const existing = await this.prisma.shiftNote.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Note not found');

    const touchesContent =
      dto.body !== undefined || dto.forDate !== undefined || dto.shifts !== undefined;
    if (touchesContent) {
      this.assertCanEditBody(existing, user);
    }

    if (dto.shifts) {
      for (const s of dto.shifts) {
        if (!RECEPTION_HANDOVER_SHIFTS.includes(s)) {
          throw new BadRequestException(`Invalid shift: ${s}`);
        }
      }
    }

    const data: Prisma.ShiftNoteUpdateInput = {
      ...(dto.forDate ? { forDate: toDateOnly(dto.forDate) } : {}),
      ...(dto.body !== undefined ? { body: dto.body.trim() } : {}),
    };

    if (dto.completed === true) {
      data.completedAt = existing.completedAt ?? new Date();
      data.completedBy = { connect: { id: user.id } };
    } else if (dto.completed === false) {
      data.completedAt = null;
      data.completedBy = { disconnect: true };
    }

    const row = await this.prisma.shiftNote.update({
      where: { id },
      data,
      include: noteInclude,
    });
    return mapNote(row);
  }

  async remove(id: string, user: AuthenticatedUser) {
    const existing = await this.prisma.shiftNote.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Note not found');
    this.assertCanEditBody(existing, user);
    await this.prisma.shiftNote.delete({ where: { id } });
    return { ok: true as const };
  }
}
