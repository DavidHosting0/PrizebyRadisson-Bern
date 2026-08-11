import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  Notification,
  NotificationType,
  Prisma,
  UserRole,
} from '@prisma/client';
import { hotelTodayIso, WS_EVENTS } from '@housekeeping/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PushService } from '../push/push.service';
import { DailyCleaningService } from '../assignments/daily-cleaning.service';
import { notificationLinkPath } from './notification-link-path';

type CreateNotificationInput = {
  userIds: string[];
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Prisma.InputJsonValue;
  /** When set, used for all recipients instead of role-based paths. */
  linkPath?: string;
};

@Injectable()
export class NotificationsService {
  private readonly log = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly push: PushService,
    private readonly dailyCleaning: DailyCleaningService,
  ) {}

  private toDto(row: Notification) {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      linkPath: row.linkPath,
      readAt: row.readAt?.toISOString() ?? null,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async listForUser(userId: string, limit = 50, unreadOnly = false) {
    const take = Math.min(Math.max(1, limit), 100);
    const rows = await this.prisma.notification.findMany({
      where: {
        userId,
        ...(unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return rows.map((r) => this.toDto(r));
  }

  async unreadCount(userId: string) {
    return this.prisma.notification.count({
      where: { userId, readAt: null },
    });
  }

  async markRead(id: string, userId: string) {
    const row = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!row) throw new NotFoundException();
    if (row.readAt) return this.toDto(row);
    const updated = await this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
    return this.toDto(updated);
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  /** Active housekeepers and supervisors (optionally excluding one user). */
  async housekeepingStaffIds(excludeUserId?: string): Promise<string[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: [UserRole.HOUSEKEEPER, UserRole.SUPERVISOR] },
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /**
   * Cleaners + HSK supervisors marked as working today (DailyWorkingStaff),
   * or on shift for the hotel day when no working-today list exists.
   */
  async workingHousekeepingStaffIds(excludeUserId?: string): Promise<string[]> {
    const { eligible } = await this.dailyCleaning.listEligibleCleaners(hotelTodayIso());
    return eligible.map((u) => u.id).filter((id) => id !== excludeUserId);
  }

  async createForUsers(input: CreateNotificationInput) {
    const uniqueIds = [...new Set(input.userIds)].filter(Boolean);
    if (uniqueIds.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueIds }, isActive: true },
      select: { id: true, role: true },
    });
    if (users.length === 0) return [];

    const created: Notification[] = [];
    for (const user of users) {
      const linkPath =
        input.linkPath ?? notificationLinkPath(user.role, input.type);
      const row = await this.prisma.notification.create({
        data: {
          userId: user.id,
          type: input.type,
          title: input.title,
          body: input.body,
          linkPath,
          metadata: input.metadata ?? Prisma.JsonNull,
        },
      });
      created.push(row);
      const dto = this.toDto(row);
      try {
        this.realtime.emitToUser(user.id, WS_EVENTS.NOTIFICATION_CREATED, dto);
      } catch (e) {
        this.log.warn(
          `notification socket failed for ${user.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      // Await push so delivery attempts finish before the request ends (retries inside PushService).
      try {
        await this.push.sendToUser(user.id, {
          title: input.title,
          body: input.body,
          linkPath,
        });
      } catch (e) {
        this.log.warn(
          `notification push failed for ${user.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    return created.map((r) => this.toDto(r));
  }

  async notifyServiceRequestCreated(
    req: {
      id: string;
      room: { roomNumber: string };
      type: { label: string };
      priority: string;
    },
    excludeUserId?: string,
  ) {
    const userIds = await this.workingHousekeepingStaffIds(excludeUserId);
    if (userIds.length === 0) {
      this.log.debug(
        `service request ${req.id}: no working housekeeping staff to notify`,
      );
      return [];
    }
    return this.createForUsers({
      userIds,
      type: NotificationType.SERVICE_REQUEST_CREATED,
      title: `New request — Room ${req.room.roomNumber}`,
      body: `${req.type.label} (${req.priority === 'URGENT' ? 'Urgent' : 'Normal'})`,
      metadata: {
        serviceRequestId: req.id,
        roomNumber: req.room.roomNumber,
        messageKey: 'serviceRequestCreated',
        messageParams: {
          roomNumber: req.room.roomNumber,
          typeLabel: req.type.label,
          priority: req.priority === 'URGENT' ? 'Urgent' : 'Normal',
        },
        bodyKey: 'serviceRequestBody',
        bodyParams: {
          typeLabel: req.type.label,
          priority: req.priority === 'URGENT' ? 'Urgent' : 'Normal',
        },
      },
    });
  }

  async notifyTeamChatMention(
    messageId: string,
    authorName: string,
    mentionedUserIds: string[],
    excludeUserId: string,
  ) {
    const userIds = mentionedUserIds.filter((id) => id !== excludeUserId);
    if (userIds.length === 0) return [];
    return this.createForUsers({
      userIds,
      type: NotificationType.TEAM_CHAT_MENTION,
      title: `${authorName} mentioned you`,
      body: 'Open team chat to read the message',
      metadata: {
        messageId,
        authorName,
        messageKey: 'teamChatMention',
        messageParams: { authorName },
        bodyKey: 'teamChatMentionBody',
      },
    });
  }
}
