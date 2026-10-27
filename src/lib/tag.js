export const TAG_MAX = 20;
export const SUGGESTED_TAGS = Object.freeze(['prod', 'stage', 'dev', 'test']);

// The frame of a protected account; kept out of PALETTE so red only ever means "protected".
export const PROTECTED_COLOR = '#d13212';
export const PALETTE = Object.freeze(['#0073bb', '#1d8102', '#ec7211', '#8456ce', '#007b83', '#c33d69', '#8d6605', '#3b48cc']);

const PROTECTED_WORDS = new Set(['prod', 'prd', 'production', 'live', '운영', '상용']);

function tokens(text) {
  return String(text ?? '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** The project part of a name: `shop-dev` and `shop prod` both give `shop`. */
export function firstToken(text) {
  return tokens(text)[0] ?? '';
}

/** Stable color for a seed (FNV-1a), so the same group or project always gets the same color. */
export function colorFor(seed) {
  let hash = 0x811c9dc5;
  for (const char of String(seed ?? '').toLowerCase()) {
    hash = Math.imul(hash ^ char.codePointAt(0), 0x01000193) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

/** True when any whole word of the given texts reads like production: `shop-prod`, `운영`, `live`. */
export function looksProtected(...texts) {
  return texts.some((text) => tokens(text).some((token) => PROTECTED_WORDS.has(token)));
}
