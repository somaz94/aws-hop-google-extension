/**
 * @jest-environment jsdom
 */
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { buildView, NAV_ATTR, readNavInfo, startGuard } from '../src/content/guard.js';
import { HOST_TAG } from '../src/content/banner.js';
import { MSG } from '../src/lib/messages.js';
import { createStore, DEFAULT_SETTINGS } from '../src/lib/store.js';
import { normalizeProfile } from '../src/lib/profile.js';
import { createFakeRuntime, createFakeStorage } from './helpers/fakeStorage.js';

const prod = normalizeProfile({ id: 'prod', name: 'shop-prod', provider: 'iam-user', env: 'prod', fields: { account: '111122223333' } });
const dev = normalizeProfile({ id: 'dev', name: 'shop-dev', provider: 'iam-user', env: 'dev', fields: { account: '444455556666' } });
const identity = (account) => ({ accounts: [account], role: null, source: 'nav' });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const label = () => document.querySelector(HOST_TAG)?.shadowRoot.querySelector('.label').textContent ?? null;

describe('buildView', () => {
  test('nothing when disabled or no identity', () => {
    expect(buildView(identity('111122223333'), prod, { ...DEFAULT_SETTINGS, guardEnabled: false })).toBeNull();
    expect(buildView(null, prod, DEFAULT_SETTINGS)).toBeNull();
  });

  test('production gets the frame and title prefix', () => {
    expect(buildView(identity('111122223333'), prod, DEFAULT_SETTINGS)).toEqual({
      color: '#d13212', textColor: '#ffffff', label: 'PROD · shop-prod', account: '1111-2222-3333', detectedFrom: 'console navigation',
      frame: true, muted: false, titlePrefix: '[PROD] ',
    });
    expect(buildView(identity('111122223333'), prod, { ...DEFAULT_SETTINGS, guardTitlePrefix: false }).titlePrefix).toBeNull();
  });

  test('other environments get the stripe and pill only', () => {
    expect(buildView(identity('444455556666'), dev, DEFAULT_SETTINGS)).toMatchObject({ frame: false, titlePrefix: null, muted: false });
  });

  test('unregistered accounts are muted, or hidden by setting', () => {
    expect(buildView(identity('999999999999'), null, DEFAULT_SETTINGS)).toMatchObject({ label: 'Unregistered account', muted: true });
    expect(buildView(identity('999999999999'), null, { ...DEFAULT_SETTINGS, guardShowUnregistered: false })).toBeNull();
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

  const start = (options = {}) => startGuard({ doc: document, hostname: 'us-east-1.console.aws.amazon.com', store, runtime, ...options });

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
    expect(label()).toBe('PROD · shop-prod');
    expect(document.title).toBe('[PROD] Console Home');
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

  test('picks up navigation info that arrives later', async () => {
    guard = await start();
    expect(label()).toBeNull();
    document.documentElement.setAttribute(NAV_ATTR, JSON.stringify({ loginDisplayNameAccount: '444455556666' }));
    await wait(400);
    expect(label()).toBe('DEV · shop-dev');
  });

  test('stops watching the page after the observation window', async () => {
    guard = await start({ observeMs: 10 });
    await wait(30);
    document.documentElement.setAttribute(NAV_ATTR, JSON.stringify({ loginDisplayNameAccount: '444455556666' }));
    await wait(400);
    expect(label()).toBeNull();
    guard.update();
    expect(label()).toBe('DEV · shop-dev');
  });

  test('reacts to profile and settings changes', async () => {
    document.documentElement.setAttribute(NAV_ATTR, JSON.stringify({ loginDisplayNameAccount: '999999999999' }));
    guard = await start();
    expect(label()).toBe('Unregistered account');

    await store.saveProfile(normalizeProfile({ id: 'new', name: 'new-prod', provider: 'iam-user', env: 'prod', fields: { account: '999999999999' } }));
    await wait(0);
    expect(label()).toBe('PROD · new-prod');

    await store.saveSettings({ ...DEFAULT_SETTINGS, guardEnabled: false });
    await wait(0);
    expect(label()).toBeNull();
    expect(document.title).toBe('Console Home');
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
