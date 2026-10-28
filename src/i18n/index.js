import en from './en.js';
import ko from './ko.js';

const CATALOGS = Object.freeze({ en, ko });

export const LANGUAGES = Object.freeze(Object.keys(CATALOGS));
export const LANGUAGE_SETTINGS = Object.freeze(['auto', ...LANGUAGES]);
export const DEFAULT_LANGUAGE = 'en';

let current = DEFAULT_LANGUAGE;

/** `auto` follows the browser UI language; a language without a catalog falls back to English. */
export function resolveLanguage(setting, uiLanguage) {
  if (LANGUAGES.includes(setting)) return setting;
  const base = String(uiLanguage ?? '').toLowerCase().split(/[-_]/)[0];
  return LANGUAGES.includes(base) ? base : DEFAULT_LANGUAGE;
}

/** Switches to the language a settings object asks for; returns the language in use. */
export function applyLanguageSetting(settings, uiLanguage) {
  return setLanguage(resolveLanguage(settings.language, uiLanguage));
}

export function setLanguage(language) {
  current = LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE;
  return current;
}

export function getLanguage() {
  return current;
}

function format(text, params) {
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

/** Text for `key` in the current language, else English; a string that is not a key comes back as is. */
export function t(key, params = {}) {
  return format(CATALOGS[current][key] ?? en[key] ?? key, params);
}

/** The text for `key` in every language, so search matches whichever one the user types. */
export function translations(key) {
  return LANGUAGES.map((language) => CATALOGS[language][key] ?? key);
}

/** `a, b or c` in English, `a, b, c` in Korean. */
export function formatList(items) {
  if (items.length < 2) return items.join('');
  return t('list.or', { list: items.slice(0, -1).join(', '), last: items.at(-1) });
}

export function catalog(language) {
  return CATALOGS[language];
}
