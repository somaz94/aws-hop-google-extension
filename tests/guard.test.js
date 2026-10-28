/**
 * @jest-environment jsdom
 */
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { buildBadge, buildView, NAV_ATTR, readNavInfo, startGuard } from '../src/content/guard.js';
import { HOST_TAG } from '../src/content/banner.js';
import { setLanguage } from '../src/i18n/index.js';
import { MSG } from '../src/lib/messages.js';
import { createStore, DEFAULT_SETTINGS } from '../src/lib/store.js';
import { readableTextColor } from '../src/lib/color.js';
import { normalizeProfile, profileColor } from '../src/lib/profile.js';
import { PROTECTED_COLOR } from '../src/lib/tag.js';
import { createFakeRuntime, createFakeStorage } from './helpers/fakeStorage.js';

const prod = normalizeProfile({ id: 'prod', name: 'shop-prod', provider: 'iam-user', tag: 'prod', guarded: true, fields: { account: '111122223333' } });
const dev = normalizeProfile({ id: 'dev', name: 'shop-dev', provider: 'iam-user', fields: { account: '444455556666' } });
const identity = (account, source = 'nav') => ({ accounts: [account], role: null, source });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pill = () => document.querySelector(HOST_TAG)?.shadowRoot.querySelector('.pill') ?? null;
const label = () => pill()?.querySelector('.label').textContent ?? null;

afterEach(() => setLanguage('en'));

describe('buildView', () => {
  test('nothing when disabled or no identity', () => {
    expect(buildView(identity('111122223333'), prod, { ...DEFAULT_SETTINGS, guardEnabled: false })).toBeNull();
    expect(buildView(null, prod, DEFAULT_SETTINGS)).toBeNull();
  });

  test('a protected account gets the frame and a title prefix with its name', () => {
    expect(buildView(identity('111122223333'), prod, DEFAULT_SETTINGS)).toEqual({
      color: profileColor(prod),
      textColor: readableTextColor(profileColor(prod)),
      label: 'prod · shop-prod',
      account: '1111-2222-3333',
      tooltip: 'AWS Hop: prod · shop-prod (1111-2222-3333), detected from the console navigation. Click to minimize.',
      frame: true,
      muted: false,
      position: 'bottom-left',
      titlePrefix: '[shop-prod] ',
    });
    expect(buildView(identity('111122223333'), prod, { ...DEFAULT_SETTINGS, guardTitlePrefix: false }).titlePrefix).toBeNull();
  });

  test('an untagged, unprotected account shows its name only', () => {
    expect(buildView(identity('444455556666', 'host'), dev, DEFAULT_SETTINGS))
      .toMatchObject({ label: 'shop-dev', frame: false, titlePrefix: null, muted: false });
  });

  test('accounts not in the list are muted, or hidden by setting', () => {
    expect(buildView(identity('999999999999', 'dom'), null, DEFAULT_SETTINGS))
      .toMatchObject({ label: 'Account not in your list', muted: true, frame: false });
    expect(buildView(identity('999999999999'), null, { ...DEFAULT_SETTINGS, guardShowUnregistered: false })).toBeNull();
  });

  test('speaks the current language', () => {
    setLanguage('ko');
    expect(buildView(identity('999999999999', 'host'), null, DEFAULT_SETTINGS)).toMatchObject({
      label: '목록에 없는 계정',
      tooltip: 'AWS Hop: 목록에 없는 계정 (9999-9999-9999). 멀티 세션 URL에서 감지했습니다. 클릭하면 접힙니다.',
    });
  });
});

