import { describe, test, expect, afterEach } from '@jest/globals';
import { parseIni, profilesFromAwsConfig } from '../src/importers/awsConfig.js';
import { EXPORT_FORMAT, EXPORT_VERSION, exportProfiles, profilesFromJson } from '../src/importers/json.js';
import { dedupeProfiles, detectFormat, droppedByReplace, importProfiles, mergeProfiles } from '../src/importers/index.js';
import { setLanguage } from '../src/i18n/index.js';
import { normalizeProfile } from '../src/lib/profile.js';

afterEach(() => setLanguage('en'));

const AWS_CONFIG = `\uFEFF# shared config
orphan = ignored before any section
[default]
region = ap-northeast-2

[sso-session corp]
sso_start_url = https://example.awsapps.com/start
sso_region = us-east-1

[profile shop-prod]
sso_session = corp
sso_account_id = 111122223333
sso_role_name = AdministratorAccess
color = d13212

[profile legacy-sso]
sso_start_url = https://legacy.awsapps.com/start   # inline comment
sso_account_id = 444455556666
sso_role_name = ReadOnly
env = test

[profile broken-sso]
sso_account_id = 444455556666
sso_role_name = ReadOnly

[profile billing-stg]
role_arn = arn:aws:iam::777788889999:role/ops/Billing
source_profile = default
group = Billing
s3 =
  max_concurrent_requests = 20
region = eu-west-1

[profile bad-arn]
role_arn = arn:aws:iam::777788889999:user/jane

[profile keys-only]
aws_account_id = 1111-2222-3333
this line is not an entry

[services local]
dynamodb =
  endpoint_url = http://localhost:8000
`;

describe('parseIni', () => {
  test('reads sections and entries, skipping comments and nested blocks', () => {
    const sections = parseIni(AWS_CONFIG);
    expect(sections.map((s) => s.name)).toEqual([
      'default', 'sso-session corp', 'profile shop-prod', 'profile legacy-sso', 'profile broken-sso',
      'profile billing-stg', 'profile bad-arn', 'profile keys-only', 'services local',
    ]);
    const billing = sections.find((s) => s.name === 'profile billing-stg').entries;
    expect(billing).toEqual({
      role_arn: 'arn:aws:iam::777788889999:role/ops/Billing',
      source_profile: 'default',
      group: 'Billing',
      s3: '',
      region: 'eu-west-1',
    });
    expect(sections.find((s) => s.name === 'profile legacy-sso').entries.sso_start_url).toBe('https://legacy.awsapps.com/start');
  });

  test('handles CRLF and empty input', () => {
    expect(parseIni('[default]\r\nregion = us-east-1\r\n')[0].entries).toEqual({ region: 'us-east-1' });
    expect(parseIni(undefined)).toEqual([]);
  });
});

describe('profilesFromAwsConfig', () => {
  const { profiles, skipped } = profilesFromAwsConfig(AWS_CONFIG);
  const byName = Object.fromEntries(profiles.map((p) => [p.name, p]));

  test('maps SSO profiles through their sso-session, protecting a production name', () => {
    expect(byName['shop-prod']).toEqual({
      name: 'shop-prod', tag: '', guarded: true, color: 'd13212', group: '', provider: 'sso',
      fields: { startUrl: 'https://example.awsapps.com/start', accountId: '111122223333', roleName: 'AdministratorAccess' },
    });
  });

  test('reads the legacy env key as the tag', () => {
    expect(byName['legacy-sso']).toMatchObject({ tag: 'test', guarded: false, provider: 'sso', fields: { startUrl: 'https://legacy.awsapps.com/start' } });
  });

  test('maps role_arn profiles to Switch Role and reads the group', () => {
    expect(byName['billing-stg']).toMatchObject({
      tag: '', guarded: false, color: null, group: 'Billing', provider: 'switch-role', fields: { account: '777788889999', roleName: 'ops/Billing' },
    });
  });

  test('a production-looking tag protects the profile too', () => {
    const [profile] = profilesFromAwsConfig('[profile billing]\naws_account_id = 111122223333\ntag = live').profiles;
    expect(profile).toMatchObject({ tag: 'live', guarded: true });
  });

  test('maps aws_account_id profiles to IAM user sign-in', () => {
    expect(byName['keys-only']).toMatchObject({ provider: 'iam-user', fields: { account: '1111-2222-3333' } });
  });

  test('explains every skipped profile', () => {
    expect(skipped).toEqual([
      { name: 'default', reason: 'no role_arn, sso_account_id or aws_account_id' },
      { name: 'broken-sso', reason: 'sso_start_url not found in the profile or its sso-session' },
      { name: 'bad-arn', reason: 'role_arn is not an IAM role ARN' },
    ]);
  });
});

