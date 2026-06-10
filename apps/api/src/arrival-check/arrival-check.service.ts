import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import type {
  ArrivalCheckRunDetail,
  ArrivalCheckRunItem,
  ArrivalCheckRunSummary,
  CheckInListTab,
  EmmaMoveFolioChargeResult,
  ReservationListItem,
} from '@housekeeping/shared';
import { ReservationsService } from '../reservations/reservations.service';
import { formatHotelDateOnly } from '@housekeeping/shared';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SecretCipherService } from '../common/crypto/secret-cipher.service';
import {
  decryptSensitivePayload,
} from '../reservations/reservation-sensitive';
import { EmmaService } from '../emma/emma.service';
import { planGuestToCompanyChargeMoves } from './arrival-check-charge-assign';
import { decryptFolioBundle } from '../reservations/reservation-folio-bundle';

@Injectable()
export class ArrivalCheckService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: SecretCipherService,
    private readonly emma: EmmaService,
    @Inject(forwardRef(() => ReservationsService))
    private readonly reservations: ReservationsService,
  ) {}

  listCheckInTab(
    tab: CheckInListTab,
    q?: string,
    hotelId?: string,
  ): Promise<ReservationListItem[]> {
    return this.reservations.list({ tab, q, hotelId });
  }

  listArrivals(q?: string, hotelId?: string): Promise<ReservationListItem[]> {
    return this.listCheckInTab('arrivals', q, hotelId);
  }

  syncArrivals(date?: string) {
    return this.reservations.syncFromEmma(date);
  }

  private defaultHotelId(hotelId?: string): string {
    return hotelId?.trim() || process.env.EMMA_HOTEL_ID?.trim() || 'CHBRNPR';
  }

  private checkInArrivalsWhere(hotelId: string) {
    return {
      hotelId,
      inTodayArrivals: true,
    };
  }

  async createRun(
    user: User,
    reservationIds: string[],
    hotelId?: string,
  ): Promise<ArrivalCheckRunDetail> {
    const hid = this.defaultHotelId(hotelId);
    const uniqueIds = [...new Set(reservationIds.map((id) => id.trim()).filter(Boolean))];
    if (uniqueIds.length === 0) {
      throw new BadRequestException('Mindestens eine Reservierungsnummer erforderlich.');
    }

    const validSnapshots = await this.prisma.reservationSnapshot.findMany({
      where: {
        ...this.checkInArrivalsWhere(hid),
        reservationId: { in: uniqueIds },
      },
    });
    const validIdSet = new Set(validSnapshots.map((s) => s.reservationId));
    const invalidIds = uniqueIds.filter((id) => !validIdSet.has(id));
    if (invalidIds.length > 0) {
      throw new BadRequestException({
        message: 'Einige Reservierungen sind keine gültigen Anreisen in der EMMA Check-In-Liste.',
        invalidReservationIds: invalidIds,
      });
    }

    const run = await this.prisma.arrivalCheckRun.create({
      data: {
        hotelId: hid,
        createdByUserId: user.id,
        items: {
          create: uniqueIds.map((reservationId) => ({
            reservationId,
            hotelId: hid,
          })),
        },
      },
      include: {
        createdBy: { select: { id: true, name: true } },
        items: true,
      },
    });

    return this.toDetail(run, validSnapshots);
  }

  async listRuns(limit = 20): Promise<ArrivalCheckRunSummary[]> {
    const runs = await this.prisma.arrivalCheckRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: {
        createdBy: { select: { id: true, name: true } },
        items: { select: { status: true } },
      },
    });
    return runs.map((run) => this.toSummary(run));
  }

  async getRun(id: string): Promise<ArrivalCheckRunDetail> {
    const run = await this.prisma.arrivalCheckRun.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true } },
        items: { orderBy: { reservationId: 'asc' } },
      },
    });
    if (!run) throw new NotFoundException('Anreise-Check-Lauf nicht gefunden.');

    const reservationIds = run.items.map((i) => i.reservationId);
    const snapshots =
      reservationIds.length > 0
        ? await this.prisma.reservationSnapshot.findMany({
            where: { hotelId: run.hotelId, reservationId: { in: reservationIds } },
          })
        : [];

    return this.toDetail(run, snapshots);
  }

  /** Process pending run items: load folio, move misassigned charges, refresh folio. */
  async executeRun(runId: string): Promise<ArrivalCheckRunDetail> {
    const run = await this.prisma.arrivalCheckRun.findUnique({
      where: { id: runId },
      include: {
        createdBy: { select: { id: true, name: true } },
        items: { orderBy: { reservationId: 'asc' } },
      },
    });
    if (!run) throw new NotFoundException('Anreise-Check-Lauf nicht gefunden.');
    if (run.status === 'CANCELLED') {
      throw new BadRequestException('Abgebrochener Lauf kann nicht ausgeführt werden.');
    }

    for (const item of run.items) {
      if (item.status !== 'PENDING' && item.status !== 'FAILED') continue;
      await this.processRunItem(run.hotelId, item.id);
    }

    await this.refreshRunStatus(runId);
    return this.getRun(runId);
  }

  /** Move one folio charge via EMMA (used by arrival check and future scripts). */
  async moveFolioCharge(
    hotelId: string,
    reservationId: string,
    sourceFolioId: string,
    chargeRowId: string,
    destinationFolioId: string,
  ): Promise<EmmaMoveFolioChargeResult> {
    return this.emma.moveFolioCharge({
      hotelId,
      reservationId,
      sourceFolioId,
      chargeRowId,
      destinationFolioId,
    });
  }

  private async processRunItem(hotelId: string, itemId: string): Promise<void> {
    const item = await this.prisma.arrivalCheckRunItem.findUnique({ where: { id: itemId } });
    if (!item) return;

    await this.prisma.arrivalCheckRunItem.update({
      where: { id: itemId },
      data: {
        status: 'IN_PROGRESS',
        currentStep: 'FOLIO_LOAD',
        error: null,
        startedAt: item.startedAt ?? new Date(),
        finishedAt: null,
      },
    });

    try {
      await this.reservations.fetchFolioFromEmma(item.reservationId, hotelId);

      await this.prisma.arrivalCheckRunItem.update({
        where: { id: itemId },
        data: { currentStep: 'CHARGE_ASSIGN' },
      });

      const snap = await this.prisma.reservationSnapshot.findUnique({
        where: {
          hotelId_reservationId: { hotelId, reservationId: item.reservationId },
        },
      });
      const bundle = snap ? decryptFolioBundle(this.cipher, snap.folioEnc) : null;
      if (!bundle) {
        throw new Error('Folio nach EMMA-Abruf nicht verfügbar.');
      }

      const moves = planGuestToCompanyChargeMoves(bundle);
      for (const move of moves) {
        await this.moveFolioCharge(
          hotelId,
          item.reservationId,
          move.sourceFolioId,
          move.chargeRowId,
          move.destinationFolioId,
        );
      }

      if (moves.length > 0) {
        await this.reservations.fetchFolioFromEmma(item.reservationId, hotelId);
      }

      await this.prisma.arrivalCheckRunItem.update({
        where: { id: itemId },
        data: {
          status: 'COMPLETED',
          currentStep: null,
          finishedAt: new Date(),
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.arrivalCheckRunItem.update({
        where: { id: itemId },
        data: {
          status: 'FAILED',
          error: message,
          finishedAt: new Date(),
        },
      });
    }
  }

  private async refreshRunStatus(runId: string): Promise<void> {
    const items = await this.prisma.arrivalCheckRunItem.findMany({
      where: { runId },
      select: { status: true },
    });
    const pending = items.some((i) => i.status === 'PENDING' || i.status === 'IN_PROGRESS');
    const failed = items.some((i) => i.status === 'FAILED');
    const allDone = items.every(
      (i) => i.status === 'COMPLETED' || i.status === 'FAILED' || i.status === 'SKIPPED',
    );
    if (!allDone) return;

    await this.prisma.arrivalCheckRun.update({
      where: { id: runId },
      data: {
        status: failed ? 'FAILED' : 'COMPLETED',
        finishedAt: new Date(),
      },
    });
  }

  private toSummary(run: {
    id: string;
    hotelId: string;
    status: ArrivalCheckRunDetail['status'];
    startedAt: Date;
    finishedAt: Date | null;
    createdBy: { id: string; name: string };
    items: { status: ArrivalCheckRunItem['status'] }[];
  }): ArrivalCheckRunSummary {
    const pendingCount = run.items.filter((i) => i.status === 'PENDING').length;
    const completedCount = run.items.filter((i) => i.status === 'COMPLETED').length;
    const failedCount = run.items.filter((i) => i.status === 'FAILED').length;
    return {
      id: run.id,
      hotelId: run.hotelId,
      status: run.status,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      createdByUserId: run.createdBy.id,
      createdByName: run.createdBy.name,
      itemCount: run.items.length,
      pendingCount,
      completedCount,
      failedCount,
    };
  }

  private toDetail(
    run: {
      id: string;
      hotelId: string;
      status: ArrivalCheckRunDetail['status'];
      startedAt: Date;
      finishedAt: Date | null;
      createdBy: { id: string; name: string };
      items: {
        id: string;
        reservationId: string;
        hotelId: string;
        status: ArrivalCheckRunItem['status'];
        currentStep: ArrivalCheckRunItem['currentStep'];
        error: string | null;
        startedAt: Date | null;
        finishedAt: Date | null;
      }[];
    },
    snapshots: {
      reservationId: string;
      roomId: string | null;
      arrivalDate: Date;
      departureDate: Date;
      roomType: string | null;
      numPax: number | null;
      sensitiveEnc: string;
    }[],
  ): ArrivalCheckRunDetail {
    const snapshotByReservationId = new Map(snapshots.map((s) => [s.reservationId, s]));
    const summary = this.toSummary(run);
    const items: ArrivalCheckRunItem[] = run.items.map((item) => {
      const snap = snapshotByReservationId.get(item.reservationId);
      const sensitive = snap
        ? decryptSensitivePayload(this.cipher, snap.sensitiveEnc)
        : null;
      return {
        id: item.id,
        reservationId: item.reservationId,
        hotelId: item.hotelId,
        status: item.status,
        currentStep: item.currentStep,
        error: item.error,
        startedAt: item.startedAt?.toISOString() ?? null,
        finishedAt: item.finishedAt?.toISOString() ?? null,
        mainGuestName: sensitive?.mainGuestName ?? null,
        roomId: snap?.roomId ?? null,
        arrivalDate: snap ? formatHotelDateOnly(snap.arrivalDate) : '',
        departureDate: snap ? formatHotelDateOnly(snap.departureDate) : '',
        roomType: snap?.roomType ?? null,
        numPax: snap?.numPax ?? null,
      };
    });
    return { ...summary, items };
  }
}
