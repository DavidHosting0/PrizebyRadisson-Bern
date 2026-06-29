import { Injectable } from '@nestjs/common';
import type { EmmaBackupModeReason, EmmaBackupModeState } from '@housekeeping/shared';
import { PrismaService } from '../prisma/prisma.service';
import { EmmaIntegrationAlertService } from './emma-integration-alert.service';

const EMMA_BACKUP_MODE_KEY = 'emmaBackupMode';

type EmmaBackupModeStored = {
  manual?: boolean;
  setAt?: string;
  setBy?: string;
};

@Injectable()
export class EmmaBackupModeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrationAlert: EmmaIntegrationAlertService,
  ) {}

  private async ensureRow() {
    let row = await this.prisma.hotelSettings.findFirst();
    if (!row) {
      row = await this.prisma.hotelSettings.create({ data: {} });
    }
    return row;
  }

  private readStored(settings: unknown): EmmaBackupModeStored {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return {};
    const raw = (settings as Record<string, unknown>)[EMMA_BACKUP_MODE_KEY];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const row = raw as Record<string, unknown>;
    return {
      manual: row.manual === true,
      setAt: typeof row.setAt === 'string' ? row.setAt : undefined,
      setBy: typeof row.setBy === 'string' ? row.setBy : undefined,
    };
  }

  async getManualState(): Promise<EmmaBackupModeStored> {
    const row = await this.ensureRow();
    return this.readStored(row.settings);
  }

  async setManual(active: boolean, userId: string): Promise<EmmaBackupModeStored> {
    const row = await this.ensureRow();
    const settings = this.asRecord(row.settings);
    const next: EmmaBackupModeStored = active
      ? { manual: true, setAt: new Date().toISOString(), setBy: userId }
      : { manual: false };

    if (active) {
      settings[EMMA_BACKUP_MODE_KEY] = next;
    } else {
      delete settings[EMMA_BACKUP_MODE_KEY];
    }

    await this.prisma.hotelSettings.update({
      where: { id: row.id },
      data: { settings: settings as object },
    });
    return next;
  }

  async getState(): Promise<EmmaBackupModeState> {
    const [pushAlert, manual, lastSyncRun] = await Promise.all([
      this.integrationAlert.getState(),
      this.getManualState(),
      this.prisma.reservationSyncRun.findFirst({ orderBy: { startedAt: 'desc' } }),
    ]);

    const reasons: EmmaBackupModeReason[] = [];
    const sinceCandidates: string[] = [];

    if (pushAlert.active) {
      reasons.push('push');
      if (pushAlert.since) sinceCandidates.push(pushAlert.since);
    }

    if (lastSyncRun?.status === 'error') {
      reasons.push('reservation_sync');
      if (lastSyncRun.finishedAt) {
        sinceCandidates.push(lastSyncRun.finishedAt.toISOString());
      }
    }

    if (manual.manual) {
      reasons.push('manual');
      if (manual.setAt) sinceCandidates.push(manual.setAt);
    }

    const since =
      sinceCandidates.length > 0
        ? sinceCandidates.sort((a, b) => a.localeCompare(b))[0]!
        : null;

    return {
      active: reasons.length > 0,
      reasons,
      since,
      manual: manual.manual === true,
    };
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return { ...(value as Record<string, unknown>) };
  }
}
