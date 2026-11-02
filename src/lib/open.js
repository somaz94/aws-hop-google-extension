import { openUrlFor } from './sessions.js';

function navigate(tabs, { url, target, tabId, active }) {
  if (target !== 'current-tab') return tabs.create({ url, active });
  return tabId === undefined ? tabs.update({ url }) : tabs.update(tabId, { url });
}

/**
 * Opens `profile` the way every entry point does: in its known console session, remembered as recent when that
 * list is on, and noted for the tab so its guard can tell when AWS lands it in another account.
 */
export async function openProfile(profile, { settings, recent, sessions, landings, tabs, target, tabId, active = true }) {
  if (settings.showRecent) await recent.record(profile.id);
  const url = await openUrlFor(profile, sessions);
  const tab = await navigate(tabs, { url, target, tabId, active });
  if (tab?.id !== undefined) await landings.expect(tab.id, profile.id);
}
