import { describe, test, expect } from '@jest/globals';
import { colorFor, firstToken, looksProtected, PALETTE, PROTECTED_COLOR, SUGGESTED_TAGS } from '../src/lib/tag.js';
import { normalizeHex, readableTextColor } from '../src/lib/color.js';

describe('tags', () => {
  test('colorFor is stable, case-insensitive and always from the palette', () => {
    expect(colorFor('shop')).toBe(colorFor('SHOP'));
    for (const seed of ['shop', 'billing', 'data', '운영', '', undefined]) expect(PALETTE).toContain(colorFor(seed));
  });

  test('different projects spread over the palette', () => {
    const colors = new Set(['shop', 'billing', 'data', 'ml', 'web', 'api', 'auth', 'ops'].map(colorFor));
    expect(colors.size).toBeGreaterThan(3);
  });

  test('red is reserved for protected accounts', () => {
    expect(PALETTE).not.toContain(PROTECTED_COLOR);
  });

  test('every palette color is a valid hex', () => {
    for (const color of [...PALETTE, PROTECTED_COLOR]) expect(normalizeHex(color)).toBe(color);
  });

  test.each([
    ['shop-dev', 'shop'],
    ['Shop Prod', 'shop'],
    ['운영-쇼핑', '운영'],
    ['', ''],
    [null, ''],
  ])('firstToken(%p) → %p', (text, token) => {
    expect(firstToken(text)).toBe(token);
  });

  test.each([
    [['shop-prod'], true],
    [['billing', 'live'], true],
    [['결제 운영'], true],
    [['product'], false],
    [['shop-dev', 'qa'], false],
    [[null], false],
  ])('looksProtected(%p) → %p', (texts, expected) => {
    expect(looksProtected(...texts)).toBe(expected);
  });

  test('suggested tags are plain words', () => {
    for (const tag of SUGGESTED_TAGS) expect(tag).toMatch(/^[a-z]+$/);
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
