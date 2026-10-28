import { describe, test, expect } from '@jest/globals';
import {
  buildProfileUrl, fieldValues, GROUP_MAX, NAME_MAX, normalizeProfile, profileAccount, profileColor, profileLabel, profileMeta, profileRoles, profileTarget, sameTargetAs, validateProfile,
} from '../src/lib/profile.js';
import { colorFor, TAG_MAX } from '../src/lib/tag.js';

const idFactory = () => 'fixed-id';

describe('normalizeProfile', () => {
  test('fills defaults for empty input', () => {
    expect(normalizeProfile(null, { idFactory })).toEqual({
      id: 'fixed-id', name: '', provider: '', tag: '', guarded: false, color: null, group: '', fields: {},
    });
  });

  test('generates a UUID by default and keeps a given id', () => {
    expect(normalizeProfile({}).id).toMatch(/^[0-9a-f-]{36}$/);
    expect(normalizeProfile({ id: ' abc ' }).id).toBe('abc');
  });

  test('trims, drops unknown field keys and normalizes known ones', () => {
    const profile = normalizeProfile({
      name: '  shop  ', provider: 'iam-user', group: ' Shop ', tag: ' qa ',
      fields: { account: ' 1111-2222-3333 ', undeclared: 'dropped' },
    }, { idFactory });
    expect(profile).toMatchObject({ name: 'shop', group: 'Shop', tag: 'qa', fields: { account: '111122223333' } });
    expect(profile.fields).not.toHaveProperty('undeclared');
  });

  test('keeps an unknown provider so it can be reported', () => {
    const profile = normalizeProfile({ name: 'x', provider: 'future-method' }, { idFactory });
    expect(profile.provider).toBe('future-method');
    expect(validateProfile(profile)).toEqual([{ field: 'provider', message: 'Unknown sign-in method "future-method"' }]);
  });

  test('guarded must be a boolean and the color a hex', () => {
    expect(normalizeProfile({ guarded: 'yes', color: 'red' }, { idFactory })).toMatchObject({ guarded: false, color: null });
    expect(normalizeProfile({ guarded: true, color: '#ABC' }, { idFactory })).toMatchObject({ guarded: true, color: '#aabbcc' });
  });

  test.each([
    ['prod', 'prod', true],
    ['stage', 'stage', false],
    ['other', '', false],
    ['constructor', '', false],
  ])('reads an older env %p as tag %p, protected %p', (env, tag, guarded) => {
    expect(normalizeProfile({ env }, { idFactory })).toMatchObject({ tag, guarded });
  });

  test('an explicit tag or guarded wins over a legacy env', () => {
    expect(normalizeProfile({ env: 'prod', tag: 'live', guarded: false }, { idFactory })).toMatchObject({ tag: 'live', guarded: false });
  });
});

describe('validateProfile', () => {
  const valid = { name: 'shop', provider: 'iam-user', fields: { account: '111122223333' } };
  const errorFields = (input) => validateProfile(normalizeProfile(input, { idFactory })).map((error) => error.field);

  test('a complete profile has no errors', () => {
    expect(errorFields(valid)).toEqual([]);
  });

  test('name is required and bounded', () => {
    expect(errorFields({ ...valid, name: '' })).toEqual(['name']);
    expect(errorFields({ ...valid, name: 'x'.repeat(NAME_MAX + 1) })).toEqual(['name']);
  });

  test('tag and group are bounded', () => {
    expect(errorFields({ ...valid, tag: 't'.repeat(TAG_MAX + 1), group: 'g'.repeat(GROUP_MAX + 1) })).toEqual(['tag', 'group']);
  });

  test('a missing required field names the field', () => {
    expect(validateProfile(normalizeProfile({ ...valid, fields: {} }, { idFactory }))).toEqual([
      { field: 'account', message: 'Account ID or alias is required' },
    ]);
  });
});

