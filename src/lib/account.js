const ACCOUNT_ID = /^\d{12}$/;
// AWS account alias: 3-63 chars of lowercase letters, digits and hyphens, no leading or trailing hyphen.
const ACCOUNT_ALIAS = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
const ROLE_ARN = /^arn:(aws|aws-cn|aws-us-gov):iam::(\d{12}):role\/(.+)$/;

export function normalizeAccountId(value) {
  const digits = String(value ?? '').trim().replace(/[\s-]/g, '');
  return ACCOUNT_ID.test(digits) ? digits : null;
}

export function isAccountAlias(value) {
  const alias = String(value ?? '').trim();
  return ACCOUNT_ALIAS.test(alias) && !ACCOUNT_ID.test(alias);
}

/** Returns the canonical form of an account ID or alias, or null when it is neither. */
export function normalizeAccount(value) {
  const id = normalizeAccountId(value);
  if (id) return id;
  const alias = String(value ?? '').trim().toLowerCase();
  return isAccountAlias(alias) ? alias : null;
}

export function formatAccountId(value) {
  const id = normalizeAccountId(value);
  return id ? `${id.slice(0, 4)}-${id.slice(4, 8)}-${id.slice(8)}` : String(value ?? '');
}

/** Splits `arn:aws:iam::<id>:role/<path>/<name>` into its account and role name (path kept). */
export function parseRoleArn(value) {
  const match = ROLE_ARN.exec(String(value ?? '').trim());
  if (!match) return null;
  return { partition: match[1], accountId: match[2], roleName: match[3] };
}
