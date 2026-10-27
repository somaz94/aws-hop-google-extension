export const ENVIRONMENTS = Object.freeze([
  { id: 'prod', label: 'Production', short: 'PROD', color: '#d13212', guarded: true },
  { id: 'stage', label: 'Staging', short: 'STG', color: '#ec7211', guarded: false },
  { id: 'dev', label: 'Development', short: 'DEV', color: '#1d8102', guarded: false },
  { id: 'test', label: 'Test', short: 'TEST', color: '#0073bb', guarded: false },
  { id: 'other', label: 'Other', short: 'OTHER', color: '#687078', guarded: false },
]);

export const DEFAULT_ENV = 'other';

const BY_ID = new Map(ENVIRONMENTS.map((env) => [env.id, env]));

const NAME_TOKENS = [
  ['prod', ['prod', 'prd', 'production', 'live']],
  ['stage', ['stage', 'stg', 'staging', 'preprod']],
  ['dev', ['dev', 'develop', 'development', 'sandbox']],
  ['test', ['test', 'qa', 'uat']],
];

export function isEnvironment(id) {
  return BY_ID.has(id);
}

export function getEnvironment(id) {
  return BY_ID.get(id) ?? BY_ID.get(DEFAULT_ENV);
}

/** Guesses the environment from whole tokens of a profile name: `shop-prod` → prod, `product` → other. */
export function inferEnv(name) {
  const tokens = new Set(String(name ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  for (const [env, words] of NAME_TOKENS) {
    if (words.some((word) => tokens.has(word))) return env;
  }
  return DEFAULT_ENV;
}
