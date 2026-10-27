/**
 * @jest-environment jsdom
 */
import { describe, test, expect, beforeEach } from '@jest/globals';
import { createTitleKeeper, HOST_TAG, renderGuard } from '../src/content/banner.js';

const view = (overrides = {}) => ({
  color: '#d13212', textColor: '#ffffff', label: 'PROD · shop', account: '1111-2222-3333', detectedFrom: 'console navigation',
  frame: true, muted: false, titlePrefix: '[PROD] ',
  ...overrides,
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const root = () => document.querySelector(HOST_TAG).shadowRoot;

describe('renderGuard', () => {
  beforeEach(() => {
    document.querySelector(HOST_TAG)?.remove();
  });

  test('draws the stripe, frame and pill', () => {
    renderGuard(document, view());
    const host = document.querySelector(HOST_TAG);
    expect(host.style.getPropertyValue('--color')).toBe('#d13212');
    expect(root().querySelector('.label').textContent).toBe('PROD · shop');
    expect(root().querySelector('.account').textContent).toBe('1111-2222-3333');
    expect(root().querySelector('.stripe').hidden).toBe(false);
    expect(root().querySelector('.frame').hidden).toBe(false);
    expect(root().querySelector('.pill').title).toBe('AWS Hop: PROD · shop (1111-2222-3333), detected from the console navigation. Click to minimize.');
  });

  test('updates in place instead of adding a second guard', () => {
    renderGuard(document, view());
    renderGuard(document, view({ label: 'DEV · shop', frame: false, muted: true }));
    expect(document.querySelectorAll(HOST_TAG)).toHaveLength(1);
    expect(root().querySelector('.label').textContent).toBe('DEV · shop');
    expect(root().querySelector('.frame').hidden).toBe(true);
    expect(root().querySelector('.stripe').hidden).toBe(true);
    expect(root().querySelector('.pill').classList.contains('muted')).toBe(true);
  });

  test('a null view removes it, and removing twice is harmless', () => {
    renderGuard(document, view());
    renderGuard(document, null);
    renderGuard(document, null);
    expect(document.querySelector(HOST_TAG)).toBeNull();
  });

  test('clicking the pill collapses and restores it', () => {
    renderGuard(document, view());
    const pill = root().querySelector('.pill');
    pill.click();
    expect(pill.classList.contains('collapsed')).toBe(true);
    pill.click();
    expect(pill.classList.contains('collapsed')).toBe(false);
  });

  test('profile names are rendered as text, never as markup', () => {
    renderGuard(document, view({ label: '<img src=x onerror=alert(1)>' }));
    expect(root().querySelector('img')).toBeNull();
    expect(root().querySelector('.label').textContent).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('createTitleKeeper', () => {
  beforeEach(() => {
    document.title = 'EC2 Console';
  });

  test('adds the prefix and keeps it when the page rewrites the title', async () => {
    const keeper = createTitleKeeper(document);
    keeper.set('[PROD] ');
    expect(document.title).toBe('[PROD] EC2 Console');
    document.title = 'S3 Console';
    await flush();
    expect(document.title).toBe('[PROD] S3 Console');
    keeper.stop();
  });

  test('switching or clearing the prefix removes the old one', () => {
    const keeper = createTitleKeeper(document);
    keeper.set('[PROD] ');
    keeper.set('[PROD] ');
    keeper.set('[STG] ');
    expect(document.title).toBe('[STG] EC2 Console');
    keeper.set(null);
    expect(document.title).toBe('EC2 Console');
    keeper.stop();
  });

  test('clearing never strips a title the page changed itself', () => {
    const keeper = createTitleKeeper(document);
    keeper.set('[PROD] ');
    keeper.stop();
    document.title = 'Changed';
    keeper.set(null);
    expect(document.title).toBe('Changed');
  });
});