describe('buildBadge', () => {
  const badgeFor = (account, profile, settings = DEFAULT_SETTINGS) => buildBadge(buildView(identity(account), profile, settings), profile);

  test('a protected account shows its tag on red', () => {
    expect(badgeFor('111122223333', prod)).toEqual({ text: 'prod', color: PROTECTED_COLOR, textColor: readableTextColor(PROTECTED_COLOR) });
  });

  test('without a tag, the start of the name in the account color', () => {
    expect(badgeFor('444455556666', dev)).toEqual({ text: 'shop', color: profileColor(dev), textColor: readableTextColor(profileColor(dev)) });
  });

  test('cuts long tags by character, not by code unit', () => {
    expect(badgeFor('111122223333', { ...prod, tag: '운영환경계정' }).text).toBe('운영환경');
  });

  test('a question mark for an account not in the list, nothing when the guard shows nothing', () => {
    expect(badgeFor('999999999999', null)).toMatchObject({ text: '?', color: '#545b64' });
    expect(badgeFor('999999999999', null, { ...DEFAULT_SETTINGS, guardShowUnregistered: false })).toBeNull();
    expect(badgeFor('111122223333', prod, { ...DEFAULT_SETTINGS, guardEnabled: false })).toBeNull();
  });
});

describe('readNavInfo', () => {
  afterEach(() => document.documentElement.removeAttribute(NAV_ATTR));

  test('missing, malformed and valid attributes', () => {
    expect(readNavInfo(document)).toBeNull();
    document.documentElement.setAttribute(NAV_ATTR, '{oops');
    expect(readNavInfo(document)).toBeNull();
    document.documentElement.setAttribute(NAV_ATTR, '{"loginDisplayNameAccount":"111122223333"}');
    expect(readNavInfo(document)).toEqual({ loginDisplayNameAccount: '111122223333' });
  });
});

