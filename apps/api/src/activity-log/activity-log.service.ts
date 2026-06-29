import { Injectable, Logger } from '@nestjs/common';
import { ActivityLogCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { resolveActivityAction } from './action-resolver';
import { sanitizeMetadata } from './sanitize-metadata';

export type ActivityLogInput = {
  method: string;
  path: string;
  actor?: Pick<AuthenticatedUser, 'id' | 'email' | 'name'> | null;
  statusCode?: number;
  success?: boolean;
  errorMessage?: string;
  body?: unknown;
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  durationMs?: number;
  action?: string;
  label?: string;
  category?: ActivityLogCategory;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
};

const SKIP_PATH_PREFIXES = ['/activity-log'];

@Injectable()
export class ActivityLogService {
  private readonly log = new Logger(ActivityLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  shouldSkipPath(rawPath: string): boolean {
    const path = rawPath.split('?')[0] ?? rawPath;
    const normalized = path.replace(/^\/api\/v1/, '');
    return SKIP_PATH_PREFIXES.some((p) => normalized === p || normalized.startsWith(`${p}/`));
  }

  async record(input: ActivityLogInput): Promise<void> {
    try {
      const resolved = resolveActivityAction(input.method, input.path);
      const metadata = sanitizeMetadata({
        ...(input.metadata ?? {}),
        body: input.body,
        params: input.params,
        query: input.query,
      }) as Prisma.InputJsonValue;

      await this.prisma.activityLog.create({
        data: {
          action: input.action ?? resolved.action,
          label: input.label ?? resolved.label,
          category: input.category ?? resolved.category,
          actorUserId: input.actor?.id ? input.actor.id : null,
          actorEmail: input.actor?.email ?? null,
          actorName: input.actor?.name && input.actor.name !== input.actor.email ? input.actor.name : input.actor?.email ?? null,
          method: input.method.toUpperCase(),
          path: input.path.split('?')[0] ?? input.path,
          resourceType: input.resourceType ?? resolved.resourceType ?? null,
          resourceId: input.resourceId ?? resolved.resourceId ?? null,
          statusCode: input.statusCode ?? null,
          success: input.success ?? true,
          errorMessage: input.errorMessage?.slice(0, 2000) ?? null,
          metadata: Object.keys(metadata as object).length ? metadata : undefined,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent?.slice(0, 500) ?? null,
          durationMs: input.durationMs ?? null,
        },
      });
    } catch (err) {
      this.log.warn(`Failed to write activity log: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async list(opts: {
    from?: Date;
    to?: Date;
    actorUserId?: string;
    category?: ActivityLogCategory;
    action?: string;
    resourceType?: string;
    resourceId?: string;
    success?: boolean;
    search?: string;
    cursor?: string;
    limit?: number;
  }) {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const where: Prisma.ActivityLogWhereInput = {};

    if (opts.from || opts.to) {
      where.createdAt = {};
      if (opts.from) where.createdAt.gte = opts.from;
      if (opts.to) where.createdAt.lte = opts.to;
    }
    if (opts.actorUserId) where.actorUserId = opts.actorUserId;
    if (opts.category) where.category = opts.category;
    if (opts.action) where.action = opts.action;
    if (opts.resourceType) where.resourceType = opts.resourceType;
    if (opts.resourceId) where.resourceId = opts.resourceId;
    if (opts.success !== undefined) where.success = opts.success;
    if (opts.search?.trim()) {
      const q = opts.search.trim();
      where.OR = [
        { label: { contains: q, mode: 'insensitive' } },
        { action: { contains: q, mode: 'insensitive' } },
        { actorEmail: { contains: q, mode: 'insensitive' } },
        { actorName: { contains: q, mode: 'insensitive' } },
        { path: { contains: q, mode: 'insensitive' } },
        { resourceId: { contains: q, mode: 'insensitive' } },
        { errorMessage: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (opts.cursor) {
      where.id = { lt: opts.cursor };
    }

    const rows = await this.prisma.activityLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    return { items, nextCursor, hasMore };
  }

  async getById(id: string) {
    return this.prisma.activityLog.findUnique({ where: { id } });
  }

  async summary(from: Date, to: Date) {
    const [total, failed, byCategory, topActions] = await Promise.all([
      this.prisma.activityLog.count({
        where: { createdAt: { gte: from, lte: to } },
      }),
      this.prisma.activityLog.count({
        where: { createdAt: { gte: from, lte: to }, success: false },
      }),
      this.prisma.activityLog.groupBy({
        by: ['category'],
        where: { createdAt: { gte: from, lte: to } },
        _count: { _all: true },
        orderBy: { _count: { category: 'desc' } },
      }),
      this.prisma.activityLog.groupBy({
        by: ['action', 'label'],
        where: { createdAt: { gte: from, lte: to } },
        _count: { _all: true },
        orderBy: { _count: { action: 'desc' } },
        take: 15,
      }),
    ]);

    return {
      total,
      failed,
      byCategory: byCategory.map((r) => ({
        category: r.category,
        count: r._count._all,
      })),
      topActions: topActions.map((r) => ({
        action: r.action,
        label: r.label,
        count: r._count._all,
      })),
    };
  }
}
