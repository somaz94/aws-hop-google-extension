import { openUrlFor } from './sessions.js';

/**
 * Opens `profile` the way every entry point does: in its known console session, remembered as recent when that
 * list is on. The recent list is written first, because a new active tab closes the popup and would cut it short.
 */
export async function openProfile(profile, { settings, recent, sessions, tabs, target, tabId, active = true }) {
  if (settings.showRecent) await recent.record(profile.id);
  const url = await openUrlFor(profile, sessions);
  if (target !== 'current-tab') await tabs.create({ url, active });
  else if (tabId === undefined) await tabs.update({ url });
  else await tabs.update(tabId, { url });
}
