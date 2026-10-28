/**
 * @jest-environment jsdom
 */
import { describe, test, expect } from '@jest/globals';
import { createThemer, resolveTheme, THEME_CACHE_KEY, THEMES } from '../src/lib/theme.js';

function fakeMedia(matches) {
  const listeners = [];
  return {
    matches,
    addEventListener: (type, listener) => listeners.push(listener),
    flip(next) {
      this.matches = next;
      for (const listener of listeners) listener();
    },
  };
}

function fakeStorage() {
  const data = {};
  return { data, setItem: (key, value) => { data[key] = value; } };
}

describe('resolveTheme', () => {
  test.each([
    ['light', true, 'light'],
    ['dark', false, 'dark'],
    ['auto', true, 'dark'],
    ['auto', false, 'light'],
    [undefined, true, 'dark'],
  ])('%p with a dark system %p → %p', (setting, prefersDark, expected) => {
    expect(resolveTheme(setting, prefersDark)).toBe(expected);
  });

  test('offers auto first', () => {
    expect(THEMES[0]).toBe('auto');
  });
});

describe('createThemer', () => {
  test('paints the chosen theme and caches the setting', () => {
    const storage = fakeStorage();
    const themer = createThemer(document, { storage, media: fakeMedia(false) });
    themer.apply('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(storage.data[THEME_CACHE_KEY]).toBe('dark');
  });

  test('follows the system while auto, and stops following once a theme is picked', () => {
    const media = fakeMedia(false);
    const themer = createThemer(document, { storage: fakeStorage(), media });
    themer.apply('auto');
    expect(document.documentElement.dataset.theme).toBe('light');
    media.flip(true);
    expect(document.documentElement.dataset.theme).toBe('dark');
    themer.apply('light');
    media.flip(false);
    media.flip(true);
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  test('an unknown setting reads as auto', () => {
    const storage = fakeStorage();
    createThemer(document, { storage, media: fakeMedia(true) }).apply('sepia');
    expect([document.documentElement.dataset.theme, storage.data[THEME_CACHE_KEY]]).toEqual(['dark', 'auto']);
  });

  test('defaults to the page storage and the system preference', () => {
    localStorage.clear();
    createThemer(document).apply('dark');
    expect(localStorage.getItem(THEME_CACHE_KEY)).toBe('dark');
  });

  test('works without storage or media', () => {
    createThemer(document, { storage: null, media: null }).apply('auto');
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
