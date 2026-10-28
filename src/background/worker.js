import { createRecentStore } from '../lib/recent.js';
import { MSG } from '../lib/messages.js';
import { createStore } from '../lib/store.js';
import { applyBadge } from './badge.js';
import { createOmnibox } from './omnibox.js';

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === MSG.SET_BADGE && sender.tab) applyBadge(chrome.action, sender.tab.id, message.badge);
  return false;
});

// A new page starts without a badge; its guard sends one once it knows the account.
chrome.tabs.onUpdated.addListener((tabId, { status }) => {
  if (status === 'loading') applyBadge(chrome.action, tabId, null);
});

const omnibox = createOmnibox({
  store: createStore(),
  recent: createRecentStore(),
  tabs: chrome.tabs,
  omnibox: chrome.omnibox,
  uiLanguage: chrome.i18n.getUILanguage(),
});
chrome.omnibox.onInputChanged.addListener(omnibox.onInputChanged);
chrome.omnibox.onInputEntered.addListener(omnibox.onInputEntered);
