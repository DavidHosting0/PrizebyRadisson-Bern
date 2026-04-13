import { Injectable } from '@nestjs/common';
import {
  ChecklistTaskStatus,
  ServiceRequestStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(from: Date, to: Date) {
    const sessions = await this.prisma.cleaningSession.findMany({
      where: {
        startedAt: { gte: from, lte: to },
        completedAt: { not: null },
      },
    });
    const durations = sessions
      .filter((s) => s.completedAt)
      .map((s) => s.completedAt!.getTime() - s.startedAt.getTime());
    const avgCleanMs =
      durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    const requests = await this.prisma.serviceRequest.findMany({
      where: {
        status: ServiceRequestStatus.RESOLVED,
        resolvedAt: { gte: from, lte: to },
      },
    });
    const resolveTimes = requests
      .filter((r) => r.resolvedAt && r.claimedAt)
      .map((r) => r.resolvedAt!.getTime() - r.createdAt.getTime());
    const avgResolveMs =
      resolveTimes.length > 0
        ? resolveTimes.reduce((a, b) => a + b, 0) / resolveTimes.length
        : 0;

    const completedTasks = await this.prisma.roomChecklistTask.findMany({
      where: {
        status: ChecklistTaskStatus.COMPLETED,
        updatedAt: { gte: from, lte: to },
        updatedByUserId: { not: null },
      },
      select: { updatedByUserId: true },
    });
    const countByUser = new Map<string, number>();
    for (const t of completedTasks) {
      const uid = t.updatedByUserId!;
      countByUser.set(uid, (countByUser.get(uid) ?? 0) + 1);
    }

    const missed = await this.prisma.roomChecklistTask.count({
      where: {
        status: { not: ChecklistTaskStatus.COMPLETED },
        updatedAt: { gte: from, lte: to },
      },
    });

    const users = await this.prisma.user.findMany({
      where: { role: UserRole.HOUSEKEEPER },
      select: { id: true, name: true, titlePrefix: true },
    });
    const idToUser = Object.fromEntries(users.map((u) => [u.id, u]));

    return {
      period: { from, to },
      avgCleanTimeSeconds: Math.round(avgCleanMs / 1000),
      avgRequestResolveTimeSeconds: Math.round(avgResolveMs / 1000),
      tasksPerHousekeeper: [...countByUser.entries()].map(([userId, completedTasksCount]) => {
        const u = idToUser[userId];
        return {
          userId,
          name: u?.name ?? '—',
          titlePrefix: u?.titlePrefix ?? null,
          completedTasks: completedTasksCount,
        };
      }),
      incompleteTasksInPeriod: missed,
    };
  }
}
