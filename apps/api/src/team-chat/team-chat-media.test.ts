import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isAllowedTeamChatUploadMime,
  isTeamChatPhotoTooLarge,
  isTeamChatVideoContentType,
  mergeTeamChatMessage,
  orderTeamChatWindow,
  rejectTeamChatImageFile,
  sniffTeamChatMediaPrefix,
  TEAM_CHAT_MAX_STORED_PHOTO_BYTES,
} from '@housekeeping/shared';

describe('team chat media guards', () => {
  it('rejects videos by MIME and filename even when type is empty', () => {
    assert.equal(
      rejectTeamChatImageFile({ type: 'video/mp4', name: 'clip.mp4', size: 1_000 }),
      'video',
    );
    assert.equal(
      rejectTeamChatImageFile({ type: '', name: 'IMG_1234.MOV', size: 1_000 }),
      'video',
    );
  });

  it('allows normal photos', () => {
    assert.equal(
      rejectTeamChatImageFile({ type: 'image/jpeg', name: 'room.jpg', size: 800_000 }),
      null,
    );
    assert.equal(
      rejectTeamChatImageFile({ type: 'image/heic', name: 'IMG_1.HEIC', size: 2_000_000 }),
      null,
    );
  });

  it('rejects oversized source files and non-images', () => {
    assert.equal(
      rejectTeamChatImageFile({ type: 'image/jpeg', name: 'huge.jpg', size: 40 * 1024 * 1024 }),
      'tooLarge',
    );
    assert.equal(
      rejectTeamChatImageFile({ type: 'application/pdf', name: 'x.pdf', size: 1000 }),
      'notImage',
    );
  });

  it('only allows jpeg/png/webp for presign', () => {
    assert.equal(isAllowedTeamChatUploadMime('image/jpeg'), true);
    assert.equal(isAllowedTeamChatUploadMime('image/png; charset=binary'), true);
    assert.equal(isAllowedTeamChatUploadMime('image/heic'), false);
    assert.equal(isAllowedTeamChatUploadMime('video/mp4'), false);
  });

  it('sniffs jpeg vs mp4 ftyp vs heic ftyp', () => {
    assert.equal(sniffTeamChatMediaPrefix(Uint8Array.of(0xff, 0xd8, 0xff, 0xe0)), 'image');
    const mp4 = new Uint8Array(12);
    mp4.set([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]); // ftyp isom
    assert.equal(sniffTeamChatMediaPrefix(mp4), 'video');
    const heic = new Uint8Array(12);
    heic.set([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]); // ftyp heic
    assert.equal(sniffTeamChatMediaPrefix(heic), 'image');
  });

  it('treats stored objects over the chat photo cap as too large', () => {
    assert.equal(isTeamChatPhotoTooLarge(TEAM_CHAT_MAX_STORED_PHOTO_BYTES + 1), true);
    assert.equal(isTeamChatPhotoTooLarge(400_000), false);
    assert.equal(isTeamChatVideoContentType('video/mp4'), true);
    assert.equal(isTeamChatVideoContentType('image/jpeg'), false);
  });

  it('returns the newest window in chronological order for the chat UI', () => {
    const newestFirst = [{ id: 'c' }, { id: 'b' }, { id: 'a' }];
    assert.deepEqual(
      orderTeamChatWindow(newestFirst, 'asc').map((r) => r.id),
      ['a', 'b', 'c'],
    );
    assert.deepEqual(
      orderTeamChatWindow(newestFirst, 'desc').map((r) => r.id),
      ['c', 'b', 'a'],
    );
  });
});

describe('mergeTeamChatMessage', () => {
  it('appends a new server message and replaces a matching temp row', () => {
    const temp = { id: 'temp-1', body: 'Hallo', author: { id: 'u1' } };
    const server = { id: 'real-1', body: 'Hallo', author: { id: 'u1' } };
    assert.deepEqual(mergeTeamChatMessage([temp], server), [server]);
    assert.deepEqual(mergeTeamChatMessage([], server), [server]);
  });

  it('replaces photo-only optimistic rows', () => {
    const temp = { id: 'temp-2', body: '', photoUrl: 'blob:x', author: { id: 'u1' } };
    const server = { id: 'real-2', body: '', photoUrl: 'https://cdn/p.jpg', author: { id: 'u1' } };
    assert.deepEqual(mergeTeamChatMessage([temp], server), [server]);
  });
});
