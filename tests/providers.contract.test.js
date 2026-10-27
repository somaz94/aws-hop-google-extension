import { describe, test, expect } from '@jest/globals';
import { getProvider, listProviders } from '../src/providers/index.js';
import { buildProfileUrl, normalizeProfile, profileAccount, profileRoles, profileTarget, validateProfile } from '../src/lib/profile.js';
import { catalog, LANGUAGES } from '../src/i18n/index.js';

const missingLanguages = (key) => LANGUAGES.filter((language) => !(key in catalog(language)));

// Runs against every registered provider, so a new sign-in method is checked without new tests.
describe.each(listProviders().map((provider) => [provider.id, provider]))('provider %s', (id, provider) => {
  const example = () => normalizeProfile({ name: 'Example', provider: id, fields: provider.example });

  test('is registered under its id', () => {
    expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(getProvider(id)).toBe(provider);
  });

  test('describes itself in every language', () => {
    expect(provider.short).toMatch(/^[A-Z]{2,5}$/);
    expect({ label: missingLanguages(provider.label), description: missingLanguages(provider.description) })
      .toEqual({ label: [], description: [] });
  });

  test('declares fields with unique keys, labelled in every language', () => {
    const keys = provider.fields.map((field) => field.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const field of provider.fields) {
      expect(typeof field.required).toBe('boolean');
      expect({ key: field.key, missing: [field.label, field.help].filter(Boolean).flatMap(missingLanguages) })
        .toEqual({ key: field.key, missing: [] });
    }
  });

  test('ignores the name when comparing sign-in targets', () => {
    expect(profileTarget(example())).toBe(profileTarget({ ...example(), name: 'Other' }));
  });

  test('ships a valid example', () => {
    expect(validateProfile(example())).toEqual([]);
  });

  test('builds an https URL for the example', () => {
    expect(new URL(buildProfileUrl(example())).protocol).toBe('https:');
  });

  test('reports the example account', () => {
    expect(profileAccount(example())).toBe('111122223333');
  });

  test('reports role names as an array', () => {
    expect(Array.isArray(profileRoles(example()))).toBe(true);
  });

  test('flags every required field when empty', () => {
    const empty = normalizeProfile({ name: 'Empty', provider: id, fields: {} });
    const flagged = validateProfile(empty).map((error) => error.field);
    expect(flagged).toEqual(provider.fields.filter((field) => field.required).map((field) => field.key));
  });
});

test('provider ids are unique', () => {
  const ids = listProviders().map((provider) => provider.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test('getProvider returns null for unknown ids', () => {
  expect(getProvider('nope')).toBeNull();
  expect(getProvider(undefined)).toBeNull();
});
