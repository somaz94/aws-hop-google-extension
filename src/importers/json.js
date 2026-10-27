export const EXPORT_FORMAT = 'aws-hop';
export const EXPORT_VERSION = 1;

export function exportProfiles(profiles, now = new Date()) {
  return `${JSON.stringify({
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    profiles,
  }, null, 2)}\n`;
}

/** Accepts an export envelope or a bare array of profiles. Throws on anything else. */
export function profilesFromJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`Invalid JSON: ${err.message}`);
  }
  if (Array.isArray(data)) return { profiles: data, skipped: [] };
  if (data && typeof data === 'object' && data.format === EXPORT_FORMAT) {
    if (data.version > EXPORT_VERSION) {
      throw new Error(`This file was exported by a newer version (format version ${data.version})`);
    }
    if (Array.isArray(data.profiles)) return { profiles: data.profiles, skipped: [] };
  }
  throw new Error('Expected an AWS Hop export or an array of profiles');
}
