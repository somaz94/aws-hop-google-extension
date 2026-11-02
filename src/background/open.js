import { openProfile } from '../lib/open.js';
import { resolveOpenTarget } from '../lib/search.js';

/**
 * Opens an account picked in the popup or a guard menu, which send only its id. It runs in the worker because
 * a new active tab closes the popup, which could then not note what the tab was opened for.
 */
export function createPickOpener({ store, recent, sessions, landings, tabs }) {
  return async function open(profileId, invert, tabId) {
    const [profiles, settings] = await Promise.all([store.loadProfiles(), store.loadSettings()]);
    const profile = profiles.find((candidate) => candidate.id === profileId);
    if (!profile) return;
    const target = resolveOpenTarget(settings.openIn, invert);
    await openProfile(profile, { settings, recent, sessions, landings, tabs, target, tabId });
  };
}
