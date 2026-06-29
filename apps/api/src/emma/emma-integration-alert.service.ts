import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type EmmaPushAlertState = {
  active: boolean;
  since: string | null;
  pendingCount: number;
  lastError: string | null;
};

const EMMA_PUSH_ALERT_KEY = 'emmaPushAlert';
const RETRY_MS = 30 * 60 * 1000;

@Injectable()
export class EmmaIntegrationAlertService {
  private readonly log = new Logger(EmmaIntegrationAlertService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async ensureRow() {
    let row = await this.prisma.hotelSettings.findFirst();
    if (!row) {
      row = await this.prisma.hotelSettings.create({ data: {} });
    }
    return row;
  }

  private readAlert(settings: unknown): EmmaPushAlertState {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return { active: false, since: null, pendingCount: 0, lastError: null };
    }
    const raw = (settings as Record<string, unknown>)[EMMA_PUSH_ALERT_KEY];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { active: false, since: null, pendingCount: 0, lastError: null };
    }
    const row = raw as Record<string, unknown>;
    return {
      active: row.active === true,
      since: typeof row.since === 'string' ? row.since : null,
      pendingCount: typeof row.pendingCount === 'number' ? row.pendingCount : 0,
      lastError: typeof row.lastError === 'string' ? row.lastError : null,
    };
  }

  async getState(): Promise<EmmaPushAlertState> {
    const row = await this.ensureRow();
    const pendingCount = await this.prisma.emmaRoomStatusPushOutbox.count({
      where: { resolvedAt: null },
    });
    const stored = this.readAlert(row.settings);
    return {
      ...stored,
      pendingCount,
      active: stored.active || pendingCount > 0,
    };
  }

  async syncFromOutbox(lastError?: string | null): Promise<EmmaPushAlertState> {
    const row = await this.ensureRow();
    const pendingCount = await this.prisma.emmaRoomStatusPushOutbox.count({
      where: { resolvedAt: null },
    });
    const prev = this.readAlert(row.settings);
    const settings = this.asRecord(row.settings);

    if (pendingCount === 0) {
      if (prev.active) {
        const next = { ...settings };
        delete next[EMMA_PUSH_ALERT_KEY];
        await this.prisma.hotelSettings.update({
          where: { id: row.id },
          data: { settings: next as object },
        });
      }
      return { active: false, since: null, pendingCount: 0, lastError: null };
    }

    const since = prev.since ?? new Date().toISOString();
    const alert: EmmaPushAlertState = {
      active: true,
      since,
      pendingCount,
      lastError: lastError ?? prev.lastError,
    };
    await this.prisma.hotelSettings.update({
      where: { id: row.id },
      data: {
        settings: {
          ...settings,
          [EMMA_PUSH_ALERT_KEY]: alert,
        } as object,
      },
    });
    return alert;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return { ...(value as Record<string, unknown>) };
  }
}

export { RETRY_MS as EMMA_PUSH_RETRY_MS };
