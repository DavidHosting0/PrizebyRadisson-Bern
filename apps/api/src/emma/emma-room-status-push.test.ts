import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildODataChangesetMergeBatchBody,
  buildRoomStatusMergeJson,
  EMMA_ODATA_RSRVS_SRV,
  roomDetailMergePath,
} from './emma-odata-client';
import {
  formatEmmaRoomId,
  mapDerivedStatusToEmmaCode,
} from './emma-room-status-push';

describe('formatEmmaRoomId', () => {
  it('pads numeric room numbers to 4 digits', () => {
    assert.equal(formatEmmaRoomId('9'), '0009');
    assert.equal(formatEmmaRoomId('101'), '0101');
  });

  it('prefers stored EMMA room id', () => {
    assert.equal(formatEmmaRoomId('9', '0009'), '0009');
  });
});

describe('mapDerivedStatusToEmmaCode', () => {
  it('maps clean and inspected', () => {
    assert.equal(mapDerivedStatusToEmmaCode('CLEAN'), 'CL');
    assert.equal(mapDerivedStatusToEmmaCode('INSPECTED'), 'IN');
    assert.equal(mapDerivedStatusToEmmaCode('DIRTY'), 'DI');
  });
});

describe('buildRoomStatusMergeJson', () => {
  it('includes RoomStatus and metadata uri', () => {
    const json = buildRoomStatusMergeJson(
      'https://emma.example.com',
      'CHBRNPR',
      '0009',
      'DI',
    );
    const parsed = JSON.parse(json) as { RoomStatus: string; __metadata: { uri: string; type: string } };
    assert.equal(parsed.RoomStatus, 'DI');
    assert.match(parsed.__metadata.uri, /RoomDetail\(HotelId='CHBRNPR',RoomId='0009'\)/);
    assert.equal(parsed.__metadata.type, `${EMMA_ODATA_RSRVS_SRV}.RoomDetail`);
  });
});

describe('buildODataChangesetMergeBatchBody', () => {
  it('uses MERGE in changeset', () => {
    const path = roomDetailMergePath('CHBRNPR', '0009', '100');
    const { body } = buildODataChangesetMergeBatchBody(
      [{ entityPath: path, body: '{"RoomStatus":"CL"}' }],
      'csrf-token',
    );
    assert.match(body, /MERGE RoomDetail\(HotelId='CHBRNPR',RoomId='0009'\)\?sap-client=100/);
    assert.match(body, /show-status: N/);
    assert.match(body, /x-csrf-token: csrf-token/);
  });
});
