import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ReservationDetail,
  ReservationListItem,
  ReservationOverview,
  ReservationSyncStatus,
  ReservationTab,
} from '@housekeeping/shared';
import { compareRoomNumbers } from '@housekeeping/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SecretCipherService } from '../common/crypto/secret-cipher.service';
import { EmmaService } from '../emma/emma.service';
import type { EmmaReservationSyncResult, ReservationUpsertRow } from '../emma/emma-reservation-sync';
import {
  decryptSensitivePayload,
  todayIsoDate,
  dateOnlyFromIso,
} from './reservation-sensitive';
import {
  decryptDetailBundle,
  encryptDetailBundle,
} from './reservation-detail-bundle';
import {
  decryptFolioBundle,
  encryptFolioBundle,
} from './reservation-folio-bundle';

@Injectable()
export class ReservationsService {
  private readonly log = new Logger(ReservationsService.name);
  private syncInProgress = false;
  private viewDebounce: ReturnType<typeof setTimeout> | null = null;
  private viewSyncNotBefore = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: SecretCipherService,
    private readonly emma: EmmaService,
  ) {}

  scheduleSyncOnView(source: string): void {
    if (process.env.EMMA_RESERVATION_AUTO_SYNC === 'false') return;
    if (this.syncInProgress) return;
    const now = Date.now();
    if (now < this.viewSyncNotBefore) return;
    if (this.viewDebounce) return;

    const debounceMs = parseInt(process.env.EMMA_VIEW_SYNC_DEBOUNCE_MS ?? '5000', 10);
    const minIntervalMs = parseInt(
      process.env.EMMA_RESERVATION_VIEW_SYNC_MIN_INTERVAL_MS ?? '90000',
      10,
    );

    this.viewDebounce = setTimeout(() => {
      this.viewDebounce = null;
      if (Date.now() < this.viewSyncNotBefore) return;
      this.viewSyncNotBefore = Date.now() + minIntervalMs;
      void this.runBackgroundSync('view', source);
    }, debounceMs);
  }

  async runBackgroundSync(trigger: 'cron' | 'view' | 'manual', source?: string): Promise<void> {
    if (process.env.EMMA_RESERVATION_AUTO_SYNC === 'false' && trigger !== 'manual') return;
    if (this.syncInProgress) return;
    this.syncInProgress = true;
    const label = source ? `${trigger}:${source}` : trigger;
    try {
      await this.syncFromEmma(undefined, label);
    } catch (err) {
      this.log.warn(`[Reservations] background sync failed (${label}): ${(err as Error).message}`);
    } finally {
      this.syncInProgress = false;
    }
  }

  async syncFromEmma(
    arrivalDateIso?: string,
    triggerLabel = 'manual',
  ): Promise<EmmaReservationSyncResult> {
    const run = await this.prisma.reservationSyncRun.create({
      data: { status: 'running', tab: triggerLabel },
    });
    try {
      const dateIso = arrivalDateIso?.trim() || todayIsoDate();
      const { rows, arrivalsReservationIds, result } =
        await this.emma.fetchReservationRowsFromEmma({ arrivalDateIso: dateIso });
      const hotelId = result.hotelId;
      const today = dateOnlyFromIso(dateIso);

      const reservationIds = rows.map((r) => r.reservationId);
      const existingRows =
        reservationIds.length > 0
          ? await this.prisma.reservationSnapshot.findMany({
              where: { hotelId, reservationId: { in: reservationIds } },
            })
          : [];
      const existingById = new Map(existingRows.map((r) => [r.reservationId, r]));

      let created = 0;
      let updated = 0;
      let unchanged = 0;
      for (const row of rows) {
        const inTodayArrivals = this.isArrivalsToday(row, today);
        const existing = existingById.get(row.reservationId);
        if (!existing) {
          await this.prisma.reservationSnapshot.create({
            data: { ...row, inTodayArrivals },
          });
          created++;
          continue;
        }

        const patch = this.buildReservationPatch(existing, row, inTodayArrivals);
        if (!patch) {
          unchanged++;
          continue;
        }

        await this.prisma.reservationSnapshot.update({
          where: { id: existing.id },
          data: patch,
        });
        updated++;
      }

      const upserted = created + updated;
      await this.reconcileTodayArrivalsFlags(hotelId, today);

      await this.prisma.reservationSyncRun.update({
        where: { id: run.id },
        data: {
          status: 'ok',
          finishedAt: new Date(),
          rowCount: upserted,
          overview: result.overview
            ? (result.overview as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
      });

      this.log.log(
        `[Reservations] sync OK (${triggerLabel}): ${created} created, ${updated} updated, ${unchanged} unchanged, arrivals fetch=${arrivalsReservationIds.length}, tabs=${JSON.stringify(result.tabs)}`,
      );
      return { ...result, upserted };
    } catch (err) {
      const msg = (err as Error).message;
      await this.prisma.reservationSyncRun.update({
        where: { id: run.id },
        data: { status: 'error', finishedAt: new Date(), error: msg },
      });
      throw err;
    }
  }

  async list(opts: {
    tab: ReservationTab;
    date?: string;
    q?: string;
    hotelId?: string;
  }): Promise<ReservationListItem[]> {
    if (opts.tab !== 'all') {
      this.scheduleSyncOnView(`list:${opts.tab}`);
    }
    const hotelId = opts.hotelId?.trim() || process.env.EMMA_HOTEL_ID?.trim() || 'CHBRNPR';
    const today = dateOnlyFromIso(todayIsoDate());
    const q = opts.q?.trim().toLowerCase();

    const where: Prisma.ReservationSnapshotWhereInput = { hotelId };

    switch (opts.tab) {
      case 'arrivals':
        Object.assign(where, this.arrivalsWhere(hotelId, today));
        break;
      case 'queue':
        where.checkInQueue = true;
        where.checkIn = false;
        where.checkOut = false;
        break;
      case 'inhouse':
        where.checkIn = true;
        where.checkOut = false;
        break;
      case 'all':
        break;
    }

    const rows = await this.prisma.reservationSnapshot.findMany({
      where,
      orderBy:
        opts.tab === 'all'
          ? [{ arrivalDate: 'desc' }, { reservationId: 'asc' }]
          : [{ arrivalDate: 'asc' }, { reservationId: 'asc' }],
      take: opts.tab === 'all' ? (q ? 2000 : 500) : undefined,
    });

    const mapped = rows.map((r) => this.toListItem(r));

    if (opts.tab === 'inhouse') {
      mapped.sort((a, b) => {
        const ra = a.roomId?.trim() ?? '';
        const rb = b.roomId?.trim() ?? '';
        if (ra && rb) {
          const cmp = compareRoomNumbers(ra, rb);
          if (cmp !== 0) return cmp;
        } else if (ra && !rb) return -1;
        else if (!ra && rb) return 1;
        return (a.mainGuestName ?? a.reservationId).localeCompare(
          b.mainGuestName ?? b.reservationId,
          'de',
        );
      });
    }

    if (!q) return mapped;
    return mapped.filter(
      (r) =>
        r.mainGuestName?.toLowerCase().includes(q) ||
        r.reservationId.toLowerCase().includes(q) ||
        r.roomId?.toLowerCase().includes(q) ||
        r.groupName?.toLowerCase().includes(q) ||
        r.roomType?.toLowerCase().includes(q) ||
        r.vipDesc?.toLowerCase().includes(q) ||
        r.tier?.toLowerCase().includes(q),
    );
  }

  async findOne(reservationId: string, hotelId?: string): Promise<ReservationDetail> {
    const hid = hotelId?.trim() || process.env.EMMA_HOTEL_ID?.trim() || 'CHBRNPR';
    const row = await this.prisma.reservationSnapshot.findUnique({
      where: { hotelId_reservationId: { hotelId: hid, reservationId } },
    });
    if (!row) throw new NotFoundException('Reservation not found');
    const detail = this.toDetail(row);
    if (!detail) throw new NotFoundException('Reservation not found');
    return detail;
  }

  /** Manually fetch full reservation detail from EMMA (read-only, no draft/lock). */
  async fetchDetailFromEmma(reservationId: string, hotelId?: string): Promise<ReservationDetail> {
    const hid = hotelId?.trim() || process.env.EMMA_HOTEL_ID?.trim() || 'CHBRNPR';
    const { upsert, bundle } = await this.emma.fetchReservationDetailFromEmma(reservationId, hid);
    const detailEnc = encryptDetailBundle(this.cipher, bundle);
    const detailFetchedAt = new Date();
    const today = dateOnlyFromIso(todayIsoDate());

    const existing = await this.prisma.reservationSnapshot.findUnique({
      where: { hotelId_reservationId: { hotelId: hid, reservationId } },
    });
    const inTodayArrivals =
      existing?.inTodayArrivals ?? this.isArrivalsToday(upsert, today);

    const snapshotData = {
      ...this.snapshotFieldsFromUpsert(upsert),
      detailEnc,
      detailFetchedAt,
      inTodayArrivals,
    };

    if (!existing) {
      await this.prisma.reservationSnapshot.create({
        data: {
          hotelId: hid,
          reservationId,
          ...snapshotData,
        },
      });
    } else {
      await this.prisma.reservationSnapshot.update({
        where: { id: existing.id },
        data: snapshotData,
      });
    }

    this.log.log(`[Reservations] EMMA detail stored for ${reservationId}`);
    return this.findOne(reservationId, hid);
  }

  /** Manually fetch Folio Management data from EMMA (read-only, no draft/lock). */
  async fetchFolioFromEmma(reservationId: string, hotelId?: string): Promise<ReservationDetail> {
    const hid = hotelId?.trim() || process.env.EMMA_HOTEL_ID?.trim() || 'CHBRNPR';
    const { upsert, bundle } = await this.emma.fetchReservationFolioFromEmma(reservationId, hid);
    const folioEnc = encryptFolioBundle(this.cipher, bundle);
    const folioFetchedAt = new Date();

    const existing = await this.prisma.reservationSnapshot.findUnique({
      where: { hotelId_reservationId: { hotelId: hid, reservationId } },
    });

    if (!existing) {
      if (!upsert) {
        throw new NotFoundException('Reservation not found locally and EMMA folio mapping failed');
      }
      const today = dateOnlyFromIso(todayIsoDate());
      await this.prisma.reservationSnapshot.create({
        data: {
          hotelId: hid,
          reservationId,
          ...this.snapshotFieldsFromUpsert(upsert),
          inTodayArrivals: this.isArrivalsToday(upsert, today),
          folioEnc,
          folioFetchedAt,
        },
      });
    } else {
      const data: Prisma.ReservationSnapshotUpdateInput = { folioEnc, folioFetchedAt };
      if (upsert) Object.assign(data, this.snapshotFieldsFromUpsert(upsert));
      await this.prisma.reservationSnapshot.update({
        where: { id: existing.id },
        data,
      });
    }

    this.log.log(
      `[Reservations] EMMA folio stored for ${reservationId} (${bundle.charges.length} charges)`,
    );
    return this.findOne(reservationId, hid);
  }

  private snapshotFieldsFromUpsert(upsert: ReservationUpsertRow) {
    return {
      arrivalDate: upsert.arrivalDate,
      departureDate: upsert.departureDate,
      roomId: upsert.roomId,
      checkIn: upsert.checkIn,
      checkOut: upsert.checkOut,
      checkInQueue: upsert.checkInQueue,
      nightsStay: upsert.nightsStay,
      roomType: upsert.roomType,
      mealPlan: upsert.mealPlan,
      tier: upsert.tier,
      numPax: upsert.numPax,
      sensitiveEnc: upsert.sensitiveEnc,
      syncedAt: upsert.syncedAt,
    };
  }

  async overview(hotelId?: string): Promise<ReservationOverview> {
    const hid = hotelId?.trim() || process.env.EMMA_HOTEL_ID?.trim() || 'CHBRNPR';
    const today = dateOnlyFromIso(todayIsoDate());
    const visibleArrivals = await this.prisma.reservationSnapshot.count({
      where: this.arrivalsWhere(hid, today),
    });
    const last = await this.prisma.reservationSyncRun.findFirst({
      where: { status: 'ok' },
      orderBy: { finishedAt: 'desc' },
    });
    const base: ReservationOverview = {
      hotelId: hid,
      checkInDone: 0,
      checkInQueue: 0,
      checkInPending: 0,
      arrivals: 0,
      checkOutDone: 0,
      checkOutToday: 0,
      inHouse: 0,
      departures: 0,
      lastSyncedAt: last?.finishedAt?.toISOString() ?? null,
      visibleArrivals,
    };
    if (last?.overview && typeof last.overview === 'object' && !Array.isArray(last.overview)) {
      const o = last.overview as Record<string, unknown>;
      return {
        ...base,
        checkInDone: Number(o.checkInDone ?? 0),
        checkInQueue: Number(o.checkInQueue ?? 0),
        checkInPending: Number(o.checkInPending ?? 0),
        arrivals: Number(o.arrivals ?? 0),
        checkOutDone: Number(o.checkOutDone ?? 0),
        checkOutToday: Number(o.checkOutToday ?? 0),
        inHouse: Number(o.inHouse ?? 0),
        departures: Number(o.departures ?? 0),
        visibleArrivals,
      };
    }
    return base;
  }

  async syncStatus(): Promise<ReservationSyncStatus> {
    const last = await this.prisma.reservationSyncRun.findFirst({
      orderBy: { startedAt: 'desc' },
    });
    const overview = await this.overview();
    return {
      lastRun: last
        ? {
            id: last.id,
            startedAt: last.startedAt.toISOString(),
            finishedAt: last.finishedAt?.toISOString() ?? null,
            status: last.status,
            rowCount: last.rowCount,
            error: last.error,
          }
        : null,
      overview,
    };
  }

  /** Delete snapshots whose departure was more than retentionDays ago. */
  async purgeExpired(retentionDays = 30): Promise<number> {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
    const result = await this.prisma.reservationSnapshot.deleteMany({
      where: { departureDate: { lt: cutoff } },
    });
    if (result.count > 0) {
      this.log.log(`[Reservations] purged ${result.count} snapshots older than ${retentionDays}d`);
    }
    return result.count;
  }

  /** EMMA Check-In → Arrivals tab: today, not in queue, not checked in/out. */
  private arrivalsWhere(hotelId: string, today: Date): Prisma.ReservationSnapshotWhereInput {
    return {
      hotelId,
      arrivalDate: today,
      checkIn: false,
      checkOut: false,
      checkInQueue: false,
    };
  }

  private isArrivalsToday(
    row: Pick<ReservationUpsertRow, 'arrivalDate' | 'checkIn' | 'checkOut' | 'checkInQueue'>,
    today: Date,
  ): boolean {
    return (
      !row.checkIn &&
      !row.checkOut &&
      !row.checkInQueue &&
      this.sameDate(row.arrivalDate, today)
    );
  }

  private async reconcileTodayArrivalsFlags(hotelId: string, today: Date): Promise<void> {
    await this.prisma.reservationSnapshot.updateMany({
      where: this.arrivalsWhere(hotelId, today),
      data: { inTodayArrivals: true },
    });
    await this.prisma.reservationSnapshot.updateMany({
      where: { hotelId, arrivalDate: today, checkIn: true },
      data: { inTodayArrivals: false },
    });
    await this.prisma.reservationSnapshot.updateMany({
      where: { hotelId, arrivalDate: today, checkOut: true },
      data: { inTodayArrivals: false },
    });
    await this.prisma.reservationSnapshot.updateMany({
      where: { hotelId, arrivalDate: today, checkInQueue: true },
      data: { inTodayArrivals: false },
    });
    await this.prisma.reservationSnapshot.updateMany({
      where: { hotelId, inTodayArrivals: true, NOT: { arrivalDate: today } },
      data: { inTodayArrivals: false },
    });
  }

  /** Compare EMMA row to stored snapshot; return update fields only when something changed. */
  private buildReservationPatch(
    existing: {
      arrivalDate: Date;
      departureDate: Date;
      roomId: string | null;
      checkIn: boolean;
      checkOut: boolean;
      checkInQueue: boolean;
      inTodayArrivals: boolean;
      nightsStay: number | null;
      roomType: string | null;
      mealPlan: string | null;
      tier: string | null;
      numPax: number | null;
      sensitiveEnc: string;
    },
    row: ReservationUpsertRow,
    inTodayArrivals: boolean,
  ): Prisma.ReservationSnapshotUpdateInput | null {
    const patch: Prisma.ReservationSnapshotUpdateInput = {};

    if (!this.sameDate(existing.arrivalDate, row.arrivalDate)) patch.arrivalDate = row.arrivalDate;
    if (!this.sameDate(existing.departureDate, row.departureDate)) {
      patch.departureDate = row.departureDate;
    }
    if (existing.roomId !== row.roomId) patch.roomId = row.roomId;
    if (existing.checkIn !== row.checkIn) patch.checkIn = row.checkIn;
    if (existing.checkOut !== row.checkOut) patch.checkOut = row.checkOut;
    if (existing.checkInQueue !== row.checkInQueue) patch.checkInQueue = row.checkInQueue;
    if (existing.inTodayArrivals !== inTodayArrivals) patch.inTodayArrivals = inTodayArrivals;
    if (existing.nightsStay !== row.nightsStay) patch.nightsStay = row.nightsStay;
    if (existing.roomType !== row.roomType) patch.roomType = row.roomType;
    if (existing.mealPlan !== row.mealPlan) patch.mealPlan = row.mealPlan;
    if (existing.tier !== row.tier) patch.tier = row.tier;
    if (existing.numPax !== row.numPax) patch.numPax = row.numPax;
    if (existing.sensitiveEnc !== row.sensitiveEnc) patch.sensitiveEnc = row.sensitiveEnc;

    if (Object.keys(patch).length === 0) return null;
    patch.syncedAt = row.syncedAt;
    return patch;
  }

  private sameDate(a: Date, b: Date): boolean {
    return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
  }

  private toListItem(row: {
    id: string;
    hotelId: string;
    reservationId: string;
    roomId: string | null;
    arrivalDate: Date;
    departureDate: Date;
    nightsStay: number | null;
    roomType: string | null;
    mealPlan: string | null;
    tier: string | null;
    numPax: number | null;
    checkIn: boolean;
    checkOut: boolean;
    checkInQueue: boolean;
    inTodayArrivals: boolean;
    sensitiveEnc: string;
    detailEnc?: string | null;
    detailFetchedAt?: Date | null;
    folioEnc?: string | null;
    folioFetchedAt?: Date | null;
    syncedAt: Date;
  }): ReservationListItem {
    const s = decryptSensitivePayload(this.cipher, row.sensitiveEnc);
    const departureDate = row.departureDate.toISOString().slice(0, 10);
    const today = todayIsoDate();
    return {
      id: row.id,
      hotelId: row.hotelId,
      reservationId: row.reservationId,
      roomId: row.roomId,
      mainGuestName: s?.mainGuestName ?? null,
      arrivalDate: row.arrivalDate.toISOString().slice(0, 10),
      departureDate,
      nightsStay: row.nightsStay,
      roomType: row.roomType,
      mealPlan: row.mealPlan,
      tier: row.tier,
      numPax: row.numPax,
      vipDesc: s?.vipDesc ?? null,
      checkIn: row.checkIn,
      checkOut: row.checkOut,
      checkInQueue: row.checkInQueue,
      creditCard: s?.creditCard ?? null,
      cardHolder: s?.cardHolder ?? null,
      cardExpiry: s?.cardExpiry ?? null,
      preAuthAmount: s?.preAuthAmount ?? null,
      groupName: s?.groupName ?? null,
      syncedAt: row.syncedAt.toISOString(),
      inTodayArrivals: row.inTodayArrivals,
      detailFetchedAt: row.detailFetchedAt?.toISOString() ?? null,
      folioFetchedAt: row.folioFetchedAt?.toISOString() ?? null,
      stayover: s?.stayover ?? false,
      expectedDepartureTime: s?.expectedDepartureTime ?? null,
      isDepartureToday: departureDate === today,
      ocoDone: s?.ocoDone ?? false,
    };
  }

  private toDetail(row: {
    id: string;
    hotelId: string;
    reservationId: string;
    roomId: string | null;
    arrivalDate: Date;
    departureDate: Date;
    nightsStay: number | null;
    roomType: string | null;
    mealPlan: string | null;
    tier: string | null;
    numPax: number | null;
    checkIn: boolean;
    checkOut: boolean;
    checkInQueue: boolean;
    inTodayArrivals: boolean;
    sensitiveEnc: string;
    detailEnc?: string | null;
    detailFetchedAt?: Date | null;
    folioEnc?: string | null;
    folioFetchedAt?: Date | null;
    syncedAt: Date;
  }): ReservationDetail | null {
    const list = this.toListItem(row);
    const emmaDetail = decryptDetailBundle(this.cipher, row.detailEnc);
    const emmaFolio = decryptFolioBundle(this.cipher, row.folioEnc);
    const s = decryptSensitivePayload(this.cipher, row.sensitiveEnc);
    if (!s) {
      return {
        ...list,
        mainGuestId: null,
        mainClientName: null,
        bookingFileId: null,
        groupId: null,
        companyName: null,
        travelAgent: null,
        rateCode: null,
        sourceCode: null,
        marketCode: null,
        balance: null,
        comments: null,
        draftStatus: null,
        draftLockedBy: null,
        stays: null,
        guests: null,
        ciStatusSigned: false,
        stayover: false,
        noMove: false,
        originalRoomType: null,
        roomTypeUpg: null,
        numPax2: null,
        numPax3: null,
        numPax4: null,
        checkInQDate: null,
        detailFetchedAt: row.detailFetchedAt?.toISOString() ?? null,
        emmaDetail,
        folioFetchedAt: row.folioFetchedAt?.toISOString() ?? null,
        emmaFolio,
      };
    }
    return {
      ...list,
      mainGuestId: s.mainGuestId,
      mainClientName: s.mainClientName,
      bookingFileId: s.bookingFileId,
      groupId: s.groupId,
      companyName: s.companyName,
      travelAgent: s.travelAgent,
      rateCode: s.rateCode,
      sourceCode: s.sourceCode,
      marketCode: s.marketCode,
      balance: s.balance,
      comments: s.comments,
      draftStatus: s.draftStatus,
      draftLockedBy: s.draftLockedBy,
      stays: s.stays,
      guests: s.guests,
      ciStatusSigned: s.ciStatusSigned,
      stayover: s.stayover,
      noMove: s.noMove,
      originalRoomType: s.originalRoomType,
      roomTypeUpg: s.roomTypeUpg,
      numPax2: s.numPax2,
      numPax3: s.numPax3,
      numPax4: s.numPax4,
      checkInQDate: s.checkInQDate,
      detailFetchedAt: row.detailFetchedAt?.toISOString() ?? null,
      emmaDetail,
      folioFetchedAt: row.folioFetchedAt?.toISOString() ?? null,
      emmaFolio,
    };
  }
}
