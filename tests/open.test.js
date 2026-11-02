import { describe, test, expect } from '@jest/globals';
import { createPickOpener } from '../src/background/open.js';
import { createLandingStore } from '../src/lib/landing.js';
import { openProfile } from '../src/lib/open.js';
import { normalizeProfile } from '../src/lib/profile.js';
import { createRecentStore, RECENT_KEY } from '../src/lib/recent.js';
import { createSessionStore } from '../src/lib/sessions.js';
import { createStore, DEFAULT_SETTINGS } from '../src/lib/store.js';
import { createFakeStorage } from './helpers/fakeStorage.js';

const prod = normalizeProfile({ id: 'prod', name: 'shop-prod', provider: 'iam-user', fields: { account: '111122223333' } });
const URL = 'https://111122223333.signin.aws.amazon.com/console';

function deps() {
  const calls = [];
  const local = createFakeStorage({}, 'local');
  return {
    calls,
    local,
    recent: createRecentStore({ area: local.area }),
    sessions: createSessionStore({ area: createFakeStorage({}, 'session').area }),
    landings: createLandingStore({ area: createFakeStorage({}, 'session').area }),
    tabs: {
      update: async (...args) => {
        calls.push(['update', ...args]);
        return { id: typeof args[0] === 'number' ? args[0] : 8 };
      },
      create: async (props) => {
        calls.push(['create', props]);
        return { id: 9 };
      },
    },
  };
}

describe('openProfile', () => {
  test('a new tab, the sender tab, or the active tab, remembering the account', async () => {
    const d = deps();
    await openProfile(prod, { ...d, settings: DEFAULT_SETTINGS, target: 'new-tab' });
    await openProfile(prod, { ...d, settings: DEFAULT_SETTINGS, target: 'new-tab', active: false });
    await openProfile(prod, { ...d, settings: DEFAULT_SETTINGS, target: 'current-tab', tabId: 7 });
    await openProfile(prod, { ...d, settings: { ...DEFAULT_SETTINGS, showRecent: false }, target: 'current-tab' });
    expect(d.calls).toEqual([
      ['create', { url: URL, active: true }],
      ['create', { url: URL, active: false }],
      ['update', 7, { url: URL }],
      ['update', { url: URL }],
    ]);
    expect(d.local.data[RECENT_KEY]).toEqual(['prod']);
  });

  test('notes which account each tab was opened for, in whichever tab Chrome reports', async () => {
    const d = deps();
    await openProfile(prod, { ...d, settings: DEFAULT_SETTINGS, target: 'new-tab' });
    await openProfile(prod, { ...d, settings: DEFAULT_SETTINGS, target: 'current-tab', tabId: 7 });
    await openProfile(prod, { ...d, settings: DEFAULT_SETTINGS, target: 'current-tab' });
    expect(await Promise.all([9, 7, 8].map((id) => d.landings.expectedFor(id)))).toEqual(['prod', 'prod', 'prod']);
  });

  test('a tab Chrome does not describe notes nothing', async () => {
    const d = deps();
    await openProfile(prod, { ...d, tabs: { create: async () => undefined }, settings: DEFAULT_SETTINGS, target: 'new-tab' });
    expect(await d.landings.expectedFor(9)).toBeNull();
  });
});

describe('createPickOpener', () => {
  async function setup(settings = DEFAULT_SETTINGS) {
    const d = deps();
    const sync = createFakeStorage();
    const store = createStore({ area: sync.area, onChanged: sync.onChanged });
    await store.replaceAll([prod]);
    await store.saveSettings(settings);
    return { ...d, open: createPickOpener({ store, ...d }) };
  }

  test('opens the picked account where the setting says, or the other way when inverted', async () => {
    const { open, calls } = await setup();
    await open('prod', false, 7);
    await open('prod', true, 7);
    expect(calls).toEqual([['create', { url: URL, active: true }], ['update', 7, { url: URL }]]);
  });

  test('ignores an account that no longer exists', async () => {
    const { open, calls } = await setup();
    await open('gone', false, 7);
    expect(calls).toEqual([]);
  });
});
