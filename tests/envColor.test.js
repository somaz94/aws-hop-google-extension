import { describe, test, expect } from '@jest/globals';
import { DEFAULT_ENV, ENVIRONMENTS, getEnvironment, inferEnv, isEnvironment } from '../src/lib/env.js';
import { normalizeHex, readableTextColor } from '../src/lib/color.js';

describe('environments', () => {
  test('ids are unique and only production is guarded', () => {
    expect(new Set(ENVIRONMENTS.map((env) => env.id)).size).toBe(ENVIRONMENTS.length);
    expect(ENVIRONMENTS.filter((env) => env.guarded).map((env) => env.id)).toEqual(['prod']);
  });

  test('every color is a valid hex', () => {
    for (const env of ENVIRONMENTS) expect(normalizeHex(env.color)).toBe(env.color);
  });

  test('unknown ids fall back to the default', () => {
    expect(getEnvironment('nope').id).toBe(DEFAULT_ENV);
    expect(getEnvironment(undefined).id).toBe(DEFAULT_ENV);
    expect(getEnvironment('prod').short).toBe('PROD');
  });

  test('isEnvironment', () => {
    expect(isEnvironment('dev')).toBe(true);
    expect(isEnvironment('production')).toBe(false);
  });
});

describe('inferEnv', () => {
  test.each([
    ['shop-prod', 'prod'],
    ['Production', 'prod'],
    ['billing_prd', 'prod'],
    ['shop-stg', 'stage'],
    ['preprod', 'stage'],
    ['dev', 'dev'],
    ['team sandbox', 'dev'],
    ['qa-env', 'test'],
    ['product', 'other'],
    ['devops-shared', 'other'],
    [null, 'other'],
  ])('%p → %p', (name, env) => {
    expect(inferEnv(name)).toBe(env);
  });
});

describe('normalizeHex', () => {
  test.each([
    ['#ABC', '#aabbcc'],
    ['ff0000', '#ff0000'],
    [' #00FF00 ', '#00ff00'],
  ])('%p → %p', (input, expected) => {
    expect(normalizeHex(input)).toBe(expected);
  });

  test.each(['red', '#12345', '', null])('rejects %p', (input) => {
    expect(normalizeHex(input)).toBeNull();
  });
});

describe('readableTextColor', () => {
  test('dark text on light backgrounds, light text on dark ones', () => {
    expect(readableTextColor('#ffffff')).toBe('#000000');
    expect(readableTextColor('#ec7211')).toBe('#000000');
    expect(readableTextColor('#000000')).toBe('#ffffff');
    expect(readableTextColor('#d13212')).toBe('#ffffff');
  });

  test('treats an invalid color as black', () => {
    expect(readableTextColor('nope')).toBe('#ffffff');
  });
});
