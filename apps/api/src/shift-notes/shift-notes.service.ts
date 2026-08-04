import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ReceptionHandoverShift } from '@prisma/client';
import type {
  CreateShiftNotePayload,
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

  async list(params: { date?: string; shift?: string }) {
    const where: Prisma.ShiftNoteWhereInput = {};
    if (params.date) {
      where.forDate = toDateOnly(params.date);
    }
    if (params.shift) {
      if (!RECEPTION_HANDOVER_SHIFTS.includes(params.shift as never)) {
        throw new BadRequestException('Invalid shift');
      }
      where.shifts = { has: params.shift as ReceptionHandoverShift };
    }
    if (!params.date && !params.shift) {
      const state = await this.prisma.shiftHandoverState.findUnique({
        where: { id: 'singleton' },
      });
      const today = new Date();
      const y = today.getFullYear();
      const mo = String(today.getMonth() + 1).padStart(2, '0');
      const da = String(today.getDate()).padStart(2, '0');
      where.forDate = toDateOnly(`${y}-${mo}-${da}`);
      where.shifts = { has: state?.activeShift ?? ReceptionHandoverShift.NIGHT };
    }
    const rows = await this.prisma.shiftNote.findMany({
      where,
      include: this.include,
      orderBy: [{ forDate: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
    return rows.map(mapNote);
  }

  async browse(params: { cursor?: string; limit?: number }) {
    const take = Math.min(Math.max(params.limit ?? 30, 1), 100);
    const rows = await this.prisma.shiftNote.findMany({
      take: take + 1,
      ...(params.cursor
        ? { cursor: { id: params.cursor }, skip: 1 }
        : {}),
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
    if (!dto.shifts?.length) throw new BadRequestException('at least one shift required');
    for (const s of dto.shifts) {
      if (!RECEPTION_HANDOVER_SHIFTS.includes(s)) {
        throw new BadRequestException(`Invalid shift: ${s}`);
      }
    }
    const row = await this.prisma.shiftNote.create({
      data: {
        forDate: toDateOnly(dto.forDate),
        shifts: dto.shifts as ReceptionHandoverShift[],
        body: dto.body.trim(),
        createdByUserId: user.id,
      },
      include: this.include,
    });
    return mapNote(row);
  }

  async update(id: string, dto: UpdateShiftNotePayload) {
    const existing = await this.prisma.shiftNote.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Note not found');
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
        ...(dto.shifts ? { shifts: dto.shifts as ReceptionHandoverShift[] } : {}),
        ...(dto.body !== undefined ? { body: dto.body.trim() } : {}),
      },
      include: this.include,
    });
    return mapNote(row);
  }

  async remove(id: string) {
    const existing = await this.prisma.shiftNote.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Note not found');
    await this.prisma.shiftNote.delete({ where: { id } });
    return { ok: true as const };
  }
}
