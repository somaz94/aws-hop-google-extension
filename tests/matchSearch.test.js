import { describe, test, expect } from '@jest/globals';
import { matchProfile, normalizeRoleName } from '../src/lib/match.js';
import { normalizeProfile } from '../src/lib/profile.js';
import {
  filterProfiles, groupProfiles, invertsTarget, moveSelection, needsConfirmation, pickerKey, popupSections, resolveOpenTarget,
} from '../src/lib/search.js';

let next = 0;
const make = (input) => normalizeProfile(input, { idFactory: () => `id-${next++}` });

const shopProdAdmin = make({ name: 'shop-prod admin', provider: 'switch-role', tag: 'prod', guarded: true, group: 'Shop', fields: { account: '111122223333', roleName: 'Admin' } });
const shopProdRead = make({ name: 'shop-prod read', provider: 'sso', tag: 'prod', group: 'Shop', fields: { startUrl: 'https://example.awsapps.com/start', accountId: '111122223333', roleName: 'ReadOnly' } });
const shopDev = make({ name: 'shop-dev', provider: 'iam-user', tag: 'dev', group: 'Shop', fields: { account: '444455556666' } });
const sandbox = make({ name: 'sandbox', provider: 'iam-user', tag: 'dev', fields: { account: 'my-sandbox' } });
const all = [shopProdAdmin, shopProdRead, shopDev, sandbox];

describe('normalizeRoleName', () => {
  test.each([
    ['AWSReservedSSO_ReadOnly_0123abcd4567ef89', 'readonly'],
    ['ops/Admin', 'admin'],
    ['Admin', 'admin'],
    [null, ''],
  ])('%p → %p', (role, expected) => {
    expect(normalizeRoleName(role)).toBe(expected);
  });
});

describe('matchProfile', () => {
  test('no identity or no candidate gives null', () => {
    expect(matchProfile(all, null)).toBeNull();
    expect(matchProfile(all, { accounts: [] })).toBeNull();
    expect(matchProfile(all, { accounts: ['999999999999'], role: null })).toBeNull();
  });

  test('a single candidate is returned as is', () => {
    expect(matchProfile(all, { accounts: ['444455556666'], role: 'whatever' })).toBe(shopDev);
  });

  test('aliases match alias profiles', () => {
    expect(matchProfile(all, { accounts: ['my-sandbox'], role: null })).toBe(sandbox);
  });

  test('the role breaks ties, including SSO reserved role names', () => {
    expect(matchProfile(all, { accounts: ['111122223333'], role: 'AWSReservedSSO_ReadOnly_0123abcd' })).toBe(shopProdRead);
    expect(matchProfile(all, { accounts: ['111122223333'], role: 'shop-prod admin' })).toBe(shopProdAdmin);
  });

  test('without a usable role the first candidate wins', () => {
    expect(matchProfile(all, { accounts: ['111122223333'], role: null })).toBe(shopProdAdmin);
    expect(matchProfile(all, { accounts: ['111122223333'], role: 'Other' })).toBe(shopProdAdmin);
  });
});

describe('filterProfiles', () => {
  test('an empty query keeps everything in order', () => {
    expect(filterProfiles(all, '  ')).toBe(all);
    expect(filterProfiles(all, undefined)).toBe(all);
  });

  test('every term must match somewhere', () => {
    expect(filterProfiles(all, 'shop dev')).toEqual([shopDev]);
    expect(filterProfiles(all, 'prod sso')).toEqual([shopProdRead]);
  });

  test('matches the sign-in method in either language', () => {
    expect(filterProfiles(all, '역할')).toEqual([shopProdAdmin]);
    expect(filterProfiles(all, 'switch')).toEqual([shopProdAdmin]);
  });

  test('matches formatted and raw account IDs', () => {
    expect(filterProfiles(all, '4444-5555')).toEqual([shopDev]);
    expect(filterProfiles(all, '444455556666')).toEqual([shopDev]);
  });

  test('name prefix hits rank before other hits', () => {
    expect(filterProfiles(all, 'dev')).toEqual([shopDev, sandbox]);
    expect(filterProfiles(all, 'sand')[0]).toBe(sandbox);
    expect(filterProfiles(all, 'shop').map((p) => p.name)).toEqual(['shop-prod admin', 'shop-prod read', 'shop-dev']);
  });

  test('profiles with an unknown provider are still searchable', () => {
    const odd = { ...sandbox, id: 'odd', provider: 'nope', name: 'odd' };
    expect(filterProfiles([odd], 'odd')).toEqual([odd]);
  });

  test('no match gives an empty list', () => {
    expect(filterProfiles(all, 'nothing-like-this')).toEqual([]);
  });
});

