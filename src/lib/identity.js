import { normalizeAccount, normalizeAccountId } from './account.js';

// Multi-session consoles live on <account-id>-<suffix>.<region>.console.aws.amazon.com (documented by AWS).
const MULTI_SESSION_HOST = /^(\d{12})-[a-z0-9]+\./;
const ACCOUNT_ID_TEXT = /\b(\d{4}-?\d{4}-?\d{4})\b/;

// Undocumented console markup; when AWS changes the navigation bar, this is the one place to update.
export const CONSOLE_SELECTORS = Object.freeze({
  loginAccount: '#awsc-login-display-name-account',
  loginUser: '#awsc-login-display-name-user',
  roleAccount: '#awsc-role-display-name-account',
  roleUser: '#awsc-role-display-name-user',
  copyAccountId: '[data-testid="awsc-copy-accountid"]',
  accountMenuButton: '[data-testid="awsc-nav-account-menu-button"]',
});

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function accountRef(value) {
  return normalizeAccount(value) ?? value.toLowerCase();
}

export function identityFromHost(hostname) {
  const match = MULTI_SESSION_HOST.exec(String(hostname ?? ''));
  return match ? { accounts: [match[1]], role: null, source: 'host' } : null;
}

/**
 * Reads the console navigation's account info. After a Switch Role the role fields describe the
 * active account, so they win over the login fields, which still describe the source account.
 */
export function identityFromNavInfo(info, source = 'nav') {
  if (!info || typeof info !== 'object') return null;
  const roleAccount = text(info.roleDisplayNameAccount);
  const account = roleAccount || text(info.loginDisplayNameAccount);
  if (!account) return null;
  const role = roleAccount ? text(info.roleDisplayNameUser) : text(info.loginDisplayNameUser).split('/')[0];
  return { accounts: [accountRef(account)], role: role || null, source };
}

export function identityFromDom(doc) {
  const read = (selector) => text(doc.querySelector(selector)?.textContent);
  const legacy = identityFromNavInfo({
    loginDisplayNameAccount: read(CONSOLE_SELECTORS.loginAccount),
    loginDisplayNameUser: read(CONSOLE_SELECTORS.loginUser),
    roleDisplayNameAccount: read(CONSOLE_SELECTORS.roleAccount),
    roleDisplayNameUser: read(CONSOLE_SELECTORS.roleUser),
  }, 'dom');
  if (legacy) return legacy;

  const copied = normalizeAccountId(text(doc.querySelector(CONSOLE_SELECTORS.copyAccountId)?.previousElementSibling?.textContent));
  if (copied) return { accounts: [copied], role: null, source: 'dom' };

  const menu = ACCOUNT_ID_TEXT.exec(read(CONSOLE_SELECTORS.accountMenuButton));
  return menu ? { accounts: [normalizeAccountId(menu[1])], role: null, source: 'dom' } : null;
}

/**
 * First strategy that answers wins: navigation info, then page markup, then the multi-session host.
 * Strategies are never merged, because the host names the signed-in session and can be the source
 * account after a Switch Role; mixing it in could match a dev profile while a prod role is active.
 */
export function detectIdentity({ hostname, navInfo, doc }) {
  return identityFromNavInfo(navInfo) ?? (doc ? identityFromDom(doc) : null) ?? identityFromHost(hostname);
}
