import type {
  ArrivalCheckCategoryCount,
  ArrivalCheckRunDetail,
  ArrivalCheckRunItem,
  ArrivalCheckScenario,
  ArrivalCheckSource,
} from '@housekeeping/shared';
import { arrivalCheckCategoryLabel } from '@housekeeping/shared';

export type ArrivalCheckMockPreset =
  | 'running'
  | 'success'
  | 'manual-mixed'
  | 'vcc-declined'
  | 'cancelled'
  | 'all-skipped';

type MockGuest = {
  name: string;
  room: string;
  source: ArrivalCheckSource;
  scenario: ArrivalCheckScenario;
};

const GUESTS: MockGuest[] = [
  { name: 'Anna Müller', room: '412', source: 'BOOKING', scenario: 'VCC' },
  { name: 'Thomas Weber', room: '305', source: 'BOOKING', scenario: 'PREPAID' },
  { name: 'Sophie Laurent', room: '218', source: 'EXPEDIA', scenario: 'VCC' },
  { name: 'Marco Rossi', room: '501', source: 'RADISSON', scenario: 'DIRECT' },
  { name: 'Li Wei', room: '109', source: 'CTRIP', scenario: 'DIRECT' },
  { name: 'Emma Johnson', room: '622', source: 'AGODA', scenario: 'FLEXIBLE' },
  { name: 'Hans Meier', room: '314', source: 'BOOKING', scenario: 'VCC' },
  { name: 'Julia Fischer', room: '407', source: 'EXPEDIA', scenario: 'PREPAID' },
  { name: 'Pierre Dubois', room: '203', source: 'APPSMEDIA_IOS', scenario: 'DIRECT' },
  { name: 'Sarah Chen', room: '516', source: 'BOOKING', scenario: 'FLEXIBLE' },
  { name: 'Michael Brown', room: '701', source: 'OTHER', scenario: 'MANUAL' },
  { name: 'Elena Petrova', room: '118', source: 'EXPEDIA', scenario: 'VCC' },
];

const BASE_RUN_ID = 'mock-run-preview';
const HOTEL_ID = 'MOCK1';

function guestAt(index: number): MockGuest {
  return GUESTS[index % GUESTS.length]!;
}

function mockItem(
  index: number,
  status: ArrivalCheckRunItem['status'],
  overrides: Partial<ArrivalCheckRunItem> = {},
): ArrivalCheckRunItem {
  const guest = guestAt(index);
  const categoryLabel = arrivalCheckCategoryLabel(guest.source, guest.scenario);
  return {
    id: `mock-item-${index}`,
    reservationId: `MOCK${1000 + index}`,
    hotelId: HOTEL_ID,
    status,
    currentStep: null,
    error: null,
    startedAt: status !== 'PENDING' ? new Date().toISOString() : null,
    finishedAt:
      status === 'COMPLETED' ||
      status === 'SKIPPED' ||
      status === 'NEEDS_MANUAL' ||
      status === 'FAILED'
        ? new Date().toISOString()
        : null,
    mainGuestName: guest.name,
    roomId: guest.room,
    arrivalDate: '2026-06-29',
    departureDate: '2026-07-01',
    roomType: 'Standard',
    numPax: 2,
    source: guest.source,
    scenario: guest.scenario,
    categoryLabel,
    statusMessage: null,
    manualReason: null,
    movesPlanned: guest.scenario === 'FLEXIBLE' ? 0 : 3,
    movesDone: status === 'COMPLETED' ? 3 : 0,
    paymentStatus: guest.scenario === 'VCC' ? 'NOT_REQUIRED' : null,
    paymentAmount: null,
    paymentExpectedAmount: null,
    paymentCardMask: null,
    paymentInvoice: null,
    paymentDepositId: null,
    folio2Amount: null,
    folio2Currency: null,
    paymentError: null,
    alreadyCompletedAt: null,
    alreadyCompletedRunId: null,
    ...overrides,
  };
}

