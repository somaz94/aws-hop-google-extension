import { profileAccount, profileRoles } from './profile.js';

const SSO_ROLE = /^AWSReservedSSO_(.+)_[0-9a-f]+$/;

/** `AWSReservedSSO_ReadOnly_0123abcd` → `readonly`, `path/Admin` → `admin`. */
export function normalizeRoleName(role) {
  const value = String(role ?? '').trim();
  const sso = SSO_ROLE.exec(value);
  return (sso ? sso[1] : value.split('/').pop()).toLowerCase();
}

/** The profile for the detected console identity; on several profiles per account, the one whose role matches. */
export function matchProfile(profiles, identity) {
  if (!identity?.accounts?.length) return null;
  const candidates = profiles.filter((profile) => identity.accounts.includes(profileAccount(profile)));
  if (candidates.length <= 1) return candidates[0] ?? null;
  const role = normalizeRoleName(identity.role);
  if (!role) return candidates[0];
  return candidates.find((profile) => profileRoles(profile).some((name) => normalizeRoleName(name) === role)) ?? candidates[0];
}
