import { t } from '../i18n/index.js';
import { normalizeProfile, profileTarget, validateProfile } from '../lib/profile.js';
import { profilesFromAwsConfig } from './awsConfig.js';
import { profilesFromJson } from './json.js';

// A JSON export is restored as it is; a CLI config often lists one account under several profiles.
const PARSERS = Object.freeze({
  json: { parse: profilesFromJson, dedupe: false },
  'aws-config': { parse: profilesFromAwsConfig, dedupe: true },
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

/** Negative when `a` is the better name to keep: any name over `default`, then the shorter (`shop` over `terraform-shop`). */
const preferred = (a, b) => (a.name === 'default') - (b.name === 'default') || a.name.length - b.name.length;

/** Keeps one profile per sign-in target; the others are reported as skipped. */
export function dedupeProfiles(profiles) {
  const groups = new Map();
  for (const profile of profiles) {
    const key = profileTarget(profile);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(profile);
  }
  const kept = [];
  const skipped = [];
  for (const members of groups.values()) {
    const keep = members.reduce((best, profile) => (preferred(profile, best) < 0 ? profile : best));
    kept.push(keep);
    for (const profile of members) {
      if (profile !== keep) skipped.push({ name: profile.name, reason: t('import.skip.duplicate', { name: keep.name }) });
    }
  }
  return { profiles: kept, skipped };
}

/** Parses, normalizes and validates; invalid entries land in `skipped` with the reason, never in `profiles`. */
export function importProfiles(text, { format = detectFormat(text), idFactory } = {}) {
  const parser = PARSERS[format];
  if (!parser) throw new Error(t('import.error.format', { format }));
  const parsed = parser.parse(text);
  const valid = [];
  const skipped = [...parsed.skipped];
  for (const raw of parsed.profiles) {
    const profile = normalizeProfile(raw, idFactory ? { idFactory } : undefined);
    const errors = validateProfile(profile);
    if (errors.length) skipped.push({ name: profile.name || t('import.unnamed'), reason: errors.map((e) => e.message).join('; ') });
    else valid.push(profile);
  }
  if (!parser.dedupe) return { profiles: valid, skipped };
  const deduped = dedupeProfiles(valid);
  return { profiles: deduped.profiles, skipped: [...skipped, ...deduped.skipped] };
}

const naturalKey = (profile) => `${profile.provider}\u0000${profile.name.toLowerCase()}`;

/** An update from an import keeps the tag, color, group and protection set in AWS Hop unless the import sets them. */
function keepEdits(current, incoming) {
  return {
    ...incoming,
    id: current.id,
    tag: incoming.tag || current.tag,
    color: incoming.color ?? current.color,
    group: incoming.group || current.group,
    guarded: incoming.guarded || current.guarded,
  };
}

/**
 * Incoming profiles replace existing ones with the same id, or else the same sign-in method and name.
 * One that signs in to the same place as an existing profile under another name is left out and
 * reported in `existing`, so importing the same config twice never doubles the list.
 */
export function mergeProfiles(current, incoming) {
  const merged = [...current];
  const byId = new Map(merged.map((profile, index) => [profile.id, index]));
  const byKey = new Map(merged.map((profile, index) => [naturalKey(profile), index]));
  const byTarget = new Map(merged.map((profile) => [profileTarget(profile), profile]));
  let added = 0;
  let updated = 0;
  const existing = [];
  for (const profile of incoming) {
    const index = byId.get(profile.id) ?? byKey.get(naturalKey(profile));
    if (index !== undefined) {
      merged[index] = keepEdits(merged[index], profile);
      byTarget.set(profileTarget(merged[index]), merged[index]);
      updated += 1;
    } else if (byTarget.has(profileTarget(profile))) {
      existing.push({ name: profile.name, reason: t('import.skip.exists', { name: byTarget.get(profileTarget(profile)).name }) });
    } else {
      byId.set(profile.id, merged.length);
      byKey.set(naturalKey(profile), merged.length);
      byTarget.set(profileTarget(profile), profile);
      merged.push(profile);
      added += 1;
    }
  }
  return { profiles: merged, added, updated, existing };
}
