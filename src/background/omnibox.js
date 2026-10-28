import { applyLanguageSetting, t } from '../i18n/index.js';
import { profileLabel } from '../lib/profile.js';
import { filterProfiles, resolveOpenTarget } from '../lib/search.js';
import { openProfile } from './open.js';

export const SUGGEST_MAX = 6;

const XML = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&apos;' };
// Chrome parses suggestion descriptions as XML, so every account value is escaped.
const escapeXml = (text) => String(text).replace(/[&<>"']/g, (char) => XML[char]);

/**
 * What Enter opens: an exact name first, otherwise the top match. With confirmation on, a protected
 * account opens only by its exact name, which picking it from the suggestions also gives.
 */
export function resolveOmnibox(profiles, text, settings) {
  const query = text.trim().toLowerCase();
  if (!query) return { profile: null, blocked: null };
  const exact = profiles.find((profile) => profile.name.toLowerCase() === query);
  const profile = exact ?? filterProfiles(profiles, query)[0] ?? null;
  if (profile && !exact && settings.confirmGuarded && profile.guarded) return { profile: null, blocked: profile };
  return { profile, blocked: null };
}

/** The first omnibox line, which says what Enter will do. */
export function defaultDescription(text, { profile, blocked }) {
  if (!text.trim()) return escapeXml(t('omnibox.prompt'));
  if (blocked) return escapeXml(t('omnibox.protected', { name: blocked.name }));
  if (!profile) return escapeXml(t('omnibox.none'));
  return escapeXml(t('omnibox.open', { name: profileLabel(profile) }));
}

/** Suggestions to pick from; the content is the account name, so picking one opens exactly that account. */
export function omniboxSuggestions(profiles, text, limit = SUGGEST_MAX) {
  if (!text.trim()) return [];
  return filterProfiles(profiles, text).slice(0, limit).map((profile) => ({
    content: profile.name,
    description: `<match>${escapeXml(profileLabel(profile))}</match>${profile.guarded ? ` <dim>${escapeXml(t('popup.guarded'))}</dim>` : ''}`,
  }));
}

export function createOmnibox({ store, recent, sessions, tabs, omnibox, uiLanguage }) {
  async function load() {
    const [profiles, settings] = await Promise.all([store.loadProfiles(), store.loadSettings()]);
    applyLanguageSetting(settings, uiLanguage);
    return { profiles, settings };
  }

  return {
    async onInputChanged(text, suggest) {
      const { profiles, settings } = await load();
      omnibox.setDefaultSuggestion({ description: defaultDescription(text, resolveOmnibox(profiles, text, settings)) });
      suggest(omniboxSuggestions(profiles, text));
    },

    /** Plain Enter follows the "Open accounts in" setting; Alt+Enter and the like open the new tab Chrome asked for. */
    async onInputEntered(text, disposition) {
      const { profiles, settings } = await load();
      const { profile } = resolveOmnibox(profiles, text, settings);
      if (!profile) return;
      const target = disposition === 'currentTab' ? resolveOpenTarget(settings.openIn, false) : 'new-tab';
      await openProfile(profile, { settings, recent, sessions, tabs, target, active: disposition !== 'newBackgroundTab' });
    },
  };
}
