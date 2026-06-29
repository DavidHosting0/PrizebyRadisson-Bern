import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isNightAuditWindow,
  resolveBackupModeWithNightAudit,
  shouldSuppressBackupForNightAudit,
} from '@housekeeping/shared';

describe('isNightAuditWindow', () => {
  it('is true at 03:00 Zurich', () => {
    assert.equal(isNightAuditWindow(new Date('2026-06-15T01:00:00.000Z')), true);
  });

  it('is false at 08:00 Zurich', () => {
    assert.equal(isNightAuditWindow(new Date('2026-06-15T06:00:00.000Z')), false);
  });
});

describe('shouldSuppressBackupForNightAudit', () => {
  it('suppresses when outage is younger than 30 minutes during night audit', () => {
    const now = new Date('2026-06-15T01:10:00.000Z');
    const since = new Date('2026-06-15T00:50:00.000Z').toISOString();
    assert.equal(shouldSuppressBackupForNightAudit(since, now), true);
  });

  it('does not suppress after 30 minutes during night audit', () => {
    const now = new Date('2026-06-15T01:35:00.000Z');
    const since = new Date('2026-06-15T00:50:00.000Z').toISOString();
    assert.equal(shouldSuppressBackupForNightAudit(since, now), false);
  });

  it('does not suppress outside night audit hours', () => {
    const now = new Date('2026-06-15T06:10:00.000Z');
    const since = new Date('2026-06-15T06:00:00.000Z').toISOString();
    assert.equal(shouldSuppressBackupForNightAudit(since, now), false);
  });
});

describe('resolveBackupModeWithNightAudit', () => {
  it('keeps manual backup active during night audit', () => {
    const now = new Date('2026-06-15T01:00:00.000Z');
    const result = resolveBackupModeWithNightAudit({
      pushActive: true,
      pushSince: new Date('2026-06-15T00:55:00.000Z').toISOString(),
      reservationSyncError: false,
      reservationSyncErrorSince: null,
      manual: true,
      now,
    });
    assert.equal(result.active, true);
    assert.ok(result.reasons.includes('manual'));
  });

  it('defers push alert during night audit grace', () => {
    const now = new Date('2026-06-15T01:00:00.000Z');
    const result = resolveBackupModeWithNightAudit({
      pushActive: true,
      pushSince: new Date('2026-06-15T00:50:00.000Z').toISOString(),
      reservationSyncError: false,
      reservationSyncErrorSince: null,
      manual: false,
      now,
    });
    assert.equal(result.active, false);
    assert.equal(result.nightAuditGrace, true);
  });
});
