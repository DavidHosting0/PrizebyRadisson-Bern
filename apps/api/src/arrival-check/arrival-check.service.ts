import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import type {
  ArrivalCheckCategoryCount,
  ArrivalCheckPaymentStatus,
  ArrivalCheckRunDetail,
  ArrivalCheckRunItem,
  ArrivalCheckRunSummary,
  ArrivalCheckScenario,
  ArrivalCheckSource,
  CheckInListTab,
  EmmaMoveFolioChargeResult,
  ReservationEmmaDetailBundle,
  ReservationEmmaFolioBundle,
  ReservationListItem,
} from '@housekeeping/shared';
import { ReservationsService } from '../reservations/reservations.service';
import { arrivalCheckCategoryLabel, formatHotelDateOnly, involvesArrivalCheckForbiddenFolio, isArrivalCheckForbiddenFolio } from '@housekeeping/shared';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SecretCipherService } from '../common/crypto/secret-cipher.service';
import {
  decryptSensitivePayload,
} from '../reservations/reservation-sensitive';
import { decryptDetailBundle } from '../reservations/reservation-detail-bundle';
import { EmmaService } from '../emma/emma.service';
import { buildArrivalCheckDecision, type ArrivalCheckDecision } from './arrival-check-rules';
import { planVccPayment } from './arrival-check-vcc';
import { crossCheckFolioAmount } from './arrival-check-payment-guard';
import { decryptFolioBundle } from '../reservations/reservation-folio-bundle';

type PaymentPhaseResult = {
  paymentStatus: ArrivalCheckPaymentStatus;
  paymentAmount: string | null;
  paymentExpectedAmount: string | null;
  paymentCardMask: string | null;
  paymentInvoice: string | null;
  paymentError: string | null;
  /** True when the reservation should stop and be listed for manual intervention. */
  manual: boolean;
  manualReason: string | null;
};

