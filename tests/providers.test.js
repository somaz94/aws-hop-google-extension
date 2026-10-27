import { describe, test, expect } from '@jest/globals';
import { buildProfileUrl, normalizeProfile, profileAccount, profileRoles, validateProfile } from '../src/lib/profile.js';
import { colorFor } from '../src/lib/tag.js';
import { httpsUrlError } from '../src/providers/fields.js';
import { normalizeStartUrl } from '../src/providers/sso.js';

const make = (provider, fields, extra = {}) => normalizeProfile({ name: 'shop-prod', provider, fields, ...extra });
const errorsOf = (profile) => validateProfile(profile).map((error) => error.field);

describe('iam-user', () => {
  test('opens the account sign-in page', () => {
    expect(buildProfileUrl(make('iam-user', { account: '1111-2222-3333' })))
      .toBe('https://111122223333.signin.aws.amazon.com/console');
  });

  test('accepts an account alias', () => {
    const profile = make('iam-user', { account: 'My-Org' });
    expect(profile.fields.account).toBe('my-org');
    expect(buildProfileUrl(profile)).toBe('https://my-org.signin.aws.amazon.com/console');
  });

  test('rejects an invalid account', () => {
    expect(errorsOf(make('iam-user', { account: 'Not An Account' }))).toEqual(['account']);
  });
});

describe('switch-role', () => {
  test('prefills account, role, display name and the project color', () => {
    const url = new URL(buildProfileUrl(make('switch-role', { account: '111122223333', roleName: 'Admin' })));
    expect(url.origin + url.pathname).toBe('https://signin.aws.amazon.com/switchrole');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      account: '111122223333',
      roleName: 'Admin',
      displayName: 'shop-prod',
      color: colorFor('shop').slice(1),
    });
  });

  test('uses an explicit display name and custom color', () => {
    const profile = make('switch-role', { account: '111122223333', roleName: 'Admin', displayName: 'Prod admin' }, { color: '#ABCDEF' });
    const params = new URL(buildProfileUrl(profile)).searchParams;
    expect(params.get('displayName')).toBe('Prod admin');
    expect(params.get('color')).toBe('abcdef');
  });

  test('omits the color when there is none', async () => {
    const { default: switchRole } = await import('../src/providers/switchRole.js');
    const url = switchRole.buildUrl({ account: '111122223333', roleName: 'Admin', displayName: '' }, { name: 'x', color: null });
    expect(new URL(url).searchParams.has('color')).toBe(false);
  });

  test('splits a pasted role ARN, the ARN account winning', () => {
    const profile = make('switch-role', { account: '444455556666', roleName: 'arn:aws:iam::111122223333:role/ops/Admin' });
    expect(profile.fields).toMatchObject({ account: '111122223333', roleName: 'ops/Admin' });
  });

  test('strips a leading slash from the role path', () => {
    expect(make('switch-role', { account: '111122223333', roleName: '/ops/Admin' }).fields.roleName).toBe('ops/Admin');
  });

  test.each([
    ['bad role!', 'roleName'],
    [`ops/${'a'.repeat(61)}`, 'roleName'],
  ])('rejects role %p', (roleName, field) => {
    expect(errorsOf(make('switch-role', { account: '111122223333', roleName }))).toEqual([field]);
  });

  test('rejects a display name over 64 characters', () => {
    expect(errorsOf(make('switch-role', { account: '111122223333', roleName: 'Admin', displayName: 'x'.repeat(65) })))
      .toEqual(['displayName']);
  });

  test('two profiles for the same account and role are one target, whatever their display names', async () => {
    const { profileTarget } = await import('../src/lib/profile.js');
    const a = make('switch-role', { account: '111122223333', roleName: 'Admin', displayName: 'A' });
    const b = make('switch-role', { account: '1111-2222-3333', roleName: 'Admin', displayName: 'B' });
    expect(profileTarget(a)).toBe(profileTarget(b));
  });

  test('reports the role name and display name for matching', () => {
    expect(profileRoles(make('switch-role', { account: '111122223333', roleName: 'ops/Admin' }))).toEqual(['Admin', 'shop-prod']);
  });
});

describe('sso', () => {
  const fields = { startUrl: 'https://example.awsapps.com/start', accountId: '111122223333', roleName: 'S3FullAccess' };

  test('builds the documented shortcut link', () => {
    expect(buildProfileUrl(make('sso', fields)))
      .toBe('https://example.awsapps.com/start/#/console?account_id=111122223333&role_name=S3FullAccess');
  });

  test('appends an encoded destination', () => {
    const url = buildProfileUrl(make('sso', { ...fields, destination: 'https://console.aws.amazon.com/s3/home' }));
    expect(url).toBe('https://example.awsapps.com/start/#/console?account_id=111122223333&role_name=S3FullAccess'
      + '&destination=https%3A%2F%2Fconsole.aws.amazon.com%2Fs3%2Fhome');
  });

  test('supports the dual-stack portal', () => {
    const profile = make('sso', { ...fields, startUrl: 'https://ssoins-1234567890abcdef.portal.us-east-1.app.aws/' });
    expect(buildProfileUrl(profile))
      .toBe('https://ssoins-1234567890abcdef.portal.us-east-1.app.aws/#/console?account_id=111122223333&role_name=S3FullAccess');
  });

  test('normalizes a start URL copied with a fragment', () => {
    expect(normalizeStartUrl('https://example.awsapps.com/start/#/')).toBe('https://example.awsapps.com/start');
    expect(normalizeStartUrl(undefined)).toBe('');
  });

  test.each([
    ['https://example.com/start', 'startUrl'],
    ['http://example.awsapps.com/start', 'startUrl'],
    ['example.awsapps.com', 'startUrl'],
  ])('rejects portal %p', (startUrl, field) => {
    expect(errorsOf(make('sso', { ...fields, startUrl }))).toEqual([field]);
  });

  test('rejects an invalid permission set and destination', () => {
    expect(errorsOf(make('sso', { ...fields, roleName: 'has space', destination: 'ftp://x' }))).toEqual(['roleName', 'destination']);
  });

  test('matches on the permission set', () => {
    expect(profileRoles(make('sso', fields))).toEqual(['S3FullAccess']);
  });
});

describe('custom-url', () => {
  test('opens the URL as given', () => {
    expect(buildProfileUrl(make('custom-url', { url: 'https://idp.example.com/app?x=1' }))).toBe('https://idp.example.com/app?x=1');
  });

  test('the account ID is optional', () => {
    const profile = make('custom-url', { url: 'https://idp.example.com/app' });
    expect(validateProfile(profile)).toEqual([]);
    expect(profileAccount(profile)).toBeNull();
  });

  test('rejects http and a malformed account ID', () => {
    expect(errorsOf(make('custom-url', { url: 'http://idp.example.com', accountId: '123' }))).toEqual(['url', 'accountId']);
  });
});

describe('httpsUrlError', () => {
  test('accepts any https host when no suffix is required', () => {
    expect(httpsUrlError('https://anything.example')).toBeNull();
  });

  test('names the allowed suffixes', () => {
    expect(httpsUrlError('https://example.com', ['.awsapps.com'])).toBe('The host must end with .awsapps.com');
    expect(httpsUrlError('https://example.com', ['.a', '.b', '.c'])).toBe('The host must end with .a, .b or .c');
  });
});
