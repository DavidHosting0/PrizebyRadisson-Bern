import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isChinaJapanOrKorea,
  isThreePersonRoom,
  normalizeGuestName,
  suggestRoomForReservation,
  type RoomSuggestGuest,
  type RoomSuggestInput,
  type RoomSuggestRoom,
} from '@housekeeping/shared';

function guest(partial: Partial<RoomSuggestGuest> & Pick<RoomSuggestGuest, 'reservationId'>): RoomSuggestGuest {
  return {
    guestName: 'Guest',
    roomType: 'BSTD------',
    nights: 1,
    numPax: 2,
    vipDesc: null,
    tier: null,
    country: null,
    previousStays: 0,
    assignedRoom: null,
    ...partial,
  };
}

function room(roomNumber: string, status: RoomSuggestRoom['status'] = 'INSPECTED'): RoomSuggestRoom {
  return { roomNumber, status };
}

function suggest(partial: Omit<RoomSuggestInput, 'mode' | 'reservationId'> & { mode?: RoomSuggestInput['mode']; reservationId: string }) {
  return suggestRoomForReservation({
    mode: partial.mode ?? 'plan',
    reservationId: partial.reservationId,
    guests: partial.guests,
    rooms: partial.rooms,
    blockedRoomsByGuest: partial.blockedRoomsByGuest,
    heldRooms: partial.heldRooms,
  });
}

describe('room suggestion helpers', () => {
  it('normalizes guest names', () => {
    assert.equal(normalizeGuestName('  Müller   Hans '), 'muller hans');
  });

  it('treats basement 8 and 12 as not larger', () => {
    assert.equal(isThreePersonRoom('8'), false);
    assert.equal(isThreePersonRoom('12'), false);
    assert.equal(isThreePersonRoom('108'), true);
    assert.equal(isThreePersonRoom('712'), true);
  });

  it('recognizes China, Japan and South Korea', () => {
    assert.equal(isChinaJapanOrKorea('CN'), true);
    assert.equal(isChinaJapanOrKorea('Japan'), true);
    assert.equal(isChinaJapanOrKorea('Südkorea'), true);
    assert.equal(isChinaJapanOrKorea('CH'), false);
    assert.equal(isChinaJapanOrKorea(null), false);
  });
});

