import { normalizeAccount, parseRoleArn } from '../lib/account.js';
import { accountRefField, SIGNIN_HOST } from './fields.js';

// The console stores path + role name in a cookie and rejects the switch above 64 characters.
const ROLE_MAX = 64;
const DISPLAY_NAME_MAX = 64;
const ROLE_NAME = /^[\w+=,.@\-/]+$/;

export default {
  id: 'switch-role',
  label: 'Switch Role',
  short: 'ROLE',
  description: 'Opens the Switch Role page prefilled with the account, role, display name and color. '
    + 'You stay signed in to your source account and confirm the switch with one click.',
  fields: [
    accountRefField({ help: 'The account that owns the role. Pasting a role ARN into Role fills this in.' }),
    {
      key: 'roleName',
      label: 'Role',
      required: true,
      placeholder: 'OrganizationAccountAccessRole',
      help: 'Role name with its path, if any (division/RoleName), or the full role ARN.',
      validate: (value) => {
        if (!ROLE_NAME.test(value)) return 'Only letters, digits and + = , . @ - _ / are allowed';
        return value.length > ROLE_MAX ? `Path and role name must be ${ROLE_MAX} characters or fewer` : null;
      },
    },
    {
      key: 'displayName',
      label: 'Display name',
      required: false,
      placeholder: 'Defaults to the profile name',
      validate: (value) => (value.length > DISPLAY_NAME_MAX ? `At most ${DISPLAY_NAME_MAX} characters` : null),
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
};
