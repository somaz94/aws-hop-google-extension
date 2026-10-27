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
