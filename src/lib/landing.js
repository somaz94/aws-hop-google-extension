import { profileAccount } from './profile.js';

const LANDING_PREFIX = 'landing:';
// Long enough to type a password and an MFA code on the way to the console.
export const LANDING_MAX_MS = 10 * 60 * 1000;

const landingKey = (tabId) => `${LANDING_PREFIX}${tabId}`;

/** Which account each tab was opened for. In chrome.storage.session, because a tab id means nothing after the browser closes. */
export function createLandingStore({ area = globalThis.chrome?.storage?.session, now = Date.now } = {}) {
  return {
    expect(tabId, profileId) {
      return area.set({ [landingKey(tabId)]: { profileId, at: now() } });
    },
    async expectedFor(tabId) {
      const key = landingKey(tabId);
      const entry = (await area.get(key))[key];
      if (!entry) return null;
      if (now() - entry.at < LANDING_MAX_MS) return entry.profileId;
      await area.remove(key);
      return null;
    },
    clear(tabId) {
      return area.remove(landingKey(tabId));
    },
  };
}

/** False when either account is unknown, as with a custom URL: only a real difference may raise a warning. */
export function isOtherAccount(expected, actual) {
  const [want, got] = [profileAccount(expected), profileAccount(actual)];
  return Boolean(want && got) && want !== got;
}
