import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PermissionCode, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { userPublicSelect } from '../common/user-public.select';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGuideDto } from './dto/create-guide.dto';
import { ReorderGuidesDto } from './dto/reorder-guides.dto';
import { UpdateGuideDto } from './dto/update-guide.dto';

const guideListSelect = {
  id: true,
  title: true,
  slug: true,
  summary: true,
  category: true,
  sortOrder: true,
  published: true,
  updatedAt: true,
} satisfies Prisma.GuideSelect;

const guideDetailInclude = {
  createdBy: { select: userPublicSelect },
  updatedBy: { select: userPublicSelect },
} satisfies Prisma.GuideInclude;

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || 'guide';
}

@Injectable()
export class GuidesService {
  constructor(private readonly prisma: PrismaService) {}

  private canWrite(user: AuthenticatedUser): boolean {
    return user.effectivePermissions.includes(PermissionCode.GUIDE_WRITE);
  }

  private async uniqueSlug(base: string, excludeId?: string): Promise<string> {
    let slug = slugify(base);
    let suffix = 0;
    while (true) {
      const candidate = suffix === 0 ? slug : `${slug}-${suffix}`;
      const existing = await this.prisma.guide.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!existing || existing.id === excludeId) return candidate;
      suffix += 1;
    }
  }

  private toListItem(row: Prisma.GuideGetPayload<{ select: typeof guideListSelect }>) {
    return {
      ...row,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toDetail(row: Prisma.GuideGetPayload<{ include: typeof guideDetailInclude }>) {
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      summary: row.summary,
      category: row.category,
      sortOrder: row.sortOrder,
      published: row.published,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    };
  }

  async list(user: AuthenticatedUser, all?: boolean) {
    const where: Prisma.GuideWhereInput = {};
    if (!all || !this.canWrite(user)) {
      where.published = true;
    }
    const rows = await this.prisma.guide.findMany({
      where,
      select: guideListSelect,
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    });
    return rows.map((row) => this.toListItem(row));
  }

  async getById(id: string, user: AuthenticatedUser) {
    const row = await this.prisma.guide.findUnique({
      where: { id },
      include: guideDetailInclude,
    });
    if (!row) throw new NotFoundException('Guide not found');
    if (!row.published && !this.canWrite(user)) {
      throw new NotFoundException('Guide not found');
    }
    return this.toDetail(row);
  }

  async create(dto: CreateGuideDto, user: AuthenticatedUser) {
    const slug = await this.uniqueSlug(dto.title);
    const row = await this.prisma.guide.create({
      data: {
        title: dto.title.trim(),
        slug,
        summary: dto.summary?.trim() || null,
        body: dto.body,
        category: dto.category?.trim() || null,
        sortOrder: dto.sortOrder ?? 0,
        published: dto.published ?? false,
        createdByUserId: user.id,
        updatedByUserId: user.id,
      },
      include: guideDetailInclude,
    });
    return this.toDetail(row);
  }

  async update(id: string, dto: UpdateGuideDto, user: AuthenticatedUser) {
    const existing = await this.prisma.guide.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Guide not found');

    const data: Prisma.GuideUpdateInput = {
      updatedBy: { connect: { id: user.id } },
    };
    if (dto.title !== undefined) {
      data.title = dto.title.trim();
      data.slug = await this.uniqueSlug(dto.title, id);
    }
    if (dto.summary !== undefined) data.summary = dto.summary?.trim() || null;
    if (dto.body !== undefined) data.body = dto.body;
    if (dto.category !== undefined) data.category = dto.category?.trim() || null;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.published !== undefined) data.published = dto.published;

    const row = await this.prisma.guide.update({
      where: { id },
      data,
      include: guideDetailInclude,
    });
    return this.toDetail(row);
  }

  async remove(id: string) {
    const existing = await this.prisma.guide.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Guide not found');
    await this.prisma.guide.delete({ where: { id } });
    return { ok: true };
  }

  async reorder(dto: ReorderGuidesDto, user: AuthenticatedUser) {
    if (!this.canWrite(user)) throw new ForbiddenException();
    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.guide.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder, updatedByUserId: user.id },
        }),
      ),
    );
    return this.list(user, true);
  }
}
