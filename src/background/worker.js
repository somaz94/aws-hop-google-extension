import { MSG } from '../lib/messages.js';
import { applyBadge } from './badge.js';

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === MSG.SET_BADGE && sender.tab) applyBadge(chrome.action, sender.tab.id, message.badge);
  return false;
});

// A new page starts without a badge; its guard sends one once it knows the account.
chrome.tabs.onUpdated.addListener((tabId, { status }) => {
  if (status === 'loading') applyBadge(chrome.action, tabId, null);
});
