import { normalizeProfile, validateProfile } from '../lib/profile.js';
import { profilesFromAwsConfig } from './awsConfig.js';
import { profilesFromJson } from './json.js';

const PARSERS = Object.freeze({
  json: profilesFromJson,
  'aws-config': profilesFromAwsConfig,
});

export const IMPORT_FORMATS = Object.freeze(Object.keys(PARSERS));

/** `{` is always JSON; `[` is JSON only if it parses, since `[profile x]` also opens an INI file. */
export function detectFormat(text) {
  const trimmed = String(text ?? '').trimStart();
  if (trimmed.startsWith('{')) return 'json';
  if (trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      return 'aws-config';
    }
  }
  return 'aws-config';
}

/** Parses, normalizes and validates; invalid entries land in `skipped` with the reason, never in `profiles`. */
export function importProfiles(text, { format = detectFormat(text), idFactory } = {}) {
  const parse = PARSERS[format];
  if (!parse) throw new Error(`Unknown import format "${format}"`);
  const parsed = parse(text);
  const profiles = [];
  const skipped = [...parsed.skipped];
  for (const raw of parsed.profiles) {
    const profile = normalizeProfile(raw, idFactory ? { idFactory } : undefined);
    const errors = validateProfile(profile);
    if (errors.length) skipped.push({ name: profile.name || '(unnamed)', reason: errors.map((e) => e.message).join('; ') });
    else profiles.push(profile);
  }
  return { profiles, skipped };
}

const naturalKey = (profile) => `${profile.provider}\u0000${profile.name.toLowerCase()}`;

/** Incoming profiles replace existing ones with the same id, or else the same sign-in method and name. */
export function mergeProfiles(existing, incoming) {
  const merged = [...existing];
  const byId = new Map(merged.map((profile, index) => [profile.id, index]));
  const byKey = new Map(merged.map((profile, index) => [naturalKey(profile), index]));
  let added = 0;
  let updated = 0;
  for (const profile of incoming) {
    const index = byId.get(profile.id) ?? byKey.get(naturalKey(profile));
    if (index === undefined) {
      byId.set(profile.id, merged.length);
      byKey.set(naturalKey(profile), merged.length);
      merged.push(profile);
      added += 1;
    } else {
      merged[index] = { ...profile, id: merged[index].id };
      updated += 1;
    }
  }
  return { profiles: merged, added, updated };
}
