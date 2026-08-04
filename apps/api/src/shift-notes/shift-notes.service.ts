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

function mapNote(row: {
  id: string;
  forDate: Date;
  shifts: ReceptionHandoverShift[];
  body: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { id: string; name: string };
}): ShiftNoteDto {
  return {
    id: row.id,
    forDate: formatDateOnly(row.forDate),
    shifts: row.shifts as ShiftNoteDto['shifts'],
    body: row.body,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class ShiftNotesService {
  constructor(private readonly prisma: PrismaService) {}

  private include = { createdBy: { select: { id: true, name: true } } } as const;

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
      include: this.include,
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    return rows.map(mapNote);
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
      include: this.include,
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
      include: this.include,
    });
    return mapNote(row);
  }

  private assertCanMutate(note: { createdByUserId: string }, user: AuthenticatedUser) {
    if (user.role === UserRole.ADMIN) return;
    if (note.createdByUserId !== user.id) {
      throw new ForbiddenException('Nur der Autor darf diese Notiz bearbeiten');
    }
  }

  async update(id: string, dto: UpdateShiftNotePayload, user: AuthenticatedUser) {
    const existing = await this.prisma.shiftNote.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Note not found');
    this.assertCanMutate(existing, user);
    if (dto.shifts) {
      for (const s of dto.shifts) {
        if (!RECEPTION_HANDOVER_SHIFTS.includes(s)) {
          throw new BadRequestException(`Invalid shift: ${s}`);
        }
      }
    }
    const row = await this.prisma.shiftNote.update({
      where: { id },
      data: {
        ...(dto.forDate ? { forDate: toDateOnly(dto.forDate) } : {}),
        ...(dto.body !== undefined ? { body: dto.body.trim() } : {}),
      },
      include: this.include,
    });
    return mapNote(row);
  }

  async remove(id: string, user: AuthenticatedUser) {
    const existing = await this.prisma.shiftNote.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Note not found');
    this.assertCanMutate(existing, user);
    await this.prisma.shiftNote.delete({ where: { id } });
    return { ok: true as const };
  }
}
