import { describe, test, expect } from '@jest/globals';
import { accountFromHash, addAccountHash } from '../src/lib/messages.js';

describe('add-account hash', () => {
  test('round-trips an account, escaping what a hash cannot hold', () => {
    expect(addAccountHash('my alias#1')).toBe('#add=my%20alias%231');
    expect(accountFromHash(addAccountHash('my alias#1'))).toBe('my alias#1');
  });

  test.each(['', '#', '#add=', '#edit=1'])('%p carries no account', (hash) => {
    expect(accountFromHash(hash)).toBeNull();
  });
});
