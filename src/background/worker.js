import { createRecentStore } from '../lib/recent.js';
import { MSG } from '../lib/messages.js';
import { createSessionStore, sessionOrigin } from '../lib/sessions.js';
import { createStore } from '../lib/store.js';
import { applyBadge } from './badge.js';
import { createOmnibox } from './omnibox.js';

const sessions = createSessionStore();

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!sender.tab) return false;
  if (message?.type === MSG.SET_BADGE) applyBadge(chrome.action, sender.tab.id, message.badge);
  if (message?.type === MSG.SESSION_SEEN) sessions.remember(message.profileId, sessionOrigin(sender.url));
  return false;
});

// A new page starts without a badge; its guard sends one once it knows the account.
chrome.tabs.onUpdated.addListener((tabId, { status }) => {
  if (status === 'loading') applyBadge(chrome.action, tabId, null);
});

const omnibox = createOmnibox({
  store: createStore(),
  recent: createRecentStore(),
  sessions,
  tabs: chrome.tabs,
  omnibox: chrome.omnibox,
  uiLanguage: chrome.i18n.getUILanguage(),
});
chrome.omnibox.onInputChanged.addListener(omnibox.onInputChanged);
chrome.omnibox.onInputEntered.addListener(omnibox.onInputEntered);
