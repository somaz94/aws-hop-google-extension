import { describe, test, expect } from '@jest/globals';
import { createLandingStore, isOtherAccount, LANDING_MAX_MS } from '../src/lib/landing.js';
import { normalizeProfile } from '../src/lib/profile.js';
import { createFakeStorage } from './helpers/fakeStorage.js';

const iam = (id, account) => normalizeProfile({ id, name: id, provider: 'iam-user', fields: { account } });

describe('createLandingStore', () => {
  function setup() {
    const clock = { now: 1000 };
    const storage = createFakeStorage({}, 'session');
    return { clock, storage, landings: createLandingStore({ area: storage.area, now: () => clock.now }) };
  }

  test('keeps one expected account per tab, the latest open winning', async () => {
    const { landings } = setup();
    await landings.expect(1, 'dev');
    await landings.expect(2, 'prod');
    await landings.expect(1, 'qa');
    expect([await landings.expectedFor(1), await landings.expectedFor(2), await landings.expectedFor(3)]).toEqual(['qa', 'prod', null]);
  });

  test('clearing forgets only that tab', async () => {
    const { landings } = setup();
    await landings.expect(1, 'dev');
    await landings.expect(2, 'prod');
    await landings.clear(1);
    expect([await landings.expectedFor(1), await landings.expectedFor(2)]).toEqual([null, 'prod']);
  });

  test('an entry past the sign-in window is dropped when read', async () => {
    const { clock, landings, storage } = setup();
    await landings.expect(1, 'dev');
    clock.now += LANDING_MAX_MS - 1;
    expect(await landings.expectedFor(1)).toBe('dev');
    clock.now += 1;
    expect(await landings.expectedFor(1)).toBeNull();
    expect(storage.data).toEqual({});
  });
});

describe('isOtherAccount', () => {
  test('two profiles on different accounts', () => {
    expect(isOtherAccount(iam('dev', '444455556666'), iam('prod', '111122223333'))).toBe(true);
  });

  test('never for the same account, whichever profile the guard matched', () => {
    expect(isOtherAccount(iam('dev', '444455556666'), iam('dev-2', '4444-5555-6666'))).toBe(false);
  });

  test('never when a method cannot name its account', () => {
    const custom = normalizeProfile({ id: 'custom', name: 'custom', provider: 'custom-url', fields: { url: 'https://example.com/sso' } });
    expect(isOtherAccount(custom, iam('prod', '111122223333'))).toBe(false);
    expect(isOtherAccount(iam('prod', '111122223333'), custom)).toBe(false);
  });
});
