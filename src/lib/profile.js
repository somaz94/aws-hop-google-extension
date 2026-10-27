import { getProvider } from '../providers/index.js';
import { DEFAULT_ENV, getEnvironment, isEnvironment } from './env.js';
import { normalizeHex } from './color.js';

export const NAME_MAX = 64;
export const GROUP_MAX = 40;

function newId() {
  return globalThis.crypto.randomUUID();
}

function text(value) {
  return String(value ?? '').trim();
}

/**
 * Coerces raw input (a form, an import, stored data) into the profile shape. Never throws:
 * an unknown provider keeps its id so validateProfile can report it.
 */
export function normalizeProfile(input, { idFactory = newId } = {}) {
  const source = input ?? {};
  const provider = getProvider(source.provider);
  let fields = {};
  if (provider) {
    for (const field of provider.fields) {
      const value = text(source.fields?.[field.key]);
      fields[field.key] = value && field.normalize ? field.normalize(value) : value;
    }
    if (provider.normalize) fields = provider.normalize(fields);
  }
  return {
    id: text(source.id) || idFactory(),
    name: text(source.name),
    provider: provider ? provider.id : text(source.provider),
    env: isEnvironment(source.env) ? source.env : DEFAULT_ENV,
    color: normalizeHex(source.color),
    group: text(source.group),
    fields,
  };
}

/** Returns `[{ field, message }]`; an empty array means the profile can be saved. */
export function validateProfile(profile) {
  const errors = [];
  if (!profile.name) errors.push({ field: 'name', message: 'Name is required' });
  else if (profile.name.length > NAME_MAX) errors.push({ field: 'name', message: `At most ${NAME_MAX} characters` });
  if (profile.group.length > GROUP_MAX) errors.push({ field: 'group', message: `At most ${GROUP_MAX} characters` });

  const provider = getProvider(profile.provider);
  if (!provider) {
    errors.push({ field: 'provider', message: `Unknown sign-in method "${profile.provider}"` });
    return errors;
  }
  for (const field of provider.fields) {
    const value = profile.fields[field.key];
    if (!value) {
      if (field.required) errors.push({ field: field.key, message: `${field.label} is required` });
      continue;
    }
    const message = field.validate?.(value);
    if (message) errors.push({ field: field.key, message });
  }
  return errors;
}

export function profileColor(profile) {
  return profile.color ?? getEnvironment(profile.env).color;
}

export function buildProfileUrl(profile) {
  const provider = getProvider(profile.provider);
  if (!provider) throw new Error(`Unknown sign-in method "${profile.provider}"`);
  return provider.buildUrl(profile.fields, { name: profile.name, color: profileColor(profile) });
}

/** Canonical account ID or alias the profile signs in to, or null when it does not say. */
export function profileAccount(profile) {
  return getProvider(profile.provider)?.accountOf(profile.fields) ?? null;
}

/** Role names the console may show while this profile is active, used to break ties between profiles. */
export function profileRoles(profile) {
  const provider = getProvider(profile.provider);
  return provider?.roleOf ? provider.roleOf(profile.fields, { name: profile.name }) : [];
}
