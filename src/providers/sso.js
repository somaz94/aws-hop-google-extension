import { normalizeAccountId } from '../lib/account.js';
import { t } from '../i18n/index.js';
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
  label: 'provider.sso.label',
  short: 'SSO',
  description: 'provider.sso.description',
  fields: [
    {
      key: 'startUrl',
      label: 'field.startUrl.label',
      required: true,
      type: 'url',
      placeholder: 'https://example.awsapps.com/start',
      normalize: normalizeStartUrl,
      validate: (value) => httpsUrlError(value, PORTAL_HOST_SUFFIXES),
    },
    accountIdField(),
    {
      key: 'roleName',
      label: 'field.permissionSet.label',
      required: true,
      placeholder: 'AdministratorAccess',
      validate: (value) => (PERMISSION_SET.test(value) ? null : t('error.permissionSet')),
    },
    {
      key: 'destination',
      label: 'field.destination.label',
      required: false,
      type: 'url',
      placeholder: 'https://console.aws.amazon.com/s3/home',
      help: 'field.destination.help',
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
