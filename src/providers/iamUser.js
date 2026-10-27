import { normalizeAccount } from '../lib/account.js';
import { accountRefField, SIGNIN_HOST } from './fields.js';

export default {
  id: 'iam-user',
  label: 'provider.iam-user.label',
  short: 'IAM',
  description: 'provider.iam-user.description',
  fields: [accountRefField()],
  example: { account: '111122223333' },
  buildUrl({ account }) {
    return `https://${normalizeAccount(account)}.${SIGNIN_HOST}/console`;
  },
  accountOf({ account }) {
    return normalizeAccount(account);
  },
};
