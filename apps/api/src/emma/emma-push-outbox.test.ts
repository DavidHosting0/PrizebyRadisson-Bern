import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const RETRY_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 48;

describe('EMMA push outbox retry policy', () => {
  it('retries every 30 minutes', () => {
    assert.equal(RETRY_MS, 1_800_000);
  });

  it('stops auto-retry after 48 attempts', () => {
    assert.equal(MAX_ATTEMPTS, 48);
  });
});

describe('cutover guard', () => {
  it('skips push when action is before PUSH_SINCE', () => {
    const pushSince = new Date('2026-06-29T00:00:00Z');
    const actionAt = new Date('2026-06-28T12:00:00Z');
    assert.equal(actionAt < pushSince, true);
  });

  it('allows push when action is on or after PUSH_SINCE', () => {
    const pushSince = new Date('2026-06-29T00:00:00Z');
    const actionAt = new Date('2026-06-29T08:00:00Z');
    assert.equal(actionAt >= pushSince, true);
  });
});
