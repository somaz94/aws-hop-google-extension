import { formatAccountId } from './account.js';
import { getEnvironment } from './env.js';
import { getProvider } from '../providers/index.js';
import { profileAccount } from './profile.js';

function haystack(profile) {
  const env = getEnvironment(profile.env);
  const provider = getProvider(profile.provider);
  const account = profileAccount(profile) ?? '';
  return [
    profile.name, profile.group, env.id, env.short, env.label,
    provider?.label, provider?.short, account, formatAccountId(account),
    ...Object.values(profile.fields),
  ].join(' ').toLowerCase();
}

function score(profile, query) {
  const name = profile.name.toLowerCase();
  if (name.startsWith(query)) return 0;
  if (name.includes(query)) return 1;
  return 2;
}

/** Every whitespace-separated term must match; name hits rank first, otherwise the user's order is kept. */
export function filterProfiles(profiles, query) {
  const normalized = String(query ?? '').trim().toLowerCase();
  if (!normalized) return profiles;
  const terms = normalized.split(/\s+/);
  return profiles
    .map((profile, index) => ({ profile, index, text: haystack(profile) }))
    .filter(({ text }) => terms.every((term) => text.includes(term)))
    .sort((a, b) => score(a.profile, normalized) - score(b.profile, normalized) || a.index - b.index)
    .map(({ profile }) => profile);
}

/** Buckets profiles by group in order of first appearance, keeping the user's order inside each bucket. */
export function groupProfiles(profiles) {
  const groups = new Map();
  for (const profile of profiles) {
    if (!groups.has(profile.group)) groups.set(profile.group, []);
    groups.get(profile.group).push(profile);
  }
  return [...groups].map(([group, members]) => ({ group, profiles: members }));
}

/** Moves a list selection by `delta`, wrapping at both ends; -1 when the list is empty. */
export function moveSelection(index, delta, length) {
  if (length <= 0) return -1;
  if (index < 0) return delta > 0 ? 0 : length - 1;
  return (((index + delta) % length) + length) % length;
}

/** A modifier key (Shift, Ctrl, Cmd, middle click) opens the profile where the setting would not. */
export function resolveOpenTarget(openIn, invert) {
  const current = openIn === 'current-tab';
  return current !== Boolean(invert) ? 'current-tab' : 'new-tab';
}
