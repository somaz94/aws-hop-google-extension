import { normalizeAccount, parseRoleArn } from '../lib/account.js';
import { t } from '../i18n/index.js';
import { accountRefField, SIGNIN_HOST } from './fields.js';

// The console stores path + role name in a cookie and rejects the switch above 64 characters.
const ROLE_MAX = 64;
const DISPLAY_NAME_MAX = 64;
const ROLE_NAME = /^[\w+=,.@\-/]+$/;

export default {
  id: 'switch-role',
  label: 'provider.switch-role.label',
  short: 'ROLE',
  description: 'provider.switch-role.description',
  fields: [
    accountRefField({ help: 'field.account.roleOwnerHelp' }),
    {
      key: 'roleName',
      label: 'field.roleName.label',
      required: true,
      placeholder: 'OrganizationAccountAccessRole',
      help: 'field.roleName.help',
      validate: (value) => {
        if (!ROLE_NAME.test(value)) return t('error.roleChars');
        return value.length > ROLE_MAX ? t('error.roleLength', { max: ROLE_MAX }) : null;
      },
    },
    {
      key: 'displayName',
      label: 'field.displayName.label',
      required: false,
      placeholder: 'field.displayName.placeholder',
      validate: (value) => (value.length > DISPLAY_NAME_MAX ? t('error.maxLength', { max: DISPLAY_NAME_MAX }) : null),
    },
  ],
  example: { account: '111122223333', roleName: 'OrganizationAccountAccessRole' },
  normalize(fields) {
    const arn = parseRoleArn(fields.roleName);
    if (arn) return { ...fields, account: arn.accountId, roleName: arn.roleName };
    return { ...fields, roleName: fields.roleName.replace(/^\/+/, '') };
  },
  buildUrl({ account, roleName, displayName }, { name, color }) {
    const params = new URLSearchParams({
      account: normalizeAccount(account),
      roleName,
      displayName: (displayName || name).slice(0, DISPLAY_NAME_MAX),
    });
    if (color) params.set('color', color.replace('#', ''));
    return `https://${SIGNIN_HOST}/switchrole?${params}`;
  },
  accountOf({ account }) {
    return normalizeAccount(account);
  },
  roleOf({ roleName, displayName }, { name }) {
    return [roleName.split('/').pop(), displayName || name];
  },
  // The display name is cosmetic; two profiles with the same account and role sign in to the same place.
  targetOf({ account, roleName }) {
    return { account: normalizeAccount(account), roleName };
  },
};
