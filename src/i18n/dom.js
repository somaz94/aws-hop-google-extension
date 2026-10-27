import { getLanguage, t } from './index.js';

const ATTRIBUTES = Object.freeze([
  ['data-i18n-placeholder', 'placeholder'],
  ['data-i18n-title', 'title'],
  ['data-i18n-aria-label', 'aria-label'],
]);

/** Builds text where `backticked` parts become <code>, without ever parsing the text as HTML. */
export function richText(doc, text) {
  const fragment = doc.createDocumentFragment();
  for (const part of text.split(/(`[^`]+`)/)) {
    if (/^`[^`]+`$/.test(part)) {
      const code = doc.createElement('code');
      code.textContent = part.slice(1, -1);
      fragment.append(code);
    } else if (part) {
      fragment.append(part);
    }
  }
  return fragment;
}

/** Fills `data-i18n` text and `data-i18n-*` attributes under `root` from the current language. */
export function applyTranslations(doc, root = doc) {
  for (const element of root.querySelectorAll('[data-i18n]')) {
    element.replaceChildren(richText(doc, t(element.getAttribute('data-i18n'))));
  }
  for (const [source, target] of ATTRIBUTES) {
    for (const element of root.querySelectorAll(`[${source}]`)) element.setAttribute(target, t(element.getAttribute(source)));
  }
  doc.documentElement.lang = getLanguage();
}
