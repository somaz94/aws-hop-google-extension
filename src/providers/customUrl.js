import { normalizeAccountId } from '../lib/account.js';
import { accountIdField, httpsUrlError } from './fields.js';

export default {
  id: 'custom-url',
  label: 'Custom URL (SAML or other IdP)',
  short: 'URL',
  description: 'Opens any https sign-in URL, such as an IdP-initiated SAML link from Okta, Entra ID or '
    + 'Google Workspace. Add the account ID so the production guard can recognise the account.',
  fields: [
    {
      key: 'url',
      label: 'Sign-in URL',
      required: true,
      type: 'url',
      placeholder: 'https://idp.example.com/app/aws/sso',
      validate: (value) => httpsUrlError(value),
    },
    accountIdField({ required: false, help: 'Optional. Lets the production guard match this account.' }),
  ],
  example: { url: 'https://idp.example.com/app/aws/sso', accountId: '111122223333' },
  buildUrl({ url }) {
    return url;
  },
  accountOf({ accountId }) {
    return normalizeAccountId(accountId);
  },
};
