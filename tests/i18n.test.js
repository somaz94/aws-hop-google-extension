/**
 * @jest-environment jsdom
 */
import { describe, test, expect, afterEach } from '@jest/globals';
import en from '../src/i18n/en.js';
import ko from '../src/i18n/ko.js';
import {
  catalog, DEFAULT_LANGUAGE, formatList, getLanguage, LANGUAGE_SETTINGS, LANGUAGES, resolveLanguage, setLanguage, t, translations,
} from '../src/i18n/index.js';
import { applyTranslations, richText } from '../src/i18n/dom.js';

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const backticks = (text) => (text.match(/`/g) ?? []).length;

afterEach(() => setLanguage('en'));

describe('catalogs', () => {
  test('every language has exactly the English keys', () => {
    for (const language of LANGUAGES) expect(Object.keys(catalog(language)).sort()).toEqual(Object.keys(en).sort());
  });

  test.each(Object.keys(en))('%s keeps the same placeholders and code spans in Korean', (key) => {
    expect(placeholders(ko[key])).toEqual(placeholders(en[key]));
    expect(backticks(ko[key])).toBe(backticks(en[key]));
    expect(backticks(en[key]) % 2).toBe(0);
  });

  test('no entry is empty', () => {
    for (const language of LANGUAGES) {
      for (const [key, text] of Object.entries(catalog(language))) expect({ key, text: text.trim().length > 0 }).toEqual({ key, text: true });
    }
  });

  test('settings offer auto plus every language', () => {
    expect(LANGUAGE_SETTINGS).toEqual(['auto', ...LANGUAGES]);
  });
});

describe('language selection', () => {
  test.each([
    ['ko', 'en-US', 'ko'],
    ['en', 'ko-KR', 'en'],
    ['auto', 'ko-KR', 'ko'],
    ['auto', 'ko', 'ko'],
    ['auto', 'en-GB', 'en'],
    ['auto', 'ja', 'en'],
    ['auto', undefined, 'en'],
    [undefined, 'ko_KR', 'ko'],
  ])('setting %p with browser %p → %p', (setting, ui, expected) => {
    expect(resolveLanguage(setting, ui)).toBe(expected);
  });

  test('an unknown language falls back to the default', () => {
    expect(setLanguage('fr')).toBe(DEFAULT_LANGUAGE);
    expect(setLanguage('ko')).toBe('ko');
    expect(getLanguage()).toBe('ko');
  });
});

describe('t', () => {
  test('formats placeholders in the current language', () => {
    expect(t('options.confirmDelete', { name: 'shop' })).toBe('Delete "shop"?');
    setLanguage('ko');
    expect(t('options.confirmDelete', { name: 'shop' })).toBe('"shop" 계정을 삭제할까요?');
  });

  test('leaves a missing parameter visible rather than printing undefined', () => {
    expect(t('options.confirmDelete')).toBe('Delete "{name}"?');
  });

  test('returns text that is not a key unchanged, for literal placeholders', () => {
    expect(t('111122223333')).toBe('111122223333');
  });

  test('translations lists every language', () => {
    expect(translations('editor.save')).toEqual(['Save', '저장']);
    expect(translations('not.a.key')).toEqual(['not.a.key', 'not.a.key']);
  });

  test('formatList joins the way each language does', () => {
    expect(formatList(['.a'])).toBe('.a');
    expect(formatList(['.a', '.b', '.c'])).toBe('.a, .b or .c');
    setLanguage('ko');
    expect(formatList(['.a', '.b', '.c'])).toBe('.a, .b, .c');
  });
});

describe('DOM', () => {
  test('richText turns backticks into code without parsing HTML', () => {
    const container = document.createElement('p');
    container.append(richText(document, 'Run `aws sts` then <b>merge</b>'));
    expect(container.innerHTML).toBe('Run <code>aws sts</code> then &lt;b&gt;merge&lt;/b&gt;');
  });

  test('applyTranslations fills text, attributes and the page language', () => {
    document.body.innerHTML = `
      <h2 data-i18n="options.accounts">Accounts</h2>
      <p data-i18n="options.noAccounts"></p>
      <input data-i18n-placeholder="popup.search" data-i18n-aria-label="popup.search">
      <button data-i18n-title="popup.manage"></button>`;
    setLanguage('ko');
    applyTranslations(document);
    expect(document.querySelector('h2').textContent).toBe('계정');
    expect(document.querySelector('p code').textContent).toBe('~/.aws/config');
    expect(document.querySelector('input').placeholder).toBe('계정 검색');
    expect(document.querySelector('input').getAttribute('aria-label')).toBe('계정 검색');
    expect(document.querySelector('button').title).toBe('계정 관리');
    expect(document.documentElement.lang).toBe('ko');
  });
});
