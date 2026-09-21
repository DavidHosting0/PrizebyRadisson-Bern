import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildEmmaRequestObjectKey,
  buildODataChangesetBatchBody,
  emmaODataStringLiteral,
} from '../emma/emma-odata-client';

describe('Guests Mail clear batch shape', () => {
  it('builds MERGE Guests path and Mail empty body like the HAR', () => {
    const hotelId = 'CHBRNPR';
    const reservationId = '0180995448';
    const guestId = '01';
    const q = emmaODataStringLiteral;
    const entityKey = `Guests(HotelId=${q(hotelId)},ReservationId=${q(reservationId)},GuestId=${q(guestId)})`;
    const path = `${entityKey}?sap-client=100`;
    const body = JSON.stringify({
      __metadata: {
        uri: `https://emma.example/sap/opu/odata/sap/ZEYUI_RSRVS_SRV/${entityKey}`,
        type: 'ZEYUI_RSRVS_SRV.Guests',
      },
      Mail: '',
    });

    const requestObjectKey = buildEmmaRequestObjectKey(hotelId, reservationId);
    assert.match(requestObjectKey, /^CHBRNPR {3}0180995448\d{17}$/);

    const batch = buildODataChangesetBatchBody(
      [{ actionPath: path, body, method: 'MERGE' }],
      'csrf-token',
      { requestObjectKey, tmsFioriApp: 'Reservations' },
    );

    assert.match(batch.body, /MERGE Guests\(HotelId='CHBRNPR',ReservationId='0180995448',GuestId='01'\)/);
    assert.match(batch.body, /Request-Object-Key: CHBRNPR {3}0180995448/);
    assert.match(batch.body, /"Mail":""/);
    assert.equal(JSON.parse(body).Mail, '');
  });
});
