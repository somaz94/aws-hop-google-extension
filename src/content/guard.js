import { formatAccountId } from '../lib/account.js';
import { readableTextColor } from '../lib/color.js';
import { getEnvironment } from '../lib/env.js';
import { detectIdentity } from '../lib/identity.js';
import { matchProfile } from '../lib/match.js';
import { MSG } from '../lib/messages.js';
import { profileColor } from '../lib/profile.js';
import { createStore } from '../lib/store.js';
import { createTitleKeeper, renderGuard } from './banner.js';

// Written by nav-bridge.js in the page's main world; the two names must match.
export const NAV_ATTR = 'data-aws-hop-nav';
export const OBSERVE_MS = 20000;
const DEBOUNCE_MS = 250;
const UNREGISTERED_COLOR = '#545b64';
const SOURCE_LABELS = Object.freeze({ nav: 'console navigation', dom: 'page header', host: 'multi-session URL' });

export function readNavInfo(doc) {
  const raw = doc.documentElement.getAttribute(NAV_ATTR);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function buildView(identity, profile, settings) {
  if (!settings.guardEnabled || !identity) return null;
  const account = formatAccountId(identity.accounts[0]);
  const detectedFrom = SOURCE_LABELS[identity.source];
  if (profile) {
    const env = getEnvironment(profile.env);
    const color = profileColor(profile);
    return {
      color,
      textColor: readableTextColor(color),
      label: `${env.short} · ${profile.name}`,
      account,
      detectedFrom,
      frame: env.guarded,
      muted: false,
      titlePrefix: env.guarded && settings.guardTitlePrefix ? `[${env.short}] ` : null,
    };
  }
  if (!settings.guardShowUnregistered) return null;
  return {
    color: UNREGISTERED_COLOR,
    textColor: readableTextColor(UNREGISTERED_COLOR),
    label: 'Unregistered account',
    account,
    detectedFrom,
    frame: false,
    muted: true,
    titlePrefix: null,
  };
}

export async function startGuard({
  doc = globalThis.document,
  hostname = globalThis.location?.hostname,
  store = createStore(),
  runtime = globalThis.chrome?.runtime,
  observeMs = OBSERVE_MS,
} = {}) {
  let [profiles, settings] = await Promise.all([store.loadProfiles(), store.loadSettings()]);
  const title = createTitleKeeper(doc);
  let state = { identity: null, profile: null };
  let lastView;

  const update = () => {
    const identity = detectIdentity({ hostname, navInfo: readNavInfo(doc), doc });
    const profile = matchProfile(profiles, identity);
    state = { identity, profile };
    const view = buildView(identity, profile, settings);
    const key = JSON.stringify(view);
    if (key === lastView) return;
    lastView = key;
    renderGuard(doc, view);
    title.set(view?.titlePrefix ?? null);
  };

  update();

  // The navigation bar renders well after document_idle, so watch the page for a while, not forever.
  let pending = null;
  const observer = new doc.defaultView.MutationObserver(() => {
    pending ??= setTimeout(() => {
      pending = null;
      update();
    }, DEBOUNCE_MS);
  });
  observer.observe(doc.documentElement, { attributes: true, attributeFilter: [NAV_ATTR], childList: true, subtree: true });
  const stopWatching = setTimeout(() => observer.disconnect(), observeMs);

  const unsubscribe = store.onChange(async (changed) => {
    if (changed.profiles) profiles = await store.loadProfiles();
    if (changed.settings) settings = await store.loadSettings();
    update();
  });

  const onMessage = (message, _sender, sendResponse) => {
    if (message?.type !== MSG.GET_IDENTITY) return false;
    sendResponse({ identity: state.identity, profileId: state.profile?.id ?? null });
    return false;
  };
  runtime?.onMessage.addListener(onMessage);

  return {
    update,
    get state() {
      return state;
    },
    stop() {
      clearTimeout(stopWatching);
      clearTimeout(pending);
      observer.disconnect();
      unsubscribe();
      runtime?.onMessage.removeListener(onMessage);
      title.set(null);
      title.stop();
      renderGuard(doc, null);
    },
  };
}
