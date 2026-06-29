import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shieldMentions, unshieldMentions } from './mention-placeholders';

describe('mention placeholders', () => {
  const mentions = [
    { userId: 'u1', name: 'Jane Doe' },
    { userId: 'u2', name: 'Bob' },
  ];

  it('roundtrips mentions through shield and unshield', () => {
    const body = 'Hello @Jane Doe and @Bob — please check room 12';
    const shielded = shieldMentions(body, mentions);
    assert.ok(shielded.includes('{{MENTION:u1}}'));
    assert.ok(shielded.includes('{{MENTION:u2}}'));
    assert.ok(!shielded.includes('@Jane Doe'));
    const restored = unshieldMentions(shielded, mentions);
    assert.equal(restored, body);
  });

  it('shields longer names first to avoid partial matches', () => {
    const body = '@Jane Doe Jr said hi';
    const shielded = shieldMentions(body, [
      { userId: 'a', name: 'Jane' },
      { userId: 'b', name: 'Jane Doe Jr' },
    ]);
    assert.equal(shielded, '{{MENTION:b}} said hi');
  });
});
