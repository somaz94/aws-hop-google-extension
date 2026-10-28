import { describe, test, expect } from '@jest/globals';
import {
  bulkEdit, dropMove, groupColor, groupIds, keepSelected, moveBy, moveNextTo, regroupedColor, restoredOrder, selectionState, selectRange,
  suggestionsFor, ungroup,
} from '../src/lib/listEdit.js';
import { normalizeProfile } from '../src/lib/profile.js';

const ids = ['a', 'b', 'c', 'd'];
const profile = (id, extra = {}) => normalizeProfile({ id, name: `shop-${id}`, provider: 'iam-user', fields: { account: '111122223333' }, ...extra });

describe('moveBy', () => {
  test.each([
    ['b', -1, ['b', 'a', 'c', 'd']],
    ['b', 1, ['a', 'c', 'b', 'd']],
    ['a', -1, ['a', 'b', 'c', 'd']],
    ['d', 1, ['a', 'b', 'c', 'd']],
    ['a', 9, ['b', 'c', 'd', 'a']],
  ])('%s by %i', (id, delta, expected) => {
    expect(moveBy(ids, id, delta)).toEqual(expected);
  });

  test('an unknown id leaves a copy of the order', () => {
    const next = moveBy(ids, 'x', 1);
    expect(next).toEqual(ids);
    expect(next).not.toBe(ids);
  });
});

describe('moveNextTo', () => {
  test.each([
    ['d', 'a', false, ['d', 'a', 'b', 'c']],
    ['d', 'a', true, ['a', 'd', 'b', 'c']],
    ['a', 'd', true, ['b', 'c', 'd', 'a']],
    ['a', 'c', false, ['b', 'a', 'c', 'd']],
    ['c', 'b', true, ['a', 'b', 'c', 'd']],
  ])('%s next to %s (after: %p)', (id, target, after, expected) => {
    expect(moveNextTo(ids, id, target, after)).toEqual(expected);
  });

  test.each([['a', 'a'], ['x', 'a'], ['a', 'x']])('%s onto %s changes nothing', (id, target) => {
    expect(moveNextTo(ids, id, target)).toEqual(ids);
  });
});

describe('selection', () => {
  test('a range selects every id between the anchor and the target, in either direction', () => {
    expect([...selectRange(new Set(), ids, 'b', 'd', true)].sort()).toEqual(['b', 'c', 'd']);
    expect([...selectRange(new Set(), ids, 'd', 'b', true)].sort()).toEqual(['b', 'c', 'd']);
  });

  test('a range clears when the target was cleared', () => {
    expect([...selectRange(new Set(ids), ids, 'a', 'c', false)]).toEqual(['d']);
  });

  test('without a listed anchor only the target changes', () => {
    expect([...selectRange(new Set(['a']), ids, null, 'c', true)].sort()).toEqual(['a', 'c']);
    expect([...selectRange(new Set(['a']), ids, 'gone', 'c', true)].sort()).toEqual(['a', 'c']);
  });

  test('an unlisted target changes nothing and the input is never mutated', () => {
    const selected = new Set(['a']);
    expect([...selectRange(selected, ids, 'a', 'x', true)]).toEqual(['a']);
    selectRange(selected, ids, 'a', 'c', true);
    expect([...selected]).toEqual(['a']);
  });

  test('keepSelected drops ids that are no longer listed', () => {
    expect([...keepSelected(new Set(['a', 'x', 'c']), ids)]).toEqual(['a', 'c']);
  });

  test.each([
    [[], 'none'],
    [['a'], 'some'],
    [ids, 'all'],
    [['x'], 'none'],
  ])('selection state of %p', (selected, expected) => {
    expect(selectionState(new Set(selected), ids)).toBe(expected);
  });

  test('nothing listed reads as nothing selected', () => {
    expect(selectionState(new Set(), [])).toBe('none');
  });
});

describe('bulkEdit', () => {
  const profiles = [profile('a', { tag: 'prod', group: 'shop' }), profile('b', { tag: 'dev' }), profile('c', { guarded: true })];

  test('applies the change to the chosen profiles only', () => {
    const next = bulkEdit(profiles, ['a', 'b'], { group: '  team  ' });
    expect(next.map((p) => [p.id, p.group, p.tag])).toEqual([['a', 'team', 'prod'], ['b', 'team', 'dev']]);
  });

  test('leaves out profiles the change does not alter', () => {
    expect(bulkEdit(profiles, ['a', 'b', 'c'], { guarded: true }).map((p) => p.id)).toEqual(['a', 'b']);
    expect(bulkEdit(profiles, ['a'], { tag: 'prod' })).toEqual([]);
  });

  test('an empty value clears the field', () => {
    expect(bulkEdit(profiles, ['a', 'b'], { tag: '' }).map((p) => p.tag)).toEqual(['', '']);
  });

  test('sets a color, normalized', () => {
    expect(bulkEdit(profiles, ['b'], { color: '#ABCDEF' }).map((p) => p.color)).toEqual(['#abcdef']);
  });

  test('ignores every other field', () => {
    expect(bulkEdit(profiles, ['a'], { name: 'renamed', id: 'z', fields: {} })).toEqual([]);
  });

  test('keeps the rest of each profile and never mutates the input', () => {
    const [next] = bulkEdit(profiles, ['c'], { guarded: false });
    expect(next).toEqual({ ...profiles[2], guarded: false });
    expect(profiles[2].guarded).toBe(true);
  });
});

