import { describe, test, expect } from '@jest/globals';
import { normalizeProfile } from '../src/lib/profile.js';
import { createSessionStore, openUrlFor, SESSION_MAX_MS, sessionOrigin, sessionUrl } from '../src/lib/sessions.js';
import { createFakeStorage } from './helpers/fakeStorage.js';

const ORIGIN = 'https://111122223333-abcd1234.eu-central-1.console.aws.amazon.com';
const iam = normalizeProfile({ id: 'prod', name: 'shop-prod', provider: 'iam-user', fields: { account: '111122223333' } });
const sso = (destination) => normalizeProfile({
  id: 'sso', name: 'data', provider: 'sso', fields: { startUrl: 'https://example.awsapps.com/start', accountId: '777788889999', roleName: 'ReadOnly', destination },
});

describe('sessionOrigin', () => {
  test('the origin of a multi-session console page', () => {
    expect(sessionOrigin(`${ORIGIN}/ec2/home?region=eu-central-1#Instances:`)).toBe(ORIGIN);
  });

  test('null for everything else', () => {
    for (const url of [
      'https://eu-central-1.console.aws.amazon.com/console/home',
      'http://111122223333-abcd1234.eu-central-1.console.aws.amazon.com/',
      'https://111122223333-abcd1234.console.aws.amazon.com.example.com/',
      'https://111122223333-abcd1234.signin.aws.amazon.com/',
      'not a url',
      undefined,
    ]) expect(sessionOrigin(url)).toBeNull();
  });
});

describe('sessionUrl', () => {
  test('the console home, or the destination page moved into the session', () => {
    expect(sessionUrl(iam, ORIGIN)).toBe(`${ORIGIN}/console/home`);
    expect(sessionUrl(sso(''), ORIGIN)).toBe(`${ORIGIN}/console/home`);
    expect(sessionUrl(sso('https://console.aws.amazon.com/s3/home?region=eu-central-1#/buckets'), ORIGIN))
      .toBe(`${ORIGIN}/s3/home?region=eu-central-1#/buckets`);
  });
});

describe('createSessionStore and openUrlFor', () => {
  const setup = (initial = {}) => {
    const clock = { now: 1_000_000 };
    const storage = createFakeStorage(initial, 'local');
    return { clock, storage, sessions: createSessionStore({ area: storage.area, now: () => clock.now }) };
  };

  test('remembers one origin per account with when it was seen, and opens through it', async () => {
    const { storage, sessions } = setup();
    expect(await openUrlFor(iam, sessions)).toBe('https://111122223333.signin.aws.amazon.com/console');

    await sessions.remember('prod', ORIGIN);
    await sessions.remember('sso', 'https://777788889999-zz.us-east-1.console.aws.amazon.com');
    expect(await openUrlFor(iam, sessions)).toBe(`${ORIGIN}/console/home`);
    expect(storage.data).toEqual({
      'session:prod': { origin: ORIGIN, seenAt: 1_000_000 },
      'session:sso': { origin: 'https://777788889999-zz.us-east-1.console.aws.amazon.com', seenAt: 1_000_000 },
    });
  });

  test('forgets an entry 12 hours after it was last seen, and seeing it again restarts the clock', async () => {
    const { clock, storage, sessions } = setup();
    await sessions.remember('prod', ORIGIN);
    clock.now += SESSION_MAX_MS - 1;
    expect(await sessions.originFor('prod')).toBe(ORIGIN);
    await sessions.remember('prod', ORIGIN);
    clock.now += SESSION_MAX_MS - 1;
    expect(await sessions.originFor('prod')).toBe(ORIGIN);
    clock.now += 1;
    expect(await sessions.originFor('prod')).toBeNull();
    expect(storage.data).toEqual({});
  });

  test('liveIds lists the accounts with an unexpired session, without removing the rest', async () => {
    const { clock, storage, sessions } = setup({ 'session:old': ORIGIN });
    await sessions.remember('prod', ORIGIN);
    clock.now += SESSION_MAX_MS - 1;
    await sessions.remember('sso', ORIGIN);
    expect([...await sessions.liveIds(['prod', 'sso', 'old', 'none'])]).toEqual(['prod', 'sso']);
    clock.now += 1;
    expect([...await sessions.liveIds(['prod', 'sso'])]).toEqual(['sso']);
    expect(Object.keys(storage.data).sort()).toEqual(['session:old', 'session:prod', 'session:sso']);
  });

  test('drops an entry in an older shape', async () => {
    const { storage, sessions } = setup({ 'session:prod': ORIGIN, recentProfiles: ['prod'] });
    expect(await sessions.originFor('prod')).toBeNull();
    expect(storage.data).toEqual({ recentProfiles: ['prod'] });
  });

  test('ignores a report without an account or a session address', async () => {
    const { storage, sessions } = setup();
    await sessions.remember('prod', null);
    await sessions.remember('', ORIGIN);
    await sessions.remember(undefined, ORIGIN);
    expect(storage.data).toEqual({});
    expect(await sessions.originFor('prod')).toBeNull();
  });
});
