import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BreakfastEntrySource,
  BreakfastWishStatus,
  Prisma,
} from '@prisma/client';
import type {
  BreakfastDayEntryDto,
  BreakfastDayStatsDto,
  BreakfastForecastDayDto,
  BreakfastSpecialWishDto,
  BreakfastTodayDto,
  CreateBreakfastWishPayload,
  ServeBreakfastEntryPayload,
  UpdateBreakfastWishPayload,
  UpsertBreakfastEntryPayload,
} from '@housekeeping/shared';
import { EMMA_DEFAULT_HOTEL_ID } from '../emma/emma-odata-client';
import {
  dateOnlyFromIso,
  todayIsoDate,
} from '../reservations/reservation-sensitive';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';

const HOTEL_TZ = 'Europe/Zurich';

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseServiceDate(raw?: string | null): { iso: string; date: Date } {
  const iso = raw?.trim() || todayIsoDate(HOTEL_TZ);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new BadRequestException('serviceDate must be YYYY-MM-DD');
  }
  return { iso, date: dateOnlyFromIso(iso) };
}

function mapEntry(
  row: {
    id: string;
    hotelId: string;
    serviceDate: Date;
    reservationId: string | null;
    persons: number;
    source: BreakfastEntrySource;
    servedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    room: { id: string; roomNumber: string };
    servedBy: { id: string; name: string } | null;
  },
  openWishRoomIds: Set<string>,
): BreakfastDayEntryDto {
  return {
    id: row.id,
    hotelId: row.hotelId,
    serviceDate: isoDate(row.serviceDate),
    room: row.room,
    reservationId: row.reservationId,
    persons: row.persons,
    source: row.source,
    servedAt: row.servedAt?.toISOString() ?? null,
    servedBy: row.servedBy,
    hasOpenWish: openWishRoomIds.has(row.room.id),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapWish(row: {
  id: string;
  hotelId: string;
  serviceDate: Date;
  tags: string[];
  note: string | null;
  status: BreakfastWishStatus;
  createdAt: Date;
  updatedAt: Date;
  room: { id: string; roomNumber: string };
  createdBy: { id: string; name: string };
}): BreakfastSpecialWishDto {
  return {
    id: row.id,
    hotelId: row.hotelId,
    serviceDate: isoDate(row.serviceDate),
    room: row.room,
    tags: row.tags,
    note: row.note,
    status: row.status,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function computeStats(
  entries: BreakfastDayEntryDto[],
  openWishesCount: number,
): BreakfastDayStatsDto {
  let totalPersons = 0;
  let servedPersons = 0;
  let servedRooms = 0;
  const hourBuckets = new Map<number, number>();

  for (const e of entries) {
    totalPersons += e.persons;
    if (e.servedAt) {
      servedPersons += e.persons;
      servedRooms += 1;
      const hour = Number(
        new Intl.DateTimeFormat('en-GB', {
          timeZone: HOTEL_TZ,
          hour: 'numeric',
          hour12: false,
        }).format(new Date(e.servedAt)),
      );
      hourBuckets.set(hour, (hourBuckets.get(hour) ?? 0) + e.persons);
    }
  }

  let peakHour: number | null = null;
  let peakPersons = 0;
  for (const [hour, persons] of hourBuckets) {
    if (persons > peakPersons) {
      peakPersons = persons;
      peakHour = hour;
    }
  }

  return {
    totalPersons,
    servedPersons,
    remainingPersons: totalPersons - servedPersons,
    totalRooms: entries.length,
    servedRooms,
    remainingRooms: entries.length - servedRooms,
    peakHour,
    peakPersons,
    openWishesCount,
  };
}

@Injectable()
export class BreakfastService {
  constructor(private readonly prisma: PrismaService) {}

  private hotelId = EMMA_DEFAULT_HOTEL_ID;

  private entryInclude = {
    room: { select: { id: true, roomNumber: true } },
    servedBy: { select: { id: true, name: true } },
  } as const;

  private wishInclude = {
    room: { select: { id: true, roomNumber: true } },
    createdBy: { select: { id: true, name: true } },
  } as const;

  async today(serviceDate?: string): Promise<BreakfastTodayDto> {
    const { iso, date } = parseServiceDate(serviceDate);
    const [rows, openWishes] = await Promise.all([
      this.prisma.breakfastDayEntry.findMany({
        where: { hotelId: this.hotelId, serviceDate: date },
        include: this.entryInclude,
        orderBy: { room: { roomNumber: 'asc' } },
      }),
      this.prisma.breakfastSpecialWish.findMany({
        where: {
          hotelId: this.hotelId,
          serviceDate: date,
          status: BreakfastWishStatus.OPEN,
        },
        select: { roomId: true },
      }),
    ]);
    const openWishRoomIds = new Set(openWishes.map((w) => w.roomId));
    const entries = rows.map((r) => mapEntry(r, openWishRoomIds));
    return {
      serviceDate: iso,
      entries,
      stats: computeStats(entries, openWishRoomIds.size),
    };
  }

  async forecast(from?: string, to?: string): Promise<BreakfastForecastDayDto[]> {
    const fromParsed = parseServiceDate(from ?? todayIsoDate(HOTEL_TZ));
    let toIso = to?.trim();
    if (!toIso) {
      const d = new Date(fromParsed.date);
      d.setUTCDate(d.getUTCDate() + 14);
      toIso = isoDate(d);
    }
    const toParsed = parseServiceDate(toIso);
    if (toParsed.date < fromParsed.date) {
      throw new BadRequestException('to must be on or after from');
    }

    const rows = await this.prisma.breakfastDayEntry.groupBy({
      by: ['serviceDate'],
      where: {
        hotelId: this.hotelId,
        serviceDate: { gte: fromParsed.date, lte: toParsed.date },
      },
      _sum: { persons: true },
      _count: { _all: true },
      orderBy: { serviceDate: 'asc' },
    });

    return rows.map((r) => ({
      serviceDate: isoDate(r.serviceDate),
      totalPersons: r._sum.persons ?? 0,
      totalRooms: r._count._all,
    }));
  }

  async upsertEntry(
    dto: UpsertBreakfastEntryPayload,
    _user: AuthenticatedUser,
  ): Promise<BreakfastDayEntryDto> {
    if (!dto.persons || dto.persons < 1) {
      throw new BadRequestException('persons must be at least 1');
    }
    const room = await this.resolveRoom(dto.roomId, dto.roomNumber);
    const { date } = parseServiceDate(dto.serviceDate);

    const row = await this.prisma.breakfastDayEntry.upsert({
      where: {
        hotelId_serviceDate_roomId: {
          hotelId: this.hotelId,
          serviceDate: date,
          roomId: room.id,
        },
      },
      create: {
        hotelId: this.hotelId,
        serviceDate: date,
        roomId: room.id,
        persons: dto.persons,
        source: BreakfastEntrySource.MANUAL,
        reservationId: dto.reservationId ?? null,
      },
      update: {
        persons: dto.persons,
        ...(dto.reservationId !== undefined
          ? { reservationId: dto.reservationId }
          : {}),
      },
      include: this.entryInclude,
    });

    const openWish = await this.prisma.breakfastSpecialWish.findFirst({
      where: {
        hotelId: this.hotelId,
        serviceDate: date,
        roomId: room.id,
        status: BreakfastWishStatus.OPEN,
      },
      select: { id: true },
    });

    return mapEntry(row, openWish ? new Set([room.id]) : new Set());
  }

  async setServed(
    id: string,
    dto: ServeBreakfastEntryPayload,
    user: AuthenticatedUser,
  ): Promise<BreakfastDayEntryDto> {
    const existing = await this.prisma.breakfastDayEntry.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Breakfast entry not found');

    const row = await this.prisma.breakfastDayEntry.update({
      where: { id },
      data: dto.served
        ? { servedAt: new Date(), servedByUserId: user.id }
        : { servedAt: null, servedByUserId: null },
      include: this.entryInclude,
    });

    const openWish = await this.prisma.breakfastSpecialWish.findFirst({
      where: {
        hotelId: row.hotelId,
        serviceDate: row.serviceDate,
        roomId: row.roomId,
        status: BreakfastWishStatus.OPEN,
      },
      select: { id: true },
    });

    return mapEntry(row, openWish ? new Set([row.roomId]) : new Set());
  }

  async listWishes(params: {
    date?: string;
    status?: string;
    roomId?: string;
  }): Promise<BreakfastSpecialWishDto[]> {
    const where: Prisma.BreakfastSpecialWishWhereInput = {
      hotelId: this.hotelId,
    };
    if (params.date) {
      where.serviceDate = parseServiceDate(params.date).date;
    }
    if (
      params.status === 'OPEN' ||
      params.status === 'DONE' ||
      params.status === 'CANCELLED'
    ) {
      where.status = params.status;
    }
    if (params.roomId) where.roomId = params.roomId;

    const rows = await this.prisma.breakfastSpecialWish.findMany({
      where,
      include: this.wishInclude,
      orderBy: [{ serviceDate: 'desc' }, { createdAt: 'desc' }],
      take: 300,
    });
    return rows.map(mapWish);
  }

  async createWish(
    dto: CreateBreakfastWishPayload,
    user: AuthenticatedUser,
  ): Promise<BreakfastSpecialWishDto> {
    const room = await this.resolveRoom(dto.roomId);
    const tags = (dto.tags ?? []).map((t) => t.trim()).filter(Boolean);
    if (tags.length === 0) throw new BadRequestException('tags required');
    const { date } = parseServiceDate(dto.serviceDate);

    const row = await this.prisma.breakfastSpecialWish.create({
      data: {
        hotelId: this.hotelId,
        roomId: room.id,
        serviceDate: date,
        tags,
        note: dto.note?.trim() || null,
        createdByUserId: user.id,
      },
      include: this.wishInclude,
    });
    return mapWish(row);
  }

  async updateWish(
    id: string,
    dto: UpdateBreakfastWishPayload,
  ): Promise<BreakfastSpecialWishDto> {
    const existing = await this.prisma.breakfastSpecialWish.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Wish not found');

    const data: Prisma.BreakfastSpecialWishUpdateInput = {};
    if (dto.tags !== undefined) {
      const tags = dto.tags.map((t) => t.trim()).filter(Boolean);
      if (tags.length === 0) throw new BadRequestException('tags required');
      data.tags = tags;
    }
    if (dto.note !== undefined) data.note = dto.note?.trim() || null;
    if (
      dto.status === 'OPEN' ||
      dto.status === 'DONE' ||
      dto.status === 'CANCELLED'
    ) {
      data.status = dto.status;
    }
    if (dto.serviceDate) {
      data.serviceDate = parseServiceDate(dto.serviceDate).date;
    }

    const row = await this.prisma.breakfastSpecialWish.update({
      where: { id },
      data,
      include: this.wishInclude,
    });
    return mapWish(row);
  }

  async deleteWish(id: string): Promise<{ ok: true }> {
    const existing = await this.prisma.breakfastSpecialWish.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Wish not found');
    await this.prisma.breakfastSpecialWish.delete({ where: { id } });
    return { ok: true };
  }

  private async resolveRoom(roomId?: string, roomNumber?: string) {
    if (roomId?.trim()) {
      const room = await this.prisma.room.findUnique({
        where: { id: roomId.trim() },
        select: { id: true, roomNumber: true },
      });
      if (!room) throw new NotFoundException('Room not found');
      return room;
    }
    const num = roomNumber?.trim();
    if (!num) throw new BadRequestException('roomId or roomNumber required');
    const room = await this.prisma.room.findUnique({
      where: { roomNumber: num },
      select: { id: true, roomNumber: true },
    });
    if (!room) throw new NotFoundException('Room not found');
    return room;
  }
}