describe('suggestionsFor', () => {
  test('lists tags in use, then the built-in ones, and groups in use, each once', () => {
    const profiles = [profile('a', { tag: 'qa', group: 'shop' }), profile('b', { tag: 'prod', group: 'shop' }), profile('c')];
    expect(suggestionsFor(profiles, ['prod', 'dev'])).toEqual({ tags: ['qa', 'prod', 'dev'], groups: ['shop'] });
  });

  test('works without built-in tags', () => {
    expect(suggestionsFor([])).toEqual({ tags: [], groups: [] });
  });
});

describe('restoredOrder', () => {
  test('restored ids go back to their earlier places', () => {
    expect(restoredOrder(['a', 'b', 'c', 'd'], ['a', 'd', 'b', 'c'])).toEqual(['a', 'b', 'c', 'd']);
  });

  test('ids added since the delete go last, and ids removed since stay out', () => {
    expect(restoredOrder(['a', 'b', 'c'], ['b', 'x', 'c'])).toEqual(['b', 'c', 'x']);
  });
});

describe('groups', () => {
  const profiles = [
    profile('a', { group: 'shop' }), profile('b', { group: 'data' }), profile('c', { group: 'shop' }), profile('d'),
  ];

  test('groupIds lists the members, and the empty name the accounts in no group', () => {
    expect(groupIds(profiles, 'shop')).toEqual(['a', 'c']);
    expect(groupIds(profiles, '')).toEqual(['d']);
  });

  test('groupColor is the color every member shares, else null', () => {
    const colored = profiles.map((p) => (p.group === 'shop' ? { ...p, color: '#123456' } : p));
    expect(groupColor(colored, 'shop')).toBe('#123456');
    expect(groupColor(colored.map((p) => (p.id === 'c' ? { ...p, color: '#654321' } : p)), 'shop')).toBeNull();
    expect(groupColor(profiles, 'shop')).toBeNull();
    expect(groupColor(colored, '')).toBeNull();
    expect(groupColor(colored, 'none')).toBeNull();
  });

  test('a drop moves the row and, onto another group, moves it into that group', () => {
    const shown = ['a', 'c', 'b', 'd'];
    expect(dropMove(profiles, shown, 'c', 'a', false)).toEqual({ order: ['c', 'a', 'b', 'd'], regrouped: null });
    const across = dropMove(profiles, shown, 'd', 'b', true);
    expect(across.order).toEqual(['a', 'c', 'b', 'd']);
    expect([across.regrouped.id, across.regrouped.group]).toEqual(['d', 'data']);
    expect(dropMove(profiles, shown, 'x', 'a', false).regrouped).toBeNull();
  });
});

describe('group colors when accounts move', () => {
  const GREEN = '#22aa22';
  const members = [
    profile('a', { group: 'lucky', color: GREEN }), profile('b', { group: 'lucky', color: GREEN }),
    profile('c'), profile('d', { color: '#123456' }), profile('e', { group: 'other' }),
  ];

  test('an account with an automatic color takes the color of the group it joins', () => {
    expect(regroupedColor(members.filter((p) => p.id !== 'c'), members[2], 'lucky')).toBe(GREEN);
    expect(bulkEdit(members, ['c'], { group: 'lucky' })[0].color).toBe(GREEN);
    expect(dropMove(members, ['a', 'b', 'c', 'd', 'e'], 'c', 'b', true).regrouped.color).toBe(GREEN);
  });

  test('a color the account was given itself stays', () => {
    expect(bulkEdit(members, ['d'], { group: 'lucky' })[0].color).toBe('#123456');
  });

  test('leaving a group gives back the color it only had from that group', () => {
    expect(bulkEdit(members, ['b'], { group: '' })[0]).toMatchObject({ group: '', color: null });
    expect(bulkEdit(members, ['b'], { group: 'other' })[0]).toMatchObject({ group: 'other', color: null });
  });

  test('renaming a whole group or setting the same group again keeps the colors', () => {
    expect(bulkEdit(members, ['a', 'b'], { group: 'lucky2' }).map((p) => [p.group, p.color])).toEqual([['lucky2', GREEN], ['lucky2', GREEN]]);
    expect(bulkEdit(members, ['a', 'b'], { group: 'lucky' })).toEqual([]);
  });

  test('ungroup takes every member out, dropping the shared color but not a different one', () => {
    const mixed = [...members, profile('f', { group: 'lucky', color: '#654321' })];
    expect(ungroup(members, 'lucky').map((p) => [p.id, p.group, p.color])).toEqual([['a', '', null], ['b', '', null]]);
    expect(ungroup(mixed, 'lucky').map((p) => p.color)).toEqual([GREEN, GREEN, '#654321']);
  });
});