function buildCategoryCounts(items: ArrivalCheckRunItem[]): ArrivalCheckCategoryCount[] {
  const map = new Map<string, ArrivalCheckCategoryCount>();
  for (const item of items) {
    if (!item.source || !item.scenario) continue;
    const key = `${item.source}|${item.scenario}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(key, {
        source: item.source,
        scenario: item.scenario,
        label: item.categoryLabel ?? arrivalCheckCategoryLabel(item.source, item.scenario),
        count: 1,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function summarize(
  status: ArrivalCheckRunDetail['status'],
  items: ArrivalCheckRunItem[],
  finishedAt: string | null = null,
): ArrivalCheckRunDetail {
  const pendingCount = items.filter(
    (i) => i.status === 'PENDING' || i.status === 'IN_PROGRESS',
  ).length;
  const completedCount = items.filter((i) => i.status === 'COMPLETED').length;
  const failedCount = items.filter((i) => i.status === 'FAILED').length;
  const skippedCount = items.filter((i) => i.status === 'SKIPPED').length;
  const manualCount = items.filter((i) => i.status === 'NEEDS_MANUAL').length;
  const paidCount = items.filter((i) => i.paymentStatus === 'PAID').length;
  const declinedCount = items.filter((i) => i.paymentStatus === 'DECLINED').length;
  const alreadyDoneCount = items.filter((i) => Boolean(i.alreadyCompletedAt)).length;

  return {
    id: BASE_RUN_ID,
    hotelId: HOTEL_ID,
    forceRerun: false,
    status,
    startedAt: new Date(Date.now() - 120_000).toISOString(),
    finishedAt,
    createdByUserId: 'mock-admin',
    createdByName: 'Admin Preview',
    itemCount: items.length,
    pendingCount,
    completedCount,
    failedCount,
    skippedCount,
    manualCount,
    paidCount,
    declinedCount,
    alreadyDoneCount,
    categoryCounts: buildCategoryCounts(items),
    items,
  };
}

/** Static snapshot for a finished or mid-run preset. */
export function buildArrivalCheckMockRun(
  preset: ArrivalCheckMockPreset,
  itemCount = 8,
): ArrivalCheckRunDetail {
  const n = Math.max(1, Math.min(itemCount, GUESTS.length));
  const items: ArrivalCheckRunItem[] = [];

  switch (preset) {
    case 'running': {
      for (let i = 0; i < n; i++) {
        if (i < Math.floor(n / 2)) {
          items.push(
            mockItem(i, 'COMPLETED', {
              statusMessage: `${guestAt(i).name}: Posten erfolgreich verschoben.`,
              paymentStatus: guestAt(i).scenario === 'VCC' ? 'PAID' : 'NOT_REQUIRED',
              paymentAmount: guestAt(i).scenario === 'VCC' ? '245.50' : null,
            }),
          );
        } else if (i === Math.floor(n / 2)) {
          const guest = guestAt(i);
          items.push(
            mockItem(i, 'IN_PROGRESS', {
              currentStep: 'CHARGE_ASSIGN',
              movesPlanned: 3,
              movesDone: 1,
              statusMessage: `${arrivalCheckCategoryLabel(guest.source, guest.scenario)} erkannt – Posten 2/3 werden verschoben …`,
            }),
          );
        } else {
          items.push(mockItem(i, 'PENDING'));
        }
      }
      return summarize('RUNNING', items);
    }

    case 'success': {
      for (let i = 0; i < n; i++) {
        const guest = guestAt(i);
        items.push(
          mockItem(i, 'COMPLETED', {
            statusMessage: `${arrivalCheckCategoryLabel(guest.source, guest.scenario)}: abgeschlossen.`,
            paymentStatus: guest.scenario === 'VCC' ? 'PAID' : 'NOT_REQUIRED',
            paymentAmount: guest.scenario === 'VCC' ? '189.00' : null,
            paymentDepositId: guest.scenario === 'VCC' ? '0001' : null,
          }),
        );
      }
      return summarize('COMPLETED', items, new Date().toISOString());
    }

    case 'manual-mixed': {
      for (let i = 0; i < n; i++) {
        if (i === 0) {
          items.push(
            mockItem(i, 'NEEDS_MANUAL', {
              statusMessage: 'Unbekannte Quelle – manuelle Prüfung nötig.',
              manualReason: 'Buchungsquelle konnte nicht eindeutig zugeordnet werden.',
              scenario: 'MANUAL',
              source: 'OTHER',
              categoryLabel: arrivalCheckCategoryLabel('OTHER', 'MANUAL'),
            }),
          );
        } else if (i === 1) {
          items.push(
            mockItem(i, 'NEEDS_MANUAL', {
              statusMessage: 'Reservierung ist in EMMA gesperrt.',
              manualReason: 'Reservierung ist gesperrt – bitte in EMMA prüfen.',
            }),
          );
        } else {
          items.push(mockItem(i, 'COMPLETED', { statusMessage: 'Erfolgreich abgeschlossen.' }));
        }
      }
      return summarize('COMPLETED', items, new Date().toISOString());
    }

    case 'vcc-declined': {
      for (let i = 0; i < n; i++) {
        if (i === 0) {
          items.push(
            mockItem(i, 'NEEDS_MANUAL', {
              statusMessage: 'VCC-Zahlung abgelehnt.',
              manualReason: 'VCC-Zahlung abgelehnt – manuelle Belastung erforderlich.',
              paymentStatus: 'DECLINED',
              paymentError: 'Gateway: Insufficient funds (code 51)',
              paymentExpectedAmount: '312.80',
              paymentCardMask: '****4242',
              movesDone: 3,
            }),
          );
        } else {
          items.push(mockItem(i, 'COMPLETED', { paymentStatus: 'PAID', paymentAmount: '156.00' }));
        }
      }
      return summarize('COMPLETED', items, new Date().toISOString());
    }

    case 'cancelled': {
      for (let i = 0; i < n; i++) {
        if (i < 2) {
          items.push(mockItem(i, 'COMPLETED'));
        } else if (i === 2) {
          items.push(
            mockItem(i, 'IN_PROGRESS', {
              currentStep: 'FOLIO_LOAD',
              statusMessage: 'Reservierungsdaten werden aus EMMA geladen …',
            }),
          );
        } else {
          items.push(
            mockItem(i, 'SKIPPED', {
              statusMessage: 'Lauf abgebrochen – nicht verarbeitet.',
            }),
          );
        }
      }
      return summarize('CANCELLED', items, new Date().toISOString());
    }

    case 'all-skipped': {
      for (let i = 0; i < n; i++) {
        items.push(
          mockItem(i, 'SKIPPED', {
            statusMessage: 'Anreise-Check bereits heute durchgeführt – übersprungen.',
            alreadyCompletedAt: new Date(Date.now() - 3600_000).toISOString(),
            alreadyCompletedRunId: 'prev-run-id',
          }),
        );
      }
      return summarize('COMPLETED', items, new Date().toISOString());
    }

    default:
      return summarize('RUNNING', [mockItem(0, 'PENDING')]);
  }
}

/** Advance mock run by one animation tick (for live preview). */
export function advanceMockRun(run: ArrivalCheckRunDetail): ArrivalCheckRunDetail {
  const items = run.items.map((item) => ({ ...item }));
  const activeIdx = items.findIndex((i) => i.status === 'IN_PROGRESS');

  if (activeIdx >= 0) {
    const item = items[activeIdx]!;
    if (item.currentStep === 'FOLIO_LOAD') {
      item.currentStep = 'CHARGE_ASSIGN';
      item.movesPlanned = 3;
      item.movesDone = 0;
      item.statusMessage = `${item.categoryLabel}: Posten werden verschoben …`;
    } else if (item.currentStep === 'CHARGE_ASSIGN') {
      if (item.movesDone < (item.movesPlanned || 3)) {
        item.movesDone += 1;
        item.statusMessage = `Posten ${item.movesDone}/${item.movesPlanned} verschoben …`;
      } else if (item.scenario === 'VCC') {
        item.currentStep = 'PREPAID_SETTLE';
        item.statusMessage = `VCC wird belastet: CHF ${item.paymentExpectedAmount ?? '245.50'} …`;
      } else {
        item.status = 'COMPLETED';
        item.currentStep = null;
        item.finishedAt = new Date().toISOString();
        item.statusMessage = `${item.categoryLabel}: abgeschlossen.`;
      }
    } else if (item.currentStep === 'PREPAID_SETTLE') {
      item.status = 'COMPLETED';
      item.currentStep = null;
      item.finishedAt = new Date().toISOString();
      item.paymentStatus = 'PAID';
      item.paymentAmount = item.paymentExpectedAmount ?? '245.50';
      item.statusMessage = `${item.categoryLabel}: VCC belastet.`;
    }
  } else {
    const nextPending = items.findIndex((i) => i.status === 'PENDING');
    if (nextPending >= 0) {
      const item = items[nextPending]!;
      item.status = 'IN_PROGRESS';
      item.startedAt = new Date().toISOString();
      item.currentStep = 'FOLIO_LOAD';
      item.statusMessage = 'Reservierungsdaten werden aus EMMA geladen …';
      if (item.scenario === 'VCC') {
        item.paymentExpectedAmount = '245.50';
      }
    }
  }

  const stillActive = items.some(
    (i) => i.status === 'PENDING' || i.status === 'IN_PROGRESS',
  );
  const status = stillActive ? 'RUNNING' : 'COMPLETED';
  return summarize(status, items, stillActive ? null : new Date().toISOString());
}

/** Start a fresh animated run from scratch. */
export function startAnimatedMockRun(itemCount = 8): ArrivalCheckRunDetail {
  const n = Math.max(1, Math.min(itemCount, GUESTS.length));
  const items = Array.from({ length: n }, (_, i) => mockItem(i, 'PENDING'));
  const run = summarize('RUNNING', items);
  return advanceMockRun(run);
}

export const MOCK_PRESET_LABELS: Record<ArrivalCheckMockPreset, string> = {
  running: 'Läuft (Mitte)',
  success: 'Erfolgreich abgeschlossen',
  'manual-mixed': 'Mit manuellen Fällen',
  'vcc-declined': 'VCC abgelehnt',
  cancelled: 'Abgebrochen',
  'all-skipped': 'Alle übersprungen',
};
