import { normalizeAccountId } from '../lib/account.js';
import { accountIdField, httpsUrlError } from './fields.js';

export default {
  id: 'custom-url',
  label: 'provider.custom-url.label',
  short: 'URL',
  description: 'provider.custom-url.description',
  fields: [
    {
      key: 'url',
      label: 'field.url.label',
      required: true,
      type: 'url',
      placeholder: 'https://idp.example.com/app/aws/sso',
      validate: (value) => httpsUrlError(value),
    },
    accountIdField({ required: false, help: 'field.accountId.guardHelp' }),
  ],
  example: { url: 'https://idp.example.com/app/aws/sso', accountId: '111122223333' },
  buildUrl({ url }) {
    return url;
  },
  accountOf({ accountId }) {
    return normalizeAccountId(accountId);
  },
};