describe('groupProfiles', () => {
  test('groups in order of first appearance', () => {
    expect(groupProfiles([shopProdAdmin, sandbox, shopDev]).map(({ group, profiles }) => [group, profiles.length]))
      .toEqual([['Shop', 2], ['', 1]]);
  });
});

describe('popupSections', () => {
  test('lists the groups while browsing', () => {
    expect(popupSections(all)).toEqual(groupProfiles(all));
  });

  test('puts the recent accounts first, still listing them in their group', () => {
    const sections = popupSections(all, { recent: [sandbox, shopDev] });
    expect(sections[0]).toEqual({ group: '', recent: true, profiles: [sandbox, shopDev] });
    expect(sections.slice(1)).toEqual(groupProfiles(all));
  });

  test('searching shows one ranked list and no recent section', () => {
    expect(popupSections(all, { query: ' dev ', recent: [sandbox] })).toEqual([{ group: '', profiles: filterProfiles(all, 'dev') }]);
  });
});

describe('needsConfirmation', () => {
  const on = { confirmGuarded: true };

  test('asks once for a protected account when the setting is on', () => {
    expect(needsConfirmation(shopProdAdmin, on, null)).toBe(true);
    expect(needsConfirmation(shopProdAdmin, on, shopDev.id)).toBe(true);
    expect(needsConfirmation(shopProdAdmin, on, shopProdAdmin.id)).toBe(false);
  });

  test('never asks for other accounts or with the setting off', () => {
    expect(needsConfirmation(shopDev, on, null)).toBe(false);
    expect(needsConfirmation(shopProdAdmin, { confirmGuarded: false }, null)).toBe(false);
  });
});

describe('moveSelection', () => {
  test.each([
    [0, 1, 0, -1],
    [-1, 1, 3, 0],
    [-1, -1, 3, 2],
    [2, 1, 3, 0],
    [0, -1, 3, 2],
    [1, 1, 3, 2],
  ])('from %p by %p in %p → %p', (index, delta, length, expected) => {
    expect(moveSelection(index, delta, length)).toBe(expected);
  });
});

describe('resolveOpenTarget', () => {
  test.each([
    ['new-tab', false, 'new-tab'],
    ['new-tab', true, 'current-tab'],
    ['current-tab', false, 'current-tab'],
    ['current-tab', true, 'new-tab'],
  ])('%p with modifier %p → %p', (openIn, invert, expected) => {
    expect(resolveOpenTarget(openIn, invert)).toBe(expected);
  });
});

describe('pickerKey', () => {
  const state = (extra) => ({ selected: 1, length: 3, confirming: false, ...extra });

  test.each([
    ['ArrowDown', state(), { action: 'move', selected: 2 }],
    ['ArrowUp', state({ selected: 0 }), { action: 'move', selected: 2 }],
    ['Enter', state(), { action: 'open', index: 1 }],
    ['Enter', state({ selected: -1 }), { action: 'open', index: 0 }],
    ['Escape', state({ confirming: true }), { action: 'unconfirm' }],
    ['Escape', state(), { action: 'escape' }],
  ])('%s → %p', (key, current, expected) => {
    expect(pickerKey(key, current)).toEqual(expected);
  });

  test('Enter on an empty list and other keys do nothing', () => {
    expect(pickerKey('Enter', state({ length: 0, selected: -1 }))).toBeNull();
    expect(pickerKey('a', state())).toBeNull();
  });
});

describe('invertsTarget', () => {
  test.each([
    [{ shiftKey: true }, true],
    [{ metaKey: true }, true],
    [{ ctrlKey: true }, true],
    [{ button: 1 }, true],
    [{ button: 0 }, false],
    [{}, false],
  ])('%p → %p', (event, expected) => {
    expect(invertsTarget(event)).toBe(expected);
  });
});