describe('JSON', () => {
  const profiles = [{ id: 'a', name: 'shop', provider: 'iam-user', fields: { account: '111122223333' } }];

  test('export writes a versioned envelope', () => {
    const text = exportProfiles(profiles, new Date('2026-01-02T03:04:05Z'));
    expect(JSON.parse(text)).toEqual({ format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: '2026-01-02T03:04:05.000Z', profiles });
    expect(text.endsWith('\n')).toBe(true);
    expect(exportProfiles([])).toContain('"profiles": []');
  });

  test('import accepts the envelope and a bare array', () => {
    expect(profilesFromJson(exportProfiles(profiles)).profiles).toEqual(profiles);
    expect(profilesFromJson(JSON.stringify(profiles))).toEqual({ profiles, skipped: [] });
  });

  test('import refuses newer formats, junk and bad JSON', () => {
    expect(() => profilesFromJson(JSON.stringify({ format: EXPORT_FORMAT, version: EXPORT_VERSION + 1, profiles: [] })))
      .toThrow('newer version');
    expect(() => profilesFromJson('{"format":"other"}')).toThrow('Expected an AWS Hop export or an array of accounts');
    expect(() => profilesFromJson(JSON.stringify({ format: EXPORT_FORMAT, version: 1 }))).toThrow('Expected an AWS Hop export');
    expect(() => profilesFromJson('null')).toThrow('Expected an AWS Hop export');
    expect(() => profilesFromJson('{oops')).toThrow('Invalid JSON');
  });
});

describe('detectFormat', () => {
  test.each([
    ['{"format":"aws-hop"}', 'json'],
    ['  [ {"name": "x"} ]', 'json'],
    ['[profile shop]\nregion = x', 'aws-config'],
    ['[default]', 'aws-config'],
    ['# comment\n[default]', 'aws-config'],
    ['', 'aws-config'],
    [undefined, 'aws-config'],
  ])('%p → %p', (text, format) => {
    expect(detectFormat(text)).toBe(format);
  });
});

