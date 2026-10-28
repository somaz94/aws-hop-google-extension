import { describe, test, expect, jest } from '@jest/globals';
import { createStore, DEFAULT_SETTINGS, normalizeSettings, profilesFromItems, saveSetting } from '../src/lib/store.js';
import { createFakeStorage } from './helpers/fakeStorage.js';

const profile = (id, name = id) => ({ id, name, provider: 'iam-user', tag: '', guarded: false, color: null, group: '', fields: { account: '111122223333' } });

function setup(initial) {
  const storage = createFakeStorage(initial);
  return { storage, store: createStore({ area: storage.area, onChanged: storage.onChanged }) };
}

describe('profiles', () => {
  test('an empty store has no profiles', async () => {
    expect(await setup().store.loadProfiles()).toEqual([]);
  });

  test('saveProfile keeps one item per profile and appends to the order once', async () => {
    const { store, storage } = setup();
    await store.saveProfile(profile('a'));
    await store.saveProfile(profile('b'));
    await store.saveProfile(profile('a', 'renamed'));
    expect(storage.data.profileOrder).toEqual(['a', 'b']);
    expect(storage.data['profile:a'].name).toBe('renamed');
    expect((await store.loadProfiles()).map((p) => p.id)).toEqual(['a', 'b']);
  });

  test('deleteProfile removes the item and its place in the order', async () => {
    const { store, storage } = setup();
    await store.replaceAll([profile('a'), profile('b')]);
    await store.deleteProfile('a');
    expect(storage.data).not.toHaveProperty('profile:a');
    expect(storage.data.profileOrder).toEqual(['b']);
  });

  test('saveProfiles writes every profile in one call and appends only the new ones', async () => {
    const { store, storage } = setup();
    await store.replaceAll([profile('a'), profile('b')]);
    const writes = jest.spyOn(storage.area, 'set');
    await store.saveProfiles([profile('b', 'renamed'), profile('c')]);
    expect(writes).toHaveBeenCalledTimes(1);
    expect(storage.data.profileOrder).toEqual(['a', 'b', 'c']);
    expect(storage.data['profile:b'].name).toBe('renamed');
  });

  test('deleteProfiles removes many items in one call', async () => {
    const { store, storage } = setup();
    await store.replaceAll([profile('a'), profile('b'), profile('c')]);
    const removes = jest.spyOn(storage.area, 'remove');
    await store.deleteProfiles(['a', 'c']);
    expect(removes).toHaveBeenCalledTimes(1);
    expect(storage.data).not.toHaveProperty('profile:a');
    expect(storage.data).not.toHaveProperty('profile:c');
    expect(storage.data.profileOrder).toEqual(['b']);
  });

  test('deleteProfile and saveProfile cope with a missing order', async () => {
    const { store, storage } = setup({ 'profile:a': profile('a') });
    await store.deleteProfile('a');
    expect(storage.data.profileOrder).toEqual([]);
    await store.saveProfile(profile('b'));
    expect(storage.data.profileOrder).toEqual(['b']);
  });

  test('reorder rewrites the order only', async () => {
    const { store } = setup();
    await store.replaceAll([profile('a'), profile('b')]);
    await store.reorder(['b', 'a']);
    expect((await store.loadProfiles()).map((p) => p.id)).toEqual(['b', 'a']);
  });

  test('replaceAll drops profiles that are not in the new list', async () => {
    const { store, storage } = setup();
    await store.replaceAll([profile('a'), profile('b')]);
    await store.replaceAll([profile('c')]);
    expect(Object.keys(storage.data).sort()).toEqual(['profile:c', 'profileOrder']);
  });

  test('replaceAll with nothing stale skips the remove call', async () => {
    const { store, storage } = setup();
    const remove = jest.spyOn(storage.area, 'remove');
    await store.replaceAll([profile('a')]);
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('older stored accounts', () => {
  test('an account saved with an env loads with a tag and protection', async () => {
    const legacy = { id: 'old', name: 'shop-prod', provider: 'iam-user', env: 'prod', color: null, group: '', fields: { account: '111122223333' } };
    const { store } = setup({ profileOrder: ['old'], 'profile:old': legacy });
    expect(await store.loadProfiles()).toEqual([
      { id: 'old', name: 'shop-prod', provider: 'iam-user', tag: 'prod', guarded: true, color: null, group: '', fields: { account: '111122223333' } },
    ]);
  });
});

describe('profilesFromItems', () => {
  test('orders by profileOrder and appends unordered profiles', () => {
    const items = {
      profileOrder: ['b', 'gone', 'a'],
      'profile:a': profile('a'),
      'profile:b': profile('b'),
      'profile:c': profile('c'),
      'profile:broken': 'not an object',
      settings: {},
    };
    expect(profilesFromItems(items).map((p) => p.id)).toEqual(['b', 'a', 'c']);
  });

  test('ignores a malformed order', () => {
    expect(profilesFromItems({ profileOrder: 'a', 'profile:a': profile('a') }).map((p) => p.id)).toEqual(['a']);
  });
});

describe('settings', () => {
  test('defaults when nothing is stored', async () => {
    expect(await setup().store.loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  test('round-trips valid values and drops invalid ones', async () => {
    const { store } = setup();
    await store.saveSettings({ language: 'ko', openIn: 'current-tab', guardEnabled: false, guardTitlePrefix: 'yes', guardPosition: 'bottom-right', theme: 'dark', extra: 1 });
    expect(await store.loadSettings()).toEqual({ ...DEFAULT_SETTINGS, language: 'ko', openIn: 'current-tab', guardEnabled: false, guardPosition: 'bottom-right', theme: 'dark' });
  });

  test('normalizeSettings ignores junk', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ openIn: 'popup', language: 'fr', guardPosition: 'top-left', theme: 'sepia' })).toEqual(DEFAULT_SETTINGS);
  });
});

describe('onChange', () => {
  test('reports which kind of data changed, for its own area only', async () => {
    const { store, storage } = setup();
    const listener = jest.fn();
    const unsubscribe = store.onChange(listener);

    await store.saveProfile(profile('a'));
    await store.saveSettings({});
    storage.emit({ unrelated: {} });
    expect(listener.mock.calls.map(([flags]) => flags)).toEqual([
      { profiles: true, settings: false },
      { profiles: false, settings: true },
    ]);

    unsubscribe();
    expect(storage.listenerCount()).toBe(0);
  });

  test('ignores changes from another storage area', () => {
    const storage = createFakeStorage({}, 'local');
    const store = createStore({ area: storage.area, onChanged: storage.onChanged });
    const listener = jest.fn();
    store.onChange(listener);
    storage.emit({ settings: {} });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('saveSetting', () => {
  test('saves one setting and keeps the others', async () => {
    const { store } = setup();
    const recent = { clear: jest.fn() };
    await saveSetting(store, 'openIn', 'current-tab', { recent });
    await saveSetting(store, 'theme', 'dark', { recent });
    expect(await store.loadSettings()).toEqual({ ...DEFAULT_SETTINGS, openIn: 'current-tab', theme: 'dark' });
    expect(recent.clear).not.toHaveBeenCalled();
  });

  test('turning the recent list off also forgets it, turning it on does not', async () => {
    const { store } = setup();
    const recent = { clear: jest.fn() };
    await saveSetting(store, 'showRecent', false, { recent });
    expect(recent.clear).toHaveBeenCalledTimes(1);
    await saveSetting(store, 'showRecent', true, { recent });
    expect(recent.clear).toHaveBeenCalledTimes(1);
  });
});
