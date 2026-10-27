import { normalizeAccountId } from '../lib/account.js';
import { accountIdField, httpsUrlError } from './fields.js';

// awsapps.com: classic portal (incl. GovCloud), app.aws: dual-stack portal, awsapps.cn: China.
export const PORTAL_HOST_SUFFIXES = ['.awsapps.com', '.app.aws', '.awsapps.cn'];
const PERMISSION_SET = /^[\w+=,.@-]{1,32}$/;

/** Drops any `#/...` fragment and trailing slashes so the console path can be appended. */
export function normalizeStartUrl(value) {
  return String(value ?? '').trim().replace(/#.*$/, '').replace(/\/+$/, '');
}

export default {
  id: 'sso',
  label: 'IAM Identity Center (SSO)',
  short: 'SSO',
  description: 'Opens an access-portal shortcut link that signs you in to the account with the chosen '
    + 'permission set in one step.',
  fields: [
    {
      key: 'startUrl',
      label: 'AWS access portal URL',
      required: true,
      type: 'url',
      placeholder: 'https://example.awsapps.com/start',
      normalize: normalizeStartUrl,
      validate: (value) => httpsUrlError(value, PORTAL_HOST_SUFFIXES),
    },
    accountIdField(),
    {
      key: 'roleName',
      label: 'Permission set',
      required: true,
      placeholder: 'AdministratorAccess',
      validate: (value) => (PERMISSION_SET.test(value) ? null : 'Up to 32 letters, digits and + = , . @ - _'),
    },
    {
      key: 'destination',
      label: 'Landing page',
      required: false,
      type: 'url',
      placeholder: 'https://console.aws.amazon.com/s3/home',
      help: 'Optional console URL to open after sign-in.',
      validate: (value) => httpsUrlError(value),
    },
  ],
  example: { startUrl: 'https://example.awsapps.com/start', accountId: '111122223333', roleName: 'ReadOnly' },
  buildUrl({ startUrl, accountId, roleName, destination }) {
    const query = [
      `account_id=${encodeURIComponent(normalizeAccountId(accountId))}`,
      `role_name=${encodeURIComponent(roleName)}`,
    ];
    if (destination) query.push(`destination=${encodeURIComponent(destination)}`);
    return `${normalizeStartUrl(startUrl)}/#/console?${query.join('&')}`;
  },
  accountOf({ accountId }) {
    return normalizeAccountId(accountId);
  },
  roleOf({ roleName }) {
    return [roleName];
  },
};
