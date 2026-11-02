import { createLandingStore } from '../lib/landing.js';
import { createRecentStore } from '../lib/recent.js';
import { MSG } from '../lib/messages.js';
import { createSessionStore, sessionOrigin } from '../lib/sessions.js';
import { createStore } from '../lib/store.js';
import { applyBadge } from './badge.js';
import { createOmnibox } from './omnibox.js';
import { createPickOpener } from './open.js';

const store = createStore();
const recent = createRecentStore();
const sessions = createSessionStore();
const landings = createLandingStore();
const openPick = createPickOpener({ store, recent, sessions, landings, tabs: chrome.tabs });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // The popup has no tab of its own, so it names the one it would replace; a console tab only ever replaces itself.
  if (message?.type === MSG.OPEN_PROFILE) openPick(message.profileId, Boolean(message.invert), sender.tab?.id ?? message.tabId);
  if (!sender.tab) return false;
  if (message?.type === MSG.SET_BADGE) applyBadge(chrome.action, sender.tab.id, message.badge);
  if (message?.type === MSG.SESSION_SEEN) sessions.remember(message.profileId, sessionOrigin(sender.url));
  if (message?.type === MSG.CLEAR_LANDING) landings.clear(sender.tab.id);
  if (message?.type === MSG.GET_LANDING) {
    landings.expectedFor(sender.tab.id).then((profileId) => sendResponse({ profileId }));
    return true;
  }
  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => landings.clear(tabId));

// A new page starts without a badge; its guard sends one once it knows the account.
chrome.tabs.onUpdated.addListener((tabId, { status }) => {
  if (status === 'loading') applyBadge(chrome.action, tabId, null);
});

const omnibox = createOmnibox({
  store,
  recent,
  sessions,
  landings,
  tabs: chrome.tabs,
  omnibox: chrome.omnibox,
  uiLanguage: chrome.i18n.getUILanguage(),
});
chrome.omnibox.onInputChanged.addListener(omnibox.onInputChanged);
chrome.omnibox.onInputEntered.addListener(omnibox.onInputEntered);