describe('startGuard', () => {
  let storage;
  let store;
  let runtime;
  let guard;

  const start = (options = {}) => startGuard({ doc: document, hostname: 'us-east-1.console.aws.amazon.com', store, runtime, uiLanguage: 'en-US', ...options });

  beforeEach(async () => {
    document.documentElement.removeAttribute(NAV_ATTR);
    document.body.innerHTML = '';
    document.title = 'Console Home';
    storage = createFakeStorage();
    store = createStore({ area: storage.area, onChanged: storage.onChanged });
    await store.replaceAll([prod, dev]);
    runtime = createFakeRuntime();
  });

  afterEach(() => guard?.stop());

  test('shows the matched profile and prefixes the title', async () => {
    document.documentElement.setAttribute(NAV_ATTR, JSON.stringify({ loginDisplayNameAccount: '1111-2222-3333' }));
    guard = await start();
    expect(label()).toBe('prod · shop-prod');
    expect(document.title).toBe('[shop-prod] Console Home');
    expect(guard.state.profile.id).toBe('prod');
  });

  test('answers the popup with the detected identity', async () => {
    guard = await start({ hostname: '444455556666-abcd.us-east-1.console.aws.amazon.com' });
    expect(runtime.send({ type: MSG.GET_IDENTITY })).toEqual({
      identity: { accounts: ['444455556666'], role: null, source: 'host' },
      profileId: 'dev',
    });
    expect(runtime.send({ type: 'something-else' })).toBeUndefined();
  });

  test('tells the worker the badge whenever the view changes, and clears it on stop', async () => {
    const badges = () => runtime.sent.filter((message) => message.type === MSG.SET_BADGE).map((message) => message.badge?.text ?? null);
    document.documentElement.setAttribute(NAV_ATTR, JSON.stringify({ loginDisplayNameAccount: '111122223333' }));
    guard = await start();
    guard.update();
    expect(badges()).toEqual(['prod']);

    await store.saveSettings({ ...DEFAULT_SETTINGS, guardEnabled: false });
    await wait(0);
    expect(badges()).toEqual(['prod', null]);

    await store.saveSettings(DEFAULT_SETTINGS);
    await wait(0);
    window.dispatchEvent(Object.assign(new window.Event('pageshow'), { persisted: false }));
    window.dispatchEvent(Object.assign(new window.Event('pageshow'), { persisted: true }));
    expect(badges()).toEqual(['prod', null, 'prod', 'prod']);

    guard.stop();
    guard = null;
    expect(badges()).toEqual(['prod', null, 'prod', 'prod', null]);
  });

  test('on a multi-session host, tells the worker which account the session belongs to', async () => {
    const seen = () => runtime.sent.filter((message) => message.type === MSG.SESSION_SEEN).map((message) => message.profileId);
    document.documentElement.setAttribute(NAV_ATTR, JSON.stringify({ loginDisplayNameAccount: '111122223333' }));
    guard = await start({ hostname: '111122223333-abcd1234.us-east-1.console.aws.amazon.com' });
    expect(seen()).toEqual(['prod']);
    guard.stop();

    guard = await start();
    expect(seen()).toEqual(['prod']);
    guard.stop();

    document.documentElement.setAttribute(NAV_ATTR, JSON.stringify({ loginDisplayNameAccount: '999999999999' }));
    guard = await start({ hostname: '999999999999-abcd1234.us-east-1.console.aws.amazon.com' });
    expect(seen()).toEqual(['prod']);
  });

  test('a missing worker or a reloaded extension does not break the guard', async () => {
    document.documentElement.setAttribute(NAV_ATTR, JSON.stringify({ loginDisplayNameAccount: '111122223333' }));
    guard = await start({ runtime: { ...runtime, sendMessage: () => Promise.reject(new Error('Receiving end does not exist.')) } });
    expect(label()).toBe('prod · shop-prod');
    guard.stop();
    guard = await start({ runtime: { ...runtime, sendMessage: () => { throw new Error('Extension context invalidated.'); } } });
    expect(label()).toBe('prod · shop-prod');
  });

  test('picks up navigation info that arrives later', async () => {
    guard = await start();
    expect(label()).toBeNull();
    document.documentElement.setAttribute(NAV_ATTR, JSON.stringify({ loginDisplayNameAccount: '444455556666' }));
    await wait(400);
    expect(label()).toBe('shop-dev');
  });

  test('stops watching the page after the observation window', async () => {
    guard = await start({ observeMs: 10 });
    await wait(30);
    document.documentElement.setAttribute(NAV_ATTR, JSON.stringify({ loginDisplayNameAccount: '444455556666' }));
    await wait(400);
    expect(label()).toBeNull();
    guard.update();
    expect(label()).toBe('shop-dev');
  });

  test('reacts to profile and settings changes', async () => {
    document.documentElement.setAttribute(NAV_ATTR, JSON.stringify({ loginDisplayNameAccount: '999999999999' }));
    guard = await start();
    expect(label()).toBe('Account not in your list');

    await store.saveSettings({ ...DEFAULT_SETTINGS, language: 'ko' });
    await wait(0);
    expect(label()).toBe('목록에 없는 계정');

    await store.saveProfile(normalizeProfile({ id: 'new', name: 'billing', provider: 'iam-user', tag: '운영', guarded: true, fields: { account: '999999999999' } }));
    await wait(0);
    expect(label()).toBe('운영 · billing');
    expect(document.title).toBe('[billing] Console Home');

    await store.saveSettings({ ...DEFAULT_SETTINGS, guardEnabled: false });
    await wait(0);
    expect(label()).toBeNull();
    expect(document.title).toBe('Console Home');
  });

  test('follows the browser language when set to auto', async () => {
    document.documentElement.setAttribute(NAV_ATTR, JSON.stringify({ loginDisplayNameAccount: '999999999999' }));
    guard = await start({ uiLanguage: 'ko-KR' });
    expect(label()).toBe('목록에 없는 계정');
  });

  test('stop removes everything it added', async () => {
    document.documentElement.setAttribute(NAV_ATTR, JSON.stringify({ loginDisplayNameAccount: '111122223333' }));
    guard = await start();
    guard.stop();
    guard = null;
    expect(document.querySelector(HOST_TAG)).toBeNull();
    expect(document.title).toBe('Console Home');
    expect(runtime.listenerCount()).toBe(0);
    expect(storage.listenerCount()).toBe(0);
  });

  test('works without a runtime', async () => {
    guard = await start({ runtime: undefined });
    expect(guard.state.identity).toBeNull();
  });
});
