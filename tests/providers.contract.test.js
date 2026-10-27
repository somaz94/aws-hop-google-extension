import { describe, test, expect } from '@jest/globals';
import { getProvider, listProviders } from '../src/providers/index.js';
import { buildProfileUrl, normalizeProfile, profileAccount, profileRoles, validateProfile } from '../src/lib/profile.js';

// Runs against every registered provider, so a new sign-in method is checked without new tests.
describe.each(listProviders().map((provider) => [provider.id, provider]))('provider %s', (id, provider) => {
  const example = () => normalizeProfile({ name: 'Example', provider: id, env: 'prod', fields: provider.example });

  test('is registered under its id', () => {
    expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(getProvider(id)).toBe(provider);
  });

  test('describes itself', () => {
    for (const key of ['label', 'short', 'description']) {
      expect(typeof provider[key]).toBe('string');
      expect(provider[key].length).toBeGreaterThan(0);
    }
  });

  test('declares fields with unique keys', () => {
    const keys = provider.fields.map((field) => field.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const field of provider.fields) {
      expect(typeof field.label).toBe('string');
      expect(typeof field.required).toBe('boolean');
    }
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
