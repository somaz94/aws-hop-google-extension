import { identityFromHost } from './identity.js';
import { buildProfileUrl, profileLanding } from './profile.js';

// In chrome.storage.local, so an extension update or a browser restart keeps them; never synced, like the cookies they point at.
const SESSION_PREFIX = 'session:';
const CONSOLE_DOMAIN = '.console.aws.amazon.com';
// No console session outlives 12 hours from sign-in, and an entry is never older than its last sighting, so it never expires early.
export const SESSION_MAX_MS = 12 * 60 * 60 * 1000;

const sessionKey = (profileId) => `${SESSION_PREFIX}${profileId}`;

/** The origin of a multi-session console page, such as `https://111122223333-abcd1234.us-east-1.console.aws.amazon.com`, or null. */
export function sessionOrigin(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const isSession = parsed.protocol === 'https:' && parsed.hostname.endsWith(CONSOLE_DOMAIN) && identityFromHost(parsed.hostname);
  return isSession ? parsed.origin : null;
}

/** A page inside the session: the profile's landing page when it has one, else the console home. */
export function sessionUrl(profile, origin) {
  const landing = profileLanding(profile);
  if (!landing) return `${origin}/console/home`;
  const { pathname, search, hash } = new URL(landing);
  return `${origin}${pathname}${search}${hash}`;
}

/** One item per account, so two tabs reporting at once cannot overwrite each other. */
export function createSessionStore({ area = globalThis.chrome?.storage?.local, now = Date.now } = {}) {
  return {
    async originFor(profileId) {
      const key = sessionKey(profileId);
      const entry = (await area.get(key))[key];
      if (!entry) return null;
      if (typeof entry.origin === 'string' && now() - entry.seenAt < SESSION_MAX_MS) return entry.origin;
      await area.remove(key);
      return null;
    },
    async remember(profileId, origin) {
      if (typeof profileId !== 'string' || !profileId || !origin) return;
      await area.set({ [sessionKey(profileId)]: { origin, seenAt: now() } });
    },
  };
}

/** Straight into the account's open console session when one is known; otherwise through its sign-in method. */
export async function openUrlFor(profile, sessions) {
  const origin = await sessions.originFor(profile.id);
  return origin ? sessionUrl(profile, origin) : buildProfileUrl(profile);
}
