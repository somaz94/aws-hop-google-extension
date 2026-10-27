import { t } from '../i18n/index.js';
import { parseRoleArn } from '../lib/account.js';
import { looksProtected } from '../lib/tag.js';
import { parseIni } from './awsConfig.js';

// Keys the AWS CLI never uses; any of them marks a config written for aws-extend-switch-roles.
const AESR_KEYS = ['role_name', 'target_role_name', 'aws_account_alias'];
const NOT_A_PROFILE = /^((sso-session|services)\s.+|plugins)$/;
const CLI_PROFILE = /^(default|profile\s.+)$/;

const profileName = (section) => section.name.replace(/^profile\s+/, '').trim();

/** True when the text uses AESR-only keys, or names a profile without the CLI's `profile ` prefix. */
export function looksLikeAesr(text) {
  return parseIni(text).some(({ name, entries }) => AESR_KEYS.some((key) => key in entries)
    || (!CLI_PROFILE.test(name) && !NOT_A_PROFILE.test(name) && Boolean(entries.aws_account_id || entries.role_arn)));
}

function toProfile(name, entries, { isBase, bases }) {
  const base = bases.get(entries.source_profile);
  const common = {
    name,
    tag: '',
    guarded: looksProtected(name),
    color: entries.color || null,
    group: isBase ? name : entries.source_profile ?? '',
  };
  if (entries.role_arn) {
    const arn = parseRoleArn(entries.role_arn);
    if (!arn) return { reason: t('import.skip.notRoleArn') };
    return { ...common, provider: 'switch-role', fields: { account: arn.accountId, roleName: arn.roleName } };
  }
  const account = entries.aws_account_id;
  if (!account) return { reason: t('import.skip.aesrNoAccount') };
  // On a base account `role_name` is the role used to sign in, not one to switch to.
  if (isBase) {
    if (entries.role_name) return { reason: t('import.skip.aesrFederatedBase') };
    return { ...common, provider: 'iam-user', fields: { account } };
  }
  const roleName = entries.role_name || base?.target_role_name;
  if (roleName) return { ...common, provider: 'switch-role', fields: { account, roleName } };
  if (entries.source_profile) return { reason: t('import.skip.aesrNoRole') };
  return { ...common, provider: 'iam-user', fields: { account } };
}

/**
 * Maps an aws-extend-switch-roles configuration: target roles (`role_arn`, or `aws_account_id` with
 * `role_name` or the base's `target_role_name`) to Switch Role, base accounts to IAM user sign-in,
 * grouped by base account. `region` and `image` have no AWS Hop equivalent and are ignored.
 */
export function profilesFromAesr(text) {
  const sections = parseIni(text);
  const baseNames = new Set(sections.map((section) => section.entries.source_profile).filter(Boolean));
  const bases = new Map(sections.filter((s) => baseNames.has(profileName(s))).map((s) => [profileName(s), s.entries]));
  const profiles = [];
  const skipped = [];
  for (const section of sections) {
    if (NOT_A_PROFILE.test(section.name)) continue;
    const name = profileName(section);
    const result = toProfile(name, section.entries, { isBase: baseNames.has(name), bases });
    if (result.reason) skipped.push({ name, reason: result.reason });
    else profiles.push(result);
  }
  return { profiles, skipped };
}
