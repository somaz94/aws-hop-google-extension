import { applyLanguageSetting, t } from '../i18n/index.js';
import { formatAccountId } from '../lib/account.js';
import { readableTextColor } from '../lib/color.js';
import { detectIdentity, identityFromHost } from '../lib/identity.js';
import { matchProfile } from '../lib/match.js';
import { MSG } from '../lib/messages.js';
import { profileColor, profileLabel } from '../lib/profile.js';
import { createRecentStore, recentProfiles } from '../lib/recent.js';
import { createStore } from '../lib/store.js';
import { PROTECTED_COLOR } from '../lib/tag.js';
import { collapseGuard, createTitleKeeper, HOST_TAG, renderGuard } from './banner.js';
import { createMenu } from './menu.js';

// Written by nav-bridge.js in the page's main world; the two names must match.
export const NAV_ATTR = 'data-aws-hop-nav';
export const OBSERVE_MS = 20000;
const DEBOUNCE_MS = 250;
const UNREGISTERED_COLOR = '#545b64';
// About as many characters as the toolbar badge shows.
const BADGE_MAX = 4;

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
  const source = t(`guard.source.${identity.source}`);
  const color = profile ? profileColor(profile) : UNREGISTERED_COLOR;
  if (!profile && !settings.guardShowUnregistered) return null;
  const label = !profile ? t('guard.unregistered') : profileLabel(profile);
  return {
    color,
    textColor: readableTextColor(color),
    label,
    account,
    tooltip: t('guard.tooltip', { label, account, source }),
    frame: Boolean(profile?.guarded),
    muted: !profile,
    position: settings.guardPosition,
    // The account name, not the tag: with several production accounts open, `[prod]` would not tell the tabs apart.
    titlePrefix: profile?.guarded && settings.guardTitlePrefix ? `[${profile.name}] ` : null,
  };
}

/** The toolbar badge for a guard view: the tag, the start of the name without one, `?` for an account not in the list. */
export function buildBadge(view, profile) {
  if (!view) return null;
  const color = view.frame ? PROTECTED_COLOR : view.color;
  const text = profile ? [...(profile.tag || profile.name)].slice(0, BADGE_MAX).join('') : '?';
  return { text, color, textColor: readableTextColor(color) };
}

export async function startGuard({
  doc = globalThis.document,
  hostname = globalThis.location?.hostname,
  store = createStore(),
  recent = createRecentStore(),
  runtime = globalThis.chrome?.runtime,
  uiLanguage = globalThis.chrome?.i18n?.getUILanguage?.(),
  observeMs = OBSERVE_MS,
} = {}) {
  let [profiles, settings] = await Promise.all([store.loadProfiles(), store.loadSettings()]);
  applyLanguageSetting(settings, uiLanguage);
  const title = createTitleKeeper(doc);
  let state = { identity: null, profile: null };
  let lastView;
  let badge = null;

  const send = (message) => {
    // Rejects when the worker is not listening, and throws once the extension was reloaded under this page.
    try {
      runtime?.sendMessage?.(message)?.catch(() => {});
    } catch {
      // Nothing left to tell.
    }
  };
  const sendBadge = () => send({ type: MSG.SET_BADGE, badge });
  const onSessionHost = Boolean(identityFromHost(hostname));

  let menu = null;
  let recentIds = [];
  const menuData = () => ({
    profiles,
    settings,
    currentId: state.profile?.id ?? null,
    recent: settings.showRecent ? recentProfiles(profiles, recentIds) : [],
    side: settings.guardPosition === 'bottom-right' ? 'right' : 'left',
  });
  const onActivate = async () => {
    try {
      if (!menu?.isOpen) recentIds = settings.showRecent ? await recent.load() : [];
    } catch {
      recentIds = [];
    }
    const root = doc.querySelector(HOST_TAG)?.shadowRoot;
    if (!root) return;
    menu ??= createMenu(root, {
      // The worker opens it, so the session it is signed in to and the open-in setting apply as in the popup.
      onOpen: (profileId, invert) => send({ type: MSG.OPEN_PROFILE, profileId, invert }),
      onCollapse: () => collapseGuard(doc),
    });
    menu.toggle(menuData());
  };

  const update = () => {
    const identity = detectIdentity({ hostname, navInfo: readNavInfo(doc), doc });
    const profile = matchProfile(profiles, identity);
    state = { identity, profile };
    menu?.refresh(menuData());
    const view = buildView(identity, profile, settings);
    const key = JSON.stringify(view);
    if (key === lastView) return;
    lastView = key;
    if (!view) {
      menu?.close();
      menu = null;
    }
    renderGuard(doc, view, { onActivate });
    title.set(view?.titlePrefix ?? null);
    badge = buildBadge(view, profile);
    sendBadge();
    // The worker reads the session's address from the sender, so only the account is sent.
    if (profile && onSessionHost) send({ type: MSG.SESSION_SEEN, profileId: profile.id });
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
    if (changed.settings) {
      settings = await store.loadSettings();
      applyLanguageSetting(settings, uiLanguage);
    }
    update();
  });

  const onMessage = (message, _sender, sendResponse) => {
    if (message?.type !== MSG.GET_IDENTITY) return false;
    sendResponse({ identity: state.identity, profileId: state.profile?.id ?? null });
    return false;
  };
  runtime?.onMessage.addListener(onMessage);

  // A page restored from the back/forward cache keeps this guard, but the worker cleared the badge when the tab navigated.
  const onPageShow = (event) => {
    if (event.persisted) sendBadge();
  };
  doc.defaultView.addEventListener('pageshow', onPageShow);

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
      doc.defaultView.removeEventListener('pageshow', onPageShow);
      badge = null;
      sendBadge();
      menu?.close();
      title.set(null);
      title.stop();
      renderGuard(doc, null);
    },
  };
}
