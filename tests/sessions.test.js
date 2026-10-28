import { describe, test, expect } from '@jest/globals';
import { normalizeProfile } from '../src/lib/profile.js';
import { createSessionStore, openUrlFor, sessionOrigin, sessionUrl } from '../src/lib/sessions.js';
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
  test('remembers one origin per account and opens through it, else through the sign-in method', async () => {
    const storage = createFakeStorage({}, 'session');
    const sessions = createSessionStore({ area: storage.area });
    expect(await openUrlFor(iam, sessions)).toBe('https://111122223333.signin.aws.amazon.com/console');

    await sessions.remember('prod', ORIGIN);
    await sessions.remember('sso', 'https://777788889999-zz.us-east-1.console.aws.amazon.com');
    expect(await openUrlFor(iam, sessions)).toBe(`${ORIGIN}/console/home`);
    expect(storage.data).toEqual({ 'session:prod': ORIGIN, 'session:sso': 'https://777788889999-zz.us-east-1.console.aws.amazon.com' });
  });

  test('ignores a report without an account or a session address', async () => {
    const storage = createFakeStorage({}, 'session');
    const sessions = createSessionStore({ area: storage.area });
    await sessions.remember('prod', null);
    await sessions.remember('', ORIGIN);
    await sessions.remember(undefined, ORIGIN);
    expect(storage.data).toEqual({});
    expect(await sessions.originFor('prod')).toBeNull();
  });
});
