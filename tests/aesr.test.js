import { describe, test, expect, afterEach } from '@jest/globals';
import { looksLikeAesr, profilesFromAesr } from '../src/importers/aesr.js';
import { detectFormat, importProfiles } from '../src/importers/index.js';
import { setLanguage } from '../src/i18n/index.js';

afterEach(() => setLanguage('en'));

// Adapted from the aws-extend-switch-roles README, simple and complex configuration.
const AESR = `
[profile marketingadmin]
role_arn = arn:aws:iam::123456789012:role/marketingadmin
color = ffaaee

[anotheraccount]
aws_account_id = 987654321987
role_name = anotherrole
region=ap-northeast-1

[organization1]
aws_account_id = 000011112222
aws_account_alias = your-account-alias ; If your account is aliased

[Org1-Account1-Role2]
aws_account_id = 123456789012
role_name = Role2
source_profile = organization1

[AnotherRole]
role_name = SomeOtherRole
aws_account_id = account-3-alias

;
; target_role_name example
;
[Org2-BaseAccount]
aws_account_id = 222200000000
target_role_name = Developer

[Org2-Account1-Developer]
aws_account_id = 222200001111
source_profile = Org2-BaseAccount

[Org2-Account2-Manager]
aws_account_id = 222200002222
role_name = Manager ; overrides target role name
source_profile = Org2-BaseAccount

[Org3-BaseAccount1]
aws_account_id = 333300000000
role_name = Entry-Role-1

[Org3-Account1-Role1]
aws_account_id = 333300001111
role_name = Role1
source_profile = Org3-BaseAccount1

[shop-prod]
aws_account_id = 444455556666

[orphan]
source_profile = organization1
aws_account_id = 555566667777

[no-account]
color = 112233

[bad-arn]
role_arn = arn:aws:iam::123456789012:user/jane

[sso-session corp]
sso_start_url = https://example.awsapps.com/start
`;

describe('profilesFromAesr', () => {
  const { profiles, skipped } = profilesFromAesr(AESR);
  const byName = Object.fromEntries(profiles.map((p) => [p.name, p]));

  test('maps role_arn targets to Switch Role, dropping the CLI profile prefix and keeping the color', () => {
    expect(byName.marketingadmin).toEqual({
      name: 'marketingadmin', tag: '', guarded: false, color: 'ffaaee', group: '', provider: 'switch-role',
      fields: { account: '123456789012', roleName: 'marketingadmin' },
    });
  });

  test('maps aws_account_id with role_name to Switch Role, account aliases included', () => {
    expect(byName.anotheraccount).toMatchObject({ provider: 'switch-role', fields: { account: '987654321987', roleName: 'anotherrole' } });
    expect(byName.AnotherRole).toMatchObject({ provider: 'switch-role', fields: { account: 'account-3-alias', roleName: 'SomeOtherRole' } });
  });

  test('groups targets under their base account, which becomes an IAM user sign-in', () => {
    expect(byName['Org1-Account1-Role2']).toMatchObject({ group: 'organization1', fields: { roleName: 'Role2' } });
    expect(byName.organization1).toMatchObject({ group: 'organization1', provider: 'iam-user', fields: { account: '000011112222' } });
  });

  test('a target without role_name takes the base target_role_name, and its own role_name wins', () => {
    expect(byName['Org2-Account1-Developer']).toMatchObject({ provider: 'switch-role', group: 'Org2-BaseAccount', fields: { roleName: 'Developer' } });
    expect(byName['Org2-Account2-Manager']).toMatchObject({ fields: { roleName: 'Manager' } });
  });

  test('an account without any role is an IAM user sign-in, protected when its name reads like production', () => {
    expect(byName['shop-prod']).toMatchObject({ provider: 'iam-user', guarded: true, group: '' });
  });

  test('explains every skipped profile, and ignores sections that are not profiles', () => {
    expect(skipped).toEqual([
      { name: 'Org3-BaseAccount1', reason: 'a base account signed in to through role_name; add it with the sign-in method you use' },
      { name: 'orphan', reason: 'no role_name, and its source_profile has no target_role_name' },
      { name: 'no-account', reason: 'no role_arn or aws_account_id' },
      { name: 'bad-arn', reason: 'role_arn is not an IAM role ARN' },
    ]);
    expect(profiles.map((p) => p.name)).not.toContain('sso-session corp');
  });

  test('skip reasons follow the language', () => {
    setLanguage('ko');
    expect(profilesFromAesr('[x]\ncolor = 112233').skipped).toEqual([{ name: 'x', reason: 'role_arn과 aws_account_id가 모두 없습니다' }]);
  });
});

describe('looksLikeAesr', () => {
  test.each([
    ['[a]\naws_account_id = 111122223333\nrole_name = Admin', true],
    ['[profile a]\naws_account_id = 111122223333\nrole_name = Admin', true],
    ['[base]\naws_account_id = 111122223333\ntarget_role_name = Dev', true],
    ['[base]\naws_account_id = 111122223333\naws_account_alias = corp', true],
    ['[a]\nrole_arn = arn:aws:iam::111122223333:role/Admin', true],
    ['[profile a]\nrole_arn = arn:aws:iam::111122223333:role/Admin', false],
    ['[default]\naws_account_id = 111122223333', false],
    ['[profile a]\nsso_account_id = 111122223333\nsso_role_name = Admin', false],
    ['[services local]\naws_account_id = 111122223333', false],
    // An ~/.aws/credentials file has bare sections too, but no account to map.
    ['[shop]\naws_access_key_id = example-key-id', false],
    ['', false],
  ])('%p → %p', (text, expected) => {
    expect(looksLikeAesr(text)).toBe(expected);
  });
});

describe('import', () => {
  test('detectFormat picks aesr for an AESR config and keeps the CLI config and JSON as they were', () => {
    expect(detectFormat(AESR)).toBe('aesr');
    expect(detectFormat('[profile a]\nrole_arn = arn:aws:iam::111122223333:role/Admin')).toBe('aws-config');
    expect(detectFormat('[{"name":"x"}]')).toBe('json');
  });

  test('importProfiles normalizes, validates and de-duplicates AESR profiles', () => {
    let n = 0;
    const text = `${AESR}\n[Org1-Account1-Role2-copy]\naws_account_id = 123456789012\nrole_name = Role2\n`;
    const { profiles, skipped } = importProfiles(text, { idFactory: () => `aesr-${n++}` });
    expect(profiles.find((p) => p.name === 'marketingadmin').color).toBe('#ffaaee');
    expect(profiles.filter((p) => p.fields.roleName === 'Role2').map((p) => p.name)).toEqual(['Org1-Account1-Role2']);
    expect(skipped.at(-1)).toEqual({ name: 'Org1-Account1-Role2-copy', reason: 'signs in to the same place as Org1-Account1-Role2, which is imported instead' });
  });
});