@Injectable()
export class ArrivalCheckService implements OnModuleInit {
  private readonly log = new Logger(ArrivalCheckService.name);
  /**
   * Service-wide guard: at most one `executeRun` may be processing items at a time.
   * Even across different runs / different HTTP requests / different users — because
   * everything ultimately drives the same EMMA HTTP session jar. Without this, two
   * parallel runs could load each other's folios into the shared jar between mutex'd
   * write calls and corrupt the payment context.
   */
  private executingRunId: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: SecretCipherService,
    private readonly emma: EmmaService,
    @Inject(forwardRef(() => ReservationsService))
    private readonly reservations: ReservationsService,
  ) {}

  /** After PM2 restart / crash: orphaned IN_PROGRESS items block forever without this. */
  async onModuleInit(): Promise<void> {
    const interrupted = await this.prisma.arrivalCheckRun.findMany({
      where: { status: 'RUNNING' },
      select: { id: true },
    });
    if (interrupted.length === 0) return;

    this.log.warn(
      `[ArrivalCheck] sealing ${interrupted.length} interrupted run(s) after process start (no auto-execute)`,
    );
    for (const run of interrupted) {
      await this.sealInterruptedRun(run.id);
    }
  }

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
    forceRerun = false,
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

    // Reservations whose arrival check already completed earlier: persist the
    // RunItem in status SKIPPED right away so the user sees "bereits erledigt"
    // instead of re-running the same EMMA operations — unless forceRerun.
    const previousBySnapshotId = forceRerun
      ? new Map<string, (typeof validSnapshots)[number]>()
      : new Map(
          validSnapshots
            .filter((s) => s.arrivalCheckCompletedAt)
            .map((s) => [s.reservationId, s] as const),
        );

    const run = await this.prisma.arrivalCheckRun.create({
      data: {
        hotelId: hid,
        createdByUserId: user.id,
        forceRerun,
        items: {
          create: uniqueIds.map((reservationId) => {
            const prev = previousBySnapshotId.get(reservationId);
            if (!prev || !prev.arrivalCheckCompletedAt) {
              return { reservationId, hotelId: hid };
            }
            const when = prev.arrivalCheckCompletedAt;
            return {
              reservationId,
              hotelId: hid,
              status: 'SKIPPED' as const,
              statusMessage: `Anreise-Check bereits am ${this.formatTimestamp(when)} durchgeführt – übersprungen.`,
              alreadyCompletedAt: when,
              alreadyCompletedRunId: prev.arrivalCheckLastRunId,
              startedAt: new Date(),
              finishedAt: new Date(),
            };
          }),
        },
      },
      include: {
        createdBy: { select: { id: true, name: true } },
        items: true,
      },
    });

    const allSkipped =
      run.items.length > 0 && run.items.every((i) => i.status === 'SKIPPED');
    if (allSkipped) {
      await this.refreshRunStatus(run.id);
      return this.getRun(run.id);
    }

    const hasActionable = run.items.some((i) => i.status === 'PENDING');
    if (hasActionable) {
      void this.executeRun(run.id).catch((err) => {
        this.log.error(
          `[ArrivalCheck] auto-execute failed for ${run.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });
    }

    return this.toDetail(run, validSnapshots);
  }

  private formatTimestamp(date: Date): string {
    try {
      return new Intl.DateTimeFormat('de-CH', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'Europe/Zurich',
      }).format(date);
    } catch {
      return date.toISOString();
    }
  }

  async listRuns(limit = 20): Promise<ArrivalCheckRunSummary[]> {
    const runs = await this.prisma.arrivalCheckRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: {
        createdBy: { select: { id: true, name: true } },
        items: {
          select: {
            status: true,
            source: true,
            scenario: true,
            categoryLabel: true,
            paymentStatus: true,
            alreadyCompletedAt: true,
          },
        },
      },
    });
    return runs.map((run) => this.toSummary(run));
  }

  async getRun(id: string): Promise<ArrivalCheckRunDetail> {
    const run = await this.prisma.arrivalCheckRun.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!run) throw new NotFoundException('Anreise-Check-Lauf nicht gefunden.');

    await this.sealInterruptedRun(id);
    return this.getRunWithoutResume(id);
  }

  /**
   * Items left IN_PROGRESS after a process crash / PM2 restart have no live worker.
   * Reset them to PENDING (or seal mid-payment rows) so executeRun can continue.
   */
  private async resetOrphanedInProgressItems(runId: string): Promise<number> {
    if (this.executingRunId === runId) return 0;

    const orphans = await this.prisma.arrivalCheckRunItem.findMany({
      where: { runId, status: 'IN_PROGRESS' },
    });
    if (orphans.length === 0) return 0;

    let reset = 0;
    for (const item of orphans) {
      if (item.paymentStatus === 'PLANNED') {
        await this.markItemUnsafeRetry(item.id);
        this.log.warn(
          `[ArrivalCheck] sealed orphaned mid-payment item ${item.reservationId} in run ${runId}`,
        );
        continue;
      }
      await this.prisma.arrivalCheckRunItem.update({
        where: { id: item.id },
        data: {
          status: 'PENDING',
          currentStep: null,
          statusMessage: 'Unterbrochen – wird fortgesetzt.',
          finishedAt: null,
        },
      });
      reset += 1;
    }
    if (reset > 0) {
      this.log.warn(`[ArrivalCheck] reset ${reset} orphaned IN_PROGRESS item(s) in run ${runId}`);
    }
    return reset;
  }

  /**
   * Items the automatic worker may pick without an explicit user retry.
   * NEEDS_MANUAL and FAILED are terminal until a human acts (retry-failed or new run).
   */
  private isQueuedForAutoProcess(item: {
    status: ArrivalCheckRunItem['status'];
    paymentStatus: string | null;
  }): boolean {
    return item.status === 'PENDING' && item.paymentStatus !== 'DECLINED';
  }

  private async isReservationInTodayArrivals(
    hotelId: string,
    reservationId: string,
  ): Promise<boolean> {
    const snap = await this.prisma.reservationSnapshot.findUnique({
      where: { hotelId_reservationId: { hotelId, reservationId } },
      select: { inTodayArrivals: true },
    });
    return snap?.inTodayArrivals === true;
  }

  private async markItemNoLongerArrival(itemId: string): Promise<void> {
    const msg = 'Nicht mehr in der EMMA-Anreiseliste – übersprungen.';
    await this.prisma.arrivalCheckRunItem.update({
      where: { id: itemId },
      data: {
        status: 'SKIPPED',
        currentStep: null,
        statusMessage: msg,
        finishedAt: new Date(),
      },
    });
  }

  /** Skip queue items whose reservation left today's EMMA arrivals tab. */
  private async skipItemsNoLongerInArrivals(runId: string, hotelId: string): Promise<number> {
    const pending = await this.prisma.arrivalCheckRunItem.findMany({
      where: { runId, status: 'PENDING' },
      select: { id: true, reservationId: true },
    });
    let skipped = 0;
    for (const item of pending) {
      if (await this.isReservationInTodayArrivals(hotelId, item.reservationId)) continue;
      await this.markItemNoLongerArrival(item.id);
      skipped += 1;
    }
    if (skipped > 0) {
      this.log.warn(
        `[ArrivalCheck] skipped ${skipped} stale item(s) in run ${runId} (no longer in arrivals list)`,
      );
    }
    return skipped;
  }

  /**
   * After restart or when viewing a run: reset orphans, drop stale queue items, seal
   * terminal runs. Never starts EMMA work — use executeRun explicitly.
   */
  private async sealInterruptedRun(runId: string): Promise<void> {
    if (this.executingRunId === runId) return;

    const run = await this.prisma.arrivalCheckRun.findUnique({
      where: { id: runId },
      select: { id: true, status: true, hotelId: true },
    });
    if (!run || run.status !== 'RUNNING') return;

    await this.resetOrphanedInProgressItems(runId);
    await this.skipItemsNoLongerInArrivals(runId, run.hotelId);
    await this.refreshRunStatus(runId);
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

    await this.resetOrphanedInProgressItems(runId);

    const runHotel = await this.prisma.arrivalCheckRun.findUnique({
      where: { id: runId },
      select: { hotelId: true },
    });
    if (runHotel) {
      await this.skipItemsNoLongerInArrivals(runId, runHotel.hotelId);
    }

    if (this.executingRunId && this.executingRunId !== runId) {
      throw new ConflictException(
        'Ein anderer Anreise-Check-Lauf wird gerade verarbeitet. Bitte warten.',
      );
    }
    if (this.executingRunId === runId) {
      return this.getRunWithoutResume(runId);
    }
    this.executingRunId = runId;

    await this.prisma.arrivalCheckRun.update({
      where: { id: runId },
      data: { status: 'RUNNING' },
    });

    try {
      while (true) {
        const runState = await this.prisma.arrivalCheckRun.findUnique({
          where: { id: runId },
          select: { status: true, forceRerun: true, hotelId: true },
        });
        if (!runState || runState.status === 'CANCELLED') {
          await this.skipPendingRunItems(runId, 'Lauf abgebrochen – nicht verarbeitet.');
          break;
        }

        const items = await this.prisma.arrivalCheckRunItem.findMany({
          where: { runId },
          orderBy: { reservationId: 'asc' },
        });
        const item = items.find((i) => this.isQueuedForAutoProcess(i));
        if (!item) break;

        if (item.paymentStatus === 'PLANNED') {
          await this.markItemUnsafeRetry(item.id);
          continue;
        }
        if (!runState.forceRerun) {
          const snap = await this.prisma.reservationSnapshot.findUnique({
            where: {
              hotelId_reservationId: {
                hotelId: runState.hotelId,
                reservationId: item.reservationId,
              },
            },
            select: { arrivalCheckCompletedAt: true, arrivalCheckLastRunId: true },
          });
          if (snap?.arrivalCheckCompletedAt) {
            await this.markItemAlreadyCompleted(
              item.id,
              snap.arrivalCheckCompletedAt,
              snap.arrivalCheckLastRunId,
            );
            continue;
          }
        }
        if (!(await this.isReservationInTodayArrivals(runState.hotelId, item.reservationId))) {
          await this.markItemNoLongerArrival(item.id);
          continue;
        }
        await this.processRunItem(runState.hotelId, item.id);
      }

      await this.refreshRunStatus(runId);
      return this.getRunWithoutResume(runId);
    } finally {
      this.executingRunId = null;
    }
  }

  /**
   * Reset FAILED items to PENDING and re-run them. NEEDS_MANUAL is never retried
   * automatically — fix EMMA manually or start a new run with force-rerun.
   */
  async retryFailedItems(runId: string): Promise<ArrivalCheckRunDetail> {
    const run = await this.prisma.arrivalCheckRun.findUnique({
      where: { id: runId },
      select: { id: true, status: true },
    });
    if (!run) throw new NotFoundException('Anreise-Check-Lauf nicht gefunden.');
    if (run.status === 'CANCELLED') {
      throw new BadRequestException('Abgebrochener Lauf kann nicht wiederholt werden.');
    }

    const retryable = await this.prisma.arrivalCheckRunItem.findMany({
      where: {
        runId,
        status: 'FAILED',
        paymentStatus: { notIn: ['DECLINED', 'PLANNED'] },
      },
      select: { id: true },
    });
    if (retryable.length === 0) {
      throw new BadRequestException(
        'Keine fehlgeschlagenen Reservierungen zum Wiederholen (DECLINED/PLANNED ausgeschlossen).',
      );
    }

    await this.prisma.arrivalCheckRunItem.updateMany({
      where: { id: { in: retryable.map((i) => i.id) } },
      data: {
        status: 'PENDING',
        currentStep: null,
        error: null,
        manualReason: null,
        statusMessage: null,
        startedAt: null,
        finishedAt: null,
        movesPlanned: 0,
        movesDone: 0,
        paymentStatus: null,
        paymentAmount: null,
        paymentExpectedAmount: null,
        paymentCardMask: null,
        paymentInvoice: null,
        paymentError: null,
      },
    });

    if (run.status !== 'RUNNING') {
      await this.prisma.arrivalCheckRun.update({
        where: { id: runId },
        data: { status: 'RUNNING', finishedAt: null },
      });
    }

    return this.executeRun(runId);
  }

  /** getRun without triggering another auto-resume (used from executeRun tail). */
  private async getRunWithoutResume(id: string): Promise<ArrivalCheckRunDetail> {
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

  /** Stop a running or queued arrival check. The current reservation (if any) still finishes for EMMA safety. */
  async cancelRun(runId: string): Promise<ArrivalCheckRunDetail> {
    const run = await this.prisma.arrivalCheckRun.findUnique({
      where: { id: runId },
      select: { id: true, status: true },
    });
    if (!run) throw new NotFoundException('Anreise-Check-Lauf nicht gefunden.');
    if (run.status === 'CANCELLED') return this.getRun(runId);
    if (run.status === 'COMPLETED' || run.status === 'FAILED') {
      throw new BadRequestException('Abgeschlossener Lauf kann nicht abgebrochen werden.');
    }

    await this.prisma.arrivalCheckRun.update({
      where: { id: runId },
      data: { status: 'CANCELLED', finishedAt: new Date() },
    });
    await this.skipPendingRunItems(runId, 'Lauf abgebrochen – nicht verarbeitet.');

    this.log.warn(`[ArrivalCheck] run ${runId} cancelled by user`);
    return this.getRun(runId);
  }

  private async skipPendingRunItems(runId: string, message: string): Promise<void> {
    const now = new Date();
    await this.prisma.arrivalCheckRunItem.updateMany({
      where: { runId, status: 'PENDING' },
      data: {
        status: 'SKIPPED',
        statusMessage: message,
        finishedAt: now,
      },
    });
  }

  /**
   * Convert a still-pending item into SKIPPED because the reservation's arrival
   * check is already on record as completed. Avoids running EMMA work twice.
   */
  private async markItemAlreadyCompleted(
    itemId: string,
    completedAt: Date,
    lastRunId: string | null,
  ): Promise<void> {
    const msg = `Anreise-Check bereits am ${this.formatTimestamp(completedAt)} durchgeführt – übersprungen.`;
    await this.prisma.arrivalCheckRunItem.update({
      where: { id: itemId },
      data: {
        status: 'SKIPPED',
        currentStep: null,
        statusMessage: msg,
        manualReason: null,
        error: null,
        alreadyCompletedAt: completedAt,
        alreadyCompletedRunId: lastRunId,
        finishedAt: new Date(),
      },
    });
  }

  /**
   * Hard-block an automatic re-run of an item that was mid-payment when it failed.
   * Once `paymentStatus === 'PLANNED'` we cannot prove the card was not charged,
   * so the item is sealed to NEEDS_MANUAL until a human checks EMMA.
   */
  private async markItemUnsafeRetry(itemId: string): Promise<void> {
    const reason =
      'Zahlung wurde bereits gestartet (Status PLANNED). Automatischer Wiederholungslauf gesperrt – ' +
      'bitte in EMMA prüfen, ob die VCC bereits belastet wurde, bevor erneut gestartet wird.';
    await this.prisma.arrivalCheckRunItem.update({
      where: { id: itemId },
      data: {
        status: 'NEEDS_MANUAL',
        currentStep: null,
        manualReason: reason,
        statusMessage: reason,
        finishedAt: new Date(),
      },
    });
  }

  /**
   * Hard cross-check before a move: the charge must (a) actually exist in the
   * locally-cached folio bundle for THIS reservation, (b) currently live on
   * the expected source folio, and (c) the bundle's reservation id must match.
   * Anything else means our plan and EMMA's reality disagree — we abort.
   * Folio 3 is never allowed as source or destination.
   */
  private assertChargeBelongsToReservation(
    folio: ReservationEmmaFolioBundle,
    reservationId: string,
    chargeRowId: string,
    sourceFolioId: string,
    destinationFolioId?: string,
  ): void {
    if (
      destinationFolioId != null &&
      involvesArrivalCheckForbiddenFolio(sourceFolioId, destinationFolioId)
    ) {
      throw new Error(
        `MANUAL: Folio 3 ist für den Anreise-Check gesperrt (Move ${sourceFolioId}→${destinationFolioId} von Posten ${chargeRowId} abgebrochen).`,
      );
    }
    if (isArrivalCheckForbiddenFolio(sourceFolioId)) {
      throw new Error(
        `MANUAL: Folio 3 ist für den Anreise-Check gesperrt (Quelle ${sourceFolioId}, Posten ${chargeRowId}) – Move abgebrochen.`,
      );
    }
    const folioRes = String(
      (folio.reservation as { ReservationId?: unknown } | undefined)?.ReservationId ?? '',
    ).trim();
    if (folioRes && folioRes !== reservationId.trim()) {
      throw new Error(
        `MANUAL: Geladenes Folio gehört zu Reservierung ${folioRes}, erwartet ${reservationId} – Move abgebrochen.`,
      );
    }
    const charges = folio.charges ?? [];
    const target = chargeRowId.trim();
    const match = charges.find((c) => (c.position ?? c.id ?? '').toString().trim() === target);
    if (!match) {
      throw new Error(
        `MANUAL: Posten ${target} nicht im aktuell geladenen Folio von ${reservationId} gefunden – Move abgebrochen.`,
      );
    }
    const actualFolio = String(match.folioId ?? '').padStart(2, '0');
    const expectedFolio = sourceFolioId.padStart(2, '0');
    if (actualFolio !== expectedFolio) {
      throw new Error(
        `MANUAL: Posten ${target} liegt auf Folio ${actualFolio}, geplant war Folio ${expectedFolio} – Move abgebrochen.`,
      );
    }
  }

  /** Move one folio charge via EMMA (used by arrival check and future scripts). */
  async moveFolioCharge(
    hotelId: string,
    reservationId: string,
    sourceFolioId: string,
    chargeRowId: string,
    destinationFolioId: string,
  ): Promise<EmmaMoveFolioChargeResult> {
    if (involvesArrivalCheckForbiddenFolio(sourceFolioId, destinationFolioId)) {
      throw new BadRequestException(
        `Folio 3 ist für den Anreise-Check gesperrt (${sourceFolioId}→${destinationFolioId}).`,
      );
    }
    return this.emma.moveFolioCharge({
      hotelId,
      reservationId,
      sourceFolioId,
      chargeRowId,
      destinationFolioId,
    });
  }

  /** Move multiple charges in one EMMA folio session (arrival check). */
  async moveFolioCharges(
    hotelId: string,
    reservationId: string,
    moves: Array<{
      sourceFolioId: string;
      chargeRowId: string;
      destinationFolioId: string;
    }>,
  ): Promise<EmmaMoveFolioChargeResult[]> {
    for (const move of moves) {
      if (involvesArrivalCheckForbiddenFolio(move.sourceFolioId, move.destinationFolioId)) {
        throw new BadRequestException(
          `Folio 3 ist für den Anreise-Check gesperrt (${move.sourceFolioId}→${move.destinationFolioId}, Posten ${move.chargeRowId}).`,
        );
      }
    }
    return this.emma.moveFolioCharges({
      hotelId,
      reservationId,
      moves,
    });
  }

  private async processRunItem(hotelId: string, itemId: string): Promise<void> {
    const item = await this.prisma.arrivalCheckRunItem.findUnique({
      where: { id: itemId },
      include: { run: { select: { forceRerun: true } } },
    });
    if (!item) return;

    if (item.run.forceRerun) {
      await this.prisma.reservationSnapshot.updateMany({
        where: { hotelId, reservationId: item.reservationId },
        data: {
          arrivalCheckCompletedAt: null,
          arrivalCheckLastRunId: null,
          arrivalCheckLastRunItemId: null,
        },
      });
    }

    await this.prisma.arrivalCheckRunItem.update({
      where: { id: itemId },
      data: {
        status: 'IN_PROGRESS',
        currentStep: 'FOLIO_LOAD',
        error: null,
        manualReason: null,
        movesDone: 0,
        paymentStatus: null,
        paymentAmount: null,
        paymentExpectedAmount: null,
        paymentCardMask: null,
        paymentInvoice: null,
        paymentError: null,
        statusMessage: 'Reservierungsdaten werden aus EMMA geladen …',
        startedAt: item.startedAt ?? new Date(),
        finishedAt: null,
      },
    });

    try {
      await this.reservations.fetchDetailFromEmma(item.reservationId, hotelId);
      await this.reservations.fetchFolioFromEmma(item.reservationId, hotelId);

      const snap = await this.prisma.reservationSnapshot.findUnique({
        where: {
          hotelId_reservationId: { hotelId, reservationId: item.reservationId },
        },
      });
      const folio = snap ? decryptFolioBundle(this.cipher, snap.folioEnc) : null;
      if (!folio) {
        throw new Error('Folio nach EMMA-Abruf nicht verfügbar.');
      }
      const detail = snap ? decryptDetailBundle(this.cipher, snap.detailEnc) : null;
      const sensitive = snap ? decryptSensitivePayload(this.cipher, snap.sensitiveEnc) : null;

      const decision = buildArrivalCheckDecision({ sensitive, detail, folio });
      const categoryLabel = arrivalCheckCategoryLabel(decision.source, decision.scenario);

      await this.prisma.arrivalCheckRunItem.update({
        where: { id: itemId },
        data: {
          currentStep: 'CHARGE_ASSIGN',
          source: decision.source,
          scenario: decision.scenario,
          categoryLabel,
          movesPlanned: decision.moves.length,
          statusMessage: this.classifyMessage(decision, categoryLabel),
        },
      });

      if (decision.requiresManual) {
        await this.prisma.arrivalCheckRunItem.update({
          where: { id: itemId },
          data: {
            status: 'NEEDS_MANUAL',
            currentStep: null,
            manualReason: decision.manualReason,
            statusMessage: decision.manualReason,
            finishedAt: new Date(),
          },
        });
        return;
      }

      let movesDone = 0;
      let workingFolioForMoves = folio;
      if (decision.moves.length > 0) {
        const beforeSnap = await this.prisma.reservationSnapshot.findUnique({
          where: { hotelId_reservationId: { hotelId, reservationId: item.reservationId } },
        });
        const beforeFolio = beforeSnap
          ? decryptFolioBundle(this.cipher, beforeSnap.folioEnc)
          : null;
        if (beforeFolio) workingFolioForMoves = beforeFolio;

        for (const move of decision.moves) {
          this.assertChargeBelongsToReservation(
            workingFolioForMoves,
            item.reservationId,
            move.chargeRowId,
            move.sourceFolioId,
            move.destinationFolioId,
          );
        }

        await this.prisma.arrivalCheckRunItem.update({
          where: { id: itemId },
          data: {
            statusMessage: `${decision.moves.length} Posten werden in einer EMMA-Sitzung verschoben …`,
          },
        });

        await this.moveFolioCharges(
          hotelId,
          item.reservationId,
          decision.moves.map((move) => ({
            sourceFolioId: move.sourceFolioId,
            chargeRowId: move.chargeRowId,
            destinationFolioId: move.destinationFolioId,
          })),
        );
        movesDone = decision.moves.length;
        await this.prisma.arrivalCheckRunItem.update({
          where: { id: itemId },
          data: { movesDone },
        });
      }

      let workingFolio: ReservationEmmaFolioBundle = folio;
      if (decision.moves.length > 0) {
        await this.reservations.fetchFolioFromEmma(item.reservationId, hotelId);
        const refreshedSnap = await this.prisma.reservationSnapshot.findUnique({
          where: { hotelId_reservationId: { hotelId, reservationId: item.reservationId } },
        });
        const refreshed = refreshedSnap
          ? decryptFolioBundle(this.cipher, refreshedSnap.folioEnc)
          : null;
        if (refreshed) workingFolio = refreshed;
      }

      const payment = await this.settleVccPayment(
        itemId,
        hotelId,
        item.reservationId,
        decision,
        detail,
        workingFolio,
      );

      if (payment.manual) {
        this.log.warn(`[ArrivalCheck] ${item.reservationId}: ${payment.manualReason}`);
        await this.prisma.arrivalCheckRunItem.update({
          where: { id: itemId },
          data: {
            status: 'NEEDS_MANUAL',
            currentStep: null,
            paymentStatus: payment.paymentStatus,
            paymentAmount: payment.paymentAmount,
            paymentExpectedAmount: payment.paymentExpectedAmount,
            paymentCardMask: payment.paymentCardMask,
            paymentInvoice: payment.paymentInvoice,
            paymentError: payment.paymentError,
            manualReason: payment.manualReason,
            statusMessage: payment.manualReason,
            movesDone,
            finishedAt: new Date(),
          },
        });
        return;
      }

      this.log.log(
        `[ArrivalCheck] ${item.reservationId}: ${categoryLabel}, ${movesDone}/${decision.moves.length} Posten verschoben` +
          (payment.paymentStatus === 'PAID'
            ? `, VCC belastet ${payment.paymentAmount}`
            : ''),
      );

      const completedAt = new Date();
      await this.prisma.arrivalCheckRunItem.update({
        where: { id: itemId },
        data: {
          status: 'COMPLETED',
          currentStep: null,
          paymentStatus: payment.paymentStatus,
          paymentAmount: payment.paymentAmount,
          paymentExpectedAmount: payment.paymentExpectedAmount,
          paymentCardMask: payment.paymentCardMask,
          paymentInvoice: payment.paymentInvoice,
          paymentError: null,
          statusMessage: this.completionMessage(decision, categoryLabel, movesDone, payment),
          finishedAt: completedAt,
        },
      });
      // Remember the completion on the reservation snapshot so that a future
      // arrival-check run on the same reservation can short-circuit to SKIPPED.
      await this.prisma.reservationSnapshot.updateMany({
        where: { hotelId, reservationId: item.reservationId },
        data: {
          arrivalCheckCompletedAt: completedAt,
          arrivalCheckLastRunItemId: itemId,
          arrivalCheckLastRunId: item.runId,
        },
      });
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      const isManual = raw.startsWith('MANUAL:');
      const message = isManual ? raw.slice('MANUAL:'.length).trim() : raw;
      const isLock = /blocked by|lock|session/i.test(message);

      // If we failed AFTER the plan was persisted, the gateway call may have hit
      // EMMA before the response was lost. We MUST NOT mark this FAILED (which
      // would allow auto-retry); always NEEDS_MANUAL so a human inspects EMMA.
      const current = await this.prisma.arrivalCheckRunItem.findUnique({
        where: { id: itemId },
        select: { paymentStatus: true },
      });
      const wasMidPayment = current?.paymentStatus === 'PLANNED';
      const manual = isManual || isLock || wasMidPayment;

      const lockMsg = isLock
        ? `EMMA-Sperre: ${message}. Bitte Reservierung manuell prüfen und ggf. die andere Sitzung schliessen.`
        : null;
      const midPaymentMsg = wasMidPayment
        ? `Fehler nach Zahlungsstart (${message}). Bitte in EMMA prüfen, ob die VCC bereits belastet wurde.`
        : null;

      await this.prisma.arrivalCheckRunItem.update({
        where: { id: itemId },
        data: {
          status: manual ? 'NEEDS_MANUAL' : 'FAILED',
          error: message,
          manualReason: lockMsg ?? midPaymentMsg ?? (isManual ? message : null),
          statusMessage:
            lockMsg ??
            midPaymentMsg ??
            (manual ? message : 'Fehler bei der Verarbeitung.'),
          currentStep: null,
          finishedAt: new Date(),
        },
      });
    }
  }

  /**
   * VCC settlement phase (runs after charges are routed). Charges the stored VCC
   * token; a decline is surfaced as manual intervention (never a silent success).
   */
  private async settleVccPayment(
    itemId: string,
    hotelId: string,
    reservationId: string,
    decision: ArrivalCheckDecision,
    detail: ReservationEmmaDetailBundle | null,
    folio: ReservationEmmaFolioBundle,
  ): Promise<PaymentPhaseResult> {
    await this.reservations.fetchFolioFromEmma(reservationId, hotelId);
    const freshSnap = await this.prisma.reservationSnapshot.findUnique({
      where: { hotelId_reservationId: { hotelId, reservationId } },
    });
    const paymentFolio =
      (freshSnap ? decryptFolioBundle(this.cipher, freshSnap.folioEnc) : null) ?? folio;

    // CROSS-CHECK: the refreshed folio must belong to the reservation we're paying.
    // Without this, an EMMA cache/session bleed could give us another reservation's
    // folio data — and we would compute the wrong amount on the wrong card.
    const folioResId = String(
      (paymentFolio.reservation as { ReservationId?: unknown } | undefined)?.ReservationId ?? '',
    ).trim();
    if (folioResId && folioResId !== reservationId.trim()) {
      const reason = `Folio gehört zu Reservierung ${folioResId}, erwartet ${reservationId} – Zahlung blockiert.`;
      this.log.error(`[ArrivalCheck-SAFETY] ${reason}`);
      return {
        paymentStatus: 'SKIPPED',
        paymentAmount: null,
        paymentExpectedAmount: null,
        paymentCardMask: null,
        paymentInvoice: null,
        paymentError: reason,
        manual: true,
        manualReason: reason,
      };
    }

    const plan = planVccPayment({ decision, detail, folio: paymentFolio });
    if (!plan) {
      return {
        paymentStatus: 'NOT_REQUIRED',
        paymentAmount: null,
        paymentExpectedAmount: null,
        paymentCardMask: null,
        paymentInvoice: null,
        paymentError: null,
        manual: false,
        manualReason: null,
      };
    }

    // Defence-in-depth: cross-check our computed plan amount against the EMMA
    // *displayed* folio totals (AmountDue / AmountPaid). If staff see one number
    // in EMMA and we compute another, NEVER charge. This blocks the worst case:
    // "charged the wrong amount because we mis-read the line items".
    const folioCheck = crossCheckFolioAmount(paymentFolio, plan.folioId, plan.amount);
    if (!folioCheck.ok) {
      this.log.error(`[ArrivalCheck-SAFETY] ${reservationId}: ${folioCheck.reason}`);
      return {
        paymentStatus: 'SKIPPED',
        paymentAmount: null,
        paymentExpectedAmount: plan.amount,
        paymentCardMask: null,
        paymentInvoice: null,
        paymentError: folioCheck.reason,
        manual: true,
        manualReason: folioCheck.reason,
      };
    }

    // Persist the plan BEFORE the EMMA call. If the server crashes mid-payment,
    // executeRun will see paymentStatus === 'PLANNED' and refuse to auto-retry.
    await this.prisma.arrivalCheckRunItem.update({
      where: { id: itemId },
      data: {
        currentStep: 'PREPAID_SETTLE',
        paymentStatus: 'PLANNED',
        paymentAmount: plan.amount,
        paymentExpectedAmount: plan.amount,
        statusMessage: `VCC wird belastet: ${plan.currency} ${plan.amount} auf Folio ${plan.folioId} …`,
      },
    });

    // Defence-in-depth read-back: re-read the persisted plan and compare with what
    // we computed in memory. A divergence here would mean someone changed the row
    // in parallel — we abort instead of paying.
    const persisted = await this.prisma.arrivalCheckRunItem.findUnique({
      where: { id: itemId },
      select: { paymentExpectedAmount: true, paymentStatus: true, reservationId: true },
    });
    if (
      !persisted ||
      persisted.paymentExpectedAmount !== plan.amount ||
      persisted.paymentStatus !== 'PLANNED' ||
      persisted.reservationId !== reservationId
    ) {
      const reason = 'Plan-Persistierung weicht ab – Zahlung aus Sicherheitsgründen abgebrochen.';
      this.log.error(
        `[ArrivalCheck-SAFETY] ${reason} expected=${plan.amount} stored=${persisted?.paymentExpectedAmount ?? '?'} resId=${persisted?.reservationId ?? '?'}`,
      );
      return {
        paymentStatus: 'SKIPPED',
        paymentAmount: null,
        paymentExpectedAmount: plan.amount,
        paymentCardMask: null,
        paymentInvoice: null,
        paymentError: reason,
        manual: true,
        manualReason: reason,
      };
    }

    const paySensitive = freshSnap
      ? decryptSensitivePayload(this.cipher, freshSnap.sensitiveEnc)
      : null;
    if (paySensitive?.draftStatus?.trim() || paySensitive?.draftLockedBy?.trim()) {
      this.log.warn(
        `[ArrivalCheck] ${reservationId}: open EMMA folio draft (${paySensitive.draftStatus ?? '—'} / ${paySensitive.draftLockedBy ?? '—'}) — clearing before VCC`,
      );
      await this.emma.clearStaleFolioPostBlock({ hotelId, reservationId });
    }

    const outcome = await this.emma.payFolioWithVcc({
      hotelId,
      reservationId,
      folioId: plan.folioId,
      amount: plan.amount,
      currency: plan.currency,
    });

    if (outcome.status === 'PAID') {
      return {
        paymentStatus: 'PAID',
        paymentAmount: outcome.amount ?? plan.amount,
        paymentExpectedAmount: outcome.expectedAmount ?? plan.amount,
        paymentCardMask: outcome.cardMask,
        paymentInvoice: outcome.invoiceNumber,
        paymentError: null,
        manual: false,
        manualReason: null,
      };
    }

    if (outcome.status === 'DECLINED') {
      const reason = `VCC abgelehnt: ${outcome.message ?? 'Zahlung nicht erfolgreich'}. Bitte manuell prüfen.`;
      return {
        paymentStatus: 'DECLINED',
        paymentAmount: outcome.amount ?? plan.amount,
        paymentExpectedAmount: outcome.expectedAmount ?? plan.amount,
        paymentCardMask: outcome.cardMask,
        paymentInvoice: outcome.invoiceNumber,
        paymentError: outcome.message ?? 'Zahlung abgelehnt',
        manual: true,
        manualReason: reason,
      };
    }

    // NO_VCC, AMBIGUOUS, UNSAFE — cannot charge safely.
    return {
      paymentStatus: 'SKIPPED',
      paymentAmount: null,
      paymentExpectedAmount: plan.amount,
      paymentCardMask: outcome.cardMask,
      paymentInvoice: null,
      paymentError: outcome.message,
      manual: true,
      manualReason: outcome.message ?? 'VCC-Zahlung nicht möglich – manuelle Prüfung nötig.',
    };
  }

  private classifyMessage(decision: ArrivalCheckDecision, categoryLabel: string): string {
    switch (decision.scenario) {
      case 'VCC':
        if (decision.source === 'CTRIP') {
          return `${categoryLabel} erkannt – alle Posten werden auf Folio 2 verschoben und die VCC dort belastet …`;
        }
        return `${categoryLabel} erkannt – Zimmer-/Verpflegungsposten werden auf das Firmen-Folio verschoben, City Tax und Hotel Tax verbleiben bzw. werden auf Folio 1 zusammengeführt …`;
      case 'PREPAID':
        return `${categoryLabel}: alle Posten werden auf Folio 1 zusammengeführt …`;
      case 'DIRECT':
        if (decision.source === 'CTRIP' || decision.source === 'APPSMEDIA_IOS') {
          return `${categoryLabel}: alle Posten werden auf Folio 2 zusammengeführt …`;
        }
        return `${categoryLabel}: alle Posten werden auf Folio 1 zusammengeführt …`;
      case 'FLEXIBLE':
        return `${categoryLabel}: keine Verschiebung nötig, Posten bereits korrekt auf Folio 1.`;
      default:
        return categoryLabel;
    }
  }

  private completionMessage(
    decision: ArrivalCheckDecision,
    categoryLabel: string,
    movesDone: number,
    payment?: PaymentPhaseResult,
  ): string {
    const paid =
      payment?.paymentStatus === 'PAID'
        ? ` VCC belastet: ${payment.paymentAmount}.`
        : '';
    if (decision.scenario === 'FLEXIBLE') {
      return `${categoryLabel}: keine Verschiebung nötig.${paid}`;
    }
    if (movesDone === 0) {
      return `${categoryLabel}: Posten bereits korrekt zugeordnet, keine Verschiebung nötig.${paid}`;
    }
    return `${categoryLabel}: ${movesDone} Posten erfolgreich verschoben.${paid}`;
  }

  private async refreshRunStatus(runId: string): Promise<void> {
    const run = await this.prisma.arrivalCheckRun.findUnique({
      where: { id: runId },
      select: { status: true },
    });
    if (run?.status === 'CANCELLED') {
      await this.skipPendingRunItems(runId, 'Lauf abgebrochen – nicht verarbeitet.');
      return;
    }

    const items = await this.prisma.arrivalCheckRunItem.findMany({
      where: { runId },
      select: { status: true },
    });
    const failed = items.some((i) => i.status === 'FAILED');
    const allDone = items.every(
      (i) =>
        i.status === 'COMPLETED' ||
        i.status === 'FAILED' ||
        i.status === 'SKIPPED' ||
        i.status === 'NEEDS_MANUAL',
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
    forceRerun?: boolean;
    status: ArrivalCheckRunDetail['status'];
    startedAt: Date;
    finishedAt: Date | null;
    createdBy: { id: string; name: string };
    items: {
      status: ArrivalCheckRunItem['status'];
      source?: string | null;
      scenario?: string | null;
      categoryLabel?: string | null;
      paymentStatus?: string | null;
      alreadyCompletedAt?: Date | null;
    }[];
  }): ArrivalCheckRunSummary {
    const pendingCount = run.items.filter(
      (i) => i.status === 'PENDING' || i.status === 'IN_PROGRESS',
    ).length;
    const completedCount = run.items.filter((i) => i.status === 'COMPLETED').length;
    const failedCount = run.items.filter((i) => i.status === 'FAILED').length;
    const skippedCount = run.items.filter((i) => i.status === 'SKIPPED').length;
    const manualCount = run.items.filter((i) => i.status === 'NEEDS_MANUAL').length;
    const paidCount = run.items.filter((i) => i.paymentStatus === 'PAID').length;
    const declinedCount = run.items.filter((i) => i.paymentStatus === 'DECLINED').length;
    const alreadyDoneCount = run.items.filter((i) => Boolean(i.alreadyCompletedAt)).length;
    return {
      id: run.id,
      hotelId: run.hotelId,
      forceRerun: run.forceRerun ?? false,
      status: run.status,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      createdByUserId: run.createdBy.id,
      createdByName: run.createdBy.name,
      itemCount: run.items.length,
      pendingCount,
      completedCount,
      failedCount,
      skippedCount,
      manualCount,
      paidCount,
      declinedCount,
      alreadyDoneCount,
      categoryCounts: this.buildCategoryCounts(run.items),
    };
  }

  private buildCategoryCounts(
    items: { source?: string | null; scenario?: string | null; categoryLabel?: string | null }[],
  ): ArrivalCheckCategoryCount[] {
    const map = new Map<string, ArrivalCheckCategoryCount>();
    for (const item of items) {
      if (!item.source || !item.scenario) continue;
      const source = item.source as ArrivalCheckSource;
      const scenario = item.scenario as ArrivalCheckScenario;
      const key = `${source}|${scenario}`;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, {
          source,
          scenario,
          label: item.categoryLabel ?? arrivalCheckCategoryLabel(source, scenario),
          count: 1,
        });
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
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
        source: string | null;
        scenario: string | null;
        categoryLabel: string | null;
        statusMessage: string | null;
        manualReason: string | null;
        movesPlanned: number;
        movesDone: number;
        paymentStatus: string | null;
        paymentAmount: string | null;
        paymentExpectedAmount: string | null;
        paymentCardMask: string | null;
        paymentInvoice: string | null;
        paymentError: string | null;
        alreadyCompletedAt: Date | null;
        alreadyCompletedRunId: string | null;
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
        source: (item.source as ArrivalCheckSource | null) ?? null,
        scenario: (item.scenario as ArrivalCheckScenario | null) ?? null,
        categoryLabel: item.categoryLabel ?? null,
        statusMessage: item.statusMessage ?? null,
        manualReason: item.manualReason ?? null,
        movesPlanned: item.movesPlanned ?? 0,
        movesDone: item.movesDone ?? 0,
        paymentStatus:
          (item.paymentStatus as ArrivalCheckPaymentStatus | null) ?? null,
        paymentAmount: item.paymentAmount ?? null,
        paymentExpectedAmount: item.paymentExpectedAmount ?? null,
        paymentCardMask: item.paymentCardMask ?? null,
        paymentInvoice: item.paymentInvoice ?? null,
        paymentError: item.paymentError ?? null,
        alreadyCompletedAt: item.alreadyCompletedAt?.toISOString() ?? null,
        alreadyCompletedRunId: item.alreadyCompletedRunId ?? null,
      };
    });
    return { ...summary, items };
  }
}
