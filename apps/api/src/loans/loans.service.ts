import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateRoomLoanPayload,
  LoanCatalogItemDto,
  RoomLoanDto,
  UpsertLoanCatalogItemPayload,
} from '@housekeeping/shared';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';

function mapCatalog(row: {
  id: string;
  name: string;
  depositCents: number;
  active: boolean;
  sortOrder: number;
}): LoanCatalogItemDto {
  return {
    id: row.id,
    name: row.name,
    depositCents: row.depositCents,
    active: row.active,
    sortOrder: row.sortOrder,
  };
}

function mapLoan(row: {
  id: string;
  depositCents: number;
  loanedAt: Date;
  returnedAt: Date | null;
  room: { id: string; roomNumber: string };
  catalogItem: { id: string; name: string };
  loanedBy: { id: string; name: string };
  returnedBy: { id: string; name: string } | null;
}): RoomLoanDto {
  return {
    id: row.id,
    room: row.room,
    catalogItem: row.catalogItem,
    depositCents: row.depositCents,
    loanedAt: row.loanedAt.toISOString(),
    loanedBy: row.loanedBy,
    returnedAt: row.returnedAt?.toISOString() ?? null,
    returnedBy: row.returnedBy,
  };
}

@Injectable()
export class LoansService {
  constructor(private readonly prisma: PrismaService) {}

  private loanInclude = {
    room: { select: { id: true, roomNumber: true } },
    catalogItem: { select: { id: true, name: true } },
    loanedBy: { select: { id: true, name: true } },
    returnedBy: { select: { id: true, name: true } },
  } as const;

  async listCatalog(all = false) {
    const rows = await this.prisma.loanItemCatalogEntry.findMany({
      where: all ? undefined : { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map(mapCatalog);
  }

  async createCatalogItem(dto: UpsertLoanCatalogItemPayload) {
    if (!dto.name?.trim()) throw new BadRequestException('name required');
    if (dto.depositCents < 0 || !Number.isFinite(dto.depositCents)) {
      throw new BadRequestException('invalid depositCents');
    }
    const row = await this.prisma.loanItemCatalogEntry.create({
      data: {
        name: dto.name.trim(),
        depositCents: Math.round(dto.depositCents),
        active: dto.active ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    return mapCatalog(row);
  }

  async updateCatalogItem(id: string, dto: UpsertLoanCatalogItemPayload) {
    const existing = await this.prisma.loanItemCatalogEntry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Catalog item not found');
    if (dto.depositCents < 0 || !Number.isFinite(dto.depositCents)) {
      throw new BadRequestException('invalid depositCents');
    }
    const row = await this.prisma.loanItemCatalogEntry.update({
      where: { id },
      data: {
        name: dto.name.trim(),
        depositCents: Math.round(dto.depositCents),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
    return mapCatalog(row);
  }

  async listLoans(activeOnly: boolean) {
    const rows = await this.prisma.roomLoan.findMany({
      where: activeOnly ? { returnedAt: null } : undefined,
      include: this.loanInclude,
      orderBy: { loanedAt: 'desc' },
      take: 200,
    });
    return rows.map(mapLoan);
  }

  async createLoan(dto: CreateRoomLoanPayload, user: AuthenticatedUser) {
    const room = await this.prisma.room.findUnique({ where: { id: dto.roomId } });
    if (!room) throw new NotFoundException('Room not found');
    const item = await this.prisma.loanItemCatalogEntry.findUnique({
      where: { id: dto.catalogItemId },
    });
    if (!item || !item.active) throw new NotFoundException('Catalog item not found or inactive');
    const row = await this.prisma.roomLoan.create({
      data: {
        roomId: dto.roomId,
        catalogItemId: dto.catalogItemId,
        depositCents: item.depositCents,
        loanedByUserId: user.id,
      },
      include: this.loanInclude,
    });
    return mapLoan(row);
  }

  async returnLoan(id: string, user: AuthenticatedUser) {
    const existing = await this.prisma.roomLoan.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Loan not found');
    if (existing.returnedAt) throw new BadRequestException('Already returned');
    const row = await this.prisma.roomLoan.update({
      where: { id },
      data: {
        returnedAt: new Date(),
        returnedByUserId: user.id,
      },
      include: this.loanInclude,
    });
    return mapLoan(row);
  }
}
