import { openProfile } from '../lib/open.js';
import { resolveOpenTarget } from '../lib/search.js';

/** Opens an account picked in a console tab's guard menu, which sends only the account's id. */
export function createGuardOpener({ store, recent, sessions, tabs }) {
  return async function open(profileId, invert, tabId) {
    const [profiles, settings] = await Promise.all([store.loadProfiles(), store.loadSettings()]);
    const profile = profiles.find((candidate) => candidate.id === profileId);
    if (!profile) return;
    const target = resolveOpenTarget(settings.openIn, invert);
    await openProfile(profile, { settings, recent, sessions, tabs, target, tabId });
  };
}