describe('suggestRoomForReservation', () => {
  it('puts a one-night stay downstairs and a VIP on the highest room', () => {
    const rooms = [room('5'), room('624')];
    const low = suggest({
      reservationId: 'a',
      guests: [guest({ reservationId: 'a', nights: 1 })],
      rooms,
    });
    const vip = suggest({
      reservationId: 'v',
      guests: [guest({ reservationId: 'v', nights: 1, vipDesc: 'VIP' })],
      rooms,
    });
    assert.equal(low?.roomNumber, '5');
    assert.equal(vip?.roomNumber, '624');
    assert.equal(vip?.reasons.includes('vip'), true);
  });

  it('keeps China, Japan and Korea off floor -1', () => {
    const result = suggest({
      reservationId: 'a',
      guests: [guest({ reservationId: 'a', nights: 1, country: 'KR', numPax: 2 })],
      rooms: [room('5'), room('22')],
    });
    assert.equal(result?.roomNumber, '22');
    assert.equal(result?.reasons.includes('no_basement'), true);
  });

  it('gives 3 guests a larger room from floor 0 upward, not basement 8', () => {
    const result = suggest({
      reservationId: 'a',
      guests: [guest({ reservationId: 'a', nights: 1, numPax: 3 })],
      rooms: [room('8'), room('108'), room('201')],
    });
    assert.equal(result?.roomNumber, '108');
    assert.equal(result?.reasons.includes('three_pax'), true);
  });

  it('keeps a corner booking in the corner pool when no 08/12 corner exists', () => {
    const result = suggest({
      reservationId: 'a',
      guests: [guest({ reservationId: 'a', roomType: 'PCMFCR----', numPax: 3, nights: 4 })],
      rooms: [room('108'), room('309'), room('610')],
    });
    assert.equal(result?.category, 'corner');
    assert.notEqual(result?.roomNumber, '108');
  });

  it('places repeat guests in the middle ahead of a pure premium guest', () => {
    const rooms = [room('308')];
    const guests = [
      guest({ reservationId: 'prem', guestName: 'Prem', vipDesc: 'Premium', nights: 2 }),
      guest({ reservationId: 'rep', guestName: 'Rep', previousStays: 2, nights: 1 }),
    ];
    const repeat = suggest({ reservationId: 'rep', guests, rooms });
    const premium = suggest({ reservationId: 'prem', guests, rooms });
    assert.equal(repeat?.roomNumber, '308');
    assert.equal(premium, null);
  });

  it('gives longer stays the highest room under a VIP', () => {
    const guests = [
      guest({ reservationId: 'vip', vipDesc: 'VIP', nights: 1 }),
      guest({ reservationId: 'long', nights: 5, numPax: 2 }),
    ];
    const rooms = [room('624'), room('524'), room('5')];
    assert.equal(suggest({ reservationId: 'vip', guests, rooms })?.roomNumber, '624');
    assert.equal(suggest({ reservationId: 'long', guests, rooms })?.roomNumber, '524');
  });

  it('suggests a dirty category room in the day plan and a ready standard room when the guest is here', () => {
    const guests = [guest({ reservationId: 'a', roomType: 'PCMFCR----', nights: 2 })];
    const rooms = [room('309', 'DIRTY'), room('202', 'INSPECTED')];
    const plan = suggest({ reservationId: 'a', guests, rooms, mode: 'plan' });
    const now = suggest({ reservationId: 'a', guests, rooms, mode: 'now' });
    assert.equal(plan?.roomNumber, '309');
    assert.equal(plan?.readyNow, false);
    assert.equal(now?.roomNumber, '202');
    assert.equal(now?.reasons.includes('category_not_ready'), true);
  });

  it('moves an overbooked view guest to a corner only when corner bookings stay covered', () => {
    const view = guest({ reservationId: 'view', roomType: 'PCMFVP----', nights: 2 });
    const cornerGuest = guest({ reservationId: 'cr', roomType: 'PCMFCR----', nights: 2 });
    const covered = suggest({
      reservationId: 'view',
      guests: [view, cornerGuest],
      rooms: [room('209'), room('202')],
    });
    const spare = suggest({
      reservationId: 'view',
      guests: [view],
      rooms: [room('209'), room('202')],
    });
    assert.equal(covered?.roomNumber, '202');
    assert.equal(spare?.roomNumber, '209');
  });

  it('moves an overbooked corner guest onto the view floor when a view room is spare', () => {
    const result = suggest({
      reservationId: 'cr',
      guests: [guest({ reservationId: 'cr', roomType: 'PCMFCR----', nights: 3, vipDesc: 'VIP' })],
      rooms: [room('718'), room('202')],
    });
    assert.equal(result?.roomNumber, '718');
    assert.equal(result?.reasons.includes('overbook_corner'), true);
  });

  it('assigns wheelchair rooms only to a single guest and only after normal rooms', () => {
    const onlyChair = [room('601')];
    const pair = suggest({
      reservationId: 'a',
      guests: [guest({ reservationId: 'a', numPax: 2, nights: 4 })],
      rooms: onlyChair,
    });
    const solo = suggest({
      reservationId: 'a',
      guests: [guest({ reservationId: 'a', numPax: 1, nights: 4 })],
      rooms: onlyChair,
    });
    const withNormal = suggest({
      reservationId: 'a',
      guests: [guest({ reservationId: 'a', numPax: 1, nights: 4 })],
      rooms: [room('601'), room('602')],
    });
    assert.equal(pair, null);
    assert.equal(solo?.roomNumber, '601');
    assert.equal(withNormal?.roomNumber, '602');
  });

  it('does not suggest a room that was already accepted', () => {
    const result = suggest({
      reservationId: 'b',
      guests: [
        guest({ reservationId: 'a', nights: 1 }),
        guest({ reservationId: 'b', nights: 1 }),
      ],
      rooms: [room('5')],
      heldRooms: { a: '5' },
    });
    assert.equal(result, null);
  });
});
