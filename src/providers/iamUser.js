import { normalizeAccount } from '../lib/account.js';
import { accountRefField, SIGNIN_HOST } from './fields.js';

export default {
  id: 'iam-user',
  label: 'IAM user sign-in',
  short: 'IAM',
  description: 'Opens the sign-in page of the account with the account already filled in. '
    + 'The user name and password are left to the browser password manager.',
  fields: [accountRefField()],
  example: { account: '111122223333' },
  buildUrl({ account }) {
    return `https://${normalizeAccount(account)}.${SIGNIN_HOST}/console`;
  },
  accountOf({ account }) {
    return normalizeAccount(account);
  },
};
