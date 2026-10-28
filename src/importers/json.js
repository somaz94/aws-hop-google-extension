import { t } from '../i18n/index.js';
import { normalizeSettings } from '../lib/store.js';

export const EXPORT_FORMAT = 'aws-hop';
export const EXPORT_VERSION = 1;

/** The export file; `settings` is optional, so a file from an older version still imports. */
export function exportProfiles(profiles, { settings, now = new Date() } = {}) {
  return `${JSON.stringify({
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    profiles,
    ...(settings ? { settings } : {}),
  }, null, 2)}\n`;
}

/** Accepts an export envelope, with the settings it carries, or a bare array of profiles. Throws on anything else. */
export function profilesFromJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(t('import.error.json', { detail: err.message }));
  }
  if (Array.isArray(data)) return { profiles: data, skipped: [], settings: null };
  if (data && typeof data === 'object' && data.format === EXPORT_FORMAT) {
    if (data.version > EXPORT_VERSION) {
      throw new Error(t('import.error.newer', { version: data.version }));
    }
    if (Array.isArray(data.profiles)) {
      const settings = data.settings && typeof data.settings === 'object' ? normalizeSettings(data.settings) : null;
      return { profiles: data.profiles, skipped: [], settings };
    }
  }
  throw new Error(t('import.error.shape'));
}