describe('sameTargetAs', () => {
  const iam = (id, name, account) => normalizeProfile({ id, name, provider: 'iam-user', fields: { account } });
  const list = [iam('a', 'shop-prod', '111122223333'), iam('b', 'shop-dev', '444455556666')];

  test('finds another account that signs in to the same place, whatever its name', () => {
    expect(sameTargetAs(list, iam('new', 'other', '1111-2222-3333'))?.name).toBe('shop-prod');
  });

  test('an account is not its own duplicate, and a new place has none', () => {
    expect(sameTargetAs(list, list[0])).toBeNull();
    expect(sameTargetAs(list, iam('new', 'x', '999999999999'))).toBeNull();
  });
});

describe('fieldValues', () => {
  test('keeps only the prefixed entries, without the prefix', () => {
    expect(fieldValues([['name', 'x'], ['field:account', '111122223333'], ['field:roleName', 'Admin']])).toEqual({ account: '111122223333', roleName: 'Admin' });
  });
});

describe('labels', () => {
  const account = (extra) => normalizeProfile({ name: 'shop-prod', provider: 'iam-user', fields: { account: '111122223333' }, ...extra }, { idFactory });

  test('the tag goes in front of the name when there is one', () => {
    expect(profileLabel(account({ tag: 'prod' }))).toBe('prod · shop-prod');
    expect(profileLabel(account())).toBe('shop-prod');
  });

  test('the meta line joins whichever of method, account and group are set', () => {
    expect(profileMeta(account({ group: 'shop' }), 'IAM')).toBe('IAM · 1111-2222-3333 · shop');
    expect(profileMeta(account(), undefined)).toBe('1111-2222-3333');
    expect(profileMeta(account({ group: 'shop' }), 'IAM', { withGroup: false })).toBe('IAM · 1111-2222-3333');
    expect(profileMeta(normalizeProfile({ name: 'x', provider: 'custom-url', fields: { url: 'https://idp.example.com' } }, { idFactory }), 'URL')).toBe('URL');
  });
});

describe('profile helpers', () => {
  const make = (input) => normalizeProfile({ provider: 'iam-user', fields: { account: '111122223333' }, ...input }, { idFactory });

  test('a chosen color wins', () => {
    expect(profileColor(make({ name: 'shop-dev', color: '#123456' }))).toBe('#123456');
  });

  test('otherwise the group decides, so a project shares one color', () => {
    expect(profileColor(make({ name: 'anything', group: 'Shop' }))).toBe(colorFor('Shop'));
  });

  test('without a group, the first word of the name decides', () => {
    expect(profileColor(make({ name: 'shop-dev' }))).toBe(profileColor(make({ name: 'shop prod' })));
    expect(profileColor(make({ name: 'shop-dev' }))).toBe(colorFor('shop'));
    expect(profileColor(make({ name: '---' }))).toBe(colorFor('---'));
  });

  test('account and roles', () => {
    expect(profileAccount(make({ name: 'shop' }))).toBe('111122223333');
    expect(profileRoles(make({ name: 'shop' }))).toEqual([]);
  });

  test('the sign-in target ignores names, tags and colors', () => {
    expect(profileTarget(make({ name: 'a', tag: 'x', color: '#000000' }))).toBe(profileTarget(make({ name: 'b' })));
    expect(profileTarget(make({ name: 'a' }))).not.toBe(profileTarget(make({ name: 'a', fields: { account: '444455556666' } })));
  });

  test('an unknown provider has no account, roles or URL', () => {
    const unknown = { ...make({ name: 'x' }), provider: 'nope' };
    expect(profileAccount(unknown)).toBeNull();
    expect(profileRoles(unknown)).toEqual([]);
    expect(profileTarget(unknown)).toBe('nope:{"account":"111122223333"}');
    expect(() => buildProfileUrl(unknown)).toThrow('Unknown sign-in method "nope"');
  });
});
