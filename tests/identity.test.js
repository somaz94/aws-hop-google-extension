/**
 * @jest-environment jsdom
 */
import { describe, test, expect, beforeEach } from '@jest/globals';
import { detectIdentity, identityFromDom, identityFromHost, identityFromNavInfo } from '../src/lib/identity.js';

describe('identityFromHost', () => {
  test('reads the account from a multi-session host', () => {
    expect(identityFromHost('111122223333-abcd1234.us-east-1.console.aws.amazon.com'))
      .toEqual({ accounts: ['111122223333'], role: null, source: 'host' });
  });

  test.each(['us-east-1.console.aws.amazon.com', 'console.aws.amazon.com', undefined])('%p has no account', (host) => {
    expect(identityFromHost(host)).toBeNull();
  });
});

describe('identityFromNavInfo', () => {
  test('uses the login account when no role is active', () => {
    expect(identityFromNavInfo({ loginDisplayNameAccount: '1111-2222-3333', loginDisplayNameUser: 'Admin/jane' }))
      .toEqual({ accounts: ['111122223333'], role: 'Admin', source: 'nav' });
  });

  test('the switched-to role wins over the source account', () => {
    expect(identityFromNavInfo({
      loginDisplayNameAccount: '444455556666',
      loginDisplayNameUser: 'jane',
      roleDisplayNameAccount: '111122223333',
      roleDisplayNameUser: 'shop-prod',
    })).toEqual({ accounts: ['111122223333'], role: 'shop-prod', source: 'nav' });
  });

  test('an alias is lowercased, other text kept as a lowercase label', () => {
    expect(identityFromNavInfo({ loginDisplayNameAccount: 'My-Org' }).accounts).toEqual(['my-org']);
    expect(identityFromNavInfo({ loginDisplayNameAccount: 'Some Name' }).accounts).toEqual(['some name']);
  });

  test('a missing user leaves the role empty', () => {
    expect(identityFromNavInfo({ loginDisplayNameAccount: '111122223333' }).role).toBeNull();
  });

  test.each([null, 'text', {}, { loginDisplayNameAccount: 42 }])('%p has no account', (info) => {
    expect(identityFromNavInfo(info)).toBeNull();
  });
});

describe('identityFromDom', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('reads the legacy navigation ids', () => {
    document.body.innerHTML = `
      <span id="awsc-login-display-name-account">4444-5555-6666</span>
      <span id="awsc-login-display-name-user">jane</span>
      <span id="awsc-role-display-name-account">1111-2222-3333</span>
      <span id="awsc-role-display-name-user">shop-prod</span>`;
    expect(identityFromDom(document)).toEqual({ accounts: ['111122223333'], role: 'shop-prod', source: 'dom' });
  });

  test('reads the account next to the copy button', () => {
    document.body.innerHTML = '<div><span>1111-2222-3333</span><button data-testid="awsc-copy-accountid"></button></div>';
    expect(identityFromDom(document)).toEqual({ accounts: ['111122223333'], role: null, source: 'dom' });
  });

  test('falls back to an ID in the account menu button', () => {
    document.body.innerHTML = '<button data-testid="awsc-nav-account-menu-button">Admin @ 1111-2222-3333</button>';
    expect(identityFromDom(document).accounts).toEqual(['111122223333']);
  });

  test('a copy button without a readable ID falls through to the menu', () => {
    document.body.innerHTML = `
      <button data-testid="awsc-copy-accountid"></button>
      <button data-testid="awsc-nav-account-menu-button">Admin @ 111122223333</button>`;
    expect(identityFromDom(document).accounts).toEqual(['111122223333']);
  });

  test('nothing recognisable gives null', () => {
    document.body.innerHTML = '<button data-testid="awsc-nav-account-menu-button">Admin</button>';
    expect(identityFromDom(document)).toBeNull();
  });
});

describe('detectIdentity', () => {
  const host = '444455556666-abcd.us-east-1.console.aws.amazon.com';

  beforeEach(() => {
    document.body.innerHTML = '<div><span>2222-3333-4444</span><button data-testid="awsc-copy-accountid"></button></div>';
  });

  test('navigation info first', () => {
    expect(detectIdentity({ hostname: host, navInfo: { loginDisplayNameAccount: '111122223333' }, doc: document }).source).toBe('nav');
  });

  test('then the page markup', () => {
    expect(detectIdentity({ hostname: host, navInfo: null, doc: document }).accounts).toEqual(['222233334444']);
  });

  test('then the host, never merged with the others', () => {
    document.body.innerHTML = '';
    expect(detectIdentity({ hostname: host, navInfo: null, doc: document }).accounts).toEqual(['444455556666']);
    expect(detectIdentity({ hostname: host, navInfo: null, doc: null }).source).toBe('host');
  });
});