describe('importProfiles', () => {
  let n = 0;
  const idFactory = () => `new-${n++}`;

  test('normalizes and validates the parsed profiles', () => {
    const { profiles, skipped } = importProfiles(AWS_CONFIG, { idFactory });
    expect(profiles.map((p) => p.name)).toEqual(['shop-prod', 'legacy-sso', 'billing-stg', 'keys-only']);
    expect(profiles.find((p) => p.name === 'keys-only').fields.account).toBe('111122223333');
    expect(profiles.find((p) => p.name === 'shop-prod').color).toBe('#d13212');
    expect(skipped).toHaveLength(3);
  });

  test('invalid profiles are skipped with their errors', () => {
    const text = JSON.stringify([
      { provider: 'iam-user', fields: { account: '111122223333' } },
      { name: 'bad', provider: 'iam-user', fields: { account: 'x' } },
      { name: 'ok', provider: 'iam-user', fields: { account: '111122223333' } },
    ]);
    const { profiles, skipped } = importProfiles(text, { idFactory });
    expect(profiles.map((p) => p.name)).toEqual(['ok']);
    expect(skipped).toEqual([
      { name: '(unnamed)', reason: 'Name is required' },
      { name: 'bad', reason: 'Enter a 12-digit account ID or an account alias' },
    ]);
  });

  test('uses random ids when no factory is given', () => {
    const { profiles } = importProfiles('[profile x]\naws_account_id = 111122223333');
    expect(profiles[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('rejects an unknown format', () => {
    expect(() => importProfiles('', { format: 'yaml' })).toThrow('Unknown import format "yaml"');
  });

  test('skip reasons follow the language', () => {
    setLanguage('ko');
    expect(importProfiles('[default]\nregion = us-east-1').skipped)
      .toEqual([{ name: 'default', reason: 'role_arn, sso_account_id, aws_account_id가 모두 없습니다' }]);
  });
});

describe('duplicates in a CLI config', () => {
  let n = 0;
  const idFactory = () => `dup-${n++}`;
  const CONFIG = `
[profile default]
aws_account_id = 111122223333

[profile shop]
aws_account_id = 111122223333

[profile terraform-shop]
aws_account_id = 1111-2222-3333

[profile data]
aws_account_id = 444455556666

[profile terraform-data]
aws_account_id = 444455556666

[profile shop-admin]
role_arn = arn:aws:iam::111122223333:role/Admin

[profile terraform-shop-admin]
role_arn = arn:aws:iam::111122223333:role/Admin
`;

  test('keeps one profile per sign-in target, under the shortest name', () => {
    const { profiles, skipped } = importProfiles(CONFIG, { idFactory });
    expect(profiles.map((p) => p.name)).toEqual(['shop', 'data', 'shop-admin']);
    expect(skipped).toEqual([
      { name: 'default', reason: 'signs in to the same place as shop, which is imported instead' },
      { name: 'terraform-shop', reason: 'signs in to the same place as shop, which is imported instead' },
      { name: 'terraform-data', reason: 'signs in to the same place as data, which is imported instead' },
      { name: 'terraform-shop-admin', reason: 'signs in to the same place as shop-admin, which is imported instead' },
    ]);
  });

  test('prefers any name over default, even a longer one', () => {
    const iam = (name) => normalizeProfile({ name, provider: 'iam-user', fields: { account: '111122223333' } }, { idFactory });
    expect(dedupeProfiles([iam('default'), iam('production-account')]).profiles.map((p) => p.name)).toEqual(['production-account']);
  });

  test('a JSON export is restored as it is, duplicates included', () => {
    const text = JSON.stringify([
      { name: 'a', provider: 'iam-user', fields: { account: '111122223333' } },
      { name: 'b', provider: 'iam-user', fields: { account: '111122223333' } },
    ]);
    expect(importProfiles(text, { idFactory }).profiles.map((p) => p.name)).toEqual(['a', 'b']);
  });

  test('explains in Korean too', () => {
    setLanguage('ko');
    expect(importProfiles(CONFIG, { idFactory }).skipped[0].reason).toBe('로그인 대상이 같아 shop 하나만 가져옵니다');
  });
});

describe('mergeProfiles', () => {
  const iam = (id, name, account, extra = {}) => normalizeProfile({ id, name, provider: 'iam-user', fields: { account }, ...extra });
  const existing = [iam('a', 'Shop', '111122223333'), iam('b', 'Billing', '222233334444')];

  test('replaces by id, then by method and name, keeping ids and positions', () => {
    const { profiles, added, updated, existing: present } = mergeProfiles(existing, [
      iam('a', 'Shop renamed', '111122223333'),
      iam('x', 'billing', '222233334444', { tag: 'prod' }),
      iam('y', 'Data', '444455556666'),
      iam('z', 'Data', '444455556666', { tag: 'dev' }),
    ]);
    expect(profiles.map((p) => [p.id, p.name, p.tag])).toEqual([
      ['a', 'Shop renamed', ''],
      ['b', 'billing', 'prod'],
      ['y', 'Data', 'dev'],
    ]);
    expect({ added, updated, present }).toEqual({ added: 1, updated: 3, present: [] });
  });

  test('an update keeps the tag, color, group and protection set in AWS Hop', () => {
    const edited = [iam('a', 'Shop', '111122223333', { tag: 'qa', color: '#123456', group: 'Shop', guarded: true })];
    const [profile] = mergeProfiles(edited, [iam('new', 'Shop', '111122223333')]).profiles;
    expect(profile).toMatchObject({ id: 'a', tag: 'qa', color: '#123456', group: 'Shop', guarded: true });
    const [retagged] = mergeProfiles(edited, [iam('new', 'Shop', '111122223333', { tag: 'live', color: '#654321' })]).profiles;
    expect(retagged).toMatchObject({ tag: 'live', color: '#654321' });
  });

  test('never adds a second profile for an account already in the list', () => {
    const first = mergeProfiles(existing, [iam('a', 'Shop renamed', '111122223333')]);
    const { profiles, added, existing: present } = mergeProfiles(first.profiles, [iam('w', 'terraform-shop', '111122223333')]);
    expect(profiles).toHaveLength(2);
    expect(added).toBe(0);
    expect(present).toEqual([{ name: 'terraform-shop', reason: 'already in your list as Shop renamed' }]);
  });

  test('reports what happened to each incoming profile, in import order', () => {
    const incoming = [iam('y', 'Data', '444455556666'), iam('x', 'shop', '111122223333'), iam('w', 'terraform-billing', '222233334444')];
    expect(mergeProfiles(existing, incoming).outcomes.map(({ profile, status, as }) => [profile.name, status, as])).toEqual([
      ['Data', 'added', undefined],
      ['shop', 'updated', undefined],
      ['terraform-billing', 'exists', 'Billing'],
    ]);
  });
});

describe('droppedByReplace', () => {
  const iam = (id, name, account) => normalizeProfile({ id, name, provider: 'iam-user', fields: { account } });
  const current = [iam('a', 'Shop', '111122223333'), iam('b', 'Billing', '222233334444'), iam('c', 'Data', '444455556666')];

  test('keeps a current profile matched by id, by method and name, or by sign-in target', () => {
    const incoming = [iam('a', 'renamed', '999999999999'), iam('n', 'billing', '777788889999'), iam('m', 'shop-data', '444455556666')];
    expect(droppedByReplace(current, incoming)).toEqual([]);
  });

  test('lists the rest, and everything when nothing is imported', () => {
    expect(droppedByReplace(current, [iam('n', 'Shop', '111122223333')]).map((p) => p.name)).toEqual(['Billing', 'Data']);
    expect(droppedByReplace(current, [])).toEqual(current);
  });
});
