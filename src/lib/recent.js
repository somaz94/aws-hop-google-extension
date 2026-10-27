// Per device, in chrome.storage.local: which accounts you open is not worth spending the sync write quota on.
export const RECENT_KEY = 'recentProfiles';
export const RECENT_LIMIT = 5;

/** Moves `id` to the front, keeping at most `limit` ids. */
export function pushRecent(ids, id, limit = RECENT_LIMIT) {
  return [id, ...ids.filter((other) => other !== id)].slice(0, limit);
}

/** Recently opened profiles that still exist; none when the whole list is no longer than the recent section. */
export function recentProfiles(profiles, ids, limit = RECENT_LIMIT) {
  if (profiles.length <= limit) return [];
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  return ids.map((id) => byId.get(id)).filter(Boolean).slice(0, limit);
}

export function createRecentStore({ area = globalThis.chrome?.storage?.local } = {}) {
  async function load() {
    const items = await area.get(RECENT_KEY);
    const ids = items[RECENT_KEY];
    return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [];
  }
  return {
    load,
    async record(id) {
      await area.set({ [RECENT_KEY]: pushRecent(await load(), id) });
    },
    async clear() {
      await area.remove(RECENT_KEY);
    },
  };
}
