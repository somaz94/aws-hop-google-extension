import iamUser from './iamUser.js';
import switchRole from './switchRole.js';
import sso from './sso.js';
import customUrl from './customUrl.js';

// A new sign-in method is one module plus one entry here; tests/providers.contract.test.js checks the contract.
const PROVIDERS = Object.freeze([iamUser, switchRole, sso, customUrl]);

const BY_ID = new Map(PROVIDERS.map((provider) => [provider.id, provider]));

export function listProviders() {
  return PROVIDERS;
}

export function getProvider(id) {
  return BY_ID.get(id) ?? null;
}

/** A new account known only by its ID, as the popup's "Add this account" offers it: IAM user sign-in, the one method that needs nothing else. */
export function draftForAccount(account) {
  return { provider: iamUser.id, fields: { account } };
}

/** Field values to keep when switching sign-in methods: `account` and `accountId` are the same thing to the user. */
export function carryFields(values) {
  const next = { ...values };
  next.account ||= next.accountId;
  next.accountId ||= next.account;
  return next;
}
