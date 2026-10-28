import { describe, test, expect, afterEach } from '@jest/globals';
import { createOmnibox, defaultDescription, omniboxSuggestions, resolveOmnibox, SUGGEST_MAX } from '../src/background/omnibox.js';
import { setLanguage } from '../src/i18n/index.js';
import { normalizeProfile } from '../src/lib/profile.js';
import { createRecentStore, RECENT_KEY } from '../src/lib/recent.js';
import { createStore, DEFAULT_SETTINGS } from '../src/lib/store.js';
import { createFakeStorage } from './helpers/fakeStorage.js';

const account = (id, name, extra = {}) => normalizeProfile({ id, name, provider: 'iam-user', fields: { account: '111122223333' }, ...extra });
const prod = account('prod', 'shop-prod', { tag: 'prod', guarded: true });
const dev = account('dev', 'shop-dev');
const data = account('data', 'data-sso');
const PROFILES = [dev, prod, data];
const CONFIRM = { ...DEFAULT_SETTINGS, confirmGuarded: true };

afterEach(() => setLanguage('en'));

describe('resolveOmnibox', () => {
  test('nothing for empty input or no match', () => {
    expect(resolveOmnibox(PROFILES, '  ', DEFAULT_SETTINGS)).toEqual({ profile: null, blocked: null });
    expect(resolveOmnibox(PROFILES, 'billing', DEFAULT_SETTINGS)).toEqual({ profile: null, blocked: null });
  });

  test('an exact name wins over an earlier partial match, otherwise the top match', () => {
    expect(resolveOmnibox(PROFILES, 'SHOP-PROD', DEFAULT_SETTINGS).profile).toBe(prod);
    expect(resolveOmnibox(PROFILES, 'shop', DEFAULT_SETTINGS).profile).toBe(dev);
    expect(resolveOmnibox(PROFILES, 'prod', DEFAULT_SETTINGS).profile).toBe(prod);
  });

  test('with confirmation on, a protected account needs its exact name', () => {
    expect(resolveOmnibox(PROFILES, 'prod', CONFIRM)).toEqual({ profile: null, blocked: prod });
    expect(resolveOmnibox(PROFILES, 'shop-prod', CONFIRM)).toEqual({ profile: prod, blocked: null });
    expect(resolveOmnibox(PROFILES, 'data', CONFIRM)).toEqual({ profile: data, blocked: null });
  });
});

describe('defaultDescription', () => {
  test('says what Enter does, escaped for Chrome', () => {
    expect(defaultDescription('', { profile: null, blocked: null })).toBe('Type an account name, tag or ID');
    expect(defaultDescription('x', { profile: null, blocked: null })).toBe('No account matches');
    expect(defaultDescription('p', { profile: prod, blocked: null })).toBe('Open prod · shop-prod');
    expect(defaultDescription('p', { profile: null, blocked: prod })).toBe('shop-prod is protected: pick it below or type its full name');
    expect(defaultDescription('a', { profile: account('x', 'R&D <"sandbox">'), blocked: null })).toBe('Open R&amp;D &lt;&quot;sandbox&quot;&gt;');
  });

  test('speaks the current language', () => {
    setLanguage('ko');
    expect(defaultDescription('p', { profile: dev, blocked: null })).toBe('shop-dev 열기');
  });
});

describe('omniboxSuggestions', () => {
  test('ranked matches with the name as content, protected ones marked', () => {
    expect(omniboxSuggestions(PROFILES, 'shop')).toEqual([
      { content: 'shop-dev', description: '<match>shop-dev</match>' },
      { content: 'shop-prod', description: '<match>prod · shop-prod</match> <dim>Protected account</dim>' },
    ]);
  });

  test('none for empty input, at most the limit, and escaped', () => {
    expect(omniboxSuggestions(PROFILES, ' ')).toEqual([]);
    const many = Array.from({ length: SUGGEST_MAX + 3 }, (_, i) => account(`a${i}`, `team-${i}`));
    expect(omniboxSuggestions(many, 'team')).toHaveLength(SUGGEST_MAX);
    expect(omniboxSuggestions([account('x', `O'Neil & co`)], 'neil')[0].description).toBe('<match>O&apos;Neil &amp; co</match>');
  });
});

describe('createOmnibox', () => {
  async function setup(settings = DEFAULT_SETTINGS) {
    const sync = createFakeStorage();
    const local = createFakeStorage({}, 'local');
    const store = createStore({ area: sync.area, onChanged: sync.onChanged });
    await store.replaceAll(PROFILES);
    await store.saveSettings(settings);
    const calls = [];
    const tabs = { update: async (props) => calls.push(['update', props]), create: async (props) => calls.push(['create', props]) };
    const defaults = [];
    const omnibox = createOmnibox({
      store,
      recent: createRecentStore({ area: local.area }),
      tabs,
      omnibox: { setDefaultSuggestion: (suggestion) => defaults.push(suggestion.description) },
      uiLanguage: 'en-US',
    });
    return { omnibox, calls, defaults, local };
  }
  const PROD_URL = 'https://111122223333.signin.aws.amazon.com/console';

  test('typing updates the first line and the suggestions, in the chosen language', async () => {
    const { omnibox, defaults } = await setup({ ...DEFAULT_SETTINGS, language: 'ko' });
    let suggested;
    await omnibox.onInputChanged('data', (list) => { suggested = list; });
    expect(defaults).toEqual(['data-sso 열기']);
    expect(suggested).toEqual([{ content: 'data-sso', description: '<match>data-sso</match>' }]);
  });

  test('Enter follows the open-in setting and remembers the account', async () => {
    const { omnibox, calls, local } = await setup();
    await omnibox.onInputEntered('shop-prod', 'currentTab');
    expect(calls).toEqual([['create', { url: PROD_URL, active: true }]]);
    expect(local.data[RECENT_KEY]).toEqual(['prod']);

    const current = await setup({ ...DEFAULT_SETTINGS, openIn: 'current-tab', showRecent: false });
    await current.omnibox.onInputEntered('shop-prod', 'currentTab');
    expect(current.calls).toEqual([['update', { url: PROD_URL }]]);
    expect(current.local.data[RECENT_KEY]).toBeUndefined();
  });

  test('Alt+Enter style dispositions always open a new tab, in the background when asked', async () => {
    const { omnibox, calls } = await setup({ ...DEFAULT_SETTINGS, openIn: 'current-tab' });
    await omnibox.onInputEntered('shop-prod', 'newForegroundTab');
    await omnibox.onInputEntered('shop-prod', 'newBackgroundTab');
    expect(calls).toEqual([['create', { url: PROD_URL, active: true }], ['create', { url: PROD_URL, active: false }]]);
  });

  test('opens nothing when nothing may be opened', async () => {
    const { omnibox, calls } = await setup(CONFIRM);
    await omnibox.onInputEntered('prod', 'currentTab');
    await omnibox.onInputEntered('billing', 'currentTab');
    expect(calls).toEqual([]);
  });
});
