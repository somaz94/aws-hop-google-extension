import { t } from '../i18n/index.js';
import { normalizeAccountId, parseRoleArn } from '../lib/account.js';
import { looksProtected } from '../lib/tag.js';

const SECTION = /^\[\s*([^\]]+?)\s*\]$/;
const ENTRY = /^([^=]+?)\s*=\s*(.*)$/;
const INLINE_COMMENT = /\s+[#;].*$/;

/** Minimal AWS shared-config parser: `[section]`, `key = value`, comments; nested sub-sections are skipped. */
export function parseIni(text) {
  const sections = [];
  let current = null;
  let nestedKey = null;
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const header = SECTION.exec(line);
    if (header) {
      current = { name: header[1], entries: {} };
      sections.push(current);
      nestedKey = null;
      continue;
    }
    if (!current) continue;
    // Indented lines under `s3 =` belong to a nested sub-section that profiles never need.
    if (nestedKey && /^\s/.test(raw)) continue;
    const entry = ENTRY.exec(line);
    if (!entry) continue;
    const key = entry[1].trim().toLowerCase();
    const value = entry[2].replace(INLINE_COMMENT, '').trim();
    nestedKey = value ? null : key;
    current.entries[key] = value;
  }
  return sections;
}

/** A shell loop that prints one importable profile per AWS CLI profile, its account ID read from STS. */
export function accountIdCommand({ copyToClipboard = false } = {}) {
  return [
    'for p in $(aws configure list-profiles); do',
    '  id=$(aws sts get-caller-identity --profile "$p" --query Account --output text 2>/dev/null) || continue',
    `  printf '[profile %s]\\naws_account_id = %s\\n\\n' "$p" "$id"`,
    copyToClipboard ? 'done | pbcopy' : 'done',
  ].join('\n');
}

function profileName(section) {
  if (section.name === 'default') return 'default';
  const match = /^profile\s+(.+)$/.exec(section.name);
  return match ? match[1].trim() : null;
}

function toProfile(name, entries, sessions) {
  // `env` is read as `tag`, its name before tags were free-form.
  const tag = entries.tag ?? entries.env ?? '';
  const common = { name, tag, guarded: looksProtected(name, tag), color: entries.color || null, group: entries.group ?? '' };
  if (entries.sso_account_id && entries.sso_role_name) {
    const startUrl = entries.sso_start_url || sessions.get(entries.sso_session)?.sso_start_url;
    if (!startUrl) return { reason: t('import.skip.noSsoStartUrl') };
    return { ...common, provider: 'sso', fields: { startUrl, accountId: entries.sso_account_id, roleName: entries.sso_role_name } };
  }
  if (entries.role_arn) {
    const arn = parseRoleArn(entries.role_arn);
    if (!arn) return { reason: t('import.skip.notRoleArn') };
    return { ...common, provider: 'switch-role', fields: { account: arn.accountId, roleName: arn.roleName } };
  }
  if (normalizeAccountId(entries.aws_account_id)) {
    return { ...common, provider: 'iam-user', fields: { account: entries.aws_account_id } };
  }
  return { reason: t('import.skip.noAccount') };
}

/**
 * Maps `~/.aws/config` profiles to raw profile input: SSO profiles to IAM Identity Center links,
 * `role_arn` profiles to Switch Role, `aws_account_id`-only profiles to IAM user sign-in.
 * Optional `tag`, `color` and `group` keys are read; a profile whose name or tag reads like
 * production is marked protected.
 */
export function profilesFromAwsConfig(text) {
  const sections = parseIni(text);
  const sessions = new Map();
  for (const section of sections) {
    const match = /^sso-session\s+(.+)$/.exec(section.name);
    if (match) sessions.set(match[1].trim(), section.entries);
  }
  const profiles = [];
  const skipped = [];
  for (const section of sections) {
    const name = profileName(section);
    if (!name) continue;
    const result = toProfile(name, section.entries, sessions);
    if (result.reason) skipped.push({ name, reason: result.reason });
    else profiles.push(result);
  }
  return { profiles, skipped };
}
