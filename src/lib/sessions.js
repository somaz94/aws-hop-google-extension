import { identityFromHost } from './identity.js';
import { buildProfileUrl } from './profile.js';

// In chrome.storage.session: a console session ends with the browser anyway, and nothing here is synced.
const SESSION_PREFIX = 'session:';
const CONSOLE_DOMAIN = '.console.aws.amazon.com';

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

/** A page inside the session: the IAM Identity Center destination's page when there is one, else the console home. */
export function sessionUrl(profile, origin) {
  const destination = profile.fields.destination;
  if (!destination) return `${origin}/console/home`;
  const { pathname, search, hash } = new URL(destination);
  return `${origin}${pathname}${search}${hash}`;
}

/** One item per account, so two tabs reporting at once cannot overwrite each other. */
export function createSessionStore({ area = globalThis.chrome?.storage?.session } = {}) {
  return {
    async originFor(profileId) {
      const items = await area.get(sessionKey(profileId));
      return items[sessionKey(profileId)] ?? null;
    },
    async remember(profileId, origin) {
      if (typeof profileId !== 'string' || !profileId || !origin) return;
      await area.set({ [sessionKey(profileId)]: origin });
    },
  };
}

/** Straight into the account's open console session when one is known; otherwise through its sign-in method. */
export async function openUrlFor(profile, sessions) {
  const origin = await sessions.originFor(profile.id);
  return origin ? sessionUrl(profile, origin) : buildProfileUrl(profile);
}
