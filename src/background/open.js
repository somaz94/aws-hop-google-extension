import { resolveOpenTarget } from '../lib/search.js';
import { openUrlFor } from '../lib/sessions.js';

/** Opens `profile` the way every entry point does: in its known console session, remembered as recent when that list is on. */
export async function openProfile(profile, { settings, recent, sessions, tabs, target, tabId, active = true }) {
  if (settings.showRecent) await recent.record(profile.id);
  const url = await openUrlFor(profile, sessions);
  if (target !== 'current-tab') await tabs.create({ url, active });
  else if (tabId === undefined) await tabs.update({ url });
  else await tabs.update(tabId, { url });
}

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
