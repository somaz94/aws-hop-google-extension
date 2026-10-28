import { LANGUAGE_SETTINGS } from '../i18n/index.js';
import { normalizeProfile } from './profile.js';

// One storage item per profile: chrome.storage.sync caps a single item at 8 KB, so one array would cap the list.
const PROFILE_PREFIX = 'profile:';
const ORDER_KEY = 'profileOrder';
const SETTINGS_KEY = 'settings';

export const DEFAULT_SETTINGS = Object.freeze({
  language: 'auto',
  openIn: 'new-tab',
  guardEnabled: true,
  guardShowUnregistered: true,
  guardTitlePrefix: true,
  showRecent: true,
  confirmGuarded: false,
  guardPosition: 'bottom-left',
});

export const OPEN_IN = Object.freeze(['new-tab', 'current-tab']);
export const GUARD_POSITIONS = Object.freeze(['bottom-left', 'bottom-right']);

const profileKey = (id) => `${PROFILE_PREFIX}${id}`;

export function normalizeSettings(raw) {
  const settings = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return settings;
  if (LANGUAGE_SETTINGS.includes(raw.language)) settings.language = raw.language;
  if (OPEN_IN.includes(raw.openIn)) settings.openIn = raw.openIn;
  if (GUARD_POSITIONS.includes(raw.guardPosition)) settings.guardPosition = raw.guardPosition;
  for (const key of ['guardEnabled', 'guardShowUnregistered', 'guardTitlePrefix', 'showRecent', 'confirmGuarded']) {
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
  // Normalized on every read, so an account saved by an older version reaches every page in today's shape.
  async function loadProfiles() {
    return profilesFromItems(await area.get(null)).map((profile) => normalizeProfile(profile));
  }

  async function readOrder() {
    const items = await area.get(ORDER_KEY);
    return Array.isArray(items[ORDER_KEY]) ? items[ORDER_KEY] : [];
  }

  async function writeOrder(ids) {
    await area.set({ [ORDER_KEY]: ids });
  }

  /** Saves many profiles in one write, so a bulk edit stays under the per-minute write quota. */
  async function saveProfiles(profiles) {
    const order = await readOrder();
    const items = { [ORDER_KEY]: [...order, ...profiles.map((profile) => profile.id).filter((id) => !order.includes(id))] };
    for (const profile of profiles) items[profileKey(profile.id)] = profile;
    await area.set(items);
  }

  async function deleteProfiles(ids) {
    const order = await readOrder();
    await area.remove(ids.map(profileKey));
    await writeOrder(order.filter((other) => !ids.includes(other)));
  }

  return {
    loadProfiles,

    saveProfile: (profile) => saveProfiles([profile]),
    saveProfiles,
    deleteProfile: (id) => deleteProfiles([id]),
    deleteProfiles,

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
