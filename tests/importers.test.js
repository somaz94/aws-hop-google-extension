import { describe, test, expect } from '@jest/globals';
import { parseIni, profilesFromAwsConfig } from '../src/importers/awsConfig.js';
import { EXPORT_FORMAT, EXPORT_VERSION, exportProfiles, profilesFromJson } from '../src/importers/json.js';
import { detectFormat, importProfiles, mergeProfiles } from '../src/importers/index.js';

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

  test('maps SSO profiles through their sso-session', () => {
    expect(byName['shop-prod']).toEqual({
      name: 'shop-prod', env: 'prod', color: 'd13212', provider: 'sso',
      fields: { startUrl: 'https://example.awsapps.com/start', accountId: '111122223333', roleName: 'AdministratorAccess' },
    });
  });

  test('maps legacy SSO profiles and honours env', () => {
    expect(byName['legacy-sso']).toMatchObject({ env: 'test', provider: 'sso', fields: { startUrl: 'https://legacy.awsapps.com/start' } });
  });

  test('maps role_arn profiles to Switch Role', () => {
    expect(byName['billing-stg']).toMatchObject({
      env: 'stage', color: null, provider: 'switch-role', fields: { account: '777788889999', roleName: 'ops/Billing' },
    });
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
    expect(() => profilesFromJson('{"format":"other"}')).toThrow('Expected an AWS Hop export');
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
});

describe('mergeProfiles', () => {
  const existing = [
    { id: 'a', name: 'Shop', provider: 'iam-user' },
    { id: 'b', name: 'Billing', provider: 'sso' },
  ];

  test('adds new, replaces by id and by method + name, keeping ids and positions', () => {
    const incoming = [
      { id: 'a', name: 'Shop renamed', provider: 'iam-user' },
      { id: 'x', name: 'billing', provider: 'sso', env: 'prod' },
      { id: 'y', name: 'Billing', provider: 'iam-user' },
      { id: 'z', name: 'Billing', provider: 'iam-user', env: 'dev' },
    ];
    const { profiles, added, updated } = mergeProfiles(existing, incoming);
    expect(profiles).toEqual([
      { id: 'a', name: 'Shop renamed', provider: 'iam-user' },
      { id: 'b', name: 'billing', provider: 'sso', env: 'prod' },
      { id: 'y', name: 'Billing', provider: 'iam-user', env: 'dev' },
    ]);
    expect({ added, updated }).toEqual({ added: 1, updated: 3 });
  });
});
