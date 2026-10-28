import { describe, test, expect } from '@jest/globals';
import { bulkEdit, keepSelected, moveBy, moveNextTo, selectionState, selectRange, suggestionsFor } from '../src/lib/listEdit.js';
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
