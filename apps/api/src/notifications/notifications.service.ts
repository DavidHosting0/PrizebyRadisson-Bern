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
import {
  formatNameList,
  notificationLocale,
  t,
  type NotificationMessageKey,
} from './notification-i18n';

type CreateNotificationInput = {
  userIds: string[];
  type: NotificationType;
  /** Title template key resolved per recipient locale. */
  titleKey: NotificationMessageKey;
  titleParams?: Record<string, string>;
  /** Body template key; when omitted, `bodyText` / snippet is used as-is. */
  bodyKey?: NotificationMessageKey;
  bodyParams?: Record<string, string>;
  /** Raw body text (e.g. chat snippet) when no bodyKey — not localized. */
  bodyText?: string;
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
      select: { id: true, role: true, preferredLocale: true },
    });
    if (users.length === 0) return [];

    const titleParams = input.titleParams ?? {};

    const created: Notification[] = [];
    for (const user of users) {
      const locale = notificationLocale(user.preferredLocale);
      const title = t(locale, input.titleKey, titleParams);
      const bodyParams = this.resolveBodyParams(locale, input.bodyParams);
      const body = input.bodyKey
        ? t(locale, input.bodyKey, bodyParams)
        : (input.bodyText ?? '');

      const linkPath =
        input.linkPath ?? notificationLinkPath(user.role, input.type);
      const row = await this.prisma.notification.create({
        data: {
          userId: user.id,
          type: input.type,
          title,
          body,
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
      try {
        await this.push.sendToUser(user.id, {
          title,
          body,
          linkPath,
          tag: `hk-${input.type}`,
        });
      } catch (e) {
        this.log.warn(
          `notification push failed for ${user.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    return created.map((r) => this.toDto(r));
  }

  /** Resolve priorityKey → localized priority label for body templates. */
  private resolveBodyParams(
    locale: string,
    params?: Record<string, string>,
  ): Record<string, string> {
    if (!params) return {};
    const out = { ...params };
    const pk = out.priorityKey;
    if (pk === 'priorityUrgent' || pk === 'priorityNormal') {
      out.priority = t(locale, pk);
      delete out.priorityKey;
    }
    return out;
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
    const priorityKey: NotificationMessageKey =
      req.priority === 'URGENT' ? 'priorityUrgent' : 'priorityNormal';

    return this.createForUsers({
      userIds,
      type: NotificationType.SERVICE_REQUEST_CREATED,
      titleKey: 'serviceRequestCreated',
      titleParams: {
        roomNumber: req.room.roomNumber,
        typeLabel: req.type.label,
      },
      bodyKey: 'serviceRequestBody',
      bodyParams: {
        typeLabel: req.type.label,
        priorityKey,
      },
      metadata: {
        serviceRequestId: req.id,
        roomNumber: req.room.roomNumber,
        messageKey: 'serviceRequestCreated',
        messageParams: {
          roomNumber: req.room.roomNumber,
          typeLabel: req.type.label,
        },
        bodyKey: 'serviceRequestBody',
        bodyParams: {
          typeLabel: req.type.label,
          priorityKey,
        },
      },
    });
  }

  private chatPreviewSnippet(preview?: string): string {
    return (preview ?? '').replace(/\s+/g, ' ').trim().slice(0, 140);
  }

  private chatBodyOptions(preview?: string, hasPhoto = false) {
    const snippet = this.chatPreviewSnippet(preview);
    if (snippet) {
      return { bodyText: snippet } as const;
    }
    if (hasPhoto) {
      return { bodyKey: 'teamChatPhoto' as const, bodyParams: {} };
    }
    return { bodyKey: 'teamChatMentionBody' as const, bodyParams: {} };
  }

  /** Explicit @mention of the recipient — "You were mentioned by X". */
  async notifyTeamChatMention(
    messageId: string,
    authorName: string,
    mentionedUserIds: string[],
    excludeUserId: string,
    preview?: string,
    hasPhoto = false,
  ) {
    const userIds = mentionedUserIds.filter((id) => id !== excludeUserId);
    if (userIds.length === 0) return [];
    const bodyOpts = this.chatBodyOptions(preview, hasPhoto);
    return this.createForUsers({
      userIds,
      type: NotificationType.TEAM_CHAT_MENTION,
      titleKey: 'teamChatMention',
      titleParams: { authorName },
      ...bodyOpts,
      metadata: {
        messageId,
        authorName,
        messageKey: 'teamChatMention',
        messageParams: { authorName },
        ...(bodyOpts.bodyKey
          ? { bodyKey: bodyOpts.bodyKey, bodyParams: bodyOpts.bodyParams ?? {} }
          : {}),
      },
    });
  }

  /**
   * Bystander when message has @mentions — "X mentioned Y".
   * `mentionedNames` are display names of the mentioned users.
   */
  async notifyTeamChatMentionOther(
    messageId: string,
    authorName: string,
    mentionedNames: string[],
    recipientUserIds: string[],
    excludeUserId: string,
    preview?: string,
    hasPhoto = false,
  ) {
    const userIds = recipientUserIds.filter((id) => id !== excludeUserId);
    if (userIds.length === 0 || mentionedNames.length === 0) return [];
    const bodyOpts = this.chatBodyOptions(preview, hasPhoto);
    return this.createLocalizedMentionOther({
      messageId,
      authorName,
      mentionedNames,
      userIds,
      bodyOpts,
    });
  }

  private async createLocalizedMentionOther(opts: {
    messageId: string;
    authorName: string;
    mentionedNames: string[];
    userIds: string[];
    bodyOpts: ReturnType<NotificationsService['chatBodyOptions']>;
  }) {
    const uniqueIds = [...new Set(opts.userIds)].filter(Boolean);
    if (uniqueIds.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueIds }, isActive: true },
      select: { id: true, role: true, preferredLocale: true },
    });
    if (users.length === 0) return [];

    const created: Notification[] = [];
    for (const user of users) {
      const locale = notificationLocale(user.preferredLocale);
      const mentionedNames = formatNameList(locale, opts.mentionedNames);
      const title = t(locale, 'teamChatMentionOther', {
        authorName: opts.authorName,
        mentionedNames,
      });
      const body = opts.bodyOpts.bodyKey
        ? t(locale, opts.bodyOpts.bodyKey, opts.bodyOpts.bodyParams ?? {})
        : (opts.bodyOpts.bodyText ?? '');

      const linkPath = notificationLinkPath(user.role, NotificationType.TEAM_CHAT_MENTION);
      const metadata = {
        messageId: opts.messageId,
        authorName: opts.authorName,
        mentionedNameList: opts.mentionedNames,
        messageKey: 'teamChatMentionOther',
        messageParams: {
          authorName: opts.authorName,
          mentionedNames,
        },
        ...(opts.bodyOpts.bodyKey
          ? {
              bodyKey: opts.bodyOpts.bodyKey,
              bodyParams: opts.bodyOpts.bodyParams ?? {},
            }
          : {}),
      };

      const row = await this.prisma.notification.create({
        data: {
          userId: user.id,
          type: NotificationType.TEAM_CHAT_MENTION,
          title,
          body,
          linkPath,
          metadata,
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
      try {
        await this.push.sendToUser(user.id, {
          title,
          body,
          linkPath,
          tag: `hk-${NotificationType.TEAM_CHAT_MENTION}`,
        });
      } catch (e) {
        this.log.warn(
          `notification push failed for ${user.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    return created.map((r) => this.toDto(r));
  }

  /** Broadcast chat message without mentions — "{author} wrote". */
  async notifyTeamChatMessage(
    messageId: string,
    authorName: string,
    recipientUserIds: string[],
    excludeUserId: string,
    preview?: string,
    hasPhoto = false,
  ) {
    const userIds = recipientUserIds.filter((id) => id !== excludeUserId);
    if (userIds.length === 0) return [];
    const bodyOpts = this.chatBodyOptions(preview, hasPhoto);
    return this.createForUsers({
      userIds,
      type: NotificationType.TEAM_CHAT_MENTION,
      titleKey: 'teamChatMessage',
      titleParams: { authorName },
      ...bodyOpts,
      metadata: {
        messageId,
        authorName,
        messageKey: 'teamChatMessage',
        messageParams: { authorName },
        ...(bodyOpts.bodyKey
          ? { bodyKey: bodyOpts.bodyKey, bodyParams: bodyOpts.bodyParams ?? {} }
          : {}),
      },
    });
  }
}
