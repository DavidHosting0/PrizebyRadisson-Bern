import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  EMMA_PUSH_RETRY_MS,
  EmmaIntegrationAlertService,
} from './emma-integration-alert.service';
import { EmmaService } from './emma.service';
import type { EmmaRoomStatusCode } from './emma-room-status-push';

const MAX_ATTEMPTS = 48;

@Injectable()
export class EmmaPushOutboxService {
  private readonly log = new Logger(EmmaPushOutboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alert: EmmaIntegrationAlertService,
    @Inject(forwardRef(() => EmmaService))
    private readonly emma: EmmaService,
  ) {}

  async enqueue(
    roomId: string,
    targetCode: EmmaRoomStatusCode,
    source: string,
    actionAt: Date,
    error: string,
  ): Promise<void> {
    const nextRetryAt = new Date(Date.now() + EMMA_PUSH_RETRY_MS);
    const existing = await this.prisma.emmaRoomStatusPushOutbox.findFirst({
      where: { roomId, resolvedAt: null },
    });
    if (existing) {
      await this.prisma.emmaRoomStatusPushOutbox.update({
        where: { id: existing.id },
        data: {
          targetCode,
          source,
          actionAt,
          lastError: error,
          nextRetryAt,
        },
      });
    } else {
      await this.prisma.emmaRoomStatusPushOutbox.create({
        data: {
          roomId,
          targetCode,
          source,
          actionAt,
          lastError: error,
          nextRetryAt,
        },
      });
    }
    await this.alert.syncFromOutbox(error);
  }

  async pendingCount(): Promise<number> {
    return this.prisma.emmaRoomStatusPushOutbox.count({ where: { resolvedAt: null } });
  }

  async processDue(): Promise<void> {
    const due = await this.prisma.emmaRoomStatusPushOutbox.findMany({
      where: {
        resolvedAt: null,
        nextRetryAt: { lte: new Date() },
        attempts: { lt: MAX_ATTEMPTS },
      },
      orderBy: { nextRetryAt: 'asc' },
      take: 20,
    });

    for (const entry of due) {
      try {
        await this.prisma.emmaRoomStatusPushOutbox.update({
          where: { id: entry.id },
          data: { attempts: { increment: 1 } },
        });

        const target =
          entry.targetCode === 'CL'
            ? 'CLEAN'
            : entry.targetCode === 'IN'
              ? 'INSPECTED'
              : 'DIRTY';

        const result = await this.emma.pushRoomStatus(entry.roomId, target, {
          actionAt: entry.actionAt,
          source: `outbox:${entry.source}`,
          fromOutbox: true,
        });

        if (result.ok) {
          await this.prisma.emmaRoomStatusPushOutbox.update({
            where: { id: entry.id },
            data: { resolvedAt: new Date() },
          });
          await this.alert.syncFromOutbox();
          this.log.log(`[EMMA] outbox retry OK room=${entry.roomId} → ${entry.targetCode}`);
        } else if (!result.skipped) {
          await this.prisma.emmaRoomStatusPushOutbox.update({
            where: { id: entry.id },
            data: {
              lastError: result.error ?? 'unknown',
              nextRetryAt: new Date(Date.now() + EMMA_PUSH_RETRY_MS),
            },
          });
          await this.alert.syncFromOutbox(result.error ?? null);
        }
      } catch (err) {
        const msg = (err as Error).message;
        this.log.warn(`[EMMA] outbox retry error room=${entry.roomId}: ${msg}`);
        try {
          await this.prisma.emmaRoomStatusPushOutbox.update({
            where: { id: entry.id },
            data: {
              lastError: msg,
              nextRetryAt: new Date(Date.now() + EMMA_PUSH_RETRY_MS),
            },
          });
          await this.alert.syncFromOutbox(msg);
        } catch (inner) {
          this.log.warn(`[EMMA] outbox bookkeeping failed: ${(inner as Error).message}`);
        }
      }
    }
  }
}
