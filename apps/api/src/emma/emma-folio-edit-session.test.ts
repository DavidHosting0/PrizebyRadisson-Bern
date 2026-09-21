import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isEmmaOwnSessionLockConflict } from './emma-folio-edit-session';

describe('isEmmaOwnSessionLockConflict', () => {
  it('detects the EMMA own-session lock dialog', () => {
    assert.equal(
      isEmmaOwnSessionLockConflict(
        'The object is currently blocked by your user. Please close the other session.',
      ),
      true,
    );
    assert.equal(isEmmaOwnSessionLockConflict('blocked by your user'), true);
    assert.equal(isEmmaOwnSessionLockConflict('Please close the other session'), true);
  });

  it('ignores unrelated lock / error messages', () => {
    assert.equal(isEmmaOwnSessionLockConflict('blocked by another user'), false);
    assert.equal(isEmmaOwnSessionLockConflict('Reservation is locked'), false);
    assert.equal(isEmmaOwnSessionLockConflict('HTTP 500'), false);
  });
});
