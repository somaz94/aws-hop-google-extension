import { describe, test, expect } from '@jest/globals';
import { createRecentStore, pushRecent, RECENT_KEY, RECENT_LIMIT, recentProfiles } from '../src/lib/recent.js';
import { createFakeStorage } from './helpers/fakeStorage.js';

const ids = (n) => Array.from({ length: n }, (_, i) => `p${i}`);
const profiles = (n) => ids(n).map((id) => ({ id, name: id }));

describe('pushRecent', () => {
  test('moves the id to the front without duplicates and keeps the limit', () => {
    expect(pushRecent([], 'a')).toEqual(['a']);
    expect(pushRecent(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b']);
    expect(pushRecent(ids(RECENT_LIMIT), 'new')).toEqual(['new', ...ids(RECENT_LIMIT - 1)]);
    expect(pushRecent(['a', 'b'], 'c', 2)).toEqual(['c', 'a']);
  });
});

describe('recentProfiles', () => {
  test('returns existing profiles in recent order, dropping deleted ones', () => {
    const list = profiles(RECENT_LIMIT + 1);
    expect(recentProfiles(list, ['p3', 'gone', 'p0']).map((p) => p.id)).toEqual(['p3', 'p0']);
  });

  test('is empty when the whole list fits in the recent section', () => {
    expect(recentProfiles(profiles(RECENT_LIMIT), ['p0'])).toEqual([]);
  });

  test('never returns more than the limit', () => {
    expect(recentProfiles(profiles(10), ids(10), 3)).toHaveLength(3);
  });
});

describe('createRecentStore', () => {
  test('records, loads and clears in its storage area', async () => {
    const storage = createFakeStorage({}, 'local');
    const store = createRecentStore({ area: storage.area });
    expect(await store.load()).toEqual([]);
    await store.record('a');
    await store.record('b');
    await store.record('a');
    expect(await store.load()).toEqual(['a', 'b']);
    await store.clear();
    expect(storage.data).toEqual({});
  });

  test('ignores junk left in storage', async () => {
    const junk = createRecentStore({ area: createFakeStorage({ [RECENT_KEY]: 'a' }).area });
    expect(await junk.load()).toEqual([]);
    const mixed = createRecentStore({ area: createFakeStorage({ [RECENT_KEY]: ['a', 1, null, 'b'] }).area });
    expect(await mixed.load()).toEqual(['a', 'b']);
  });

  test('defaults to chrome.storage.local', async () => {
    const storage = createFakeStorage({}, 'local');
    globalThis.chrome = { storage: { local: storage.area } };
    try {
      await createRecentStore().record('x');
      expect(storage.data[RECENT_KEY]).toEqual(['x']);
    } finally {
      delete globalThis.chrome;
    }
  });
});
