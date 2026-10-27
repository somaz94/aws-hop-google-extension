// One storage item per profile: chrome.storage.sync caps a single item at 8 KB, so one array would cap the list.
const PROFILE_PREFIX = 'profile:';
const ORDER_KEY = 'profileOrder';
const SETTINGS_KEY = 'settings';

export const DEFAULT_SETTINGS = Object.freeze({
  openIn: 'new-tab',
  guardEnabled: true,
  guardShowUnregistered: true,
  guardTitlePrefix: true,
});

export const OPEN_IN = Object.freeze(['new-tab', 'current-tab']);

const profileKey = (id) => `${PROFILE_PREFIX}${id}`;

export function normalizeSettings(raw) {
  const settings = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return settings;
  if (OPEN_IN.includes(raw.openIn)) settings.openIn = raw.openIn;
  for (const key of ['guardEnabled', 'guardShowUnregistered', 'guardTitlePrefix']) {
    if (typeof raw[key] === 'boolean') settings[key] = raw[key];
  }
  return settings;
}

/** Profiles in the stored order; profiles missing from the order (e.g. written by another device) go last. */
export function profilesFromItems(items) {
  const order = Array.isArray(items[ORDER_KEY]) ? items[ORDER_KEY] : [];
  const byId = new Map();
  for (const [key, value] of Object.entries(items)) {
    if (key.startsWith(PROFILE_PREFIX) && value && typeof value === 'object') {
      byId.set(key.slice(PROFILE_PREFIX.length), value);
    }
  }
  const ordered = order.filter((id) => byId.has(id)).map((id) => byId.get(id));
  const rest = [...byId.keys()].filter((id) => !order.includes(id)).map((id) => byId.get(id));
  return [...ordered, ...rest];
}

export function createStore({ area = globalThis.chrome?.storage?.sync, onChanged = globalThis.chrome?.storage?.onChanged, areaName = 'sync' } = {}) {
  async function loadProfiles() {
    return profilesFromItems(await area.get(null));
  }

  async function writeOrder(ids) {
    await area.set({ [ORDER_KEY]: ids });
  }

  return {
    loadProfiles,

    async saveProfile(profile) {
      const items = await area.get(ORDER_KEY);
      const order = Array.isArray(items[ORDER_KEY]) ? items[ORDER_KEY] : [];
      const next = order.includes(profile.id) ? order : [...order, profile.id];
      await area.set({ [profileKey(profile.id)]: profile, [ORDER_KEY]: next });
    },

    async deleteProfile(id) {
      const items = await area.get(ORDER_KEY);
      const order = Array.isArray(items[ORDER_KEY]) ? items[ORDER_KEY] : [];
      await area.remove(profileKey(id));
      await writeOrder(order.filter((other) => other !== id));
    },

    async reorder(ids) {
      await writeOrder(ids);
    },

    /** Replaces the whole list in two writes, so a large import stays under the per-minute write quota. */
    async replaceAll(profiles) {
      const keep = new Set(profiles.map((profile) => profileKey(profile.id)));
      const stale = Object.keys(await area.get(null)).filter((key) => key.startsWith(PROFILE_PREFIX) && !keep.has(key));
      if (stale.length) await area.remove(stale);
      const items = { [ORDER_KEY]: profiles.map((profile) => profile.id) };
      for (const profile of profiles) items[profileKey(profile.id)] = profile;
      await area.set(items);
    },

    async loadSettings() {
      const items = await area.get(SETTINGS_KEY);
      return normalizeSettings(items[SETTINGS_KEY]);
    },

    async saveSettings(settings) {
      await area.set({ [SETTINGS_KEY]: normalizeSettings(settings) });
    },

    /** Calls `listener({ profiles, settings })` with the flags that changed; returns an unsubscribe function. */
    onChange(listener) {
      const handler = (changes, name) => {
        if (name !== areaName) return;
        const keys = Object.keys(changes);
        const profiles = keys.some((key) => key === ORDER_KEY || key.startsWith(PROFILE_PREFIX));
        const settings = keys.includes(SETTINGS_KEY);
        if (profiles || settings) listener({ profiles, settings });
      };
      onChanged.addListener(handler);
      return () => onChanged.removeListener(handler);
    },
  };
}
