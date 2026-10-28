/**
 * @jest-environment jsdom
 */
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createMenu, menuProfiles } from '../src/content/menu.js';
import { setLanguage } from '../src/i18n/index.js';
import { normalizeProfile } from '../src/lib/profile.js';
import { DEFAULT_SETTINGS } from '../src/lib/store.js';

const account = (id, name, extra = {}) => normalizeProfile({ id, name, provider: 'iam-user', fields: { account: '111122223333' }, ...extra });
const prod = account('prod', 'shop-prod', { tag: 'prod', guarded: true });
const dev = account('dev', 'shop-dev');
const data = account('data', 'data-sso');
const PROFILES = [dev, prod, data];

describe('menuProfiles', () => {
  test('recent accounts first without duplicates, one ranked list while searching', () => {
    expect(menuProfiles(PROFILES).map((p) => p.id)).toEqual(['dev', 'prod', 'data']);
    expect(menuProfiles(PROFILES, { recent: [data] }).map((p) => p.id)).toEqual(['data', 'dev', 'prod']);
    expect(menuProfiles(PROFILES, { query: 'prod', recent: [data] }).map((p) => p.id)).toEqual(['prod']);
  });
});

describe('createMenu', () => {
  let host;
  let root;
  let opened;
  let collapsed;
  let menu;
  const box = () => root.querySelector('.menu');
  const rows = () => [...root.querySelectorAll('.row')].map((row) => [row.querySelector('.name').textContent, row.querySelector('.meta').textContent]);
  const key = (name, extra = {}) => root.querySelector('.search').dispatchEvent(new window.KeyboardEvent('keydown', { key: name, bubbles: true, composed: true, ...extra }));
  const type = (text) => {
    const search = root.querySelector('.search');
    search.value = text;
    search.dispatchEvent(new window.Event('input'));
  };
  const show = (extra = {}) => menu.toggle({ profiles: PROFILES, settings: DEFAULT_SETTINGS, currentId: 'dev', recent: [], side: 'left', ...extra });

  beforeEach(() => {
    host = document.createElement('aws-hop-guard');
    document.body.append(host);
    root = host.attachShadow({ mode: 'open' });
    opened = [];
    collapsed = 0;
    menu = createMenu(root, { onOpen: (id, invert) => opened.push([id, invert]), onCollapse: () => { collapsed += 1; } });
  });

  afterEach(() => {
    menu.close();
    host.remove();
    setLanguage('en');
  });

  test('opens on the left or right with the search focused and the current account marked', () => {
    show();
    expect(menu.isOpen).toBe(true);
    expect(box().classList.contains('right')).toBe(false);
    expect(root.activeElement).toBe(root.querySelector('.search'));
    expect(rows()).toEqual([['shop-dev', 'current'], ['prod · shop-prod', ''], ['data-sso', '']]);
    menu.toggle();
    expect(menu.isOpen).toBe(false);
    expect(root.querySelector('style')).toBeNull();
    show({ side: 'right' });
    expect(box().classList.contains('right')).toBe(true);
  });

  test('typing filters, arrows pick, Enter opens and closes', () => {
    show();
    type('sso');
    expect(rows()).toEqual([['data-sso', '']]);
    key('Enter');
    expect(opened).toEqual([['data', false]]);
    expect(menu.isOpen).toBe(false);

    show();
    key('ArrowDown');
    key('ArrowDown');
    key('Enter', { shiftKey: true });
    expect(opened.at(-1)).toEqual(['prod', true]);
  });

  test('a click opens, a middle click opens the other way, an empty search says so', () => {
    show();
    root.querySelectorAll('.row')[2].click();
    expect(opened).toEqual([['data', false]]);
    show();
    root.querySelectorAll('.row')[0].dispatchEvent(new window.MouseEvent('auxclick', { button: 2 }));
    expect(menu.isOpen).toBe(true);
    root.querySelectorAll('.row')[0].dispatchEvent(new window.MouseEvent('auxclick', { button: 1 }));
    expect(opened).toEqual([['data', false], ['dev', true]]);
    show();
    type('billing');
    expect(root.querySelector('.empty').textContent).toBe('No account matches.');
    key('Enter');
    expect(opened).toHaveLength(2);
  });

  test('a protected account waits for a second Enter when confirmation is on; Escape steps back', () => {
    show({ settings: { ...DEFAULT_SETTINGS, confirmGuarded: true } });
    type('prod');
    key('Enter');
    expect(opened).toEqual([]);
    expect(rows()).toEqual([['prod · shop-prod', 'Protected account: press Enter or click again to open']]);
    key('Escape');
    expect(rows()).toEqual([['prod · shop-prod', '']]);
    key('Enter');
    key('Enter');
    expect(opened).toEqual([['prod', false]]);

    show({ settings: { ...DEFAULT_SETTINGS, confirmGuarded: true } });
    key('ArrowUp');
    key('Escape');
    expect(menu.isOpen).toBe(false);
  });

  test('keys typed into it never reach the page', () => {
    show();
    const seen = [];
    const listen = (event) => seen.push(event.type);
    for (const name of ['keydown', 'keyup', 'keypress']) document.addEventListener(name, listen);
    for (const name of ['keydown', 'keyup', 'keypress']) root.querySelector('.search').dispatchEvent(new window.KeyboardEvent(name, { key: 'a', bubbles: true, composed: true }));
    expect(seen).toEqual([]);
    for (const name of ['keydown', 'keyup', 'keypress']) document.removeEventListener(name, listen);
  });

  test('collapses on request, and closes on a click outside but not inside', () => {
    show();
    root.querySelector('.collapse').click();
    expect([menu.isOpen, collapsed]).toEqual([false, 1]);

    show();
    box().dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, composed: true }));
    expect(menu.isOpen).toBe(true);
    document.body.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    expect(menu.isOpen).toBe(false);
  });

  test('refresh keeps the search and follows account and side changes; nothing when closed', () => {
    menu.refresh({ profiles: [], settings: DEFAULT_SETTINGS, currentId: null, recent: [], side: 'left' });
    expect(menu.isOpen).toBe(false);
    show();
    type('shop');
    menu.refresh({ profiles: [prod], settings: DEFAULT_SETTINGS, currentId: 'prod', recent: [], side: 'right' });
    expect(rows()).toEqual([['prod · shop-prod', 'current']]);
    expect(box().classList.contains('right')).toBe(true);
  });

  test('speaks the current language', () => {
    setLanguage('ko');
    show();
    expect([root.querySelector('.search').placeholder, root.querySelector('.collapse').title, box().getAttribute('aria-label')]).toEqual(['계정 검색', '점으로 접기', '계정 전환']);
  });
});
