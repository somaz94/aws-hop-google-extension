import { PROTECTED_COLOR } from '../lib/tag.js';

export const HOST_TAG = 'aws-hop-guard';

export const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;

const STYLE = `
:host { all: initial; }
.stripe {
  position: fixed; top: 0; left: 0; right: 0; height: 4px;
  z-index: 2147483647; pointer-events: none; background: var(--color);
}
.frame {
  position: fixed; inset: 0; z-index: 2147483646; pointer-events: none;
  box-shadow: inset 0 0 0 3px ${PROTECTED_COLOR};
}
.pill {
  position: fixed; left: 12px; bottom: 44px; z-index: 2147483647;
  display: flex; gap: 6px; align-items: center; max-width: 360px; padding: 4px 10px;
  border: 0; border-radius: 999px; cursor: pointer;
  font: 600 12px/1.4 ${FONT}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  background: var(--color); color: var(--text); box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}
.pill.right { left: auto; right: 12px; }
.pill .account { font-weight: 400; opacity: 0.85; }
.pill.muted { opacity: 0.75; }
.pill.collapsed { width: 14px; height: 14px; padding: 0; }
.pill.collapsed span { display: none; }
`;

function build(doc, host, onActivate) {
  const root = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = STYLE;
  const stripe = doc.createElement('div');
  stripe.className = 'stripe';
  const frame = doc.createElement('div');
  frame.className = 'frame';
  const pill = doc.createElement('button');
  pill.type = 'button';
  pill.className = 'pill';
  const label = doc.createElement('span');
  label.className = 'label';
  const account = doc.createElement('span');
  account.className = 'account';
  pill.append(label, account);
  // A dot only expands back; otherwise the label opens the account menu, or collapses when there is none.
  pill.addEventListener('click', (event) => {
    if (pill.classList.contains('collapsed') || !onActivate) pill.classList.toggle('collapsed');
    else onActivate(event);
  });
  root.append(style, stripe, frame, pill);
  return root;
}

/** Draws, updates or (with a null view) removes the guard. Profile names go through textContent only. */
export function renderGuard(doc, view, { onActivate } = {}) {
  let host = doc.querySelector(HOST_TAG);
  if (!view) {
    host?.remove();
    return;
  }
  if (!host) {
    host = doc.createElement(HOST_TAG);
    build(doc, host, onActivate);
    doc.documentElement.appendChild(host);
  }
  const root = host.shadowRoot;
  host.style.setProperty('--color', view.color);
  host.style.setProperty('--text', view.textColor);
  root.querySelector('.stripe').hidden = view.muted;
  root.querySelector('.frame').hidden = !view.frame;
  const pill = root.querySelector('.pill');
  pill.classList.toggle('muted', view.muted);
  pill.classList.toggle('right', view.position === 'bottom-right');
  pill.title = view.tooltip;
  root.querySelector('.label').textContent = view.label;
  root.querySelector('.account').textContent = view.account;
}

/** Shrinks the label to a dot; clicking the dot brings it back. */
export function collapseGuard(doc) {
  doc.querySelector(HOST_TAG)?.shadowRoot.querySelector('.pill').classList.add('collapsed');
}

/** Keeps `prefix` at the start of the tab title while the console's single-page app rewrites it. */
export function createTitleKeeper(doc) {
  let prefix = null;
  let observer = null;
  const apply = () => {
    if (prefix && !doc.title.startsWith(prefix)) doc.title = prefix + doc.title;
  };
  return {
    set(next) {
      if (next === prefix) return;
      if (prefix && doc.title.startsWith(prefix)) doc.title = doc.title.slice(prefix.length);
      observer?.disconnect();
      observer = null;
      prefix = next;
      if (!prefix) return;
      apply();
      observer = new doc.defaultView.MutationObserver(apply);
      observer.observe(doc.head ?? doc.documentElement, { childList: true, subtree: true, characterData: true });
    },
    stop() {
      observer?.disconnect();
    },
  };
}
