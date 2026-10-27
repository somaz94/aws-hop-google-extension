import { describe, test, expect } from '@jest/globals';
import {
  buildProfileUrl, GROUP_MAX, NAME_MAX, normalizeProfile, profileAccount, profileColor, profileRoles, validateProfile,
} from '../src/lib/profile.js';

const idFactory = () => 'fixed-id';

describe('normalizeProfile', () => {
  test('fills defaults for empty input', () => {
    expect(normalizeProfile(null, { idFactory })).toEqual({
      id: 'fixed-id', name: '', provider: '', env: 'other', color: null, group: '', fields: {},
    });
  });

  test('generates a UUID by default and keeps a given id', () => {
    expect(normalizeProfile({}).id).toMatch(/^[0-9a-f-]{36}$/);
    expect(normalizeProfile({ id: ' abc ' }).id).toBe('abc');
  });

  test('trims, drops unknown field keys and normalizes known ones', () => {
    const profile = normalizeProfile({
      name: '  shop  ', provider: 'iam-user', group: ' Shop ',
      fields: { account: ' 1111-2222-3333 ', undeclared: 'dropped' },
    }, { idFactory });
    expect(profile).toMatchObject({ name: 'shop', group: 'Shop', fields: { account: '111122223333' } });
    expect(profile.fields).not.toHaveProperty('undeclared');
  });

  test('keeps an unknown provider so it can be reported', () => {
    const profile = normalizeProfile({ name: 'x', provider: 'future-method' }, { idFactory });
    expect(profile.provider).toBe('future-method');
    expect(validateProfile(profile)).toEqual([{ field: 'provider', message: 'Unknown sign-in method "future-method"' }]);
  });

  test('rejects invalid env and color', () => {
    expect(normalizeProfile({ env: 'production', color: 'red' }, { idFactory })).toMatchObject({ env: 'other', color: null });
    expect(normalizeProfile({ env: 'dev', color: '#ABC' }, { idFactory })).toMatchObject({ env: 'dev', color: '#aabbcc' });
  });
});

describe('validateProfile', () => {
  const valid = { name: 'shop', provider: 'iam-user', fields: { account: '111122223333' } };

  test('a complete profile has no errors', () => {
    expect(validateProfile(normalizeProfile(valid, { idFactory }))).toEqual([]);
  });

  test('name is required and bounded', () => {
    expect(validateProfile(normalizeProfile({ ...valid, name: '' }, { idFactory }))[0].field).toBe('name');
    expect(validateProfile(normalizeProfile({ ...valid, name: 'x'.repeat(NAME_MAX + 1) }, { idFactory }))[0].field).toBe('name');
  });

  test('group is bounded', () => {
    expect(validateProfile(normalizeProfile({ ...valid, group: 'g'.repeat(GROUP_MAX + 1) }, { idFactory }))[0].field).toBe('group');
  });
});

describe('profile helpers', () => {
  const profile = normalizeProfile({ name: 'shop', provider: 'iam-user', env: 'dev', fields: { account: '111122223333' } }, { idFactory });

  test('color falls back to the environment color', () => {
    expect(profileColor(profile)).toBe('#1d8102');
    expect(profileColor({ ...profile, color: '#123456' })).toBe('#123456');
  });

  test('account and roles', () => {
    expect(profileAccount(profile)).toBe('111122223333');
    expect(profileRoles(profile)).toEqual([]);
  });

  test('an unknown provider has no account, roles or URL', () => {
    const unknown = { ...profile, provider: 'nope' };
    expect(profileAccount(unknown)).toBeNull();
    expect(profileRoles(unknown)).toEqual([]);
    expect(() => buildProfileUrl(unknown)).toThrow('Unknown sign-in method "nope"');
  });
});
