import { normalizeAccount, normalizeAccountId } from '../lib/account.js';

export const SIGNIN_HOST = 'signin.aws.amazon.com';

export function accountRefField(overrides = {}) {
  return {
    key: 'account',
    label: 'Account ID or alias',
    required: true,
    placeholder: '111122223333',
    normalize: (value) => normalizeAccount(value) ?? value,
    validate: (value) => (normalizeAccount(value) ? null : 'Enter a 12-digit account ID or an account alias'),
    ...overrides,
  };
}

export function accountIdField(overrides = {}) {
  return {
    key: 'accountId',
    label: 'Account ID',
    required: true,
    placeholder: '111122223333',
    normalize: (value) => normalizeAccountId(value) ?? value,
    validate: (value) => (normalizeAccountId(value) ? null : 'Enter a 12-digit account ID'),
    ...overrides,
  };
}

/** Returns an error message, or null when `value` is an https URL on one of `hostSuffixes` (any host if omitted). */
export function httpsUrlError(value, hostSuffixes = null) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return 'Enter a full URL starting with https://';
  }
  if (url.protocol !== 'https:') return 'The URL must start with https://';
  if (hostSuffixes && !hostSuffixes.some((suffix) => url.hostname.endsWith(suffix))) {
    const choices = hostSuffixes.length > 1 ? `${hostSuffixes.slice(0, -1).join(', ')} or ${hostSuffixes.at(-1)}` : hostSuffixes[0];
    return `The host must end with ${choices}`;
  }
  return null;
}
