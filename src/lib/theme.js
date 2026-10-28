export const THEMES = Object.freeze(['auto', 'light', 'dark']);
// Read by src/theme-early.js, which cannot import this module.
export const THEME_CACHE_KEY = 'theme';

/** 'light' or 'dark' for a theme setting; 'auto' follows the system. */
export function resolveTheme(setting, prefersDark) {
  if (setting === 'light' || setting === 'dark') return setting;
  return prefersDark ? 'dark' : 'light';
}

/**
 * Keeps the page in the theme the setting picks, following the system while it is 'auto', and caches the
 * setting so theme-early.js can paint the next page in it before the synced settings load.
 */
export function createThemer(doc, {
  storage = globalThis.localStorage,
  media = globalThis.matchMedia?.('(prefers-color-scheme: dark)'),
} = {}) {
  let setting = 'auto';
  const paint = () => {
    doc.documentElement.dataset.theme = resolveTheme(setting, media?.matches);
  };
  media?.addEventListener('change', paint);
  return {
    apply(next) {
      setting = THEMES.includes(next) ? next : 'auto';
      storage?.setItem(THEME_CACHE_KEY, setting);
      paint();
    },
  };
}
