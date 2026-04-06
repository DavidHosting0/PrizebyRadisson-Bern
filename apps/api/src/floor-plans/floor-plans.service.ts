import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type LayoutElement = {
  id: string;
  kind: 'room' | 'staff' | 'elevator' | 'corridor' | 'glass';
  x: number;
  y: number;
  w: number;
  h: number;
  roomNumber?: string;
};

@Injectable()
export class FloorPlansService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.floorPlan.findMany({
      orderBy: { floor: 'asc' },
      select: { id: true, floor: true, layout: true, updatedAt: true, updatedByUserId: true },
    });
  }

  async get(floor: number) {
    const row = await this.prisma.floorPlan.findUnique({
      where: { floor },
      select: { id: true, floor: true, layout: true, updatedAt: true, updatedByUserId: true },
    });
    if (!row) return null;
    return row;
  }

  private sanitizeLayout(layout: Array<Record<string, unknown>>): LayoutElement[] {
    const out: LayoutElement[] = [];
    for (const it of layout) {
      const kind = typeof it.kind === 'string' ? it.kind : '';
      if (!['room', 'staff', 'elevator', 'corridor', 'glass'].includes(kind)) continue;
      const x = Number(it.x);
      const y = Number(it.y);
      const w = Number(it.w);
      const h = Number(it.h);
      if (![x, y, w, h].every((n) => Number.isFinite(n))) continue;
      const id = typeof it.id === 'string' && it.id.length > 0 ? it.id : `el-${out.length + 1}`;
      const roomNumber = typeof it.roomNumber === 'string' ? it.roomNumber : undefined;
      out.push({
        id,
        kind: kind as LayoutElement['kind'],
        x: Math.max(1, Math.round(x)),
        y: Math.max(1, Math.round(y)),
        w: Math.max(1, Math.round(w)),
        h: Math.max(1, Math.round(h)),
        roomNumber,
      });
    }
    return out;
  }

  async upsert(
    floor: number,
    dto: { layout: Array<Record<string, unknown>> },
    user: User,
  ) {
    const layout = this.sanitizeLayout(dto.layout);
    return this.prisma.floorPlan.upsert({
      where: { floor },
      create: {
        floor,
        layout: layout as unknown as Prisma.JsonArray,
        updatedByUserId: user.id,
      },
      update: {
        layout: layout as unknown as Prisma.JsonArray,
        updatedByUserId: user.id,
      },
      select: { id: true, floor: true, layout: true, updatedAt: true, updatedByUserId: true },
    });
  }
}
