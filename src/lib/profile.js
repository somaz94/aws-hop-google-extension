import { t } from '../i18n/index.js';
import { getProvider } from '../providers/index.js';
import { formatAccountId } from './account.js';
import { normalizeHex } from './color.js';
import { colorFor, firstToken, TAG_MAX } from './tag.js';

export const NAME_MAX = 64;
export const GROUP_MAX = 40;
// Editor inputs for a sign-in method's own fields are named with this prefix, apart from the common ones.
export const FIELD_PREFIX = 'field:';

// Older versions stored a fixed environment instead of a free-form tag; such accounts are read as this tag.
const LEGACY_ENV_TAGS = Object.freeze({ prod: 'prod', stage: 'stage', dev: 'dev', test: 'test', other: '' });

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
  const legacyEnv = Object.hasOwn(LEGACY_ENV_TAGS, source.env ?? '') ? source.env : null;
  return {
    id: text(source.id) || idFactory(),
    name: text(source.name),
    provider: provider ? provider.id : text(source.provider),
    tag: text(source.tag ?? (legacyEnv ? LEGACY_ENV_TAGS[legacyEnv] : '')),
    guarded: typeof source.guarded === 'boolean' ? source.guarded : legacyEnv === 'prod',
    color: normalizeHex(source.color),
    group: text(source.group),
    fields,
  };
}

/** Returns `[{ field, message }]`; an empty array means the profile can be saved. */
export function validateProfile(profile) {
  const errors = [];
  if (!profile.name) errors.push({ field: 'name', message: t('error.nameRequired') });
  else if (profile.name.length > NAME_MAX) errors.push({ field: 'name', message: t('error.maxLength', { max: NAME_MAX }) });
  if (profile.tag.length > TAG_MAX) errors.push({ field: 'tag', message: t('error.maxLength', { max: TAG_MAX }) });
  if (profile.group.length > GROUP_MAX) errors.push({ field: 'group', message: t('error.maxLength', { max: GROUP_MAX }) });

  const provider = getProvider(profile.provider);
  if (!provider) {
    errors.push({ field: 'provider', message: t('error.unknownProvider', { id: profile.provider }) });
    return errors;
  }
  for (const field of provider.fields) {
    const value = profile.fields[field.key];
    if (!value) {
      if (field.required) errors.push({ field: field.key, message: t('error.required', { label: t(field.label) }) });
      continue;
    }
    const message = field.validate?.(value);
    if (message) errors.push({ field: field.key, message });
  }
  return errors;
}

/** The sign-in method's fields out of form entries, keyed without FIELD_PREFIX. */
export function fieldValues(entries) {
  const values = {};
  for (const [key, value] of entries) {
    if (key.startsWith(FIELD_PREFIX)) values[key.slice(FIELD_PREFIX.length)] = value;
  }
  return values;
}

/** "tag · name", or just the name: how an account is named on the console label, its menu and the address bar. */
export function profileLabel(profile) {
  return profile.tag ? `${profile.tag} · ${profile.name}` : profile.name;
}

/** The second line of an account row: the sign-in method as the caller words it, the account ID and the group. */
export function profileMeta(profile, providerText) {
  const account = profileAccount(profile);
  return [providerText, account && formatAccountId(account), profile.group].filter(Boolean).join(' · ');
}

/** The chosen color, else one derived from the group or the first word of the name, so a project shares a color. */
export function profileColor(profile) {
  return profile.color ?? colorFor(profile.group || firstToken(profile.name) || profile.name);
}

export function buildProfileUrl(profile) {
  const provider = getProvider(profile.provider);
  if (!provider) throw new Error(t('error.unknownProvider', { id: profile.provider }));
  return provider.buildUrl(profile.fields, { name: profile.name, color: profileColor(profile) });
}

/** Canonical account ID or alias the profile signs in to, or null when it does not say. */
export function profileAccount(profile) {
  return getProvider(profile.provider)?.accountOf(profile.fields) ?? null;
}

/** The console page the profile opens after sign-in, or null for the console home. */
export function profileLanding(profile) {
  return getProvider(profile.provider)?.landingOf?.(profile.fields) ?? null;
}

/** Role names the console may show while this profile is active, used to break ties between profiles. */
export function profileRoles(profile) {
  const provider = getProvider(profile.provider);
  return provider?.roleOf ? provider.roleOf(profile.fields, { name: profile.name }) : [];
}

/** Equal for profiles that sign in to the same place; names, tags and colors do not count. */
export function profileTarget(profile) {
  const provider = getProvider(profile.provider);
  const target = provider?.targetOf ? provider.targetOf(profile.fields) : profile.fields;
  return `${profile.provider}:${JSON.stringify(target)}`;
}
