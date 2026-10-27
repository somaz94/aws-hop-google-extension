import { normalizeAccount, normalizeAccountId } from '../lib/account.js';
import { formatList, t } from '../i18n/index.js';

export const SIGNIN_HOST = 'signin.aws.amazon.com';

// Field `label`, `help` and `placeholder` are i18n keys; a placeholder that is not a key is shown as is.
export function accountRefField(overrides = {}) {
  return {
    key: 'account',
    label: 'field.account.label',
    required: true,
    placeholder: '111122223333',
    normalize: (value) => normalizeAccount(value) ?? value,
    validate: (value) => (normalizeAccount(value) ? null : t('error.accountRef')),
    ...overrides,
  };
}

export function accountIdField(overrides = {}) {
  return {
    key: 'accountId',
    label: 'field.accountId.label',
    required: true,
    placeholder: '111122223333',
    normalize: (value) => normalizeAccountId(value) ?? value,
    validate: (value) => (normalizeAccountId(value) ? null : t('error.accountId')),
    ...overrides,
  };
}

/** Returns an error message, or null when `value` is an https URL on one of `hostSuffixes` (any host if omitted). */
export function httpsUrlError(value, hostSuffixes = null) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return t('error.urlInvalid');
  }
  if (url.protocol !== 'https:') return t('error.urlHttps');
  if (hostSuffixes && !hostSuffixes.some((suffix) => url.hostname.endsWith(suffix))) {
    return t('error.hostSuffix', { choices: formatList(hostSuffixes) });
  }
  return null;
}
